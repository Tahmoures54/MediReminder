// src/App.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { db, Medication, HistoryRecord } from './db/database';
import { playAlarm, stopAlarm, triggerHaptics } from './utils/audio';
import { initAllPermissions, checkNotificationPermission } from './utils/permissions';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const SUPPORT_WEBSITE = "https://mediremind-brown.vercel.app/";
const LOW_STOCK_THRESHOLD = 5;
const TIMER_INTERVAL = 1000;
const EARLY_THRESHOLD_MS = 30 * 60 * 1000;
const LATE_THRESHOLD_MS = 60 * 60 * 1000;
/** فاصله تکرار اعلان پس‌زمینه (ثانیه) تا تأیید مصرف */
const FOLLOW_UP_NATIVE_SECONDS = 45;

interface MedicationWithTimestamp extends Medication {
  lastUpdated: number;
}

interface AlertItem {
  title: string;
  message: string;
  medication: MedicationWithTimestamp;
  isMedicationAlert?: boolean;
}

interface ConfirmDialogData {
  title: string;
  message: string;
  onConfirm: () => void;
}

const calculateDoseStatus = (
  lastTakenAt: number,
  currentTime: number,
  intervalSeconds: number
): 'on-time' | 'early' | 'late' => {
  const diffMs = currentTime - lastTakenAt;
  const targetMs = intervalSeconds * 1000;
  if (diffMs < targetMs - EARLY_THRESHOLD_MS) return 'early';
  if (diffMs > targetMs + LATE_THRESHOLD_MS) return 'late';
  return 'on-time';
};

const createDoseRecord = (
  medication: MedicationWithTimestamp
): HistoryRecord[] => {
  const nowMs = Date.now();
  const history = medication.history || [];
  let status: 'on-time' | 'early' | 'late' = 'on-time';
  if (history.length > 0) {
    const latestTaken = Math.max(...history.map(h => h.takenAt));
    status = calculateDoseStatus(latestTaken, nowMs, medication.interval);
  }
  return [...history, { takenAt: nowMs, status }];
};

const recalculateRemaining = (
  medication: MedicationWithTimestamp,
  currentTime: number
): MedicationWithTimestamp => {
  if (!medication.running) return medication;
  const elapsedSeconds = Math.floor((currentTime - medication.lastUpdated) / 1000);
  const newRemaining = Math.max(0, medication.remaining - elapsedSeconds);
  return {
    ...medication,
    remaining: newRemaining,
    lastUpdated: currentTime,
  };
};

