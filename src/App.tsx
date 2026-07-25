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

// ============================================================================
// Constants
// ============================================================================
const SUPPORT_WEBSITE = "https://mediremind-brown.vercel.app/";
const LOW_STOCK_THRESHOLD = 5;
const TIMER_INTERVAL = 1000;
const EARLY_THRESHOLD_MS = 30 * 60 * 1000;
const LATE_THRESHOLD_MS = 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================
interface MedicationWithTimestamp extends Medication {
  lastUpdated: number;
}

interface AlertItem {
  title: string;
  message: string;
  medication: MedicationWithTimestamp;
}

interface ConfirmDialogData {
  title: string;
  message: string;
  onConfirm: () => void;
}

// ============================================================================
// Utility Functions
// ============================================================================
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

const sendBrowserNotification = (medication: MedicationWithTimestamp): void => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🔔 Time to Medicate!', {
      body: `${medication.name} - ${medication.dosage}`,
      icon: '/android-chrome-192x192.png',
      tag: `med-${medication.id}`,
      requireInteraction: true,
    });
  }
};

const createMedicationAlert = (medication: MedicationWithTimestamp): AlertItem => ({
  title: "🔔 Time to Medicate!",
  message: `Take now:\n💊 ${medication.name}\n⚖️ Dosage: ${medication.dosage}`,
  medication,
});

const createLowStockAlert = (medication: MedicationWithTimestamp): AlertItem => ({
  title: "💊 Low Stock Alert",
  message: `Only ${medication.quantity} pill${
    medication.quantity !== 1 ? 's' : ''
  } left of ${medication.name}.\nPlease refill soon.`,
  medication,
});

// ============================================================================
// Service Worker Alarm Sync
// ============================================================================
const syncAlarmsToServiceWorker = (meds: MedicationWithTimestamp[]) => {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const now = Date.now();
  const alarms = meds
    .filter(m => m.running && m.remaining > 0)
    .map(m => ({
      id: m.id,
      time: now + m.remaining * 1000,
      name: m.name,
      dosage: m.dosage,
    }));
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_ALARMS',
    alarms,
  });
};

// ============================================================================
// Native Alarm Sync
// ============================================================================
const scheduleNativeAlarms = async (meds: MedicationWithTimestamp[]) => {
  const now = Date.now();
  const notifications: any[] = [];

  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch {}

  for (const med of meds) {
    if (med.running && med.remaining > 0) {
      notifications.push({
        id: med.id!,
        title: '🔔 Time to Medicate!',
        body: `${med.name} - ${med.dosage}`,
        channelId: 'medication-alarms',
        schedule: { at: new Date(now + med.remaining * 1000) },
        sound: 'medication_alarm.wav',
        smallIcon: 'ic_stat_med',
        iconColor: '#DC2626',
        extra: { medicationId: med.id },
      });
    }
  }

  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
    } catch (err) {
      console.error('scheduleNativeAlarms error:', err);
    }
  }
};

// ============================================================================
// Unified alarm sync
// ============================================================================
const syncAlarms = (meds: MedicationWithTimestamp[]) => {
  if (Capacitor.isNativePlatform()) {
    scheduleNativeAlarms(meds);
  } else {
    syncAlarmsToServiceWorker(meds);
  }
};

// ============================================================================
// Custom Hooks
// ============================================================================
const useAudioUnlock = () => {
  const unlockedRef = useRef(false);

  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    const silentAudio = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
    );
    silentAudio.volume = 0;
    silentAudio.play()
      .then(() => {
        silentAudio.pause();
        unlockedRef.current = true;
      })
      .catch(() => {});
  }, []);

  return unlock;
};

