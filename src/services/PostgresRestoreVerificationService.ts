import { promises as fs } from 'fs';
import path from 'path';
import type { CommandRunner } from '../adapters/CommandRunner';
import { calculateSha256, type PostgresBackupManifest } from './PostgresBackupService';

export interface RestoreVerificationRequest {
  backupPath: string;
  restoreDatabase?: string;
}

export interface RestoreVerificationResult {
  ok: true;
  backupPath: string;
  manifestPath: string;
  checksumValid: true;
  sha256: string;
  pgRestoreListValid: true;
  listedEntries: number;
  restoredToDatabase?: string;
}

export class PostgresRestoreVerificationService {
  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly pgRestoreCommand = 'pg_restore',
  ) {}

  public async verify(request: RestoreVerificationRequest): Promise<RestoreVerificationResult> {
    const backupPath = path.resolve(request.backupPath);
    const manifestPath = path.join(path.dirname(backupPath), 'manifest.json');
    const manifest = await readManifest(manifestPath);
    const sha256 = await calculateSha256(backupPath);

    if (sha256 !== manifest.backup.sha256) {
      throw new Error('backup-checksum-mismatch');
    }

    const listResult = await this.commandRunner.run(this.pgRestoreCommand, ['--list', backupPath]);
    if (listResult.exitCode !== 0) {
      throw new Error(`pg-restore-list-failed: ${listResult.stderr || listResult.stdout}`);
    }

    if (request.restoreDatabase?.trim()) {
      const restoreResult = await this.commandRunner.run(this.pgRestoreCommand, [
        '--dbname',
        request.restoreDatabase.trim(),
        backupPath,
      ]);
      if (restoreResult.exitCode !== 0) {
        throw new Error(`pg-restore-verify-restore-failed: ${restoreResult.stderr || restoreResult.stdout}`);
      }
    }

    return {
      ok: true,
      backupPath,
      manifestPath,
      checksumValid: true,
      sha256,
      pgRestoreListValid: true,
      listedEntries: listResult.stdout.split('\n').filter((line) => line.trim()).length,
      restoredToDatabase: request.restoreDatabase?.trim() || undefined,
    };
  }
}

const readManifest = async (manifestPath: string): Promise<PostgresBackupManifest> => {
  const raw = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as PostgresBackupManifest;
};
