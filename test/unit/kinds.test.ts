import { describe, expect, it } from 'vitest';
import { firstLine, isCodePath, isSuspect, proofKind } from '../../src/check/kinds';

describe('firstLine', () => {
  it('returns the first non-blank line, trimmed', () => {
    expect(firstLine('\n\n  AssertionError: boom  \n  at foo')).toBe('AssertionError: boom');
  });
  it('cuts to the limit and handles missing messages', () => {
    expect(firstLine('x'.repeat(300))).toHaveLength(200);
    expect(firstLine(undefined)).toBe('');
  });
});

describe('proofKind', () => {
  it.each([
    'AssertionError: expected 3, got 2',
    'Error: expect(received).toBe(expected)',
    'assert 2 == 1',
  ])('treats %s as an assertion failure', (message) => {
    expect(proofKind(message, false)).toBe('assertion');
  });

  it.each([
    "ImportError: cannot import name 'parse_new' from 'parser'",
    "ModuleNotFoundError: No module named 'parser.new'",
    "AttributeError: module 'parser' has no attribute 'parse_new'",
    "Cannot find module './helper' from 'src/a.test.js'",
    'ReferenceError: parseNew is not defined',
    'TypeError: parser.parseNew is not a function',
    './parser_test.go:12:9: undefined: ParseNew',
    'error: cannot find symbol',
    'error[E0425]: cannot find function `parse_new` in this scope',
    "SyntaxError: The requested module './x.js' does not provide an export named 'y'",
    "NoMethodError: undefined method `parse_new' for Parser:Class",
    "Parser does not contain a definition for 'ParseNew'",
    'Call to undefined function parse_new()',
    '** (UndefinedFunctionError) function Parser.parse_new/1 is undefined',
  ])('treats %s as missing code', (message) => {
    expect(proofKind(message, false)).toBe('missing-code');
  });

  it('treats load errors and empty messages sensibly', () => {
    expect(proofKind('anything', true)).toBe('missing-code');
    expect(proofKind(undefined, false)).toBe('assertion');
  });
});

describe('isSuspect', () => {
  it('flags a missing data file the swap removed', () => {
    expect(isSuspect("FileNotFoundError: [Errno 2] No such file: 'data/case.json'", ['data/case.json'])).toBe(true);
    expect(isSuspect("ENOENT: no such file or directory, open '/tmp/w/data/case.json'", ['data/case.json'])).toBe(true);
  });

  it('does not flag missing code files, which are real proof', () => {
    expect(isSuspect("Cannot find module './helper.js'", ['src/helper.js'])).toBe(false);
  });

  it('does not flag unrelated messages or very short names', () => {
    expect(isSuspect('AssertionError: expected 3', ['data/case.json'])).toBe(false);
    expect(isSuspect('failed reading a.b', ['x/a.b'])).toBe(false);
    expect(isSuspect(undefined, ['data/case.json'])).toBe(false);
  });

  it('recognizes code paths', () => {
    expect(isCodePath('src/a.ts')).toBe(true);
    expect(isCodePath('data/case.json')).toBe(false);
  });
});
