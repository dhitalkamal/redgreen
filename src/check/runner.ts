import { spawn } from 'node:child_process';

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  startError?: string;
  durationMs: number;
  outputTail: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  tailBytes?: number;
  env?: NodeJS.ProcessEnv;
}

const DRAIN_MS = 2000;

export function runCommand(command: string, opts: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const limit = opts.tailBytes ?? 64 * 1024;
  let tail = Buffer.alloc(0);
  const keep = (chunk: Buffer) => {
    tail = Buffer.concat([tail, chunk]);
    if (tail.length > limit) tail = tail.subarray(tail.length - limit);
  };
  return new Promise((resolve) => {
    // own process group, so the whole tree can be killed at once
    const child = spawn(command, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let exitCode: number | null = null;
    let timedOut = false;
    let startError: string | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ exitCode, timedOut, startError, durationMs: Date.now() - started, outputTail: tail.toString('utf8') });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, opts.timeoutMs);
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    child.on('error', (error) => {
      startError = error.message;
      finish();
    });
    child.on('exit', (code) => {
      exitCode = code;
      killTree(child.pid);
      setTimeout(finish, DRAIN_MS);
    });
    child.on('close', finish);
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    // the group has already exited
  }
}
