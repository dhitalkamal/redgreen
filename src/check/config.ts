import { DEFAULT_DEPENDENCY_PATTERNS, DEFAULT_TEST_PATTERNS } from './patterns';

export interface EngineConfig {
  cwd: string;
  testCommand: string;
  junitPath?: string;
  installCommand?: string;
  testPatterns: string[];
  dependencyPatterns: string[];
  runTimeoutMinutes: number;
  retries: number;
  runWithoutTestChanges: boolean;
  maxChangedFiles: number;
}

export function makeConfig(cwd: string, testCommand: string, overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    cwd, testCommand, testPatterns: [...DEFAULT_TEST_PATTERNS], dependencyPatterns: [...DEFAULT_DEPENDENCY_PATTERNS],
    runTimeoutMinutes: 20, retries: 0, runWithoutTestChanges: false, maxChangedFiles: 3000, ...overrides,
  };
}
