import type { EngineConfig } from './config';
import { clearJUnitFiles, readJUnitFiles, type TestCase } from './junit';
import { mergeRepeats } from './repeats';
import { runCommand, type RunResult } from './runner';

export type Log = (message: string) => void;

export interface Side {
  run: RunResult;
  tests?: TestCase[];
  flaky: Set<string>;
  junitFiles: number;
  junitErrors: string[];
}

const timeoutMs = (cfg: EngineConfig) => cfg.runTimeoutMinutes * 60_000;

export async function runSide(cfg: EngineConfig, label: 'with' | 'without', log: Log): Promise<Side> {
  const runs: RunResult[] = [];
  const results: TestCase[][] = [];
  const junitErrors: string[] = [];
  let junitFiles = 0;
  for (let i = 0; i <= cfg.retries; i += 1) {
    if (cfg.junitPath) await clearJUnitFiles(cfg.cwd, cfg.junitPath);
    log(`running tests ${label} the change (run ${i + 1} of ${cfg.retries + 1})`);
    const run = await runCommand(cfg.testCommand, { cwd: cfg.cwd, timeoutMs: timeoutMs(cfg) });
    runs.push(run);
    if (run.timedOut || run.startError !== undefined) break;
    if (!cfg.junitPath) continue;
    const read = await readJUnitFiles(cfg.cwd, cfg.junitPath);
    junitFiles = Math.max(junitFiles, read.files);
    junitErrors.push(...read.errors);
    results.push(read.tests);
  }
  const run = { ...(runs[0] as RunResult), timedOut: runs.some((r) => r.timedOut) };
  if (results.length === 0 || results.every((r) => r.length === 0)) {
    return { run, flaky: new Set(), junitFiles, junitErrors };
  }
  const merged = mergeRepeats(results);
  return { run, tests: merged.tests, flaky: merged.flaky, junitFiles, junitErrors };
}

export async function runInstall(cfg: EngineConfig, label: 'with' | 'without', log: Log): Promise<void> {
  if (!cfg.installCommand) return;
  log(`installing dependencies ${label} the change`);
  const r = await runCommand(cfg.installCommand, { cwd: cfg.cwd, timeoutMs: timeoutMs(cfg) });
  if (r.exitCode !== 0) throw new Error(`the install command exited with code ${r.exitCode ?? 'none'}`);
}
