import { classify } from './classify';
import { compareRuns } from './compare';
import type { EngineConfig } from './config';
import { parseRawDiff } from './diff';
import { ZERO_COUNTS, toCounts, toEntries, type EngineResult } from './entries';
import { git } from './git';
import { runInstall, runSide, type Log, type Side } from './side';
import { planSwap, runOps, trackedSnapshot, verifyRestored, type SwapPlan } from './swap';
import { couldNotStart, decideFallback, decideVerdict, runProblem, type Decision } from './verdict';

export class RestoreError extends Error {}

type Refs = { base: string; head: string };

const seconds = (side?: Side) => (side ? Math.round(side.run.durationMs / 100) / 10 : 0);

export async function runEngine(cfg: EngineConfig, log: Log = () => {}): Promise<EngineResult> {
  const head = (await git(cfg.cwd, ['rev-parse', 'HEAD'])).trim();
  const base = await git(cfg.cwd, ['rev-parse', '--verify', '-q', 'HEAD^1']).then(
    (out) => out.trim(),
    () => {
      throw new Error('HEAD has no parent: check out the pull request merge commit with fetch-depth: 2');
    },
  );
  const refs: Refs = { base, head };
  const changes = parseRawDiff(await git(cfg.cwd, ['diff', '--raw', '-z', '-M', base, head]));
  const { files, counts: changed } = classify(changes, cfg);
  const start: EngineResult = {
    verdict: 'no-proof', mode: cfg.junitPath ? 'junit' : 'exit-code', headSha: head, baseSha: base,
    proof: [], broken: [], counts: { ...ZERO_COUNTS }, changed, flags: [],
    timings: { withSeconds: 0, withoutSeconds: 0 }, outputTails: {},
  };
  if (changed.test === 0 && !cfg.runWithoutTestChanges) return { ...start, verdict: 'no-proof-yet' };
  if (changes.some((c) => c.submodule)) {
    return { ...start, verdict: 'inconclusive', reason: 'the pull request changes a submodule' };
  }
  if (changes.length > cfg.maxChangedFiles) {
    return { ...start, verdict: 'inconclusive', reason: `more than ${cfg.maxChangedFiles} files changed` };
  }

  const withSide = await runSide(cfg, 'with', log);
  const tails = { with: withSide.run.outputTail } as EngineResult['outputTails'];
  if (withSide.run.timedOut || couldNotStart(withSide.run)) {
    const reason = runProblem({ withRun: withSide.run, depsWithoutInstall: false }, cfg.runTimeoutMinutes);
    return { ...start, verdict: 'inconclusive', reason, outputTails: tails };
  }

  const plan = planSwap(files);
  const snapshot = await trackedSnapshot(cfg.cwd);
  const depsChanged = changed.dependency > 0;
  const depsWithoutInstall = depsChanged && !cfg.installCommand;
  let withoutSide: Side | undefined;
  let swapFailed: string | undefined;
  if (!depsWithoutInstall) {
    try {
      await runOps(cfg.cwd, refs, plan.apply);
      if (depsChanged) await runInstall(cfg, 'without', log);
      withoutSide = await runSide(cfg, 'without', log);
    } catch (error) {
      swapFailed = (error as Error).message;
    } finally {
      await restore(cfg, refs, plan, snapshot, depsChanged, log);
    }
  }

  const problem = runProblem(
    { withRun: withSide.run, withoutRun: withoutSide?.run, swapFailed, depsWithoutInstall },
    cfg.runTimeoutMinutes,
  );
  const flags = cfg.retries > 0 ? ['retries-used'] : [];
  if (withSide.junitErrors.length + (withoutSide?.junitErrors.length ?? 0) > 0) flags.push('junit-unreadable');
  const common = {
    timings: { withSeconds: seconds(withSide), withoutSeconds: seconds(withoutSide) },
    outputTails: { ...tails, without: withoutSide?.run.outputTail },
  };

  if (!withSide.tests || !withoutSide?.tests) {
    if (cfg.junitPath && withoutSide) flags.push(withSide.tests ? 'no-results-without-change' : 'junit-missing');
    flags.push('coarse');
    const decision: Decision = withoutSide
      ? decideFallback(problem, withoutSide.run, withSide.run)
      : { verdict: 'inconclusive', reason: problem ?? 'the tests did not run without the change' };
    return { ...start, ...decision, mode: 'exit-code', flags, ...common };
  }

  const flaky = new Set([...withSide.flaky, ...withoutSide.flaky]);
  const changedTestFiles = files.filter((f) => f.group === 'test').map((f) => f.path);
  const cmp = compareRuns(withoutSide.tests, withSide.tests, { changedTestFiles, flaky });
  const entries = toEntries(cmp, plan.touched);
  if (entries.proof.some((p) => p.suspect)) flags.push('suspect-support-file');
  return { ...start, ...decideVerdict(problem, cmp), mode: 'junit', ...entries, counts: toCounts(cmp, flaky), flags, ...common };
}

// undo always runs; a failed restore must stop the job so later steps never see swapped files
async function restore(cfg: EngineConfig, refs: Refs, plan: SwapPlan, snapshot: string, depsChanged: boolean, log: Log) {
  try {
    await runOps(cfg.cwd, refs, plan.undo);
    if (depsChanged) await runInstall(cfg, 'with', log);
  } catch (error) {
    throw new RestoreError(`could not restore the pull request: ${(error as Error).message}`);
  }
  const problem = await verifyRestored(cfg.cwd, plan, snapshot);
  if (problem) throw new RestoreError(`could not restore the pull request: ${problem}`);
}
