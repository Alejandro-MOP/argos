import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { CommandRunner, CommandRunOptions, CommandRunResult } from '../src/adapters/CommandRunner';
import type { Queryable } from '../src/db/postgres';
import {
  buildRestoreInstructions,
  parseDatabaseUrl,
  PostgresBackupService,
  resolveDateParts,
  sanitizeForLogs,
} from '../src/services/PostgresBackupService';

class FakeCommandRunner implements CommandRunner {
  public calls: Array<{ command: string; args: string[]; options?: CommandRunOptions }> = [];
  public failPgDump = false;
  public failPgRestoreList = false;
  public emptyDump = false;

  public async run(command: string, args: string[], options?: CommandRunOptions): Promise<CommandRunResult> {
    this.calls.push({ command, args, options });

    if (args[0] === '--version') {
      const versions: Record<string, string> = {
        pg_dump: 'pg_dump (PostgreSQL) 17.6 (Homebrew)',
        pg_restore: 'pg_restore (PostgreSQL) 17.6 (Homebrew)',
        psql: 'psql (PostgreSQL) 17.6 (Homebrew)',
      };

      return { exitCode: 0, stdout: versions[command] ?? '', stderr: '' };
    }

    if (command === 'pg_dump') {
      const file = args[args.indexOf('--file') + 1];
      if (!this.failPgDump) {
        await fs.writeFile(file, this.emptyDump ? '' : 'fake custom dump');
      }

      return this.failPgDump
        ? { exitCode: 1, stdout: '', stderr: 'pg_dump failed for postgres://user:secret@localhost/db' }
        : { exitCode: 0, stdout: '', stderr: '' };
    }

    if (command === 'pg_restore' && args[0] === '--list') {
      return this.failPgRestoreList
        ? { exitCode: 1, stdout: '', stderr: 'bad dump' }
        : { exitCode: 0, stdout: '1; schema\n2; table\n', stderr: '' };
    }

    return { exitCode: 0, stdout: '', stderr: '' };
  }
}

const buildDatabase = (): Queryable => ({
  query: jest.fn(async (sql: string) => {
    if (sql === 'SELECT version() AS version') {
      return { rows: [{ version: 'PostgreSQL 16.15 on x86_64-pc-linux-musl' }], rowCount: 1 } as never;
    }
    if (sql === 'SHOW server_version') {
      return { rows: [{ server_version: '16.15' }], rowCount: 1 } as never;
    }
    if (sql === 'SHOW server_version_num') {
      return { rows: [{ server_version_num: '160015' }], rowCount: 1 } as never;
    }

    throw new Error(`Unexpected query: ${sql}`);
  }),
});

const createService = async (runner = new FakeCommandRunner()) => {
  const basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'argos-backup-test-'));
  const service = new PostgresBackupService(buildDatabase(), runner, {
    databaseUrl: 'postgres://market_signal_engine:super_secret@localhost:15432/market_signal_engine',
    basePath,
    timezone: 'America/Mexico_City',
    now: () => new Date('2026-08-27T05:10:00.000Z'),
  });

  return { service, runner, basePath };
};

