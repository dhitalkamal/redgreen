import picomatch from 'picomatch';

export const DEFAULT_TEST_PATTERNS = [
  '**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.py', '**/*_test.go',
  '**/*Test.java', '**/*Tests.cs', '**/tests/**', '**/test/**', '**/spec/**',
  '**/__tests__/**', '**/testdata/**', '**/fixtures/**', '**/__fixtures__/**',
  '**/__snapshots__/**', '**/conftest.py', 'src/test/**',
];

export const DEFAULT_DEPENDENCY_PATTERNS = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lock', 'bun.lockb', 'requirements*.txt', 'pyproject.toml', 'poetry.lock', 'uv.lock',
  'Pipfile', 'Pipfile.lock', 'setup.py', 'setup.cfg', 'Cargo.toml', 'Cargo.lock', 'go.mod',
  'go.sum', 'Gemfile', 'Gemfile.lock', '*.gemspec', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'gradle.lockfile', 'composer.json', 'composer.lock', '*.csproj',
  'packages.lock.json', 'Directory.Packages.props', 'mix.exs', 'mix.lock',
];

// patterns without a slash match the file name at any depth
export function makeMatcher(patterns: string[]): (path: string) => boolean {
  if (patterns.length === 0) return () => false;

  const basenamePatterns = patterns.filter((p) => !p.includes('/'));
  const fullPathPatterns = patterns.filter((p) => p.includes('/'));

  const isBasenameMatch = basenamePatterns.length > 0 ? picomatch(basenamePatterns, { dot: true }) : null;
  const isFullPathMatch = fullPathPatterns.length > 0 ? picomatch(fullPathPatterns, { dot: true }) : null;

  return (path) => {
    const basename = path.split('/').pop() || '';
    if (isBasenameMatch && isBasenameMatch(basename)) return true;
    if (isFullPathMatch && isFullPathMatch(path)) return true;
    return false;
  };
}

export function parsePatternList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
