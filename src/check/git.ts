import { execFile } from 'node:child_process';

export class GitError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

// arguments go straight to git with no shell, so PR text cannot inject commands
export function git(cwd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === 'number' ? error.code : null;
          reject(new GitError(`git ${args[0] ?? ''} failed: ${stderr.trim() || error.message}`, stderr, code));
        }
        else resolve(stdout);
      },
    );
    if (input !== undefined) child.stdin?.end(input);
  });
}
