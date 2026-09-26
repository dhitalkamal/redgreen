import { describe, expect, it } from 'vitest';
import type { Change } from '../../src/check/diff';
import { classify } from '../../src/check/classify';
import {
  DEFAULT_DEPENDENCY_PATTERNS,
  DEFAULT_TEST_PATTERNS,
  makeMatcher,
  parsePatternList,
} from '../../src/check/patterns';

const defaults = {
  testPatterns: DEFAULT_TEST_PATTERNS,
  dependencyPatterns: DEFAULT_DEPENDENCY_PATTERNS,
};

function change(path: string, status: Change['status'] = 'M'): Change {
  return { status, path, submodule: false };
}

describe('makeMatcher', () => {
  const isTest = makeMatcher(DEFAULT_TEST_PATTERNS);
  const isDep = makeMatcher(DEFAULT_DEPENDENCY_PATTERNS);

  it.each([
    'src/parser.test.ts', 'web/app.spec.js', 'tests/test_parser.py', 'pkg/parser_test.go',
    'src/test/java/FooTest.java', 'test/fixtures/case.json', 'src/__snapshots__/a.snap',
    'conftest.py', 'lib/testdata/input.txt', 'Api.Tests/ParserTests.cs',
  ])('treats %s as a test file', (path) => {
    expect(isTest(path)).toBe(true);
  });

  it.each(['src/parser.ts', 'docs/testing.md', 'contest.py', 'src/latest.ts'])(
    'does not treat %s as a test file',
    (path) => {
      expect(isTest(path)).toBe(false);
    },
  );

  it.each(['package.json', 'packages/a/package.json', 'Cargo.lock', 'requirements-dev.txt', 'app/App.csproj'])(
    'treats %s as a dependency file at any depth',
    (path) => {
      expect(isDep(path)).toBe(true);
    },
  );

  it('matches nothing for an empty list', () => {
    expect(makeMatcher([])('anything')).toBe(false);
  });
});

describe('parsePatternList', () => {
  it('splits on commas and newlines and drops blanks', () => {
    expect(parsePatternList('a/**, b/*\n\n c.txt ')).toEqual(['a/**', 'b/*', 'c.txt']);
  });
});

describe('classify', () => {
  it('groups files and counts them', () => {
    const result = classify(
      [change('src/parser.ts'), change('src/parser.test.ts', 'A'), change('package.json'), change('README.md')],
      defaults,
    );
    expect(result.files.map((f) => f.group)).toEqual(['other', 'test', 'dependency', 'other']);
    expect(result.counts).toEqual({ test: 1, dependency: 1, other: 2 });
  });

  it('classifies a rename by its new path', () => {
    const renamed: Change = { status: 'R', path: 'tests/new.test.js', oldPath: 'lib/old.js', submodule: false };
    expect(classify([renamed], defaults).files[0]?.group).toBe('test');
  });

  it('lets test patterns win over dependency patterns', () => {
    const result = classify([change('test/fixtures/package.json')], defaults);
    expect(result.files[0]?.group).toBe('test');
  });
});
