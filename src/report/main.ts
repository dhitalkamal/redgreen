import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { ARTIFACT_NAME, type Results } from '../shared/schema';
import { allLabels, labelFor } from '../shared/verdicts';
import { downloadResults, type ArtifactSource } from './artifact';
import { checkConclusion, shownResult } from './conclusion';
import { verifyIdentity, type PullInfo } from './identity';
import { createCheck, setLabel, upsertComment, type PublishApi, type Target } from './publish';
import { HEADLINES, MARKER, renderComment } from './render';
import { readSettings } from './settings';
import { scriptsChanged, untrustedFiles } from './trust';

type Octokit = ReturnType<typeof github.getOctokit>;
type Pull = PullInfo & { author: string; draft: boolean; baseSha: string };

async function readFileAt(octokit: Octokit, owner: string, repo: string, path: string, ref: string) {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return undefined;
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
}

export async function run(): Promise<void> {
  const { eventName, payload } = github.context;
  const wr = payload.workflow_run;
  if (eventName !== 'workflow_run' || !wr) throw new Error('redgreen/report only runs on workflow_run events');
  if (wr.conclusion === 'cancelled' || wr.conclusion === 'skipped') return;
  const settings = readSettings(
    (name) => core.getInput(name, { trimWhitespace: name !== 'label-prefix' }),
    process.env.GITHUB_ACTION_REPOSITORY,
  );
  const token = core.getInput('github-token');
  const octokit = github.getOctokit(token);
  const api = octokit as unknown as PublishApi;
  // read after the event check; the repo getter throws outside a real run
  const { owner, repo: name } = github.context.repo;
  const onRun: Target = { owner, repo: name, pr: 0, headSha: wr.head_sha };

  let results: Results;
  try {
    const dir = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'redgreen-'));
    const findBy = { token, workflowRunId: wr.id, repositoryOwner: owner, repositoryName: name };
    results = await downloadResults(new DefaultArtifactClient() as unknown as ArtifactSource, ARTIFACT_NAME, findBy, dir);
  } catch (error) {
    await createCheck(api, onRun, 'neutral', 'redgreen: no valid results', `${(error as Error).message}\n\n[Run details](${wr.html_url})`);
    return;
  }

  let pull: Pull | undefined;
  const findPull = async (n: number): Promise<PullInfo | undefined> => {
    try {
      const { data } = await octokit.rest.pulls.get({ owner, repo: name, pull_number: n });
      pull = {
        number: data.number, headSha: data.head.sha, headRepo: data.head.repo?.full_name ?? '',
        author: data.user?.login ?? '', draft: Boolean(data.draft), baseSha: data.base.sha,
      };
      return pull;
    } catch {
      return undefined;
    }
  };
  const runInfo = { path: wr.path, event: wr.event, headSha: wr.head_sha, headRepo: wr.head_repository?.full_name ?? '' };
  const rejected = await verifyIdentity(runInfo, results, settings.checkWorkflow, findPull);
  if (rejected || !pull) {
    await createCheck(api, onRun, 'neutral', 'redgreen: results rejected', rejected ?? 'pull request not found');
    return;
  }
  const p: Pull = pull;
  if (settings.skipAuthors.includes(p.author) || (settings.skipDrafts && p.draft)) return;

  const target: Target = { owner, repo: name, pr: p.number, headSha: p.headSha };
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, { owner, repo: name, pull_number: p.number, per_page: 100 });
  const paths = files.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
  const untrusted = untrustedFiles(paths, settings.trustPatterns);
  for (const pkg of paths.filter((f) => f === 'package.json' || f.endsWith('/package.json')).slice(0, 5)) {
    const [before, after] = await Promise.all([
      readFileAt(octokit, owner, name, pkg, p.baseSha),
      readFileAt(octokit, owner, name, pkg, p.headSha),
    ]);
    if (scriptsChanged(before, after)) untrusted.push(`${pkg} (scripts)`);
  }

  const shown = shownResult(results.verdict, untrusted.length > 0);
  const body = renderComment(results, shown, { guideUrl: settings.guideUrl, runUrl: wr.html_url, untrustedFiles: untrusted });
  if (settings.comment) await upsertComment(api, target, body, MARKER);
  await createCheck(api, target, checkConclusion(shown, settings.mode, settings.blockOn), `redgreen: ${HEADLINES[shown]}`, body);
  if (settings.labels) await setLabel(api, target, labelFor(shown, settings.labelPrefix), allLabels(settings.labelPrefix));
}

export async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    core.warning(`redgreen report hit an internal error: ${(error as Error).message}`);
  }
}
