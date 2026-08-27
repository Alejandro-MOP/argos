import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { CommandRunner } from '../adapters/CommandRunner';
import { DATABASE_SCHEMA, type Queryable } from '../db/postgres';

export interface PostgresBackupConfig {
  databaseUrl: string;
  basePath: string;
  timezone: string;
  schema?: string;
  application?: string;
  now?: () => Date;
}

export interface PostgresBackupManifest {
  application: string;
  backupType: 'POSTGRESQL_CUSTOM_DUMP';
  backupDate: string;
  generatedAt: string;
  timezone: string;
  status: 'COMPLETED';
  database: {
    name: string;
    host?: string;
    port?: number;
    username?: string;
    postgresServerVersion: string;
    postgresServerVersionNumber: string;
    schema: string;
  };
  tools: {
    pgDumpVersion: string;
    pgRestoreVersion: string;
    psqlVersion: string;
  };
  backup: {
    format: 'custom';
    file: 'argos.dump';
    fileSizeBytes: number;
    sha256: string;
  };
  compatibility: {
    recommendedPostgresVersion: string;
    notes: string;
  };
  recovery: {
    instructionsFile: 'RESTORE.md';
  };
}

export interface PostgresBackupResult {
  ok: true;
  backupDate: string;
  directory: string;
  path: string;
  manifest: string;
  recoveryInstructions: string;
  postgresVersion: string;
  postgresServerVersionNumber: string;
  pgDumpVersion: string;
  pgRestoreVersion: string;
  psqlVersion: string;
  fileSizeBytes: number;
  sha256: string;
  validated: true;
  durationMs: number;
}

export interface DatabaseVersionInfo {
  postgresServerVersion: string;
  postgresServerVersionNumber: string;
  serverVersion: string;
}

const DUMP_FILE = 'argos.dump';
const TMP_DUMP_FILE = 'argos.dump.tmp';
const MANIFEST_FILE = 'manifest.json';
const RESTORE_FILE = 'RESTORE.md';

export class PostgresBackupService {
  public constructor(
    private readonly database: Queryable,
    private readonly commandRunner: CommandRunner,
    private readonly config: PostgresBackupConfig,
  ) {}

  public async runBackup(): Promise<PostgresBackupResult> {
    const startedAt = Date.now();
    const connection = parseDatabaseUrl(this.config.databaseUrl);
    const backupDate = resolveDateParts(this.config.now?.() ?? new Date(), this.config.timezone);
    const backupDirectory = path.resolve(
      this.config.basePath,
      backupDate.year,
      backupDate.month,
      backupDate.day,
    );
    const dumpPath = path.join(backupDirectory, DUMP_FILE);
    const tmpDumpPath = path.join(backupDirectory, TMP_DUMP_FILE);
    const manifestPath = path.join(backupDirectory, MANIFEST_FILE);
    const restorePath = path.join(backupDirectory, RESTORE_FILE);

    await fs.mkdir(backupDirectory, { recursive: true });
    await removeIfExists(tmpDumpPath);

    const [databaseVersion, pgDumpVersion, pgRestoreVersion, psqlVersion] = await Promise.all([
      this.getDatabaseVersionInfo(),
      this.getToolVersion('pg_dump'),
      this.getToolVersion('pg_restore'),
      this.getToolVersion('psql'),
    ]);

    try {
      await this.runPgDump(connection, tmpDumpPath);
      await this.validateDumpFile(tmpDumpPath);
      await this.validatePgRestoreList(tmpDumpPath, connection.password);
      await fs.rename(tmpDumpPath, dumpPath);
    } catch (error) {
      await removeIfExists(tmpDumpPath);
      throw error;
    }

    const fileSizeBytes = (await fs.stat(dumpPath)).size;
    const sha256 = await calculateSha256(dumpPath);
    const manifest: PostgresBackupManifest = {
      application: this.config.application ?? 'ARGOS',
      backupType: 'POSTGRESQL_CUSTOM_DUMP',
      backupDate: backupDate.isoDate,
      generatedAt: new Date().toISOString(),
      timezone: this.config.timezone,
      status: 'COMPLETED',
      database: {
        name: connection.database,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        postgresServerVersion: databaseVersion.postgresServerVersion,
        postgresServerVersionNumber: databaseVersion.postgresServerVersionNumber,
        schema: this.config.schema ?? DATABASE_SCHEMA,
      },
      tools: {
        pgDumpVersion,
        pgRestoreVersion,
        psqlVersion,
      },
      backup: {
        format: 'custom',
        file: DUMP_FILE,
        fileSizeBytes,
        sha256,
      },
      compatibility: {
        recommendedPostgresVersion: databaseVersion.serverVersion,
        notes: buildCompatibilityNotes(databaseVersion.serverVersion, pgDumpVersion, pgRestoreVersion),
      },
      recovery: {
        instructionsFile: RESTORE_FILE,
      },
    };

    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await fs.writeFile(restorePath, buildRestoreInstructions(manifest), 'utf8');

    return {
      ok: true,
      backupDate: backupDate.isoDate,
      directory: toPortablePath(path.relative(process.cwd(), backupDirectory) || backupDirectory),
      path: toPortablePath(path.relative(process.cwd(), dumpPath) || dumpPath),
      manifest: toPortablePath(path.relative(process.cwd(), manifestPath) || manifestPath),
      recoveryInstructions: toPortablePath(path.relative(process.cwd(), restorePath) || restorePath),
      postgresVersion: databaseVersion.postgresServerVersion,
      postgresServerVersionNumber: databaseVersion.postgresServerVersionNumber,
      pgDumpVersion,
      pgRestoreVersion,
      psqlVersion,
      fileSizeBytes,
      sha256,
      validated: true,
      durationMs: Date.now() - startedAt,
    };
  }

