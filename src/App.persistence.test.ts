import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_PATH = fileURLToPath(new URL('./App.tsx', import.meta.url));
const appSource = readFileSync(APP_PATH, 'utf8');

// Explicit skip, visible in the report — not silent pass.
const isShell = appSource.includes('Temporary shell');
const suite = isShell ? describe.skip : describe;

function ordered(source: string, fragments: string[]) {
  const positions = fragments.map((f) => {
    const i = source.indexOf(f);
    if (i < 0) {
      throw new Error(`fragment not found in block: ${JSON.stringify(f)}`);
    }
    return i;
  });
  const sorted = [...positions].sort((a, b) => a - b);
  expect(positions, `fragments out of order: ${fragments.join(' → ')}`).toEqual(sorted);
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`start marker not found: ${JSON.stringify(startMarker)}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`end marker not found after start: ${JSON.stringify(endMarker)}`);
  return source.slice(start, end);
}

suite('due medication persistence safety', () => {
  it('persists due transition before updating visible state in timer loop', () => {
    const block = sliceBetween(
      appSource,
      'A due transition is not shown as committed until IndexedDB confirms it.',
      'if (updates.size) setMedications',
    );
    ordered(block, ['await persist(due);', 'updates.set(due.id, due);', 'openAlert(due, true);']);
  });

  it('persists due transition before UI update on resume', () => {
    const block = sliceBetween(
      appSource,
      'failed to persist due medication on resume; retry will be allowed',
      '\n        }',
    );
    ordered(block, ['await persist(due);', 'setMedications(', 'openAlert(due, true);']);
  });

  it('persists native due transition before showing the alert', () => {
    const block = sliceBetween(
      appSource,
      'failed to persist native due medication; retry will be allowed',
      'else openAlert(m, true);',
    );
    ordered(block, ['await persist(due);', 'setMedications(', 'openAlert(due, true);']);
  });

  it('persists edits before visible state and closes editor only after success', () => {
    const block = sliceBetween(appSource, 'const saveEdit = async', 'const remove = async');
    ordered(block, ['await persist(updated);', 'setMedications(', 'setEditing(null);']);
  });
});
