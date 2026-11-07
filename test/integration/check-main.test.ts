import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TempRepo } from './helpers/repo';
import { NODE, fixValue, scenario } from './helpers/scenario';

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  uploads: [] as { name: string; content: string }[],
  summary: '',
  failed: [] as string[],
  warnings: [] as string[],
  context: { eventName: 'pull_request', payload: {} as Record<string, unknown> },
}));

vi.mock('@actions/core', () => ({
  getInput: (name: string) => state.inputs[name] ?? '',
  info: () => {},
  warning: (m: string) => state.warnings.push(m),
  setFailed: (m: string) => state.failed.push(m),
  setOutput: () => {},
  summary: {
    addRaw(text: string) { state.summary += text; return this; },
    async write() { return this; },
  },
}));
vi.mock('@actions/github', () => ({ context: state.context }));
vi.mock('@actions/artifact', () => ({
  DefaultArtifactClient: class {
    async uploadArtifact(name: string, files: string[]) {
      state.uploads.push({ name, content: readFileSync(files[0] as string, 'utf8') });
      return { id: 1, size: 1 };
    }
  },
}));

const { main } = await import('../../src/check/main');

let repo: TempRepo | undefined;
beforeEach(() => {
  Object.assign(state, { inputs: {}, uploads: [], summary: '', failed: [], warnings: [] });
  state.context.eventName = 'pull_request';
});
afterEach(async () => {
  await repo?.cleanup();
  repo = undefined;
});

describe('check main', () => {
  it('runs the engine and uploads validated results', async () => {
    repo = await scenario(fixValue);
    process.env.GITHUB_WORKSPACE = repo.dir;
    state.inputs = { 'test-command': `${NODE} minirunner.cjs`, 'junit-path': 'reports/*.xml' };
    state.context.payload = {
      pull_request: { number: 5, title: 'Fix value', body: 'calls `missing_fn`', head: { sha: 'a'.repeat(40) } },
    };
    await main();
    expect(state.failed).toEqual([]);
    expect(state.uploads[0]?.name).toBe('redgreen-results');
    const results = JSON.parse(state.uploads[0]?.content ?? '{}');
    expect(results).toMatchObject({ pr: 5, verdict: 'proof-found', headSha: 'a'.repeat(40), mentionsNotFound: ['missing_fn'] });
    expect(state.summary).toContain('## redgreen: proof found');
  });

  it('fails clearly on other events', async () => {
    state.context.eventName = 'push';
    await main();
    expect(state.failed[0]).toMatch(/only runs on pull_request events/);
  });

  it('turns unexpected errors into a warning that never fails the job', async () => {
    process.env.GITHUB_WORKSPACE = '/definitely/not/a/repo';
    state.inputs = { 'test-command': 'true' };
    state.context.payload = { pull_request: { number: 1, title: '', body: '', head: { sha: 'a'.repeat(40) } } };
    await main();
    expect(state.failed).toEqual([]);
    expect(state.warnings[0]).toMatch(/internal error/);
    expect(state.uploads).toEqual([]);
  });
});