  private async getDatabaseVersionInfo(): Promise<DatabaseVersionInfo> {
    const version = await this.database.query<{ version: string }>('SELECT version() AS version');
    const serverVersion = await this.database.query<{ server_version: string }>('SHOW server_version');
    const serverVersionNum = await this.database.query<{ server_version_num: string }>('SHOW server_version_num');

    return {
      postgresServerVersion: version.rows[0]?.version ?? 'unknown',
      serverVersion: serverVersion.rows[0]?.server_version ?? 'unknown',
      postgresServerVersionNumber: serverVersionNum.rows[0]?.server_version_num ?? 'unknown',
    };
  }

  private async getToolVersion(command: 'pg_dump' | 'pg_restore' | 'psql'): Promise<string> {
    const result = await this.commandRunner.run(command, ['--version']);
    if (result.exitCode !== 0) {
      throw new Error(`${command}-version-failed: ${sanitizeForLogs(result.stderr || result.stdout)}`);
    }

    return (result.stdout || result.stderr).trim();
  }

  private async runPgDump(connection: ParsedDatabaseUrl, outputPath: string): Promise<void> {
    const result = await this.commandRunner.run('pg_dump', [
      '--format=custom',
      '--file',
      outputPath,
      '--host',
      connection.host,
      '--port',
      String(connection.port),
      '--username',
      connection.username,
      '--dbname',
      connection.database,
    ], {
      env: buildPostgresToolEnv(connection.password),
    });

    if (result.exitCode !== 0) {
      throw new Error(`pg-dump-failed: ${sanitizeForLogs(result.stderr || result.stdout)}`);
    }
  }

  private async validateDumpFile(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath).catch(() => undefined);
    if (!stats?.isFile() || stats.size <= 0) {
      throw new Error('postgres-backup-empty-dump');
    }
  }

  private async validatePgRestoreList(filePath: string, password?: string): Promise<void> {
    const result = await this.commandRunner.run('pg_restore', ['--list', filePath], {
      env: buildPostgresToolEnv(password),
    });

    if (result.exitCode !== 0) {
      throw new Error(`pg-restore-list-failed: ${sanitizeForLogs(result.stderr || result.stdout)}`);
    }
  }
}

export interface ParsedDatabaseUrl {
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
}

export const parseDatabaseUrl = (databaseUrl: string): ParsedDatabaseUrl => {
  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required for database backup');
  }

  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, '');

  if (!database || !parsed.username) {
    throw new Error('DATABASE_URL must include database name and username');
  }

  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 5432,
    database,
    username: decodeURIComponent(parsed.username),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
};

export const sanitizeForLogs = (value: string): string =>
  value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/PASSWORD\s+[^\s;]+/gi, 'PASSWORD [REDACTED]');

