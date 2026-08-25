import { promises as fs } from 'fs';
import path from 'path';
import type { Queryable } from './postgres';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export const runMigrations = async (
  database: Queryable,
  migrationsDirectory = path.resolve(process.cwd(), 'migrations'),
): Promise<MigrationResult> => {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = await database.query('SELECT id FROM schema_migrations WHERE id = $1', [file]);

    if (existing.rowCount && existing.rowCount > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');

    await database.query('BEGIN');
    try {
      await database.query(sql);
      await database.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await database.query('COMMIT');
      applied.push(file);
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  return { applied, skipped };
};
