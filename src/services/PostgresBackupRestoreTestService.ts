import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import type { CommandRunner } from '../adapters/CommandRunner';
import { DATABASE_SCHEMA } from '../db/postgres';
import {
  buildPostgresToolEnv,
  calculateSha256,
  parseDatabaseUrl,
  type ParsedDatabaseUrl,
  type PostgresBackupManifest,
  sanitizeForLogs,
} from './PostgresBackupService';

export interface RestoreTestRequest {
  backupPath: string;
}

export interface TableRowCountComparison {
  table: string;
  original: number;
  restored: number;
  match: boolean;
}

export interface StructuralValidationResult {
  schemaExists: boolean;
  tablesExist: boolean;
  primaryKeysMatch: boolean;
  foreignKeysMatch: boolean;
  indexesMatch: boolean;
  sequencesMatch: boolean;
  schemaMigrationsMatch: boolean;
  original: StructuralCounts;
  restored: StructuralCounts;
}

export interface StructuralCounts {
  tables: number;
  primaryKeys: number;
  foreignKeys: number;
  indexes: number;
  sequences: number;
  schemaMigrations: number;
}

export interface SampleValidationResult {
  table: string;
  sampledIds: string[];
  restoredIds: string[];
  match: boolean;
}

export interface RestoreTestResult {
  status: 'PASSED' | 'FAILED';
  backup: string;
  manifest: string;
  checksumValidation: 'OK' | 'FAILED';
  pgRestoreList: 'OK' | 'FAILED';
  temporaryDatabase?: string;
  postgresVersion?: string;
  restoreExitCode?: number;
  tablesVerified: string[];
  tablesChecked: number;
  rowCounts: TableRowCountComparison[];
  rowCountsMatch: boolean;
  structuralValidation?: StructuralValidationResult;
  samples: SampleValidationResult[];
  restoreSucceeded: boolean;
  temporaryDatabaseDropped: boolean;
  originalDatabaseUnmodified: true;
  failure?: string;
  inspectCommand?: string;
  manualCleanupCommand?: string;
}

const EXPECTED_TABLES = [
  'schema_migrations',
  'engine_config',
  'market_symbols',
  'symbol_timeframes',
  'opportunities',
  'signals',
  'signal_evaluations',
  'evidence_signals',
  'evidence_signal_evaluations',
  'evidence_target_evaluations',
];

