import { describe, expect, it } from 'vitest';
import { parseRawDiff } from '../../src/check/diff';

// builds -z output from header and path tokens
function raw(...tokens: string[]): string {
  return tokens.join('\0') + '\0';
}

describe('parseRawDiff', () => {
  it('returns nothing for empty output', () => {
    expect(parseRawDiff('')).toEqual([]);
  });

  it('parses modified, added, deleted and type-changed files', () => {
    const out = raw(
      ':100644 100644 aaa bbb M', 'src/a.ts',
      ':000000 100644 000 bbb A', 'src/new.ts',
      ':100644 000000 aaa 000 D', 'src/old.ts',
      ':100644 120000 aaa bbb T', 'src/link',
    );
    expect(parseRawDiff(out)).toEqual([
      { status: 'M', path: 'src/a.ts', submodule: false },
      { status: 'A', path: 'src/new.ts', submodule: false },
      { status: 'D', path: 'src/old.ts', submodule: false },
      { status: 'T', path: 'src/link', submodule: false },
    ]);
  });

  it('parses renames with a score into old and new paths', () => {
    const out = raw(':100644 100644 aaa bbb R087', 'src/old name.ts', 'src/new name.ts');
    expect(parseRawDiff(out)).toEqual([
      { status: 'R', path: 'src/new name.ts', oldPath: 'src/old name.ts', submodule: false },
    ]);
  });

  it('treats a copy as an added file', () => {
    const out = raw(':100644 100644 aaa bbb C100', 'src/a.ts', 'src/b.ts');
    expect(parseRawDiff(out)).toEqual([{ status: 'A', path: 'src/b.ts', submodule: false }]);
  });

  it('flags submodules by mode 160000', () => {
    const out = raw(':160000 160000 aaa bbb M', 'vendor/lib');
    expect(parseRawDiff(out)[0]?.submodule).toBe(true);
  });

  it('keeps paths that contain newlines intact', () => {
    const out = raw(':100644 100644 aaa bbb M', 'odd\nname.ts');
    expect(parseRawDiff(out)[0]?.path).toBe('odd\nname.ts');
  });

  it('rejects entries it does not understand', () => {
    expect(() => parseRawDiff(raw('garbage', 'x'))).toThrow(/unexpected diff entry/);
    expect(() => parseRawDiff(raw(':100644 100644 aaa bbb U', 'x'))).toThrow(/unsupported diff status/);
    expect(() => parseRawDiff(':100644 100644 aaa bbb M')).toThrow(/truncated/);
  });
});
