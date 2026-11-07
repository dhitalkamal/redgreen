export type ProofKind = 'assertion' | 'missing-code';

export const CODE_EXT =
  /\.(py|js|jsx|ts|tsx|mjs|cjs|go|rb|java|kt|cs|rs|php|exs?|swift|scala|c|cc|cpp|h|hpp)$/;

// first-line signs that the test failed because the new code does not exist yet
const MISSING_CODE: RegExp[] = [
  /ImportError/,
  /ModuleNotFoundError/,
  /NameError/,
  /AttributeError/,
  /ReferenceError/,
  /NoMethodError/,
  /NoSuchMethodError/,
  /ClassNotFoundException/,
  /NoClassDefFoundError/,
  /LoadError/,
  /UndefinedFunctionError/,
  /cannot find (module|symbol|name|function|value|type|struct|crate)/i,
  /is not defined/,
  /is not a function/,
  /undefined: /,
  /cannot import name/,
  /has no attribute/,
  /unresolved import/,
  /does not provide an export named/,
  /does not contain a definition for/,
  /Call to undefined (function|method)/,
];

export function isCodePath(path: string): boolean {
  return CODE_EXT.test(path);
}

export function firstLine(message: string | undefined, max = 200): string {
  const line = (message ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (line ?? '').slice(0, max);
}

// display form for pr comments: values often sit on later lines (node, jest)
export function oneLine(message: string | undefined, max = 200): string {
  return (message ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

export function proofKind(message: string | undefined, viaLoadError: boolean): ProofKind {
  if (viaLoadError) return 'missing-code';
  const line = firstLine(message, 500);
  return MISSING_CODE.some((re) => re.test(line)) ? 'missing-code' : 'assertion';
}

export function isSuspect(message: string | undefined, touched: string[]): boolean {
  const line = firstLine(message, 500);
  if (line === '') return false;
  return touched.some((path) => {
    if (isCodePath(path)) return false;
    const base = path.split('/').pop() ?? path;
    return line.includes(path) || (base.length >= 5 && base.includes('.') && line.includes(base));
  });
}
