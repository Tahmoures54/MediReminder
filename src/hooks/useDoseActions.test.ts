import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./useDoseActions.ts', import.meta.url)), 'utf8');

function ordered(fragments: string[]) {
  const positions = fragments.map((fragment) => source.indexOf(fragment));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

describe('dose action safety contracts', () => {
  it('blocks dose recording when stock is empty before claiming the dose cycle', () => {
    ordered(['if (m.quantity <= 0)', 'window.alert(', 'return;', 'const actionKey = doseActionKey(m);', 'const record: HistoryRecord']);
    expect(source).toContain('دوزی ثبت نشد');
  });

  it('persists a taken dose before updating visible state', () => {
    ordered(['await persist(updated);', 'setMedications((v) => v.map((x) => (x.id === m.id ? updated : x)))']);
  });

  it('releases the duplicate-action guard if persistence fails', () => {
    expect(source).toContain('completedDoseActionsRef.current.delete(actionKey)');
    expect(source).toContain('failed to persist taken dose; action can be retried');
  });
});
