import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { CommandRunner, CommandRunResult } from '../src/adapters/CommandRunner';
import { calculateSha256, type PostgresBackupManifest } from '../src/services/PostgresBackupService';
import { PostgresRestoreVerificationService } from '../src/services/PostgresRestoreVerificationService';

class FakeCommandRunner implements CommandRunner {
  public calls: Array<{ command: string; args: string[] }> = [];
  public failList = false;
  public failRestore = false;

  public async run(command: string, args: string[]): Promise<CommandRunResult> {
    this.calls.push({ command, args });

    if (command === 'pg_restore' && args[0] === '--list') {
      return this.failList
        ? { exitCode: 1, stdout: '', stderr: 'invalid dump' }
        : { exitCode: 0, stdout: '1; schema\n2; table\n', stderr: '' };
    }

    if (command === 'pg_restore' && args[0] === '--dbname') {
      return this.failRestore
        ? { exitCode: 1, stdout: '', stderr: 'restore failed' }
        : { exitCode: 0, stdout: '', stderr: '' };
    }

    return { exitCode: 1, stdout: '', stderr: `unexpected command: ${command}` };
  }
}

const createSnapshot = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'argos-verify-test-'));
  const dumpPath = path.join(directory, 'argos.dump');
  await fs.writeFile(dumpPath, 'fake custom dump');
  const sha256 = await calculateSha256(dumpPath);
  const manifest: Pick<PostgresBackupManifest, 'backup'> = {
    backup: {
      format: 'custom',
      file: 'argos.dump',
      fileSizeBytes: 16,
      sha256,
    },
  };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');

  return { directory, dumpPath, sha256 };
};

describe('PostgresRestoreVerificationService', () => {
  it('validates checksum and pg_restore --list without restoring by default', async () => {
    const { dumpPath, sha256 } = await createSnapshot();
    const runner = new FakeCommandRunner();
    const service = new PostgresRestoreVerificationService(runner);

    const result = await service.verify({ backupPath: dumpPath });

    expect(result.sha256).toBe(sha256);
    expect(result.pgRestoreListValid).toBe(true);
    expect(result.listedEntries).toBe(2);
    expect(runner.calls).toEqual([{ command: 'pg_restore', args: ['--list', dumpPath] }]);
  });

  it('rejects checksum mismatches', async () => {
    const { directory, dumpPath } = await createSnapshot();
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ backup: { sha256: 'bad' } }), 'utf8');
    const service = new PostgresRestoreVerificationService(new FakeCommandRunner());

    await expect(service.verify({ backupPath: dumpPath })).rejects.toThrow('backup-checksum-mismatch');
  });

  it('supports explicit restore verification to a provided database only', async () => {
    const { dumpPath } = await createSnapshot();
    const runner = new FakeCommandRunner();
    const service = new PostgresRestoreVerificationService(runner);

    await service.verify({ backupPath: dumpPath, restoreDatabase: 'argos_restore_test' });

    expect(runner.calls).toContainEqual({
      command: 'pg_restore',
      args: ['--dbname', 'argos_restore_test', dumpPath],
    });
  });

  it('does not execute destructive commands', async () => {
    const { dumpPath } = await createSnapshot();
    const runner = new FakeCommandRunner();
    const service = new PostgresRestoreVerificationService(runner);

    await service.verify({ backupPath: dumpPath, restoreDatabase: 'argos_restore_test' });

    const commandText = runner.calls
      .map((call) => [call.command, ...call.args].join(' '))
      .join('\\n')
      .toUpperCase();
    expect(commandText).not.toContain('DROP ');
    expect(commandText).not.toContain('DELETE ');
    expect(commandText).not.toContain('TRUNCATE ');
  });
});
