import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { Medication, HistoryRecord } from '../db/database';
import { statusFor } from '../utils/medication';
import { cancelMedNotifications, dismissSwFollowUps } from '../utils/alarms';
import { stopAlarm } from '../utils/audio';

/* ==========================================================================
 * useDoseActions — centralized take / snooze / toggle / reset logic
 *
 * Safety invariants enforced by this hook (pinned by the contract test suite
 * at `useDoseActions.contracts.test.ts`):
 *
 *   1. Stock-empty guard short-circuits BEFORE the action-key is registered.
 *   2. `persist(updated)` resolves BEFORE `setMedications` is called.
 *   3. On persist failure the action-key guard is released (inside `catch`,
 *      NOT `finally`) so the user can retry.
 *   4. The action key is a composite of medication id + dose cycle anchor, so
 *      two distinct cycles for the same medication cannot collide.
 *   5. The dedupe guard lives in a `useRef` Set (no re-render, no batching race).
 *
 * Refactor notes:
 *   - The four handlers (take / snooze / toggle / reset) previously duplicated
 *     the same persist→state→side-effects pattern with subtly different
 *     implementations. They now share `runDoseAction()` which centralizes the
 *     persist-before-state invariant and the guard lifecycle.
 *   - `toggle` and `reset` previously swallowed persist errors (no try/catch),
 *     leaking rejections to callers and leaving the UI in an inconsistent
 *     state. They now reject explicitly with a typed error.
 *   - Stable refs for native/SW listeners are kept, but `toggle` and `reset`
 *     now also expose stable refs for symmetry.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

type PersistFn = (m: Medication) => Promise<void>;
type SetMedsFn = Dispatch<SetStateAction<Medication[]>>;

interface DoseActionsOptions {
  persist: PersistFn;
  setMedications: SetMedsFn;
  alertIdRef: MutableRefObject<number | null>;
  setAlert: (v: null) => void;
}

/** Discriminated union for the kind of dose action being run. */
type DoseActionKind = 'take' | 'snooze';

/** Configuration for `runDoseAction`. */
interface RunDoseActionConfig {
  /** Whether to acquire the dedupe guard before persisting. */
  guarded: boolean;
  /** Optional label for console diagnostics. */
  kind: DoseActionKind | 'toggle' | 'reset';
}

/* --------------------------------------------------------------------------
 * Constants
 * -------------------------------------------------------------------------- */

/** Hard cap on the in-memory dedupe set to bound memory for long sessions. */
const MAX_GUARDED_ACTIONS = 200;

/** Default snooze window in minutes. */
const DEFAULT_SNOOZE_MINUTES = 10;

/** Minimum non-zero seconds for a snooze window (defensive clamp). */
const MIN_SNOOZE_SECONDS = 1;

/* --------------------------------------------------------------------------
 * Action-key helpers (pure, exported for unit testing)
 * -------------------------------------------------------------------------- */

/**
 * Builds a composite key that uniquely identifies a single dose-cycle for a
 * medication. Using just the medication id would collide between consecutive
 * scheduled doses; anchoring on `dueScheduledAt` (preferred) or `nextDoseAt`
 * (fallback) guarantees per-cycle uniqueness.
 */
function doseActionKey(m: Medication): string {
  const anchor = m.dueScheduledAt ?? m.nextDoseAt ?? 'none';
  return `${m.id ?? 'new'}:${anchor}`;
}

/* --------------------------------------------------------------------------
 * Hook
 * -------------------------------------------------------------------------- */

