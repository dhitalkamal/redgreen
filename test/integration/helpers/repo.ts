import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { git } from '../../../src/check/git';

export interface TempRepo {
  dir: string;
  run(args: string[]): Promise<string>;
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string>;
  remove(path: string): Promise<void>;
  commit(message: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function makeRepo(): Promise<TempRepo> {
  const dir = await mkdtemp(join(tmpdir(), 'redgreen-'));
  const run = (args: string[]) => git(dir, args);
  await run(['init', '-q', '-b', 'base']);
  // fixture repos must not inherit signing or hooks from the global git config
  await run(['config', 'user.name', 'redgreen test']);
  await run(['config', 'user.email', 'test@example.invalid']);
  await run(['config', 'commit.gpgsign', 'false']);
  await run(['config', 'core.hooksPath', '/dev/null']);
  return {
    dir,
    run,
    async write(path, content) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    },
    read: (path) => readFile(join(dir, path), 'utf8'),
    remove: (path) => rm(join(dir, path), { force: true }),
    async commit(message) {
      await run(['add', '-A']);
      await run(['commit', '-q', '-m', message]);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

// mimics GitHub's PR merge ref: HEAD ends on a merge commit whose first parent is base
export async function mergePr(repo: TempRepo, branch: string): Promise<void> {
  await repo.run(['switch', '-q', 'base']);
  await repo.run(['merge', '-q', '--no-ff', '-m', 'merge pr', branch]);
}
