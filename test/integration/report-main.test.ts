import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = 'a'.repeat(40);
const B = 'b'.repeat(40);
const state = vi.hoisted(() => ({
  artifact: undefined as string | undefined,
  calls: [] as { kind: string; p: Record<string, unknown> }[],
  files: [] as { filename: string; previous_filename?: string }[],
  contents: {} as Record<string, string>,
  pull: undefined as Record<string, unknown> | undefined,
  warnings: [] as string[],
  context: { eventName: 'workflow_run', payload: {} as Record<string, unknown>, repo: { owner: 'o', repo: 'r' } },
}));

const rec = (kind: string) => async (p: Record<string, unknown>) => {
  state.calls.push({ kind, p });
};
const lists = { comments: {}, labels: {}, files: {} };
const octokit = {
  paginate: async (m: unknown) => (m === lists.files ? state.files : []),
  rest: {
    issues: {
      listComments: lists.comments, listLabelsOnIssue: lists.labels,
      createComment: rec('comment'), updateComment: rec('update'), addLabels: rec('label'), removeLabel: rec('unlabel'),
    },
    checks: { create: rec('check') },
    pulls: {
      listFiles: lists.files,
      get: async ({ pull_number }: { pull_number: number }) => {
        if (!state.pull || state.pull.number !== pull_number) throw new Error('404');
        return { data: state.pull };
      },
    },
    repos: {
      getContent: async ({ path, ref }: { path: string; ref: string }) => {
        const text = state.contents[`${ref}:${path}`];
        if (text === undefined) throw new Error('404');
        return { data: { type: 'file', content: Buffer.from(text).toString('base64') } };
      },
    },
  },
};

vi.mock('@actions/core', () => ({
  getInput: () => '',
  info: () => {},
  warning: (m: string) => state.warnings.push(m),
}));
vi.mock('@actions/github', () => ({ context: state.context, getOctokit: () => octokit }));
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: class {
    async getArtifact() { return { artifact: { id: 1, size: 100 } }; }
    async downloadArtifact(_id: number, opts: { path: string }) {
      if (state.artifact !== undefined) await writeFile(join(opts.path, 'results.json'), state.artifact);
    }
  },
}));

const { main } = await import('../../src/report/main');

const results = {
  schemaVersion: 1, tool: 'redgreen 0.1.0', pr: 4, headSha: H, baseSha: B, mergeSha: 'c'.repeat(40),
  mode: 'junit', verdict: 'proof-found',
  counts: { proof: 1, independent: 2, alreadyFailing: 0, broken: 0, notComparable: 0, flaky: 0, skipped: 0 },
  proof: [{ id: 'tests::adds', message: 'AssertionError: 2 != 3', kind: 'assertion', suspect: false }],
  broken: [], changed: { test: 1, dependency: 0, other: 1 }, mentionsNotFound: [], flags: [],
  timings: { withSeconds: 1, withoutSeconds: 1 },
};
const workflowRun = {
  id: 9, path: '.github/workflows/redgreen.yml', event: 'pull_request', head_sha: H, conclusion: 'success',
  head_repository: { full_name: 'fork/r' }, html_url: 'https://example.invalid/run/9',
};
const kinds = () => state.calls.map((c) => c.kind);
const check = () => state.calls.find((c) => c.kind === 'check')?.p;
const labels = () => state.calls.filter((c) => c.kind === 'label').map((c) => (c.p.labels as string[])[0]);

beforeEach(() => {
  Object.assign(state, { artifact: JSON.stringify(results), calls: [], files: [{ filename: 'src/a.ts' }], contents: {}, warnings: [] });
  state.pull = { number: 4, draft: false, user: { login: 'alice' }, head: { sha: H, repo: { full_name: 'fork/r' } }, base: { sha: B } };
  state.context.eventName = 'workflow_run';
  state.context.payload = { workflow_run: workflowRun };
});

describe('report main', () => {
  it('publishes the comment, a success check and the label', async () => {
    await main();
    expect(kinds()).toEqual(['comment', 'check', 'label']);
    expect(check()).toMatchObject({ conclusion: 'success', head_sha: H, output: { title: 'redgreen: Proof found' } });
    expect(labels()).toEqual(['proof: found']);
  });

  it('shows unverified when the pr touches a workflow file', async () => {
    state.files = [{ filename: 'src/a.ts' }, { filename: 'ci/old.yml', previous_filename: '.github/workflows/redgreen.yml' }];
    await main();
    expect(check()).toMatchObject({ conclusion: 'neutral', output: { title: 'redgreen: Unverified' } });
    expect(labels()).toEqual(['proof: unverified']);
  });

  it('shows unverified when package.json scripts change', async () => {
    state.files = [{ filename: 'package.json' }];
    state.contents = { [`${B}:package.json`]: '{"scripts":{"test":"vitest"}}', [`${H}:package.json`]: '{"scripts":{"test":"exit 0"}}' };
    await main();
    expect(labels()).toEqual(['proof: unverified']);
  });

  it('rejects results whose identity does not match', async () => {
    state.context.payload = { workflow_run: { ...workflowRun, path: '.github/workflows/evil.yml' } };
    await main();
    expect(kinds()).toEqual(['check']);
    expect(check()).toMatchObject({ conclusion: 'neutral', output: { title: 'redgreen: results rejected' } });
  });

  it('posts a neutral check when the artifact is invalid', async () => {
    state.artifact = '{bad';
    await main();
    expect(kinds()).toEqual(['check']);
    expect(check()).toMatchObject({ conclusion: 'neutral', output: { title: 'redgreen: no valid results' } });
  });

  it('does nothing for cancelled runs or skipped authors', async () => {
    state.context.payload = { workflow_run: { ...workflowRun, conclusion: 'cancelled' } };
    await main();
    state.context.payload = { workflow_run: workflowRun };
    state.pull = { ...state.pull, user: { login: 'dependabot[bot]' } };
    await main();
    expect(kinds()).toEqual([]);
    expect(state.warnings).toEqual([]);
  });

  it('rejects a run whose head repository is gone (deleted fork)', async () => {
    state.context.payload = { workflow_run: { ...workflowRun, head_repository: null } };
    state.pull = { ...state.pull, head: { sha: H, repo: null } };
    await main();
    expect(kinds()).toEqual(['check']);
    expect(check()).toMatchObject({ conclusion: 'neutral', output: { title: 'redgreen: results rejected' } });
  });

  it('turns internal errors into warnings', async () => {
    state.context.eventName = 'push';
    await main();
    expect(kinds()).toEqual([]);
    expect(state.warnings[0]).toMatch(/internal error/);
  });
});
