import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from './git';
import type { Classified } from './classify';

export type SwapOp =
  | { kind: 'checkout'; path: string; from: 'base' | 'head' }
  | { kind: 'remove'; path: string };

export interface SwapPlan {
  apply: SwapOp[];
  undo: SwapOp[];
  touched: string[];
}

// apply turns the PR into base code plus the PR's tests; undo reverses it
export function planSwap(files: Classified[]): SwapPlan {
  const apply: SwapOp[] = [];
  const undo: SwapOp[] = [];
  const touched: string[] = [];
  for (const f of files) {
    if (f.group === 'test') continue;
    if (f.status === 'M' || f.status === 'T') {
      apply.push({ kind: 'checkout', path: f.path, from: 'base' });
      undo.push({ kind: 'checkout', path: f.path, from: 'head' });
      touched.push(f.path);
    } else if (f.status === 'A') {
      apply.push({ kind: 'remove', path: f.path });
      undo.push({ kind: 'checkout', path: f.path, from: 'head' });
      touched.push(f.path);
    } else if (f.status === 'D') {
      apply.push({ kind: 'checkout', path: f.path, from: 'base' });
      undo.push({ kind: 'remove', path: f.path });
      touched.push(f.path);
    } else {
      if (!f.oldPath) throw new Error(`rename of ${f.path} has no old path`);
      apply.push({ kind: 'remove', path: f.path }, { kind: 'checkout', path: f.oldPath, from: 'base' });
      undo.push({ kind: 'remove', path: f.oldPath }, { kind: 'checkout', path: f.path, from: 'head' });
      touched.push(f.path, f.oldPath);
    }
  }
  return { apply, undo, touched };
}

// checkouts are batched per source so thousands of files need two git calls
export async function runOps(
  cwd: string,
  refs: { base: string; head: string },
  ops: SwapOp[],
): Promise<void> {
  for (const from of ['base', 'head'] as const) {
    const paths = ops.flatMap((op) => (op.kind === 'checkout' && op.from === from ? [op.path] : []));
    if (paths.length === 0) continue;
    await git(
      cwd,
      ['restore', `--source=${refs[from]}`, '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'],
      paths.join('\0'),
    );
  }
  for (const op of ops) {
    if (op.kind === 'remove') await rm(join(cwd, op.path), { force: true });
  }
}

export async function trackedSnapshot(cwd: string): Promise<string> {
  const out = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=no']);
  return out.split('\0').filter((entry) => entry.length > 0).sort().join('\n');
}

export async function verifyRestored(cwd: string, plan: SwapPlan, snapshot: string): Promise<string | null> {
  if ((await trackedSnapshot(cwd)) !== snapshot) return 'tracked files differ from before the swap';
  for (const op of plan.undo) {
    if (op.kind === 'remove' && existsSync(join(cwd, op.path))) {
      return `${op.path} should not exist after restore`;
    }
  }
  return null;
}
