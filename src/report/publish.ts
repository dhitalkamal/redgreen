import type { Conclusion } from './conclusion';

export interface Target { owner: string; repo: string; pr: number; headSha: string }

type Call = (params: Record<string, unknown>) => Promise<unknown>;

// the part of Octokit publishing needs; the entry point casts the real client to it
export interface PublishApi {
  paginate<T>(method: unknown, params: Record<string, unknown>): Promise<T[]>;
  rest: {
    issues: {
      listComments: unknown; listLabelsOnIssue: unknown;
      createComment: Call; updateComment: Call; addLabels: Call; removeLabel: Call;
    };
    checks: { create: Call };
  };
}

const BOT = 'github-actions[bot]';

export async function upsertComment(api: PublishApi, t: Target, body: string, marker: string): Promise<void> {
  const comments = await api.paginate<{ id: number; body?: string | null; user?: { login?: string } | null }>(
    api.rest.issues.listComments,
    { owner: t.owner, repo: t.repo, issue_number: t.pr, per_page: 100 },
  );
  const mine = comments.find((c) => c.user?.login === BOT && (c.body ?? '').startsWith(marker));
  if (mine) await api.rest.issues.updateComment({ owner: t.owner, repo: t.repo, comment_id: mine.id, body });
  else await api.rest.issues.createComment({ owner: t.owner, repo: t.repo, issue_number: t.pr, body });
}

export async function createCheck(api: PublishApi, t: Target, conclusion: Conclusion, title: string, summary: string): Promise<void> {
  await api.rest.checks.create({
    owner: t.owner, repo: t.repo, name: 'redgreen', head_sha: t.headSha, status: 'completed', conclusion,
    output: { title, summary: summary.slice(0, 65000) },
  });
}

export async function setLabel(api: PublishApi, t: Target, label: string, all: string[]): Promise<void> {
  const current = await api.paginate<{ name: string }>(api.rest.issues.listLabelsOnIssue, {
    owner: t.owner, repo: t.repo, issue_number: t.pr, per_page: 100,
  });
  for (const l of current) {
    if (all.includes(l.name) && l.name !== label) {
      await api.rest.issues.removeLabel({ owner: t.owner, repo: t.repo, issue_number: t.pr, name: l.name });
    }
  }
  if (!current.some((l) => l.name === label)) {
    await api.rest.issues.addLabels({ owner: t.owner, repo: t.repo, issue_number: t.pr, labels: [label] });
  }
}
