import { promises as fs } from 'fs';
import path from 'path';
import { DATABASE_SCHEMA, type Queryable } from './postgres';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export const runMigrations = async (
  database: Queryable,
  migrationsDirectory = path.resolve(process.cwd(), 'migrations'),
): Promise<MigrationResult> => {
  const migrationsTable = `${DATABASE_SCHEMA}.schema_migrations`;

  await database.query(`CREATE SCHEMA IF NOT EXISTS ${DATABASE_SCHEMA}`);
  await database.query(`
    CREATE TABLE IF NOT EXISTS ${migrationsTable} (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await copyLegacyMigrationHistory(database, migrationsTable);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = await database.query(`SELECT id FROM ${migrationsTable} WHERE id = $1`, [file]);

    if (existing.rowCount && existing.rowCount > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');

    await database.query('BEGIN');
    try {
      await database.query(sql);
      await database.query(`INSERT INTO ${migrationsTable} (id) VALUES ($1)`, [file]);
      await database.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  return { applied, skipped };
};


const copyLegacyMigrationHistory = async (
  database: Queryable,
  migrationsTable: string,
): Promise<void> => {
  const legacyTable = await database.query<{ table_name: string | null }>(
    "SELECT to_regclass('public.schema_migrations')::text AS table_name",
  );

  if (!legacyTable.rows[0]?.table_name) {
    return;
  }

  await database.query(`
    INSERT INTO ${migrationsTable} (id, applied_at)
    SELECT id, applied_at
    FROM public.schema_migrations
    ON CONFLICT (id) DO NOTHING
  `);
};
