import dotenv from 'dotenv';
import { ProcessCommandRunner } from '../adapters/CommandRunner';
import { env } from '../config/env';
import { createPostgresPool } from './postgres';
import { PostgresBackupService } from '../services/PostgresBackupService';

dotenv.config();

const main = async (): Promise<void> => {
  if (!env.databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required to run database backup');
  }

  const pool = createPostgresPool(env.databaseUrl);
  const service = new PostgresBackupService(pool, new ProcessCommandRunner(), {
    databaseUrl: env.databaseUrl,
    basePath: env.databaseBackupBasePath,
    timezone: env.databaseBackupTimezone,
  });

  try {
    const result = await service.runBackup();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'database-backup-failed');
  process.exitCode = 1;
});
