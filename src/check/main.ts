import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { RestoreError, runEngine } from './engine';
import { InputError, readInputs } from './inputs';
import { extractCandidates, findMissing } from './mentions';
import { buildResults, renderSummary } from './results';
import { ARTIFACT_NAME } from '../shared/schema';

const TOOL = 'redgreen 0.1.0';

export async function run(): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (github.context.eventName !== 'pull_request' || !pr) {
    throw new InputError('redgreen/check only runs on pull_request events');
  }
  const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const cfg = readInputs((name) => core.getInput(name), cwd);
  const result = await runEngine(cfg, (message) => core.info(message));
  const mentions = await findMissing(cwd, extractCandidates(String(pr.title ?? ''), String(pr.body ?? '')));
  const results = buildResults(result, {
    pr: Number(pr.number),
    prHeadSha: String(pr.head?.sha ?? ''),
    tool: TOOL,
    mentionsNotFound: mentions,
  });
  await core.summary.addRaw(renderSummary(results, result.outputTails)).write();
  const dir = await mkdtemp(join(tmpdir(), 'redgreen-'));
  const file = join(dir, 'results.json');
  await writeFile(file, JSON.stringify(results));
  await new DefaultArtifactClient().uploadArtifact(ARTIFACT_NAME, [file], dir, { retentionDays: 7 });
  core.setOutput('verdict', results.verdict);
}

export async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof RestoreError || error instanceof InputError) {
      core.setFailed(message);
      return;
    }
    // redgreen's own bugs must never block a pull request
    const note = `redgreen hit an internal error and produced no results: ${message}`;
    core.warning(note);
    await core.summary.addRaw(`## redgreen: internal error\n\n${note}\n`).write();
  }
}