describe('PostgresBackupService', () => {
  it('resolves YYYY/MM/DD using the configured timezone', () => {
    expect(resolveDateParts(new Date('2026-08-27T05:10:00.000Z'), 'America/Mexico_City')).toEqual({
      year: '2026',
      month: '08',
      day: '26',
      isoDate: '2026-08-26',
    });
  });

  it('creates daily backup directory, dump, manifest and RESTORE.md', async () => {
    const { service, runner, basePath } = await createService();

    const result = await service.runBackup();

    expect(result.path).toContain('2026/08/26/argos.dump');
    await expect(fs.stat(path.join(basePath, '2026/08/26/argos.dump'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(basePath, '2026/08/26/manifest.json'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(basePath, '2026/08/26/RESTORE.md'))).resolves.toBeTruthy();
    expect(runner.calls.some((call) => call.command === 'pg_dump')).toBe(true);
    expect(runner.calls.some((call) => call.command === 'pg_restore' && call.args[0] === '--list')).toBe(true);
  });

  it('builds pg_dump command without embedding the password in args', async () => {
    const { service, runner } = await createService();

    await service.runBackup();

    const pgDump = runner.calls.find((call) => call.command === 'pg_dump' && call.args.includes('--format=custom'));
    expect(pgDump?.args).toEqual(expect.arrayContaining(['--format=custom', '--host', 'localhost', '--port', '15432', '--username', 'market_signal_engine', '--dbname', 'market_signal_engine']));
    expect(pgDump?.args.join(' ')).not.toContain('super_secret');
    expect(pgDump?.options?.env?.PGPASSWORD).toBe('super_secret');
  });

  it('does not expose password in manifest or RESTORE.md', async () => {
    const { service, basePath } = await createService();

    await service.runBackup();

    const manifest = await fs.readFile(path.join(basePath, '2026/08/26/manifest.json'), 'utf8');
    const restore = await fs.readFile(path.join(basePath, '2026/08/26/RESTORE.md'), 'utf8');
    expect(manifest).not.toContain('super_secret');
    expect(restore).not.toContain('super_secret');
    expect(restore).toContain('<SET_PASSWORD_MANUALLY>');
  });

  it('does not mark backup completed when pg_dump fails and preserves existing dump', async () => {
    const runner = new FakeCommandRunner();
    runner.failPgDump = true;
    const { service, basePath } = await createService(runner);
    const directory = path.join(basePath, '2026/08/26');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'argos.dump'), 'valid previous dump');

    await expect(service.runBackup()).rejects.toThrow('pg-dump-failed');

    await expect(fs.readFile(path.join(directory, 'argos.dump'), 'utf8')).resolves.toBe('valid previous dump');
    await expect(fs.stat(path.join(directory, 'argos.dump.tmp'))).rejects.toThrow();
    await expect(fs.stat(path.join(directory, 'manifest.json'))).rejects.toThrow();
  });

  it('rejects empty dumps', async () => {
    const runner = new FakeCommandRunner();
    runner.emptyDump = true;
    const { service } = await createService(runner);

    await expect(service.runBackup()).rejects.toThrow('postgres-backup-empty-dump');
  });

  it('rejects dumps that pg_restore --list cannot read', async () => {
    const runner = new FakeCommandRunner();
    runner.failPgRestoreList = true;
    const { service } = await createService(runner);

    await expect(service.runBackup()).rejects.toThrow('pg-restore-list-failed');
  });

  it('calculates SHA-256 and stores database/tooling versions in manifest', async () => {
    const { service, basePath } = await createService();

    await service.runBackup();

    const manifest = JSON.parse(await fs.readFile(path.join(basePath, '2026/08/26/manifest.json'), 'utf8')) as {
      backup: { sha256: string; fileSizeBytes: number };
      database: { postgresServerVersion: string; postgresServerVersionNumber: string };
      tools: { pgDumpVersion: string; pgRestoreVersion: string; psqlVersion: string };
    };

    expect(manifest.backup.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.backup.fileSizeBytes).toBeGreaterThan(0);
    expect(manifest.database.postgresServerVersion).toContain('PostgreSQL 16.15');
    expect(manifest.database.postgresServerVersionNumber).toBe('160015');
    expect(manifest.tools.pgDumpVersion).toContain('17.6');
    expect(manifest.tools.pgRestoreVersion).toContain('17.6');
    expect(manifest.tools.psqlVersion).toContain('17.6');
  });

  it('re-executes safely for the same day by replacing only the current day dump after success', async () => {
    const { service, basePath } = await createService();

    await service.runBackup();
    await service.runBackup();

    await expect(fs.stat(path.join(basePath, '2026/08/26/argos.dump'))).resolves.toBeTruthy();
  });

  it('does not touch previous day folders automatically', async () => {
    const { service, basePath } = await createService();
    const previous = path.join(basePath, '2026/08/25/argos.dump');
    await fs.mkdir(path.dirname(previous), { recursive: true });
    await fs.writeFile(previous, 'previous day');

    await service.runBackup();

    await expect(fs.readFile(previous, 'utf8')).resolves.toBe('previous day');
  });

  it('sanitizes connection strings for logs', () => {
    expect(sanitizeForLogs('failed postgres://user:secret@localhost:5432/db')).not.toContain('secret');
  });

  it('parses DATABASE_URL without leaking credentials', () => {
    expect(parseDatabaseUrl('postgres://user:secret@localhost:15432/db')).toEqual({
      host: 'localhost',
      port: 15432,
      database: 'db',
      username: 'user',
      password: 'secret',
    });
  });

  it('documents recovery steps without destructive commands', () => {
    const instructions = buildRestoreInstructions({
      application: 'ARGOS',
      backupType: 'POSTGRESQL_CUSTOM_DUMP',
      backupDate: '2026-08-27',
      generatedAt: '2026-08-27T12:00:00.000Z',
      timezone: 'America/Mexico_City',
      status: 'COMPLETED',
      database: {
        name: 'market_signal_engine',
        host: 'localhost',
        port: 15432,
        username: 'market_signal_engine',
        postgresServerVersion: 'PostgreSQL 16.15',
        postgresServerVersionNumber: '160015',
        schema: 'market_signal_engine',
      },
      tools: {
        pgDumpVersion: 'pg_dump (PostgreSQL) 17.6',
        pgRestoreVersion: 'pg_restore (PostgreSQL) 17.6',
        psqlVersion: 'psql (PostgreSQL) 17.6',
      },
      backup: { format: 'custom', file: 'argos.dump', fileSizeBytes: 1, sha256: 'abc' },
      compatibility: { recommendedPostgresVersion: '16.15', notes: 'notes' },
      recovery: { instructionsFile: 'RESTORE.md' },
    });

    expect(instructions).toContain('ARGOS PostgreSQL Recovery');
    expect(instructions).toContain('createdb');
    expect(instructions).toContain('pg_restore');
    expect(instructions).toContain('DROP DATABASE');
  });

  it('does not execute destructive commands during backup generation', async () => {
    const { service, runner } = await createService();

    await service.runBackup();

    const commandText = runner.calls
      .map((call) => [call.command, ...call.args].join(' '))
      .join('\n')
      .toUpperCase();

    expect(commandText).not.toContain('DROP ');
    expect(commandText).not.toContain('TRUNCATE ');
    expect(commandText).not.toContain('DELETE ');
  });

});
