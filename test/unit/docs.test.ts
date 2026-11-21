import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// input names are the two-space-indented keys under inputs:
function inputNames(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const start = text.indexOf('inputs:');
  const end = text.indexOf('\noutputs:') === -1 ? text.indexOf('\nruns:') : text.indexOf('\noutputs:');
  return [...text.slice(start, end).matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1] as string);
}

describe('docs stay in sync with the action metadata', () => {
  const readme = readFileSync('README.md', 'utf8');

  it.each(['action.yml', 'report/action.yml'])('README documents every input of %s', (path) => {
    const names = inputNames(path);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(readme).toContain(`\`${name}\``);
  });

  it('root action runs the check bundle', () => {
    const root = readFileSync('action.yml', 'utf8');
    expect(root).toContain('main: check/dist/index.cjs');
    expect(existsSync('check/action.yml')).toBe(false);
  });

  it('templates point at the published action, not a placeholder', () => {
    expect(readFileSync('docs/templates/redgreen.yml', 'utf8')).toContain('uses: dhitalkamal/redgreen@v1');
    expect(readFileSync('docs/templates/redgreen-report.yml', 'utf8')).toContain('uses: dhitalkamal/redgreen/report@v1');
  });

  it('templates use the expected names and never check out code in stage 2', () => {
    const stage1 = readFileSync('docs/templates/redgreen.yml', 'utf8');
    const stage2 = readFileSync('docs/templates/redgreen-report.yml', 'utf8');
    expect(stage1).toContain('name: redgreen\n');
    expect(stage1).toContain('fetch-depth: 2');
    expect(stage1).toContain('contents: read');
    expect(stage2).toContain('workflows: [redgreen]');
    expect(stage2).not.toContain('actions/checkout');
  });

  it('has the guide that comments link to', () => {
    expect(readFileSync('docs/prove-your-change.md', 'utf8')).toContain('# How to prove your change');
  });
});
