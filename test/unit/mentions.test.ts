import { describe, expect, it } from 'vitest';
import { extractCandidates, looksLikeCode } from '../../src/check/mentions';

describe('looksLikeCode', () => {
  it.each(['src/a.rs', 'parse_unicode()', 'parser.parse', 'parseUnicode', 'run()'])('accepts %s', (t) => {
    expect(looksLikeCode(t)).toBe(true);
  });
  it.each(['word', 'Parser', 'two words', 'README'])('rejects %s', (t) => {
    expect(looksLikeCode(t)).toBe(false);
  });
});

describe('extractCandidates', () => {
  it('collects code spans and plain-text paths, skipping fences, urls and plain words', () => {
    const body = [
      'Fixes `parse_unicode()` in `src/lexer/escape.rs`, see docs/setup.md.',
      'Plain `word` and `two words` are skipped. See https://github.com/x/y/blob/main/src/a.rs',
      '```',
      'let hidden = `fenced_name`;',
      '```',
      'Also `./tools/run.sh` and `parseUnicode` and `parse_unicode()` again.',
    ].join('\n');
    expect(extractCandidates('Fix `escapeChar`', body)).toEqual([
      'escapeChar', 'parse_unicode', 'src/lexer/escape.rs', 'tools/run.sh', 'parseUnicode', 'docs/setup.md',
    ]);
  });

  it('keeps at most 30 candidates', () => {
    const body = Array.from({ length: 40 }, (_, i) => `\`name_${i}\``).join(' ');
    expect(extractCandidates('', body)).toHaveLength(30);
  });
});
