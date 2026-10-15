import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8');

function ordered(source: string, fragments: string[]) {
  const positions = fragments.map((fragment) => source.indexOf(fragment));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

describe('due medication persistence safety', () => {
  it('persists a due transition before updating the visible state in the timer loop', () => {
    const start = appSource.indexOf('A due transition is not shown as committed until IndexedDB confirms it.');
    const end = appSource.indexOf('if (updates.size) setMedications', start);
    const block = appSource.slice(start, end);
    ordered(block, ['await persist(due);', 'updates.set(id, due);', 'openAlert(due, true);']);
  });

  it('persists a due transition before updating the UI when the app resumes', () => {
    const start = appSource.indexOf('failed to persist due medication on resume; retry will be allowed') - 900;
    const end = appSource.indexOf('\n        }', start);
    const block = appSource.slice(start, end);
    ordered(block, ['await persist(due);', 'setMedications((prev)', 'openAlert(due, true);']);
  });

  it('persists a native notification transition before showing the alert', () => {
    const start = appSource.indexOf('failed to persist native due medication; retry will be allowed') - 700;
    const end = appSource.indexOf('else openAlert(m, true);', start);
    const block = appSource.slice(start, end);
    ordered(block, ['await persist(due);', 'setMedications((v)', 'openAlert(due, true);']);
  });


  it('persists medication edits before updating visible state and keeps the editor open on failure', () => {
    const start = appSource.indexOf('const saveEdit = async');
    const end = appSource.indexOf('const remove = async', start);
    const block = appSource.slice(start, end);
    ordered(block, ['await persist(updated);', 'setMedications((v)', 'setEditing(null);']);
    expect(block).toContain('failed to save medication edits');
    expect(block).toContain('return;');
  });

  it('does not silently ignore failed persistence of a due transition', () => {
    expect(appSource).not.toContain('persist(due).catch(() => {});');
  });
});