export default function App() {
  const [medications, setMedications] = useState<MedicationWithTimestamp[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<AlertItem | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogData | null>(null);
  const [reportMedication, setReportMedication] = useState<MedicationWithTimestamp | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unknown'>('unknown');
  const [isNative, setIsNative] = useState(false);

  const medicationsRef = useRef<MedicationWithTimestamp[]>([]);
  const alertQueueRef = useRef<AlertItem[]>([]);
  const isAlertShowingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<string>('');

  useEffect(() => {
    medicationsRef.current = medications;
  }, [medications]);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    initAllPermissions().then(() => {
      checkNotificationPermission().then(setNotificationPermission);
    });
    loadMedications();
  }, []);

  const loadMedications = async () => {
    try {
      const all = await db.getAllMedications();
      const now = Date.now();
      const withTs: MedicationWithTimestamp[] = all.map(m => ({
        ...m,
        lastUpdated: now,
        history: m.history || [],
      }));
      setMedications(withTs);
    } catch (e) {
      console.error('Failed to load medications', e);
    }
  };

  const persistMedication = async (med: MedicationWithTimestamp) => {
    try {
      await db.updateMedication(med);
    } catch (e) {
      console.error('Failed to persist medication', e);
    }
  };

  const showAlert = useCallback((alert: AlertItem) => {
    if (isAlertShowingRef.current) {
      alertQueueRef.current.push(alert);
      return;
    }
    isAlertShowingRef.current = true;
    setCurrentAlert(alert);
    if (alert.isMedicationAlert) {
      playAlarm();
      triggerHaptics();
    }
  }, []);

  const handleCloseAlert = useCallback(() => {
    stopAlarm();
    setCurrentAlert(null);
    isAlertShowingRef.current = false;
    const next = alertQueueRef.current.shift();
    if (next) {
      setTimeout(() => showAlert(next), 300);
    }
  }, [showAlert]);

  const handleAlertRestart = useCallback(async () => {
    if (!currentAlert?.medication) return;
    const med = currentAlert.medication;
    const now = Date.now();
    const updated: MedicationWithTimestamp = {
      ...med,
      remaining: med.interval,
      running: true,
      lastUpdated: now,
      quantity: Math.max(0, med.quantity - 1),
      history: createDoseRecord(med),
    };
    setMedications(prev => prev.map(m => (m.id === med.id ? updated : m)));
    await persistMedication(updated);
    handleCloseAlert();
  }, [currentAlert, handleCloseAlert]);

  const handleSnooze = useCallback(
    async (minutes: number) => {
      if (!currentAlert?.medication) return;
      const med = currentAlert.medication;
      const now = Date.now();
      const updated: MedicationWithTimestamp = {
        ...med,
        remaining: minutes * 60,
        running: true,
        lastUpdated: now,
      };
      setMedications(prev => prev.map(m => (m.id === med.id ? updated : m)));
      await persistMedication(updated);
      handleCloseAlert();
    },
    [currentAlert, handleCloseAlert]
  );

  const handleToggleMedication = async (med: MedicationWithTimestamp) => {
    const now = Date.now();
    const updated: MedicationWithTimestamp = {
      ...med,
      running: !med.running,
      lastUpdated: now,
    };
    setMedications(prev => prev.map(m => (m.id === med.id ? updated : m)));
    await persistMedication(updated);
  };

  const handleResetMedication = async (med: MedicationWithTimestamp) => {
    const now = Date.now();
    const updated: MedicationWithTimestamp = {
      ...med,
      remaining: med.interval,
      running: false,
      lastUpdated: now,
    };
    setMedications(prev => prev.map(m => (m.id === med.id ? updated : m)));
    await persistMedication(updated);
  };

  const handleDeleteMedication = (med: MedicationWithTimestamp) => {
    setConfirmDialog({
      title: 'حذف دارو',
      message: `آیا از حذف «${med.name}» مطمئن هستید؟`,
      onConfirm: async () => {
        try {
          if (med.id != null) await db.deleteMedication(med.id);
          setMedications(prev => prev.filter(m => m.id !== med.id));
        } catch (e) {
          console.error('Delete failed', e);
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleAddMedication = async (data: {
    name: string;
    dosage: string;
    intervalHours: number;
    quantity: number;
  }) => {
    const now = Date.now();
    const interval = data.intervalHours * 3600;
    const newMed: MedicationWithTimestamp = {
      name: data.name,
      dosage: data.dosage,
      intervalHours: data.intervalHours,
      interval,
      quantity: data.quantity,
      remaining: interval,
      running: false,
      lastUpdated: now,
      history: [],
    };
    try {
      const id = await db.addMedication(newMed);
      setMedications(prev => [...prev, { ...newMed, id }]);
      setShowAddForm(false);
    } catch (e) {
      console.error('Add failed', e);
    }
  };

  // Timer tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const now = Date.now();
      setMedications(prev => {
        let changed = false;
        const next = prev.map(med => {
          if (!med.running) return med;
          const updated = recalculateRemaining(med, now);
          if (updated.remaining !== med.remaining) changed = true;
          if (updated.remaining === 0 && med.remaining > 0) {
            showAlert({
              title: 'زمان مصرف دارو',
              message: `وقت مصرف ${med.name} (${med.dosage}) فرا رسیده است.`,
              medication: updated,
              isMedicationAlert: true,
            });
          }
          return updated;
        });
        if (changed) {
          next.forEach(m => {
            if (m.running) persistMedication(m);
          });
        }
        return changed ? next : prev;
      });
    }, TIMER_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [showAlert]);

  // Native notification sync (only when state actually changes)
  useEffect(() => {
    if (!isNative) return;
    const key = medications
      .map(m => `${m.id}:${m.running}:${m.remaining}:${m.name}`)
      .join('|');
    if (key === lastSyncRef.current) return;
    lastSyncRef.current = key;

    (async () => {
      try {
        await LocalNotifications.cancel({ notifications: medications.map((_, i) => ({ id: i + 1 })) });
        const pending = medications.filter(m => m.running && m.remaining > 0);
        for (let i = 0; i < pending.length; i++) {
          const m = pending[i];
          const id = (m.id ?? i) + 1;
          await LocalNotifications.schedule({
            notifications: [
              {
                id,
                title: 'یادآور دارو',
                body: `وقت مصرف ${m.name}`,
                schedule: { at: new Date(Date.now() + m.remaining * 1000) },
                sound: 'medication_alarm.wav',
                extra: { medicationId: m.id },
              },
            ],
          });
        }
      } catch (e) {
        console.warn('Native notification sync failed', e);
      }
    })();
  }, [medications, isNative]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 text-white">
      <div className="mx-auto max-w-lg px-4 py-6">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-cyan-300">💊 یادآور دارو</h1>
          <p className="mt-2 text-sm text-cyan-300/60">مصرف به‌موقع، سلامت بهتر</p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="rounded-xl bg-cyan-500 px-5 py-2.5 font-bold text-gray-900 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-400"
            >
              + دارو
            </button>
            <a
              href={SUPPORT_WEBSITE}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-cyan-500/30 px-4 py-2.5 text-sm text-cyan-300/80 transition hover:bg-cyan-500/10"
            >
              پشتیبانی
            </a>
          </div>
          {notificationPermission === 'denied' && (
            <p className="mt-3 text-xs text-amber-400">اعلان‌ها غیرفعال است — از تنظیمات دستگاه فعال کنید</p>
          )}
        </header>

        {showAddForm && (
          <div className="mb-6">
            <AddMedicationForm
              onSubmit={handleAddMedication}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        <div className="space-y-4">
          {medications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                <div className="text-8xl animate-bounce">💊</div>
                <div className="absolute inset-0 blur-2xl bg-cyan-400/20 animate-pulse" />
              </div>
              <p className="text-xl font-semibold text-cyan-300/90 mb-2">
                هنوز دارویی اضافه نشده
              </p>
              <p className="text-sm text-cyan-300/50">
                برای شروع روی «+ دارو» بزنید
              </p>
            </div>
          ) : (
            medications.map((med, index) => (
              <div
                key={med.id}
                className="animate-in slide-in-from-bottom duration-300"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <MedicationCard
                  medication={med}
                  index={index + 1}
                  onToggle={() => handleToggleMedication(med)}
                  onReset={() => handleResetMedication(med)}
                  onDelete={() => handleDeleteMedication(med)}
                  onShowReport={() => setReportMedication(med)}
                />
              </div>
            ))
          )}
        </div>

        <footer className="mt-12 text-center">
          <div className="inline-block bg-gradient-to-r from-cyan-500/5 to-blue-500/5 backdrop-blur-sm rounded-full px-6 py-3 border border-cyan-500/10">
            <p className="text-xs text-cyan-300/40 font-medium flex items-center gap-2">
              <span className="text-sm">✨</span>
              <span>ساخته‌شده با دقت برای سلامت شما</span>
              <span className="text-sm">✨</span>
            </p>
          </div>
        </footer>
      </div>

      {currentAlert && (
        <NotificationPopup
          title={currentAlert.title}
          message={currentAlert.message}
          onClose={handleCloseAlert}
          onRestart={currentAlert.isMedicationAlert ? handleAlertRestart : undefined}
          onSnooze={currentAlert.isMedicationAlert ? handleSnooze : undefined}
          isMedicationAlert={!!currentAlert.isMedicationAlert}
        />
      )}

      {reportMedication && (
        <ReportModal
          medication={reportMedication}
          onClose={() => setReportMedication(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
