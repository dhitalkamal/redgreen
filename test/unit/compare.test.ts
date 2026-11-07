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

  describe('go packages that do not compile without the change', () => {
    const built = 'FAIL\texample.com/m [build failed]';
    const goCase = (suite: string, name: string, status: TestStatus, message?: string): TestCase => ({
      id: name === 'TestMain' ? 'TestMain' : `${suite}::${name}`,
      name, classname: name === 'TestMain' ? '' : suite, suite, status, message,
    });
    const without = [
      goCase('example.com/m', 'TestMain', 'fail', built),
      goCase('example.com/m/doc', 'TestOld', 'pass'),
    ];
    const withChange = [
      goCase('example.com/m', 'TestNew', 'pass'),
      goCase('example.com/m', 'TestBad', 'fail'),
      goCase('example.com/m/doc', 'TestOld', 'pass'),
      goCase('example.com/m/doc', 'TestOnlyWith', 'pass'),
    ];

    it('turns the build failure of a package with a changed test file into missing-code proof', () => {
      const { items } = compareRuns(without, withChange, { changedTestFiles: ['complete_test.go'] });
      expect(items.find((i) => i.id === 'example.com/m::TestNew')).toMatchObject({
        outcome: 'proof', viaLoadError: true, withoutMessage: built,
      });
      expect(outcomeOf(items, 'example.com/m::TestBad')).toBe('already-failing');
      expect(outcomeOf(items, 'example.com/m/doc::TestOld')).toBe('independent');
      // a sub-package is a different go package, so the parent build failure does not cover it
      expect(outcomeOf(items, 'example.com/m/doc::TestOnlyWith')).toBe('not-comparable');
    });

    it('matches a changed test file in a sub-directory to its package', () => {
      const docWithout = [goCase('example.com/m/doc', 'TestMain', 'fail', 'FAIL\texample.com/m/doc [build failed]'), goCase('example.com/m', 'TestA', 'pass')];
      const docWith = [goCase('example.com/m/doc', 'TestNew', 'pass'), goCase('example.com/m', 'TestA', 'pass')];
      const { items } = compareRuns(docWithout, docWith, { changedTestFiles: ['doc/man_test.go'] });
      expect(outcomeOf(items, 'example.com/m/doc::TestNew')).toBe('proof');
    });

    it('ignores build failures in packages whose tests the pr did not change', () => {
      for (const changed of ['doc/man_test.go', 'tests/test_x.py']) {
        const { items } = compareRuns(without, withChange, { changedTestFiles: [changed] });
        expect(outcomeOf(items, 'example.com/m::TestNew')).toBe('not-comparable');
      }
    });
  });

  it('marks tests present only with the change as not comparable', () => {
    const { counts } = compareRuns([], [tc('src.lib::inline', 'pass')], opts);
    expect(counts['not-comparable']).toBe(1);
  });
});
