import { ProcessCommandRunner } from '../adapters/CommandRunner';
import { env } from '../config/env';
import { PostgresRestoreVerificationService } from '../services/PostgresRestoreVerificationService';

const main = async (): Promise<void> => {
  const backupPath = process.argv[2];
  const restoreDatabase = parseRestoreDatabase(process.argv.slice(3));

  if (!backupPath) {
    throw new Error('Usage: npm run db:backup:verify -- <path-to-argos.dump> [--restore-to <database>]');
  }

  const service = new PostgresRestoreVerificationService(new ProcessCommandRunner(), env.databasePgRestoreBin);
  const result = await service.verify({ backupPath, restoreDatabase });
  console.log(JSON.stringify(result, null, 2));
};

const parseRestoreDatabase = (args: string[]): string | undefined => {
  const index = args.indexOf('--restore-to');
  if (index === -1) {
    return undefined;
  }

  return args[index + 1]?.trim() || undefined;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'database-backup-verification-failed');
  process.exitCode = 1;
});
