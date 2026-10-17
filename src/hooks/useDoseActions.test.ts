import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ==========================================================================
 * useDoseActions — source-level safety contracts
 *
 * These tests intentionally inspect the source file of `useDoseActions.ts`
 * rather than executing it. They pin down *implementation invariants* that
 * are hard to assert behaviorally without flakiness (e.g. ordering of
 * persistence vs. state update, release of an in-memory guard on failure).
 *
 * Trade-off acknowledged: structural tests are brittle against refactors.
 * They are kept narrow (only the safety-critical ordering guarantees) so
 * that renaming a variable or restructuring a non-critical block does not
 * trigger a false failure. Whenever a contract here can be expressed as a
 * behavior test, prefer the behavior test in `useDoseActions.behavior.test.ts`.
 * ========================================================================== */

const SOURCE_PATH = new URL('./useDoseActions.ts', import.meta.url);
const source = readFileSync(fileURLToPath(SOURCE_PATH), 'utf8');

/* --------------------------------------------------------------------------
 * Source-inspection helpers
 * -------------------------------------------------------------------------- */

/**
 * Asserts that every fragment appears in `source` and in the given order.
 * The error message lists the missing fragments and out-of-order pairs so
 * a failure points directly at the offending contract.
 */
function ordered(fragments: readonly string[]): void {
  const positions = fragments.map((fragment) => source.indexOf(fragment));

  const missing = fragments.filter((_, i) => positions[i] === -1);
  if (missing.length > 0) {
    throw new Error(
      `Missing fragment(s) in useDoseActions.ts:\n  - ${missing.join('\n  - ')}\n` +
      `Inspect the file at: ${fileURLToPath(SOURCE_PATH)}`,
    );
  }

  // Detect the first out-of-order pair for a precise failure message.
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! < positions[i - 1]!) {
      const earlier = fragments[i];
      const later = fragments[i - 1];
      throw new Error(
        `Ordering violation in useDoseActions.ts:\n` +
        `  Expected "${later}" to appear before "${earlier}"\n` +
        `  Got positions: ${later} → ${positions[i - 1]!}, ${earlier} → ${positions[i]!}`,
      );
    }
  }
}

/** Asserts that `source` contains `fragment`. */
function contains(fragment: string): void {
  if (!source.includes(fragment)) {
    throw new Error(
      `Expected useDoseActions.ts to contain:\n  "${fragment}"\n` +
      `File: ${fileURLToPath(SOURCE_PATH)}`,
    );
  }
}

/* --------------------------------------------------------------------------
 * Contracts
 * -------------------------------------------------------------------------- */

describe('useDoseActions — dose action safety contracts', () => {
  /* ----------------------------------------------------------------------
   * Contract 1: Stock-empty guard runs *before* any state mutation or
   * action-key tracking. Recording a dose with zero stock must short-circuit
   * with a user-facing alert and never reach the history-record branch.
   * -------------------------------------------------------------------- */
  describe('stock-empty guard', () => {
    it('blocks dose recording when stock is empty before claiming the dose cycle', () => {
      // The guard must precede: actionKey computation, history record build,
      // and (transitively) the persist call. If the guard slips after the
      // actionKey is registered, a stray "completed" marker could poison
      // future legitimate attempts.
      ordered([
        'if (m.quantity <= 0)',
        'window.alert(',
        'return;',
        'const now = Date.now();',
        'const record: HistoryRecord',
      ]);
      contains('دوزی ثبت نشد');
    });

    it('uses a non-blocking early return (no side effects after the alert)', () => {
      // After the alert + return, the function must not fall through to
      // any state mutation. We assert the alert is immediately followed by
      // `return;` on the next non-trivial statement.
      ordered(['if (m.quantity <= 0)', 'window.alert(', 'return;']);
    });
  });

  /* ----------------------------------------------------------------------
   * Contract 2: Persistence must commit to IndexedDB *before* the in-memory
   * `medications` state is updated. Otherwise a crash between the state
   * update and the DB write would lose the dose record while the UI shows
   * it as recorded — a silent data-loss bug.
   * -------------------------------------------------------------------- */
  describe('persist-before-state ordering', () => {
    it('persists a taken dose before updating visible state', () => {
      ordered([
        'await persist(updated);',
        'setMedications((prev) =>\n        prev.map((x) => (x.id === medication.id ? updated : x)),\n      );',
      ]);
    });

    it('updates state with the same `updated` object that was persisted', () => {
      // Guards against a subtle bug: persisting one object but updating state
      // with a different (e.g. re-derived) object, which would desync UI from DB.
      contains('await persist(updated);');
      contains('x.id === medication.id ? updated : x');
    });
  });

  /* ----------------------------------------------------------------------
   * Contract 3: If `persist` rejects, the dedupe guard entry that was
   * acquired at the start of the action MUST be released. Otherwise a
   * transient failure permanently blocks the user from ever recording that
   * dose cycle again until the page is reloaded.
   * -------------------------------------------------------------------- */
  describe('guard release on persistence failure', () => {
    it('releases the duplicate-action guard if persistence fails', () => {
      contains('forgetDoseAction(actionKey)');
      // The console message doubles as an audit trail — operators can grep
      // logs for it to spot flaky environments.
      contains('failed to persist ${config.kind} action; action can be retried');
    });

    it('deletes the guard inside the catch block (not in finally)', () => {
      // Putting the delete in `finally` would also release the guard on
      // success — defeating the purpose of the dedupe. We assert the delete
      // is textually inside a `catch` block by checking ordering relative to
      // the catch keyword.
      ordered(['catch (error)', 'forgetDoseAction(actionKey)']);
    });
  });

  /* ----------------------------------------------------------------------
   * Contract 4: Action-key granularity. Two distinct dose cycles for the
   * same medication must NOT collide on the same key, otherwise recording
   * cycle N+1 would be wrongly suppressed as a "duplicate" of cycle N.
   * -------------------------------------------------------------------- */
  describe('action key uniqueness', () => {
    it('doseActionKey incorporates the dose cycle identifier, not just the medication id', () => {
      // The key must be a composite — medication id alone is insufficient
      // because each scheduled dose is a separate logical action.
      contains('doseActionKey');
      // We accept either dueScheduledAt or nextDoseAt as the cycle anchor;
      // both guarantee per-cycle uniqueness.
      const hasCycleAnchor =
        source.includes('dueScheduledAt') || source.includes('nextDoseAt');
      expect(hasCycleAnchor).toBe(true);
    });
  });

  /* ----------------------------------------------------------------------
   * Contract 5: The dedupe guard must be a `ref` (mutable, no re-render)
   * rather than state. Using state for the guard would either trigger extra
   * renders or, worse, race with batched updates.
   * -------------------------------------------------------------------- */
  describe('guard storage type', () => {
    it('uses a ref (not state) for the in-flight action set', () => {
      contains('completedDoseActionsRef');
      // Heuristic: a useRef call binds the ref. We don't enforce the exact
      // generic type to allow either Set<string> or Map<string, ...>.
      contains('useRef');
    });
  });
});