// ============================================================================
// Permission Hook
// ============================================================================
const usePermissions = () => {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  useEffect(() => {
    checkNotificationPermission().then(status => {
      if (status === 'granted') {
        setPermissionGranted(true);
        setShowPermissionBanner(false);
      } else if (status === 'denied') {
        setPermissionGranted(false);
        setShowPermissionBanner(true);
      } else if (status === 'prompt') {
        setShowPermissionBanner(true);
      }
    });
  }, []);

  const requestPermissions = useCallback(async () => {
    const result = await initAllPermissions();
    setPermissionGranted(result.notification);
    if (result.notification) {
      setShowPermissionBanner(false);
    }
    return result;
  }, []);

  return { permissionGranted, showPermissionBanner, requestPermissions };
};

// ============================================================================
// Main Component
// ============================================================================
export default function App() {

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [medications, setMedications] = useState<MedicationWithTimestamp[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [alertQueue, setAlertQueue] = useState<AlertItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogData | null>(null);
  const [reportMedication, setReportMedication] = useState<MedicationWithTimestamp | null>(null);

  // --------------------------------------------------------------------------
  // Refs
  // --------------------------------------------------------------------------
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const medicationsRef = useRef<MedicationWithTimestamp[]>([]);
  const isSavingRef = useRef(false);

  // --------------------------------------------------------------------------
  // Custom Hooks
  // --------------------------------------------------------------------------
  const unlockAudio = useAudioUnlock();
  const { showPermissionBanner, requestPermissions } = usePermissions();

  // --------------------------------------------------------------------------
  // Sync medications to ref
  // --------------------------------------------------------------------------
  useEffect(() => {
    medicationsRef.current = medications;
  }, [medications]);

  // --------------------------------------------------------------------------
  // Load medications from database
  // --------------------------------------------------------------------------
  const loadMedications = useCallback(async () => {
    try {
      const meds = await db.getAllMedications();
      const now = Date.now();
      const processedMeds: MedicationWithTimestamp[] = [];
      const expiredAlerts: AlertItem[] = [];

      for (const med of meds) {
        const lastUpdated = (med as any).lastUpdated || now;
        let processedMed: MedicationWithTimestamp = {
          ...med,
          lastUpdated,
        };

        if (processedMed.running) {
          processedMed = recalculateRemaining(processedMed, now);
          if (processedMed.remaining === 0) {
            processedMed.running = false;
            processedMed.remaining = processedMed.interval;
            expiredAlerts.push(createMedicationAlert(processedMed));
          }
        }

        processedMeds.push(processedMed);
      }

      await Promise.all(processedMeds.map(med => db.updateMedication(med)));
      setMedications(processedMeds);

      if (expiredAlerts.length > 0) {
        playAlarm();
        triggerHaptics();
        setAlertQueue(prev => [...prev, ...expiredAlerts]);
      }
    } catch (error) {
      console.error('Failed to load medications:', error);
    }
  }, []);

  // --------------------------------------------------------------------------
  // Update timers every second
  // --------------------------------------------------------------------------
  const updateTimers = useCallback(() => {
    setMedications(prevMeds => {
      const now = Date.now();
      let hasChanges = false;
      const expiredMeds: MedicationWithTimestamp[] = [];

      const updatedMeds = prevMeds.map(med => {
        if (!med.running || med.remaining <= 0) return med;

        hasChanges = true;
        const newRemaining = med.remaining - 1;

        if (newRemaining === 0) {
          expiredMeds.push(med);
          return {
            ...med,
            remaining: 0,
            lastUpdated: now,
          };
        }

        return {
          ...med,
          remaining: newRemaining,
          lastUpdated: now,
        };
      });

      if (expiredMeds.length > 0) {
        playAlarm();
        triggerHaptics();
        expiredMeds.forEach(sendBrowserNotification);
        const newAlerts = expiredMeds.map(createMedicationAlert);
        setAlertQueue(prev => [...prev, ...newAlerts]);
      }

      return hasChanges ? updatedMeds : prevMeds;
    });
  }, []);

  // --------------------------------------------------------------------------
  // Save all medications to database
  // --------------------------------------------------------------------------
  const saveAllMedications = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const now = Date.now();
      const medsToSave = medicationsRef.current.map(med => ({
        ...med,
        lastUpdated: now,
      }));
      await Promise.all(medsToSave.map(med => db.updateMedication(med)));
    } catch (error) {
      console.error('Failed to save medications:', error);
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // --------------------------------------------------------------------------
  // Initialize app
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadMedications().then(() => {
      syncAlarms(medicationsRef.current);
    });

    intervalRef.current = setInterval(updateTimers, TIMER_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveAllMedications();
      } else {
        loadMedications().then(() => {
          syncAlarms(medicationsRef.current);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', saveAllMedications);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopAlarm();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', saveAllMedications);
    };
  }, [loadMedications, updateTimers, saveAllMedications]);

  // --------------------------------------------------------------------------
  // Sync alarms whenever medications change
  // --------------------------------------------------------------------------
  useEffect(() => {
    syncAlarms(medications);
  }, [medications]);

  // --------------------------------------------------------------------------
  // Native notification listeners
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // وقتی کاربر روی نوتیفیکیشن کلیک می‌کند
    const actionListener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      notification => {
        const medId = notification.notification.extra?.medicationId;
        if (medId) {
          const med = medicationsRef.current.find(m => m.id === medId);
          if (med) {
            playAlarm();
            triggerHaptics();
            setAlertQueue(prev => {
              if (prev.some(a => a.medication.id === med.id)) return prev;
              return [...prev, createMedicationAlert(med)];
            });
          }
        }
      }
    );

    // وقتی اپ باز است و نوتیفیکیشن می‌رسد
    const receivedListener = LocalNotifications.addListener(
      'localNotificationReceived',
      notification => {
        const medId = notification.extra?.medicationId;
        if (medId) {
          const med = medicationsRef.current.find(m => m.id === medId);
          if (med) {
            playAlarm();
            triggerHaptics();
            setAlertQueue(prev => {
              if (prev.some(a => a.medication.id === med.id)) return prev;
              return [...prev, createMedicationAlert(med)];
            });
          }
        }
      }
    );

    return () => {
      actionListener.then(l => l.remove());
      receivedListener.then(l => l.remove());
    };
  }, []);

  // --------------------------------------------------------------------------
  // Service Worker messages
  // --------------------------------------------------------------------------
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'ALARM_TRIGGERED') {
        const med = medicationsRef.current.find(m => m.id === event.data.medicationId);
        if (med) {
          playAlarm();
          triggerHaptics();
          setAlertQueue(prev => {
            if (prev.some(a => a.medication.id === med.id)) return prev;
            return [...prev, createMedicationAlert(med)];
          });
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  // --------------------------------------------------------------------------
  // Handle expired medications (remaining === 0)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const expiredMeds = medications.filter(med => med.running && med.remaining === 0);
    if (expiredMeds.length > 0) {
      setMedications(prev =>
        prev.map(med =>
          expiredMeds.some(exp => exp.id === med.id)
            ? {
                ...med,
                running: false,
                remaining: med.interval,
                lastUpdated: Date.now(),
              }
            : med
        )
      );
    }
  }, [medications]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleAddMedication = async (
    medData: Omit<Medication, 'id' | 'remaining' | 'running' | 'history'>
  ) => {
    unlockAudio();

    const newMed: MedicationWithTimestamp = {
      ...medData,
      remaining: medData.interval,
      running: false,
      history: [],
      lastUpdated: Date.now(),
    };

    try {
      const id = await db.addMedication(newMed);
      newMed.id = id;
      setMedications(prev => [...prev, newMed]);
      setShowForm(false);

      setAlertQueue(prev => [
        ...prev,
        {
          title: "💡 Reminder",
          message: "Tap ▶ Start after each dose.",
          medication: newMed,
        },
      ]);
    } catch (error) {
      console.error('Failed to add medication:', error);
    }
  };

  const handleToggleMedication = (med: MedicationWithTimestamp) => {
    unlockAudio();
    const willStart = !med.running;
    const message = willStart
      ? `Did you take ${med.name} (${med.dosage}) now?\nTimer will start after confirmation.`
      : "Pause the timer?";

    setConfirmDialog({
      title: "Confirm",
      message,
      onConfirm: async () => {
        try {
          const now = Date.now();
          const updatedMed: MedicationWithTimestamp = {
            ...med,
            running: willStart,
            quantity: willStart && med.quantity > 0 ? med.quantity - 1 : med.quantity,
            history: willStart ? createDoseRecord(med) : med.history,
            lastUpdated: now,
          };

          await db.updateMedication(updatedMed);
          setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));

          if (willStart && updatedMed.quantity <= LOW_STOCK_THRESHOLD) {
            setAlertQueue(prev => [...prev, createLowStockAlert(updatedMed)]);
          }
        } catch (error) {
          console.error('Failed to toggle medication:', error);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleResetMedication = (med: MedicationWithTimestamp) => {
    unlockAudio();
    setConfirmDialog({
      title: "Reset Timer",
      message: "Reset timer to full interval?",
      onConfirm: async () => {
        try {
          const updatedMed: MedicationWithTimestamp = {
            ...med,
            remaining: med.interval,
            lastUpdated: Date.now(),
          };
          await db.updateMedication(updatedMed);
          setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
        } catch (error) {
          console.error('Failed to reset medication:', error);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleDeleteMedication = (med: MedicationWithTimestamp) => {
    unlockAudio();
    setConfirmDialog({
      title: "Delete Medication",
      message: `Remove ${med.name}?\nThis action cannot be undone.`,
      onConfirm: async () => {
        try {
          await db.deleteMedication(med.id!);
          setMedications(prev => prev.filter(m => m.id !== med.id));
        } catch (error) {
          console.error('Failed to delete medication:', error);
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleRestartFromAlert = async (alertMed: MedicationWithTimestamp) => {
    const currentMed = medicationsRef.current.find(m => m.id === alertMed.id);
    if (!currentMed) return;

    try {
      const newQuantity = currentMed.quantity > 0 ? currentMed.quantity - 1 : 0;
      const updatedMed: MedicationWithTimestamp = {
        ...currentMed,
        running: true,
        quantity: newQuantity,
        history: createDoseRecord(currentMed),
        remaining: currentMed.interval,
        lastUpdated: Date.now(),
      };

      await db.updateMedication(updatedMed);
      setMedications(prev => prev.map(m => m.id === currentMed.id ? updatedMed : m));

      if (newQuantity <= LOW_STOCK_THRESHOLD) {
        setAlertQueue(prev => [...prev, createLowStockAlert(updatedMed)]);
      }

      syncAlarms(medicationsRef.current);
    } catch (error) {
      console.error('Failed to restart medication:', error);
    }
  };

  const handleCloseAlert = () => {
    setAlertQueue(prev => {
      const current = prev[0];
      if (current?.medication?.id) {
        if (!Capacitor.isNativePlatform()) {
          navigator.serviceWorker?.controller?.postMessage({
            type: 'DISMISS_ALARM',
            id: current.medication.id,
          });
        }
      }
      const newQueue = prev.slice(1);
      if (newQueue.length === 0) stopAlarm();
      return newQueue;
    });
  };

  const handleAlertRestart = async () => {
    if (currentAlert?.medication) {
      await handleRestartFromAlert(currentAlert.medication);
    }
    handleCloseAlert();
  };

  // --------------------------------------------------------------------------
  // Computed Values
  // --------------------------------------------------------------------------
  const currentAlert = useMemo(() => alertQueue[0] || null, [alertQueue]);
  const hasActiveMedications = medications.length > 0;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900 relative overflow-hidden">

      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-32 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/5 rounded-full blur-3xl" />
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-4 pb-24 relative z-10">

        {/* ================================================================
            بنر درخواست مجوز نوتیفیکیشن
        ================================================================ */}
        {showPermissionBanner && (
          <div className="mb-4 mt-4 bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-lg shadow-amber-500/10">
            <span className="text-2xl shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-amber-300 font-semibold text-sm leading-snug">
                Enable notifications to receive medication reminders
              </p>
              <p className="text-amber-300/60 text-xs mt-1 leading-relaxed">
                Without this permission, alarms won't work when the app is closed or in the background.
              </p>
            </div>
            <button
              onClick={async () => {
                unlockAudio();
                await requestPermissions();
              }}
              className="shrink-0 bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold py-2 px-5 rounded-xl text-sm transition-all duration-200 shadow-md shadow-amber-500/30"
            >
              Allow
            </button>
          </div>
        )}

        {/* Header */}
        <header className="mb-8 pt-4">
          <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-cyan-500/10 backdrop-blur-sm rounded-3xl p-6 border border-cyan-500/20 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <span className="text-5xl md:text-6xl drop-shadow-[0_0_20px_rgba(34,211,238,0.5)] animate-pulse">
                  💊
                </span>
                <div className="absolute inset-0 blur-xl bg-cyan-400/30 rounded-full" />
              </div>
              <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-300 via-blue-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg">
                Reminder
              </h1>
            </div>
            <p className="text-center text-cyan-300/60 text-xs mt-3 font-medium tracking-wider">
              Your Health, Our Priority
            </p>
          </div>
        </header>

        {/* Action Buttons / Form */}
        <div className="mb-8">
          {!showForm ? (
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  unlockAudio();
                  setShowForm(true);
                }}
                className="relative group overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 px-6 rounded-2xl text-sm sm:text-base transition-all duration-300 shadow-2xl shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                aria-label="Add new medication"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="relative flex items-center justify-center gap-1.5">
                  <span className="text-xl font-black">+</span>
                  <span>Med</span>
                </span>
              </button>

              <button
                onClick={() => {
                  unlockAudio();
                  window.open(SUPPORT_WEBSITE, '_blank', 'noopener,noreferrer');
                }}
                className="relative group overflow-hidden bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-6 sm:px-8 rounded-2xl transition-all duration-300 shadow-2xl shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
                aria-label="Get support"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="relative font-bold text-white">Support</span>
              </button>
            </div>
          ) : (
            <div className="animate-in slide-in-from-top duration-300">
              <AddMedicationForm
                onSubmit={handleAddMedication}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}
        </div>

        {/* Medications List */}
        <div className="space-y-5">
          {!hasActiveMedications ? (
            <div className="text-center py-20 animate-in fade-in zoom-in duration-500">
              <div className="relative inline-block mb-6">
                <div className="text-8xl animate-bounce">💊</div>
                <div className="absolute inset-0 blur-2xl bg-cyan-400/20 animate-pulse" />
              </div>
              <p className="text-xl font-semibold text-cyan-300/90 mb-2">
                No medications added yet
              </p>
              <p className="text-sm text-cyan-300/50">
                Click "+ Med" to get started
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

        {/* Footer */}
        <footer className="mt-12 text-center">
          <div className="inline-block bg-gradient-to-r from-cyan-500/5 to-blue-500/5 backdrop-blur-sm rounded-full px-6 py-3 border border-cyan-500/10">
            <p className="text-xs text-cyan-300/40 font-medium flex items-center gap-2">
              <span className="text-sm">✨</span>
              <span>Made with care for your health</span>
              <span className="text-sm">✨</span>
            </p>
          </div>
        </footer>
      </div>

      {/* ================================================================
          Modals & Popups
      ================================================================ */}
      {reportMedication && (
        <ReportModal
          medication={reportMedication}
          onClose={() => setReportMedication(null)}
        />
      )}

      {currentAlert && (
        <NotificationPopup
          title={currentAlert.title}
          message={currentAlert.message}
          onClose={handleCloseAlert}
          onRestart={currentAlert.medication ? handleAlertRestart : undefined}
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
