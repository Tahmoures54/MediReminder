import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Medication, HistoryRecord } from '../db/database';
import { statusFor } from '../utils/medication';
import { cancelMedNotifications, dismissSwFollowUps } from '../utils/alarms';
import { stopAlarm } from '../utils/audio';

type PersistFn = (m: Medication) => Promise<void>;
type SetMedsFn = Dispatch<SetStateAction<Medication[]>>;

interface DoseActionsOptions {
  persist: PersistFn;
  setMedications: SetMedsFn;
  alertIdRef: MutableRefObject<number | null>;
  setAlert: (v: null) => void;
}

/**
 * Centralizes take / snooze / toggle / reset logic so App.tsx stays lean
 * and the same handlers can be reused from native notification actions
 * and the service-worker bridge.
 */
export function useDoseActions({
  persist,
  setMedications,
  alertIdRef,
  setAlert,
}: DoseActionsOptions) {
  const takeDose = useCallback(
    async (m: Medication) => {
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
      setMedications((v) => v.map((x) => (x.id === m.id ? updated : x)));
      await persist(updated);

      if (m.id != null) {
        await cancelMedNotifications(m.id);
        dismissSwFollowUps(m.id);
      }
      alertIdRef.current = null;
      stopAlarm();
      setAlert(null);
    },
    [persist, setMedications, alertIdRef, setAlert]
  );

  const snooze = useCallback(
    async (m: Medication, minutes = 10) => {
      const now = Date.now();
      const secs = Math.max(1, Math.round(minutes * 60));
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
      setMedications((v) => v.map((x) => (x.id === m.id ? updated : x)));
      await persist(updated);

      if (m.id != null) {
        await cancelMedNotifications(m.id);
        dismissSwFollowUps(m.id);
      }
      alertIdRef.current = null;
      stopAlarm();
      setAlert(null);
    },
    [persist, setMedications, alertIdRef, setAlert]
  );

  const toggle = useCallback(
    async (m: Medication) => {
      const now = Date.now();
      const running = !m.running;
      const updated: Medication = {
        ...m,
        running,
        pendingDose: false,
        dueScheduledAt: undefined,
        nextDoseAt: running ? now + Math.max(1, m.remaining || m.interval) * 1000 : undefined,
        remaining: running ? Math.max(1, m.remaining || m.interval) : m.remaining,
        updatedAt: now,
      };
      setMedications((v) => v.map((x) => (x.id === m.id ? updated : x)));
      await persist(updated);
      if (!running && m.id != null) {
        await cancelMedNotifications(m.id);
        dismissSwFollowUps(m.id);
      }
    },
    [persist, setMedications]
  );

  const reset = useCallback(
    async (m: Medication) => {
      const updated: Medication = {
        ...m,
        running: false,
        pendingDose: false,
        dueScheduledAt: undefined,
        nextDoseAt: undefined,
        remaining: m.interval,
        snoozeCount: 0,
        updatedAt: Date.now(),
      };
      setMedications((v) => v.map((x) => (x.id === m.id ? updated : x)));
      await persist(updated);
      if (m.id != null) {
        await cancelMedNotifications(m.id);
        dismissSwFollowUps(m.id);
      }
      if (alertIdRef.current === m.id) {
        alertIdRef.current = null;
        stopAlarm();
        setAlert(null);
      }
    },
    [persist, setMedications, alertIdRef, setAlert]
  );

  // Stable refs so native / SW listeners always call the latest implementation
  const takeDoseRef = useRef(takeDose);
  const snoozeRef = useRef(snooze);
  takeDoseRef.current = takeDose;
  snoozeRef.current = snooze;

  return {
    takeDose,
    snooze,
    toggle,
    reset,
    takeDoseRef,
    snoozeRef,
  };
}
