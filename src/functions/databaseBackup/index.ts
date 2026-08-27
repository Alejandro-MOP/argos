import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { postgresBackupService } from '../../config/container';

export async function databaseBackup(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method !== 'POST') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use POST /api/database-backup',
      },
    };
  }

  if (!postgresBackupService) {
    return {
      status: 503,
      jsonBody: {
        ok: false,
        error: 'database-backup-unavailable',
        message: 'DATABASE_URL is required to run PostgreSQL backups.',
      },
    };
  }

  try {
    const result = await postgresBackupService.runBackup();
    context.log('Database backup completed', {
      backupDate: result.backupDate,
      path: result.path,
      fileSizeBytes: result.fileSizeBytes,
      sha256: result.sha256,
    });

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'database-backup-failed';
    context.error('Database backup failed', { message });

    return {
      status: 500,
      jsonBody: {
        ok: false,
        error: 'database-backup-failed',
        message,
      },
    };
  }
}

app.http('databaseBackup', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'database-backup',
  handler: databaseBackup,
});
