import { spawn } from 'child_process';

export interface CommandRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: CommandRunOptions): Promise<CommandRunResult>;
}

export class ProcessCommandRunner implements CommandRunner {
  public run(command: string, args: string[], options: CommandRunOptions = {}): Promise<CommandRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  }
}
