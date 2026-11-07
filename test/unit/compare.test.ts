import { describe, expect, it } from 'vitest';
import type { TestCase, TestStatus } from '../../src/check/junit';
import { compareRuns, moduleKey } from '../../src/check/compare';
import { indexRun, mergeRepeats } from '../../src/check/repeats';

function tc(id: string, status: TestStatus, extra: Partial<TestCase> = {}): TestCase {
  const [classname = '', name = id] = id.includes('::') ? id.split('::') : ['', id];
  return { id, name, classname, status, ...extra };
}

const outcomeOf = (items: { id: string; outcome: string }[], id: string) =>
  items.find((i) => i.id === id)?.outcome;

describe('repeats', () => {
  it('merges duplicate ids with fail winning', () => {
    const map = indexRun([tc('a::x', 'pass'), tc('a::x', 'fail')]);
    expect(map.get('a::x')?.status).toBe('fail');
  });

  it('flags tests whose status changes between repeats', () => {
    const { flaky, tests } = mergeRepeats([
      [tc('a::stable', 'pass'), tc('a::flip', 'pass'), tc('a::gone', 'pass'), tc('a::skip', 'skip')],
      [tc('a::stable', 'pass'), tc('a::flip', 'fail'), tc('a::skip', 'pass')],
    ]);
    expect([...flaky].sort()).toEqual(['a::flip', 'a::gone']);
    expect(tests).toHaveLength(4);
  });
});

describe('moduleKey', () => {
  it('maps paths and dotted names to the same key', () => {
    expect(moduleKey('tests/test_new.py')).toBe('tests.test_new');
    expect(moduleKey('tests.test_new')).toBe('tests.test_new');
    expect(moduleKey('tests/new.test.js')).toBe('tests.new.test');
    expect(moduleKey(undefined)).toBe('');
  });
});

describe('compareRuns', () => {
  const opts = { changedTestFiles: ['tests/test_new.py'] };

  it('classifies every with/without pair', () => {
    const without = [tc('m::p', 'fail'), tc('m::i', 'pass'), tc('m::a', 'fail'), tc('m::b', 'pass'), tc('m::s', 'skip')];
    const withChange = [tc('m::p', 'pass'), tc('m::i', 'pass'), tc('m::a', 'fail'), tc('m::b', 'fail'), tc('m::s', 'pass')];
    const { items, counts } = compareRuns(without, withChange, opts);
    expect(outcomeOf(items, 'm::p')).toBe('proof');
    expect(outcomeOf(items, 'm::i')).toBe('independent');
    expect(outcomeOf(items, 'm::a')).toBe('already-failing');
    expect(outcomeOf(items, 'm::b')).toBe('broken');
    expect(outcomeOf(items, 'm::s')).toBe('ignored');
    expect(counts).toMatchObject({ proof: 1, independent: 1, 'already-failing': 1, broken: 1, ignored: 1 });
  });

  it('keeps the without-run failure message for proof', () => {
    const { items } = compareRuns([tc('m::p', 'fail', { message: 'AssertionError: 2 != 3' })], [tc('m::p', 'pass')], opts);
    expect(items[0]?.withoutMessage).toBe('AssertionError: 2 != 3');
  });

  it('ignores flaky tests', () => {
    const { items } = compareRuns([tc('m::p', 'fail')], [tc('m::p', 'pass')], { ...opts, flaky: new Set(['m::p']) });
    expect(items[0]?.outcome).toBe('ignored');
  });

  it('turns a load error for a changed test file into missing-code proof', () => {
    const without = [tc('tests.test_new', 'fail', { message: "ImportError: cannot import name 'x'" })];
    const withChange = [tc('tests.test_new::test_a', 'pass'), tc('tests.test_new::test_b', 'fail')];
    const { items } = compareRuns(without, withChange, opts);
    const a = items.find((i) => i.id === 'tests.test_new::test_a');
    expect(a).toMatchObject({ outcome: 'proof', viaLoadError: true, withoutMessage: "ImportError: cannot import name 'x'" });
    expect(outcomeOf(items, 'tests.test_new::test_b')).toBe('already-failing');
    expect(outcomeOf(items, 'tests.test_new')).toBe('ignored');
  });

  it('does not treat errors from unchanged files as load errors', () => {
    const without = [tc('tests.test_other', 'fail')];
    const withChange = [tc('tests.test_other::test_a', 'pass')];
    expect(outcomeOf(compareRuns(without, withChange, opts).items, 'tests.test_other::test_a')).toBe('not-comparable');
  });

  it('marks tests present only with the change as not comparable', () => {
    const { counts } = compareRuns([], [tc('src.lib::inline', 'pass')], opts);
    expect(counts['not-comparable']).toBe(1);
  });
});
