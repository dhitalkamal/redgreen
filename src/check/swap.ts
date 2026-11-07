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
