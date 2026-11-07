import { InputError, listOr, parseBool, type GetInput } from '../shared/inputs';
import { makeConfig, type EngineConfig } from './config';
import { parsePatternList } from './patterns';

export { InputError } from '../shared/inputs';

function num(get: GetInput, name: string, fallback: number, min: number, whole: boolean): number {
  const raw = get(name).trim();
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new InputError(`input ${name} must be a number, got "${raw}"`);
  if (whole && !Number.isInteger(value)) throw new InputError(`input ${name} must be a whole number, got "${raw}"`);
  if (value < min) throw new InputError(`input ${name} must be at least ${min}, got "${raw}"`);
  return value;
}

export function readInputs(get: GetInput, cwd: string): EngineConfig {
  const testCommand = get('test-command').trim();
  if (testCommand === '') throw new InputError('input test-command is required');
  const base = makeConfig(cwd, testCommand);
  return {
    ...base,
    junitPath: get('junit-path').trim() || undefined,
    installCommand: get('install-command').trim() || undefined,
    testPatterns: [...listOr(get, 'test-patterns', base.testPatterns), ...parsePatternList(get('extra-test-patterns'))],
    dependencyPatterns: listOr(get, 'dependency-patterns', base.dependencyPatterns),
    runTimeoutMinutes: num(get, 'run-timeout-minutes', base.runTimeoutMinutes, 1, false),
    retries: num(get, 'retries', base.retries, 0, true),
    runWithoutTestChanges: parseBool(get, 'run-without-test-changes', base.runWithoutTestChanges),
    maxChangedFiles: num(get, 'max-changed-files', base.maxChangedFiles, 1, true),
  };
}
