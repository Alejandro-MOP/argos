const importFunction = async (enabled: boolean, service: unknown) => {
  jest.resetModules();
  jest.doMock('../src/config/env', () => ({
    env: {
      databaseBackupEnabled: enabled,
      databaseBackupSchedule: '0 50 5 * * *',
    },
  }));
  jest.doMock('../src/config/container', () => ({
    postgresBackupService: service,
  }));

  return import('../src/functions/dailyDatabaseBackup');
};

describe('dailyDatabaseBackup timer function', () => {
  it('skips when DATABASE_BACKUP_ENABLED=false', async () => {
    const runBackup = jest.fn();
    const { dailyDatabaseBackup } = await importFunction(false, { runBackup });
    const context = { log: jest.fn(), error: jest.fn() };

    await dailyDatabaseBackup({} as never, context as never);

    expect(runBackup).not.toHaveBeenCalled();
    expect(context.log).toHaveBeenCalledWith('Daily database backup skipped: DATABASE_BACKUP_ENABLED=false');
  });

  it('runs backup when enabled', async () => {
    const runBackup = jest.fn().mockResolvedValue({
      backupDate: '2026-08-27',
      path: 'backups/2026/08/27/argos.dump',
      fileSizeBytes: 123,
      sha256: 'abc',
    });
    const { dailyDatabaseBackup } = await importFunction(true, { runBackup });
    const context = { log: jest.fn(), error: jest.fn() };

    await dailyDatabaseBackup({} as never, context as never);

    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(context.log).toHaveBeenCalledWith('Daily database backup completed', expect.objectContaining({ sha256: 'abc' }));
  });

  it('logs an explicit error when DATABASE_URL is not configured', async () => {
    const { dailyDatabaseBackup } = await importFunction(true, undefined);
    const context = { log: jest.fn(), error: jest.fn() };

    await dailyDatabaseBackup({} as never, context as never);

    expect(context.error).toHaveBeenCalledWith('Daily database backup unavailable: DATABASE_URL is required');
  });
});

export {};
