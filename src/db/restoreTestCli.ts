import dotenv from 'dotenv';
import { ProcessCommandRunner } from '../adapters/CommandRunner';
import { env } from '../config/env';
import { PostgresBackupRestoreTestService } from '../services/PostgresBackupRestoreTestService';

dotenv.config();

const main = async (): Promise<void> => {
  const backupPath = process.argv[2];

  if (!backupPath) {
    throw new Error('Usage: npm run db:backup:restore-test -- <path-to-argos.dump>');
  }

  if (!env.databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required to run database restore test');
  }

  const service = new PostgresBackupRestoreTestService(new ProcessCommandRunner(), env.databaseUrl, env.databasePgRestoreBin);
  const result = await service.run({ backupPath });
  console.log(JSON.stringify(result, null, 2));

  if (result.status !== 'PASSED') {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'database-backup-restore-test-failed');
  process.exitCode = 1;
});
