import { describe, expect, it } from 'vitest';
import type { Compared, Comparison, Outcome } from '../../src/check/compare';
import { toCounts, toEntries } from '../../src/check/entries';

function comparison(items: Compared[]): Comparison {
  const counts = { proof: 0, independent: 0, 'already-failing': 0, broken: 0, ignored: 0, 'not-comparable': 0 } as Record<Outcome, number>;
  for (const i of items) counts[i.outcome] += 1;
  return { items, counts };
}

const cmp = comparison([
  { id: 'a::assert', outcome: 'proof', viaLoadError: false, withoutMessage: 'AssertionError: 2 != 3\n  at x' },
  { id: 'a::load', outcome: 'proof', viaLoadError: true, withoutMessage: "ImportError: cannot import name 'y'" },
  { id: 'a::data', outcome: 'proof', viaLoadError: false, withoutMessage: "ENOENT: no such file, open 'data/case.json'" },
  { id: 'a::broke', outcome: 'broken', viaLoadError: false, withMessage: 'Error: expected true' },
  { id: 'a::flaky', outcome: 'ignored', viaLoadError: false },
  { id: 'a::skip', outcome: 'ignored', viaLoadError: false },
  { id: 'a::inline', outcome: 'not-comparable', viaLoadError: false },
]);

describe('toEntries', () => {
  it('builds proof entries with first lines, kinds and suspect flags', () => {
    const { proof } = toEntries(cmp, ['data/case.json', 'src/y.py']);
    expect(proof).toEqual([
      { id: 'a::assert', file: undefined, message: 'AssertionError: 2 != 3', kind: 'assertion', suspect: false },
      { id: 'a::load', file: undefined, message: "ImportError: cannot import name 'y'", kind: 'missing-code', suspect: false },
      { id: 'a::data', file: undefined, message: "ENOENT: no such file, open 'data/case.json'", kind: 'assertion', suspect: true },
    ]);
  });

  it('builds broken entries from the with-run message', () => {
    expect(toEntries(cmp, []).broken).toEqual([{ id: 'a::broke', file: undefined, message: 'Error: expected true' }]);
  });
});

describe('toCounts', () => {
  it('maps outcomes and splits flaky from skipped', () => {
    expect(toCounts(cmp, new Set(['a::flaky']))).toEqual({
      proof: 3, independent: 0, alreadyFailing: 0, broken: 1, notComparable: 1, flaky: 1, skipped: 1,
    });
  });
});
