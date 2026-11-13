import { describe, expect, it } from 'vitest';
import { createCheck, setLabel, upsertComment, type PublishApi } from '../../src/report/publish';

type Comment = { id: number; body: string; user: { login: string } };

function fake(comments: Comment[] = [], labels: { name: string }[] = []) {
  const calls: Record<string, Record<string, unknown>[]> = { create: [], update: [], add: [], remove: [], check: [] };
  const listComments = { kind: 'comments' };
  const listLabels = { kind: 'labels' };
  const record = (key: string) => async (p: Record<string, unknown>) => { calls[key]?.push(p); };
  const api: PublishApi = {
    paginate: async (method: unknown) => (method === listComments ? comments : labels) as never,
    rest: {
      issues: {
        listComments, listLabelsOnIssue: listLabels,
        createComment: record('create'), updateComment: record('update'),
        addLabels: record('add'), removeLabel: record('remove'),
      },
      checks: { create: record('check') },
    },
  };
  return { api, calls };
}

const t = { owner: 'o', repo: 'r', pr: 4, headSha: 'a'.repeat(40) };
const MARK = '<!-- redgreen:v1 -->';

describe('upsertComment', () => {
  it('creates a comment when none exists', async () => {
    const { api, calls } = fake();
    await upsertComment(api, t, `${MARK}\nhi`, MARK);
    expect(calls.create).toEqual([{ owner: 'o', repo: 'r', issue_number: 4, body: `${MARK}\nhi` }]);
  });

  it('updates only the bot comment with the marker', async () => {
    const { api, calls } = fake([
      { id: 1, body: `${MARK} fake`, user: { login: 'mallory' } },
      { id: 2, body: `${MARK}\nold`, user: { login: 'github-actions[bot]' } },
    ]);
    await upsertComment(api, t, `${MARK}\nnew`, MARK);
    expect(calls.update).toEqual([{ owner: 'o', repo: 'r', comment_id: 2, body: `${MARK}\nnew` }]);
    expect(calls.create).toEqual([]);
  });

  it('ignores marker comments from other users', async () => {
    const { api, calls } = fake([{ id: 1, body: `${MARK} fake`, user: { login: 'mallory' } }]);
    await upsertComment(api, t, `${MARK}\nnew`, MARK);
    expect(calls.update).toEqual([]);
    expect(calls.create).toHaveLength(1);
  });
});

describe('setLabel', () => {
  const all = ['proof: found', 'proof: none', 'proof: missing'];

  it('swaps stale proof labels and keeps unrelated ones', async () => {
    const { api, calls } = fake([], [{ name: 'proof: none' }, { name: 'bug' }]);
    await setLabel(api, t, 'proof: found', all);
    expect(calls.remove).toEqual([{ owner: 'o', repo: 'r', issue_number: 4, name: 'proof: none' }]);
    expect(calls.add).toEqual([{ owner: 'o', repo: 'r', issue_number: 4, labels: ['proof: found'] }]);
  });

  it('does nothing when the label is already right', async () => {
    const { api, calls } = fake([], [{ name: 'proof: found' }]);
    await setLabel(api, t, 'proof: found', all);
    expect(calls.add).toEqual([]);
    expect(calls.remove).toEqual([]);
  });
});

describe('createCheck', () => {
  it('creates a completed check on the head commit', async () => {
    const { api, calls } = fake();
    await createCheck(api, t, 'neutral', 'redgreen: no proof', 'summary');
    expect(calls.check).toEqual([{
      owner: 'o', repo: 'r', name: 'redgreen', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'neutral',
      output: { title: 'redgreen: no proof', summary: 'summary' },
    }]);
  });
});
