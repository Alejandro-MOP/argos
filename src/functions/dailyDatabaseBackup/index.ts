import { app, type InvocationContext, type Timer } from '@azure/functions';
import { env } from '../../config/env';
import { postgresBackupService } from '../../config/container';

export async function dailyDatabaseBackup(_timer: Timer, context: InvocationContext): Promise<void> {
  if (!env.databaseBackupEnabled) {
    context.log('Daily database backup skipped: DATABASE_BACKUP_ENABLED=false');
    return;
  }

  if (!postgresBackupService) {
    context.error('Daily database backup unavailable: DATABASE_URL is required');
    return;
  }

  const result = await postgresBackupService.runBackup();
  context.log('Daily database backup completed', {
    backupDate: result.backupDate,
    path: result.path,
    fileSizeBytes: result.fileSizeBytes,
    sha256: result.sha256,
  });
}

app.timer('dailyDatabaseBackup', {
  schedule: env.databaseBackupSchedule,
  handler: dailyDatabaseBackup,
});
