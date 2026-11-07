import { readFileSync } from 'node:fs';
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

  it.each(['check/action.yml', 'report/action.yml'])('README documents every input of %s', (path) => {
    const names = inputNames(path);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(readme).toContain(`\`${name}\``);
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
