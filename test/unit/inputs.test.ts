import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_PATTERNS } from '../../src/check/patterns';
import { InputError, readInputs } from '../../src/check/inputs';

const from = (values: Record<string, string>) => (name: string) => values[name] ?? '';

describe('readInputs', () => {
  it('applies defaults', () => {
    const cfg = readInputs(from({ 'test-command': 'npm test' }), '/w');
    expect(cfg).toMatchObject({
      cwd: '/w', testCommand: 'npm test', runTimeoutMinutes: 20, retries: 0,
      runWithoutTestChanges: false, maxChangedFiles: 3000,
    });
    expect(cfg.junitPath).toBeUndefined();
    expect(cfg.testPatterns).toEqual(DEFAULT_TEST_PATTERNS);
  });

  it('reads every input', () => {
    const cfg = readInputs(from({
      'test-command': 'pytest', 'junit-path': 'r/*.xml', 'install-command': 'pip install -e .',
      'test-patterns': 'checks/**', 'extra-test-patterns': 'extra/**', 'dependency-patterns': 'deps.txt',
      'run-timeout-minutes': '5', retries: '2', 'run-without-test-changes': 'true', 'max-changed-files': '10',
    }), '/w');
    expect(cfg).toMatchObject({
      junitPath: 'r/*.xml', installCommand: 'pip install -e .', testPatterns: ['checks/**', 'extra/**'],
      dependencyPatterns: ['deps.txt'], runTimeoutMinutes: 5, retries: 2, runWithoutTestChanges: true, maxChangedFiles: 10,
    });
  });

  it('rejects bad values with a clear message', () => {
    expect(() => readInputs(from({}), '/w')).toThrow(InputError);
    expect(() => readInputs(from({ 'test-command': 'x', retries: '1.5' }), '/w')).toThrow(/retries must be a whole number/);
    expect(() => readInputs(from({ 'test-command': 'x', 'run-without-test-changes': 'yes' }), '/w')).toThrow(/true or false/);
    expect(() => readInputs(from({ 'test-command': 'x', 'max-changed-files': '0' }), '/w')).toThrow(/at least 1/);
  });
});