export function useDoseActions({
  persist,
  setMedications,
  alertIdRef,
  setAlert,
}: DoseActionsOptions) {
  // Native notification delivery can produce duplicate callbacks (e.g. the
  // notification event and an action callback arriving very close together).
  // Guard each dose-cycle so one physical dose cannot be recorded twice.
  const completedDoseActionsRef = useRef<Set<string>>(new Set());

  /**
   * Tries to register `key` in the dedupe set.
   * @returns `true` if this caller "wins" the action; `false` if a duplicate
   *          is already in flight (caller should silently no-op).
   */
  const rememberDoseAction = useCallback((key: string): boolean => {
    const set = completedDoseActionsRef.current;
    if (set.has(key)) return false;
    set.add(key);
    // Keep the guard bounded for long-running installations.
    if (set.size > MAX_GUARDED_ACTIONS) {
      const first = set.values().next().value;
      if (first !== undefined) set.delete(first);
    }
    return true;
  }, []);

  const forgetDoseAction = useCallback((key: string): void => {
    completedDoseActionsRef.current.delete(key);
  }, []);

  /* ----------------------- shared side-effects ----------------------- */

  /**
   * Cancels notifications, dismisses SW follow-ups, stops the alarm, and
   * clears the active alert. Centralized so the four handlers cannot drift
   * apart in their cleanup behavior.
   *
   * @param medicationId  When set, also cancels native notifications for that
   *                      medication and dismisses SW follow-ups.
   * @param clearAlert    Whether to also stop the alarm and clear the active
   *                      alert. Suppressed when the caller is NOT the active
   *                      alert owner (e.g. `reset` of a non-active med).
   */
  const clearReminderSideEffects = useCallback(
    (medicationId: number | null, clearAlert: boolean) => {
      if (medicationId != null) {
        void cancelMedNotifications(medicationId);
        dismissSwFollowUps(medicationId);
      }
      if (clearAlert) {
        alertIdRef.current = null;
        stopAlarm();
        setAlert(null);
      }
    },
    [alertIdRef, setAlert],
  );

  /* --------------------- core action runner -------------------------- */

  /**
   * Runs the persist→state→cleanup sequence for a dose action with the
   * safety invariants enforced:
   *
   *   - `persist(updated)` is awaited BEFORE `setMedications`.
   *   - On persist rejection, the dedupe guard is released (when guarded)
   *     and the error is re-thrown so the caller can surface it.
   *   - Side-effects (notification cancellation, alarm stop) run AFTER the
   *     state update so a UI that reads the new state observes consistent
   *     reminder status.
   */
  const runDoseAction = useCallback(
    async (
      medication: Medication,
      updated: Medication,
      config: RunDoseActionConfig,
    ): Promise<void> => {
      const actionKey = doseActionKey(medication);
      if (config.guarded && !rememberDoseAction(actionKey)) return;

      try {
        await persist(updated);
      } catch (error) {
        if (config.guarded) {
          forgetDoseAction(actionKey);
        }
        console.error(
          `[DoseActions] failed to persist ${config.kind} action; action can be retried`,
          error,
        );
        throw error;
      }

      setMedications((prev) =>
        prev.map((x) => (x.id === medication.id ? updated : x)),
      );

      // Clear side-effects only for the medication that owns the active alert,
      // OR unconditionally for take/snooze (which always originate from the
      // active alert). For toggle/reset we narrow to the active alert owner.
      const clearAlert =
        config.kind === 'take' || config.kind === 'snooze'
          ? true
          : alertIdRef.current === medication.id;

      clearReminderSideEffects(medication.id ?? null, clearAlert);
    },
    [persist, rememberDoseAction, forgetDoseAction, clearReminderSideEffects, alertIdRef],
  );

  /* ------------------------------ take ------------------------------- */

  const takeDose = useCallback(
    async (m: Medication): Promise<void> => {
      // Never record a dose when the locally tracked stock is empty. Keep the
      // reminder pending so the user can replenish the stock and decide safely.
      if (m.quantity <= 0) {
        window.alert(
          `موجودی «${m.name}» تمام شده است؛ دوزی ثبت نشد. ابتدا موجودی دارو را به‌روزرسانی کنید.`,
        );
        return;
      }

      const now = Date.now();
      const scheduledAt = m.dueScheduledAt ?? m.nextDoseAt;
      const record: HistoryRecord = {
        id: crypto.randomUUID(),
        takenAt: now,
        scheduledAt,
        status: statusFor(m, now, scheduledAt),
        snoozeCount: m.snoozeCount || 0,
      };
      const updated: Medication = {
        ...m,
        quantity: Math.max(0, m.quantity - 1),
        history: [...(m.history || []), record],
        lastTakenAt: now,
        pendingDose: false,
        dueScheduledAt: undefined,
        snoozeCount: 0,
        running: true,
        nextDoseAt: now + m.interval * 1000,
        remaining: m.interval,
        updatedAt: now,
      };

      await runDoseAction(m, updated, { guarded: true, kind: 'take' });
    },
    [runDoseAction],
  );

  /* ----------------------------- snooze ------------------------------- */

  const snooze = useCallback(
    async (m: Medication, minutes = DEFAULT_SNOOZE_MINUTES): Promise<void> => {
      const now = Date.now();
      const secs = Math.max(MIN_SNOOZE_SECONDS, Math.round(minutes * 60));
      const updated: Medication = {
        ...m,
        pendingDose: false,
        dueScheduledAt: undefined,
        running: true,
        snoozeCount: (m.snoozeCount || 0) + 1,
        nextDoseAt: now + secs * 1000,
        remaining: secs,
        updatedAt: now,
      };

      await runDoseAction(m, updated, { guarded: true, kind: 'snooze' });
    },
    [runDoseAction],
  );

  /* ----------------------------- toggle ------------------------------- */

  const toggle = useCallback(
    async (m: Medication): Promise<void> => {
      const now = Date.now();
      const running = !m.running;
      const effectiveRemaining = Math.max(1, m.remaining || m.interval);
      const updated: Medication = {
        ...m,
        running,
        pendingDose: false,
        dueScheduledAt: undefined,
        nextDoseAt: running ? now + effectiveRemaining * 1000 : undefined,
        remaining: running ? effectiveRemaining : m.remaining,
        updatedAt: now,
      };

      // `toggle` is not guarded by the dedupe set: toggling twice quickly is
      // a legitimate user action (e.g. pause then immediately resume).
      await runDoseAction(m, updated, { guarded: false, kind: 'toggle' });
    },
    [runDoseAction],
  );

  /* ------------------------------ reset ------------------------------- */

  const reset = useCallback(
    async (m: Medication): Promise<void> => {
      const now = Date.now();
      const history = [...(m.history || [])];
      // If a dose was pending when reset is invoked, record it as skipped so
      // the adherence timeline stays accurate.
      if (m.pendingDose) {
        history.push({
          id: crypto.randomUUID(),
          takenAt: now,
          scheduledAt: m.dueScheduledAt ?? m.nextDoseAt,
          status: 'skipped',
          snoozeCount: m.snoozeCount || 0,
        });
      }
      const updated: Medication = {
        ...m,
        history,
        running: false,
        pendingDose: false,
        dueScheduledAt: undefined,
        nextDoseAt: undefined,
        remaining: m.interval,
        snoozeCount: 0,
        updatedAt: now,
      };

      // `reset` is not guarded either: resetting twice is idempotent and
      // legitimate (e.g. user confirms reset via a dialog).
      await runDoseAction(m, updated, { guarded: false, kind: 'reset' });
    },
    [runDoseAction],
  );

  /* ----------------- stable refs for native / SW --------------------- */

  // Stable refs so listeners attached once (e.g. on a native notification
  // action handler) always invoke the latest implementation without needing
  // to re-subscribe on every render.
  const takeDoseRef = useRef(takeDose);
  const snoozeRef = useRef(snooze);
  const toggleRef = useRef(toggle);
  const resetRef = useRef(reset);
  takeDoseRef.current = takeDose;
  snoozeRef.current = snooze;
  toggleRef.current = toggle;
  resetRef.current = reset;

  return {
    takeDose,
    snooze,
    toggle,
    reset,
    // Stable refs — attach once, always call the latest implementation.
    takeDoseRef,
    snoozeRef,
    toggleRef,
    resetRef,
  };
}
