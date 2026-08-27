const runBackup = jest.fn().mockResolvedValue({
  ok: true,
  backupDate: '2026-08-27',
  path: 'backups/2026/08/27/argos.dump',
  fileSizeBytes: 123,
  sha256: 'abc',
});

jest.mock('../src/config/container', () => ({
  postgresBackupService: { runBackup },
}));

describe('databaseBackup HTTP function', () => {
  beforeEach(() => {
    runBackup.mockClear();
  });

  it('runs a manual PostgreSQL backup with POST', async () => {
    const { databaseBackup } = await import('../src/functions/databaseBackup');
    const context = { log: jest.fn(), error: jest.fn() };

    const response = await databaseBackup({ method: 'POST' } as never, context as never);

    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(expect.objectContaining({ ok: true, path: 'backups/2026/08/27/argos.dump' }));
    expect(context.log).toHaveBeenCalledWith('Database backup completed', expect.objectContaining({ sha256: 'abc' }));
  });

  it('rejects non-POST requests', async () => {
    const { databaseBackup } = await import('../src/functions/databaseBackup');
    const context = { log: jest.fn(), error: jest.fn() };

    const response = await databaseBackup({ method: 'GET' } as never, context as never);

    expect(response.status).toBe(405);
    expect(runBackup).not.toHaveBeenCalled();
  });
});

export {};
