import { describe, expect, it } from 'vitest';
import type { Classified } from '../../src/check/classify';
import { planSwap, type SwapOp } from '../../src/check/swap';

type Tree = Map<string, string>;

// applies ops to an in-memory tree, the way runOps applies them to disk
function run(ops: SwapOp[], tree: Tree, base: Tree, head: Tree): Tree {
  const next = new Map(tree);
  for (const op of ops) {
    if (op.kind === 'remove') next.delete(op.path);
    else {
      const content = (op.from === 'base' ? base : head).get(op.path);
      if (content === undefined) throw new Error(`${op.path} missing in ${op.from}`);
      next.set(op.path, content);
    }
  }
  return next;
}

const base: Tree = new Map([['a', 'a0'], ['old', 'o0'], ['gone', 'g0'], ['t', 't0']]);
const head: Tree = new Map([['a', 'a1'], ['new', 'o0'], ['added', 'n1'], ['t', 't1']]);
const files: Classified[] = [
  { status: 'M', path: 'a', submodule: false, group: 'other' },
  { status: 'R', path: 'new', oldPath: 'old', submodule: false, group: 'other' },
  { status: 'A', path: 'added', submodule: false, group: 'dependency' },
  { status: 'D', path: 'gone', submodule: false, group: 'other' },
  { status: 'M', path: 't', submodule: false, group: 'test' },
];

describe('planSwap', () => {
  it('turns the PR into base code plus the PR tests', () => {
    const plan = planSwap(files);
    const swapped = run(plan.apply, head, base, head);
    expect(Object.fromEntries(swapped)).toEqual({ a: 'a0', old: 'o0', gone: 'g0', t: 't1' });
  });

  it('undo returns exactly to the PR', () => {
    const plan = planSwap(files);
    const back = run(plan.undo, run(plan.apply, head, base, head), base, head);
    expect(back).toEqual(head);
  });

  it('lists every touched path and skips tests', () => {
    expect(planSwap(files).touched.sort()).toEqual(['a', 'added', 'gone', 'new', 'old']);
  });

  it('handles type changes like modifications', () => {
    const plan = planSwap([{ status: 'T', path: 'link', submodule: false, group: 'other' }]);
    expect(plan.apply).toEqual([{ kind: 'checkout', path: 'link', from: 'base' }]);
    expect(plan.undo).toEqual([{ kind: 'checkout', path: 'link', from: 'head' }]);
  });

  it('rejects a rename without an old path', () => {
    expect(() => planSwap([{ status: 'R', path: 'x', submodule: false, group: 'other' }])).toThrow(/old path/);
  });
});