export const resolveDateParts = (date: Date, timezone: string): { year: string; month: string; day: string; isoDate: string } => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve backup date for timezone ${timezone}`);
  }

  return { year, month, day, isoDate: `${year}-${month}-${day}` };
};

export const calculateSha256 = async (filePath: string): Promise<string> => {
  const file = await fs.readFile(filePath);
  return createHash('sha256').update(file).digest('hex');
};

export const buildPostgresToolEnv = (password?: string): NodeJS.ProcessEnv => ({
  ...process.env,
  ...(password ? { PGPASSWORD: password } : {}),
});

const removeIfExists = async (filePath: string): Promise<void> => {
  await fs.rm(filePath, { force: true });
};

const toPortablePath = (value: string): string => value.split(path.sep).join('/');

const buildCompatibilityNotes = (
  serverVersion: string,
  pgDumpVersion: string,
  pgRestoreVersion: string,
): string =>
  [
    `This snapshot was created from PostgreSQL server ${serverVersion}.`,
    'Use PostgreSQL client tools compatible with the recorded server/dump version.',
    `Recorded tools: ${pgDumpVersion}; ${pgRestoreVersion}.`,
    'If pg_dump is older than the server, PostgreSQL can refuse the dump; do not ignore that failure.',
  ].join(' ');

export const buildRestoreInstructions = (manifest: PostgresBackupManifest): string => {
  const majorVersion = manifest.database.postgresServerVersionNumber.length >= 2
    ? Number.parseInt(manifest.database.postgresServerVersionNumber.slice(0, -4), 10)
    : undefined;
  const postgresqlPackage = Number.isFinite(majorVersion) ? `postgresql@${majorVersion}` : 'postgresql';
  const port = manifest.database.port ?? 5432;
  const username = manifest.database.username ?? '<ROLE_NAME>';

  return `# ARGOS PostgreSQL Recovery

## Snapshot

- Backup date: ${manifest.backupDate}
- Generated at: ${manifest.generatedAt}
- PostgreSQL server version: ${manifest.database.postgresServerVersion}
- PostgreSQL server version number: ${manifest.database.postgresServerVersionNumber}
- pg_dump version: ${manifest.tools.pgDumpVersion}
- pg_restore version: ${manifest.tools.pgRestoreVersion}
- psql version: ${manifest.tools.psqlVersion}
- Dump format: ${manifest.backup.format}
- SHA-256: ${manifest.backup.sha256}

## Requirements

You need PostgreSQL client tooling compatible with this snapshot:

- PostgreSQL server / client tools
- pg_restore
- psql
- createdb

Recommended starting point based on this snapshot:

\`\`\`bash
brew install ${postgresqlPackage}
\`\`\`

If Homebrew reports that the package is already installed, ensure its \`bin\` directory is on your \`PATH\` before restoring.

## Verify checksum first

Do not restore if the checksum does not match.

macOS:

\`\`\`bash
shasum -a 256 argos.dump
\`\`\`

Compare the output with the SHA-256 recorded above and in \`manifest.json\`.

## Rebuild PostgreSQL locally if needed

Start PostgreSQL using your preferred local setup. With Homebrew this is commonly:

\`\`\`bash
brew services start ${postgresqlPackage}
psql --version
pg_restore --version
\`\`\`

Create the role manually if it does not exist. Never paste real passwords into Git-tracked files:

\`\`\`sql
CREATE ROLE ${username}
WITH LOGIN PASSWORD '<SET_PASSWORD_MANUALLY>';
\`\`\`

## Restore safely into a new database first

Prefer restoring into a new validation database before touching any active ARGOS database.

\`\`\`bash
createdb \\
  --host=localhost \\
  --port=${port} \\
  --username=${username} \\
  argos_restore_test

pg_restore \\
  --host=localhost \\
  --port=${port} \\
  --username=${username} \\
  --dbname=argos_restore_test \\
  argos.dump
\`\`\`

This guide intentionally does not recommend restoring over the active database as the first step.

## Inspect dump contents without restoring

\`\`\`bash
pg_restore --list argos.dump
\`\`\`

## Post-restore verification queries

\`\`\`sql
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('${manifest.database.schema}', 'public')
ORDER BY schema_name;

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = '${manifest.database.schema}'
ORDER BY table_name;

SELECT count(*) FROM ${manifest.database.schema}.schema_migrations;
SELECT count(*) FROM ${manifest.database.schema}.evidence_signals;
SELECT count(*) FROM ${manifest.database.schema}.evidence_signal_evaluations;
SELECT count(*) FROM ${manifest.database.schema}.evidence_target_evaluations;
SELECT count(*) FROM ${manifest.database.schema}.engine_config;
SELECT count(*) FROM ${manifest.database.schema}.market_symbols;
\`\`\`

## Safety notes

- This snapshot is a PostgreSQL custom dump created with \`pg_dump -Fc\`.
- No passwords are stored in this file or in \`manifest.json\`.
- Restore drills should be done against disposable databases first.
- Do not run destructive commands such as \`DROP DATABASE\`, \`DROP SCHEMA\`, \`TRUNCATE\` or \`DELETE\` as part of routine backup verification.
`;
};