export class PostgresBackupRestoreTestService {
  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly databaseUrl: string,
    private readonly pgRestoreCommand = 'pg_restore',
  ) {}

  public async run(request: RestoreTestRequest): Promise<RestoreTestResult> {
    const backupPath = path.resolve(request.backupPath);
    const manifestPath = path.join(path.dirname(backupPath), 'manifest.json');
    const restorePath = path.join(path.dirname(backupPath), 'RESTORE.md');
    const connection = parseDatabaseUrl(this.databaseUrl);
    let temporaryDatabase: string | undefined;
    let restoreExitCode: number | undefined;
    let postgresVersion: string | undefined;
    let restoreSucceeded = false;

    const baseResult = (): RestoreTestResult => ({
      status: 'FAILED',
      backup: backupPath,
      manifest: manifestPath,
      checksumValidation: 'FAILED',
      pgRestoreList: 'FAILED',
      temporaryDatabase,
      postgresVersion,
      restoreExitCode,
      tablesVerified: EXPECTED_TABLES,
      tablesChecked: 0,
      rowCounts: [],
      rowCountsMatch: false,
      samples: [],
      restoreSucceeded,
      temporaryDatabaseDropped: false,
      originalDatabaseUnmodified: true,
      inspectCommand: temporaryDatabase ? buildInspectCommand(connection, temporaryDatabase) : undefined,
      manualCleanupCommand: temporaryDatabase ? buildManualCleanupCommand(connection, temporaryDatabase) : undefined,
    });

    try {
      await requireFile(backupPath, 'argos.dump');
      await requireFile(manifestPath, 'manifest.json');
      await requireFile(restorePath, 'RESTORE.md');

      const manifest = await readManifest(manifestPath);
      const sha256 = await calculateSha256(backupPath);
      if (sha256 !== manifest.backup.sha256) {
        return { ...baseResult(), failure: 'backup-checksum-mismatch' };
      }

      const listResult = await this.commandRunner.run(this.pgRestoreCommand, ['--list', backupPath]);
      if (listResult.exitCode !== 0) {
        return {
          ...baseResult(),
          checksumValidation: 'OK',
          failure: `pg-restore-list-failed: ${sanitizeForLogs(listResult.stderr || listResult.stdout)}`,
        };
      }

      temporaryDatabase = createTemporaryDatabaseName();
      assertSafeTemporaryDatabase(connection.database, temporaryDatabase);

      const adminPool = createPool(this.databaseUrl);
      try {
        const versionResult = await adminPool.query<{ version: string }>('SELECT version() AS version');
        postgresVersion = versionResult.rows[0]?.version ?? 'unknown';
        await adminPool.query(`CREATE DATABASE ${quoteIdentifier(temporaryDatabase)}`);
      } finally {
        await adminPool.end();
      }

      const restoreResult = await this.commandRunner.run(this.pgRestoreCommand, buildPgRestoreArgs(connection, temporaryDatabase, backupPath), {
        env: buildPostgresToolEnv(connection.password),
      });
      restoreExitCode = restoreResult.exitCode;
      if (restoreResult.exitCode !== 0) {
        return {
          ...baseResult(),
          checksumValidation: 'OK',
          pgRestoreList: 'OK',
          failure: `pg-restore-failed: ${sanitizeForLogs(restoreResult.stderr || restoreResult.stdout)}`,
        };
      }
      restoreSucceeded = true;

      const originalPool = createPool(this.databaseUrl);
      const restoredPool = createPool(replaceDatabaseName(this.databaseUrl, temporaryDatabase));
      try {
        const [tablesVerified, rowCounts, structuralValidation, samples] = await Promise.all([
          verifyExpectedTables(restoredPool),
          compareRowCounts(originalPool, restoredPool),
          validateStructure(originalPool, restoredPool),
          validateSamples(originalPool, restoredPool),
        ]);
        const rowCountsMatch = rowCounts.every((comparison) => comparison.match);
        const structuralOk = structuralValidation.schemaExists
          && structuralValidation.tablesExist
          && structuralValidation.primaryKeysMatch
          && structuralValidation.foreignKeysMatch
          && structuralValidation.indexesMatch
          && structuralValidation.sequencesMatch
          && structuralValidation.schemaMigrationsMatch;
        const samplesOk = samples.every((sample) => sample.match);

        if (!rowCountsMatch || !structuralOk || !samplesOk) {
          return {
            ...baseResult(),
            checksumValidation: 'OK',
            pgRestoreList: 'OK',
            tablesVerified,
            tablesChecked: tablesVerified.length,
            rowCounts,
            rowCountsMatch,
            structuralValidation,
            samples,
            failure: 'restore-validation-failed',
          };
        }

        await originalPool.end();
        await restoredPool.end();
        await dropTemporaryDatabaseSafely(this.databaseUrl, connection.database, temporaryDatabase);

        return {
          status: 'PASSED',
          backup: backupPath,
          manifest: manifestPath,
          checksumValidation: 'OK',
          pgRestoreList: 'OK',
          temporaryDatabase,
          postgresVersion,
          restoreExitCode,
          tablesVerified,
          tablesChecked: tablesVerified.length,
          rowCounts,
          rowCountsMatch,
          structuralValidation,
          samples,
          restoreSucceeded,
          temporaryDatabaseDropped: true,
          originalDatabaseUnmodified: true,
        };
      } finally {
        await originalPool.end().catch(() => undefined);
        await restoredPool.end().catch(() => undefined);
      }
    } catch (error) {
      return {
        ...baseResult(),
        failure: error instanceof Error ? sanitizeForLogs(error.message) : 'restore-test-failed',
      };
    }
  }
}

const requireFile = async (filePath: string, label: string): Promise<void> => {
  const stats = await fs.stat(filePath).catch(() => undefined);
  if (!stats?.isFile()) {
    throw new Error(`${label}-not-found`);
  }
};

const readManifest = async (manifestPath: string): Promise<PostgresBackupManifest> => {
  const raw = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as PostgresBackupManifest;
};

const createPool = (databaseUrl: string): Pool =>
  new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${DATABASE_SCHEMA},public`,
  });

const createTemporaryDatabaseName = (): string => {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `argos_restore_test_${timestamp}`;
};

const assertSafeTemporaryDatabase = (originalDatabase: string, temporaryDatabase: string): void => {
  if (temporaryDatabase === originalDatabase) {
    throw new Error('restore-test-temp-db-matches-original-db');
  }

  if (!/^argos_restore_test_\d{14}$/.test(temporaryDatabase)) {
    throw new Error('restore-test-temp-db-name-not-safe');
  }
};

const quoteIdentifier = (identifier: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`unsafe-identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
};

const replaceDatabaseName = (databaseUrl: string, database: string): string => {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};

const buildPgRestoreArgs = (connection: ParsedDatabaseUrl, database: string, backupPath: string): string[] => [
  '--host',
  connection.host,
  '--port',
  String(connection.port),
  '--username',
  connection.username,
  '--dbname',
  database,
  backupPath,
];

const verifyExpectedTables = async (pool: Pool): Promise<string[]> => {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type = 'BASE TABLE'
       AND table_name = ANY($2)
     ORDER BY table_name`,
    [DATABASE_SCHEMA, EXPECTED_TABLES],
  );
  const existing = result.rows.map((row) => row.table_name);
  const missing = EXPECTED_TABLES.filter((table) => !existing.includes(table));
  if (missing.length > 0) {
    throw new Error(`restore-test-missing-tables: ${missing.join(', ')}`);
  }

  return EXPECTED_TABLES;
};

const compareRowCounts = async (original: Pool, restored: Pool): Promise<TableRowCountComparison[]> => {
  const comparisons: TableRowCountComparison[] = [];
  for (const table of EXPECTED_TABLES) {
    const [originalCount, restoredCount] = await Promise.all([
      countRows(original, table),
      countRows(restored, table),
    ]);
    comparisons.push({
      table,
      original: originalCount,
      restored: restoredCount,
      match: originalCount === restoredCount,
    });
  }

  return comparisons;
};

const countRows = async (pool: Pool, table: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${DATABASE_SCHEMA}.${quoteIdentifier(table)}`);
  return Number(result.rows[0]?.count ?? 0);
};

