import type { TestCase } from './junit';
import { CODE_EXT } from './kinds';
import { indexRun } from './repeats';

export type Outcome = 'proof' | 'independent' | 'already-failing' | 'broken' | 'ignored' | 'not-comparable';

export interface Compared {
  id: string;
  outcome: Outcome;
  file?: string;
  withoutMessage?: string;
  withMessage?: string;
  viaLoadError: boolean;
}

export interface Comparison {
  items: Compared[];
  counts: Record<Outcome, number>;
}

export function moduleKey(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\\/g, '/').replace(CODE_EXT, '').replace(/\//g, '.');
}

const covers = (key: string, loadKey: string) => key === loadKey || key.startsWith(`${loadKey}.`);

// gotestsum reports a go package that does not compile as one failing case with this marker
const BUILD_FAILED = /\[(build|setup) failed\]/;

const dirOf = (path: string) => {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
};

// the module root package: the suite that every other go package path extends
function rootSuite(tests: TestCase[]): string | undefined {
  const names = [...new Set(tests.map((t) => t.suite).filter((s): s is string => !!s))];
  return names.find((s) => names.every((other) => other === s || other.startsWith(`${s}/`)));
}

// go packages are named by import path, so a test file in dir d belongs to the suite
// ending in /d; a test file at the repo root belongs to the module root
function buildErrors(without: TestCase[], withChange: TestCase[], changedTestFiles: string[]): Map<string, string | undefined> {
  const dirs = changedTestFiles.map((f) => f.replace(/\\/g, '/')).filter((f) => f.endsWith('_test.go')).map(dirOf);
  const root = rootSuite([...without, ...withChange]);
  const owns = (suite: string) => dirs.some((d) => (d === '' ? suite === root : suite === d || suite.endsWith(`/${d}`)));
  const errors = new Map<string, string | undefined>();
  for (const t of without) {
    if (t.status === 'fail' && t.suite && BUILD_FAILED.test(t.message ?? '') && owns(t.suite)) errors.set(t.suite, t.message);
  }
  return errors;
}

function pairOutcome(before: TestCase['status'], after: TestCase['status']): Outcome {
  if (before === 'skip' || after === 'skip') return 'ignored';
  if (before === 'fail') return after === 'pass' ? 'proof' : 'already-failing';
  return after === 'pass' ? 'independent' : 'broken';
}

export function compareRuns(
  without: TestCase[],
  withChange: TestCase[],
  opts: { changedTestFiles: string[]; flaky?: Set<string> },
): Comparison {
  const before = indexRun(without);
  const after = indexRun(withChange);
  const flaky = opts.flaky ?? new Set<string>();
  const changedKeys = new Set(opts.changedTestFiles.map(moduleKey));

  const loadErrors = new Map<string, string | undefined>();
  for (const t of before.values()) {
    if (t.status !== 'fail' || after.has(t.id)) continue;
    for (const key of [t.name, t.classname, t.file].map(moduleKey)) {
      if (key && changedKeys.has(key)) loadErrors.set(key, t.message);
    }
  }
  // matched by exact suite: a parent package failing to build says nothing about sub-packages
  const suiteErrors = buildErrors(without, withChange, opts.changedTestFiles);
  const loadErrorFor = (t: TestCase): { message?: string } | undefined => {
    if (t.suite && suiteErrors.has(t.suite)) return { message: suiteErrors.get(t.suite) };
    const keys = [t.classname, t.file].map(moduleKey).filter((k) => k !== '');
    const loadKey = [...loadErrors.keys()].find((lk) => keys.some((k) => covers(k, lk)));
    return loadKey === undefined ? undefined : { message: loadErrors.get(loadKey) };
  };

  const items: Compared[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id);
    const a = after.get(id);
    const item: Compared = { id, outcome: 'ignored', file: (a ?? b)?.file, viaLoadError: false };
    if (b?.status === 'fail') item.withoutMessage = b.message;
    if (a?.status === 'fail') item.withMessage = a.message;
    if (flaky.has(id)) item.outcome = 'ignored';
    else if (a && b) item.outcome = pairOutcome(b.status, a.status);
    else if (a) {
      const load = loadErrorFor(a);
      if (!load) item.outcome = a.status === 'skip' ? 'ignored' : 'not-comparable';
      else if (a.status === 'pass') {
        item.outcome = 'proof';
        item.viaLoadError = true;
        item.withoutMessage = load.message;
      } else item.outcome = a.status === 'fail' ? 'already-failing' : 'ignored';
    }
    items.push(item);
  }

  const counts: Record<Outcome, number> = {
    proof: 0, independent: 0, 'already-failing': 0, broken: 0, ignored: 0, 'not-comparable': 0,
  };
  for (const item of items) counts[item.outcome] += 1;
  return { items, counts };
}
