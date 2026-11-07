export type ChangeStatus = 'A' | 'D' | 'M' | 'R' | 'T';

export interface Change {
  status: ChangeStatus;
  path: string;
  oldPath?: string;
  submodule: boolean;
}

const SIMPLE = new Set(['A', 'D', 'M', 'T']);

// parses `git diff --raw -z -M` output; -z keeps odd file names intact
export function parseRawDiff(output: string): Change[] {
  const parts = output.split('\0');
  const changes: Change[] = [];
  let i = 0;
  while (i < parts.length) {
    const header = parts[i];
    if (header === undefined || header === '') {
      i += 1;
      continue;
    }
    if (!header.startsWith(':')) {
      throw new Error(`unexpected diff entry: ${header.slice(0, 80)}`);
    }
    const [srcMode, dstMode, , , statusField = ''] = header.slice(1).split(' ');
    const letter = statusField.charAt(0);
    const submodule = srcMode === '160000' || dstMode === '160000';
    if (letter === 'R' || letter === 'C') {
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      if (oldPath === undefined || newPath === undefined || newPath === '') {
        throw new Error('truncated rename entry');
      }
      changes.push(
        letter === 'R'
          ? { status: 'R', path: newPath, oldPath, submodule }
          : { status: 'A', path: newPath, submodule },
      );
      i += 3;
      continue;
    }
    const path = parts[i + 1];
    if (path === undefined || path === '') throw new Error('truncated diff entry');
    if (!SIMPLE.has(letter)) throw new Error(`unsupported diff status: ${statusField}`);
    changes.push({ status: letter as ChangeStatus, path, submodule });
    i += 2;
  }
  return changes;
}