const validateStructure = async (original: Pool, restored: Pool): Promise<StructuralValidationResult> => {
  const [originalCounts, restoredCounts] = await Promise.all([
    getStructuralCounts(original),
    getStructuralCounts(restored),
  ]);

  return {
    schemaExists: restoredCounts.tables > 0,
    tablesExist: restoredCounts.tables >= EXPECTED_TABLES.length,
    primaryKeysMatch: originalCounts.primaryKeys === restoredCounts.primaryKeys,
    foreignKeysMatch: originalCounts.foreignKeys === restoredCounts.foreignKeys,
    indexesMatch: originalCounts.indexes === restoredCounts.indexes,
    sequencesMatch: originalCounts.sequences === restoredCounts.sequences,
    schemaMigrationsMatch: originalCounts.schemaMigrations === restoredCounts.schemaMigrations,
    original: originalCounts,
    restored: restoredCounts,
  };
};

const getStructuralCounts = async (pool: Pool): Promise<StructuralCounts> => {
  const [tables, primaryKeys, foreignKeys, indexes, sequences, schemaMigrations] = await Promise.all([
    countScalar(pool, `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`, [DATABASE_SCHEMA]),
    countScalar(pool, `SELECT count(*)::text AS count FROM information_schema.table_constraints WHERE table_schema = $1 AND constraint_type = 'PRIMARY KEY'`, [DATABASE_SCHEMA]),
    countScalar(pool, `SELECT count(*)::text AS count FROM information_schema.table_constraints WHERE table_schema = $1 AND constraint_type = 'FOREIGN KEY'`, [DATABASE_SCHEMA]),
    countScalar(pool, `SELECT count(*)::text AS count FROM pg_indexes WHERE schemaname = $1`, [DATABASE_SCHEMA]),
    countScalar(pool, `SELECT count(*)::text AS count FROM information_schema.sequences WHERE sequence_schema = $1`, [DATABASE_SCHEMA]),
    countRows(pool, 'schema_migrations'),
  ]);

  return { tables, primaryKeys, foreignKeys, indexes, sequences, schemaMigrations };
};

const countScalar = async (pool: Pool, sql: string, values: unknown[]): Promise<number> => {
  const result = await pool.query<{ count: string }>(sql, values);
  return Number(result.rows[0]?.count ?? 0);
};

const validateSamples = async (original: Pool, restored: Pool): Promise<SampleValidationResult[]> => {
  const sampleDefinitions = [
    { table: 'evidence_signals', orderBy: 'detected_at' },
    { table: 'signals', orderBy: 'signal_at' },
    { table: 'evidence_target_evaluations', orderBy: 'created_at' },
  ];
  const validations: SampleValidationResult[] = [];

  for (const sample of sampleDefinitions) {
    const sampledIds = await getSampleIds(original, sample.table, sample.orderBy);
    const restoredIds = sampledIds.length > 0 ? await findExistingIds(restored, sample.table, sampledIds) : [];
    validations.push({
      table: sample.table,
      sampledIds,
      restoredIds,
      match: sampledIds.length === restoredIds.length && sampledIds.every((id) => restoredIds.includes(id)),
    });
  }

  return validations;
};

const getSampleIds = async (pool: Pool, table: string, orderBy: string): Promise<string[]> => {
  const result = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM ${DATABASE_SCHEMA}.${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(orderBy)} DESC LIMIT 3`,
  );
  return result.rows.map((row) => row.id);
};

const findExistingIds = async (pool: Pool, table: string, ids: string[]): Promise<string[]> => {
  const result = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM ${DATABASE_SCHEMA}.${quoteIdentifier(table)} WHERE id::text = ANY($1)`,
    [ids],
  );
  return result.rows.map((row) => row.id);
};

const dropTemporaryDatabaseSafely = async (
  databaseUrl: string,
  originalDatabase: string,
  temporaryDatabase: string,
): Promise<void> => {
  assertSafeTemporaryDatabase(originalDatabase, temporaryDatabase);
  const pool = createPool(databaseUrl);
  try {
    await pool.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1
         AND pid <> pg_backend_pid()`,
      [temporaryDatabase],
    );
    await pool.query(`DROP DATABASE ${quoteIdentifier(temporaryDatabase)}`);
  } finally {
    await pool.end();
  }
};

const buildInspectCommand = (connection: ParsedDatabaseUrl, database: string): string =>
  `psql --host=${connection.host} --port=${connection.port} --username=${connection.username} --dbname=${database}`;

const buildManualCleanupCommand = (connection: ParsedDatabaseUrl, database: string): string =>
  `dropdb --host=${connection.host} --port=${connection.port} --username=${connection.username} ${database}`;
