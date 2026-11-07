import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  const r = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`build failed: ${r.stderr}`);
}, 120_000);

// run a bundle the way the runner does, but on an event it must refuse
function runBundle(path: string) {
  return spawnSync(process.execPath, [path], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', GITHUB_EVENT_NAME: 'push' },
  });
}

describe('bundles', () => {
  it('builds both actions', () => {
    expect(existsSync('check/dist/index.cjs')).toBe(true);
    expect(existsSync('report/dist/index.cjs')).toBe(true);
  });

  it('check refuses other events with a clear error', () => {
    const r = runBundle('check/dist/index.cjs');
    expect(r.stdout).toContain('::error::redgreen/check only runs on pull_request events');
    expect(r.status).toBe(1);
  });

  it('report warns instead of failing', () => {
    const r = runBundle('report/dist/index.cjs');
    expect(r.stdout).toContain('::warning::redgreen report hit an internal error');
    expect(r.status).toBe(0);
  });
});
