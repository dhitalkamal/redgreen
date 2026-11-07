import { parsePatternList } from '../check/patterns';

// input helpers used by both actions
export class InputError extends Error {}

export type GetInput = (name: string) => string;

export function parseBool(get: GetInput, name: string, fallback: boolean): boolean {
  const raw = get(name).trim().toLowerCase();
  if (raw === '') return fallback;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  throw new InputError(`input ${name} must be true or false, got "${raw}"`);
}

export function listOr(get: GetInput, name: string, fallback: string[]): string[] {
  return get(name).trim() === '' ? fallback : parsePatternList(get(name));
}
