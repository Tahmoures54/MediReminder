import { useState, useEffect, useRef, useCallback } from 'react';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { db, Medication, HistoryRecord } from './db/database';
import { playAlarm, stopAlarm } from './utils/audio';

const SUPPORT_WEBSITE = "https://mediremind-brown.vercel.app/";
const LOW_STOCK_THRESHOLD = 5;

interface MedicationWithTimestamp extends Medication {
  lastUpdated: number;
}

interface AlertItem {
  title: string;
  message: string;
  medication: MedicationWithTimestamp;
}

export default function App() {
  const [medications, setMedications] = useState<MedicationWithTimestamp[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [alertQueue, setAlertQueue] = useState<AlertItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [reportMedication, setReportMedication] = useState<MedicationWithTimestamp | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ------------------------------------------------------------------
  // مدیریت آزادسازی بستر صوتی مرورگر
  // ------------------------------------------------------------------
  const audioUnlocked = useRef(false);

  const unlockAudio = useCallback(() => {
    if (audioUnlocked.current) return;
    try {
      const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
      silentAudio.volume = 0;
      const promise = silentAudio.play();
      if (promise !== undefined) {
        promise.then(() => {
          silentAudio.pause();
          audioUnlocked.current = true;
        }).catch(() => {});
      } else {
        audioUnlocked.current = true;
      }
    } catch (e) {
      // نادیده گرفتن خطا
    }
  }, []);

  // با اولین تعامل کاربر در کل صفحه، محدودیت صدا برداشته می‌شود
  useEffect(() => {
    const handleFirstInteraction = () => {
      unlockAudio();
      document.removeEventListener('pointerdown', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    
    document.addEventListener('pointerdown', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);

    return () => {
      document.removeEventListener('pointerdown', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [unlockAudio]);

  // ------------------------------------------------------------------
  // بارگذاری اولیه و تنظیمات چرخه حیات
  // ------------------------------------------------------------------
  useEffect(() => {
    loadMedications();
    
    intervalRef.current = setInterval(() => {
      updateTimers();
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveAllMedications();
      } else {
        // وقتی کاربر دوباره به تب برمی‌گردد تایمرها فوراً به‌روزرسانی شوند
        updateTimers(); 
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
  }, []);

  const loadMedications = async () => {
    try {
      const meds: Medication[] = await db.getAllMedications();
      const now = Date.now();
      const updatedMeds: MedicationWithTimestamp[] = [];

      for (const med of meds) {
        // جلوگیری از خطای تایپ اسکریپت با بررسی امن
        const lastUpdated = 'lastUpdated' in med ? (med as any).lastUpdated : now;
        const medWithTS: MedicationWithTimestamp = { ...med, lastUpdated };

        if (medWithTS.running) {
          const elapsed = Math.floor((now - medWithTS.lastUpdated) / 1000);
          if (elapsed > 0) {
            medWithTS.remaining = Math.max(0, medWithTS.remaining - elapsed);
            if (medWithTS.remaining <= 0) {
              medWithTS.running = false;
              medWithTS.remaining = medWithTS.interval;
              setTimeout(() => showMedicationAlert(medWithTS), 500);
            }
          }
        }
        medWithTS.lastUpdated = now;
        updatedMeds.push(medWithTS);
      }

      await Promise.all(updatedMeds.map(med => db.updateMedication(med)));
      setMedications(updatedMeds);
    } catch (error) {
      console.error('Failed to load medications:', error);
    }
  };

  const updateTimers = () => {
    const now = Date.now();
    setMedications(prev => {
      let changed = false;
      const updated = prev.map(med => {
        if (med.running) {
          // محاسبه دقیق زمان گذشته شده (رفع مشکل کند شدن تایمر در تب‌های غیرفعال)
          const elapsed = Math.floor((now - med.lastUpdated) / 1000);
          
          if (elapsed > 0) {
            changed = true;
            const newRemaining = med.remaining - elapsed;
            
            if (newRemaining <= 0) {
              // استفاده از setTimeout برای جلوگیری از اجرای ساید‌افکت داخل تابع آپدیت استیت
              setTimeout(() => showMedicationAlert(med), 0);
              return { ...med, running: false, remaining: med.interval, lastUpdated: now };
            }
            return { ...med, remaining: newRemaining, lastUpdated: now };
          }
        }
        return med;
      });
      return changed ? updated : prev;
    });
  };

  const showMedicationAlert = (med: MedicationWithTimestamp) => {
    playAlarm();

    const newAlert: AlertItem = {
      title: "🔔 Time to Medicate!",
      message: `Take now:\n💊 ${med.name}\n⚖️ Dosage: ${med.dosage}`,
      medication: med,
    };
    setAlertQueue(prev => [...prev, newAlert]);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Time to Medicate!', {
        body: `${med.name} - ${med.dosage}`,
        icon: '/icon.png',
        tag: `med-${med.id}`,
      });
    }
  };

  const recordDose = (med: MedicationWithTimestamp): HistoryRecord[] => {
    const nowMs = Date.now();
    const updatedHistory = med.history || [];
    let status: 'on-time' | 'early' | 'late' = 'on-time';
    
    if (updatedHistory.length > 0) {
      const latestTaken = Math.max(...updatedHistory.map(h => h.takenAt));
      const diffMs = nowMs - latestTaken;
      const targetMs = med.interval * 1000;
      
      const THIRTY_MINS = 30 * 60 * 1000;
      const SIXTY_MINS = 60 * 60 * 1000;
      
      if (diffMs < targetMs - THIRTY_MINS) status = 'early';
      else if (diffMs > targetMs + SIXTY_MINS) status = 'late';
    }
    return [...updatedHistory, { takenAt: nowMs, status }];
  };

  const handleAddMedication = async (medData: Omit<Medication, 'id' | 'remaining' | 'running' | 'history'>) => {
    const now = Date.now();
    const newMed: MedicationWithTimestamp = {
      ...medData,
      remaining: medData.interval,
      running: false,
      history: [],
      lastUpdated: now,
    };
    
    const id = await db.addMedication(newMed);
    newMed.id = id;
    
    setMedications(prev => [...prev, newMed]);
    setShowForm(false);
    
    setTimeout(() => {
      setAlertQueue(prev => [...prev, {
        title: "💡 Reminder",
        message: "Tap ▶ Start after each dose.",
        medication: newMed,
      }]);
    }, 300);
  };

  const handleToggleMedication = async (med: MedicationWithTimestamp) => {
    const wasRunning = med.running;
    const confirmMessage = wasRunning
      ? "Pause the timer?"
      : `Did you take ${med.name} (${med.dosage}) now?\nTimer will start after confirmation.`;
    
    setConfirmDialog({
      title: "Confirm",
      message: confirmMessage,
      onConfirm: async () => {
        const updatedHistory = !wasRunning ? recordDose(med) : med.history;
        const now = Date.now();

        const updatedMed: MedicationWithTimestamp = {
          ...med,
          running: !wasRunning,
          quantity: !wasRunning && med.quantity > 0 ? med.quantity - 1 : med.quantity,
          history: updatedHistory,
          lastUpdated: now,
        };
        
        await db.updateMedication(updatedMed);
        setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
        
        if (!wasRunning && updatedMed.quantity <= LOW_STOCK_THRESHOLD) {
          setTimeout(() => {
            setAlertQueue(prev => [...prev, {
              title: "💊 Low Stock Alert",
              message: `Only ${updatedMed.quantity} pill${updatedMed.quantity > 1 ? 's' : ''} left of ${updatedMed.name}.\nPlease refill soon.`,
              medication: updatedMed,
            }]);
          }, 500);
        }
        setConfirmDialog(null);
      }
    });
  };

  const handleResetMedication = async (med: MedicationWithTimestamp) => {
    setConfirmDialog({
      title: "Reset Timer",
      message: "Reset timer to full interval?",
      onConfirm: async () => {
        const updatedMed: MedicationWithTimestamp = {
          ...med,
          remaining: med.interval,
          lastUpdated: Date.now(),
        };
        await db.updateMedication(updatedMed);
        setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
        setConfirmDialog(null);
      }
    });
  };

  const handleDeleteMedication = async (med: MedicationWithTimestamp) => {
    setConfirmDialog({
      title: "Delete Medication",
      message: `Remove ${med.name}?`,
      onConfirm: async () => {
        await db.deleteMedication(med.id!);
        setMedications(prev => prev.filter(m => m.id !== med.id));
        setConfirmDialog(null);
      }
    });
  };

  const handleRestartMedication = (med: MedicationWithTimestamp) => {
    const updatedHistory = recordDose(med);
    const updatedMed: MedicationWithTimestamp = {
      ...med,
      running: true,
      history: updatedHistory,
      lastUpdated: Date.now(),
    };
    db.updateMedication(updatedMed);
    setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
  };

  const saveAllMedications = useCallback(async () => {
    const now = Date.now();
    setMedications(prev => {
      const updated = prev.map(med => ({ ...med, lastUpdated: now }));
      updated.forEach(med => db.updateMedication(med));
      return updated;
    });
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const currentAlert = alertQueue.length > 0 ? alertQueue[0] : null;

  const dismissCurrentAlert = () => {
    setAlertQueue(prev => prev.slice(1));
    if (alertQueue.length <= 1) stopAlarm();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-32 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-24 relative z-10">
        <div className="mb-8 pt-6">
          <div className="bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-cyan-500/10 backdrop-blur-sm rounded-3xl p-6 border border-cyan-500/20 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <span className="text-5xl md:text-6xl drop-shadow-[0_0_20px_rgba(34,211,238,0.5)] animate-pulse">💊</span>
                <div className="absolute inset-0 blur-xl bg-cyan-400/30 rounded-full"></div>
              </div>
              <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-cyan-300 via-blue-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-lg animate-gradient bg-[length:200%_auto]">
                Reminder
              </h1>
            </div>
            <p className="text-center text-cyan-300/60 text-xs mt-3 font-medium tracking-wider">
              Your Health, Our Priority
            </p>
          </div>
        </div>

        <div className="mb-8">
          {!showForm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 relative group overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 px-4 rounded-2xl text-sm sm:text-base transition-all duration-300 shadow-2xl shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02] active:scale-95"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-2">
                  <span className="text-lg">➕</span>
                  <span>Add Medication</span>
                </span>
              </button>
              
              <button
                onClick={() => window.open(SUPPORT_WEBSITE, '_blank')}
                className="relative group overflow-hidden bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold py-4 px-4 sm:px-6 rounded-2xl transition-all duration-300 shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative text-lg animate-pulse">❤️</span>
                <span className="relative hidden sm:inline font-bold">Support</span>
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

        <div className="space-y-5">
          {medications.length === 0 ? (
            <div className="text-center py-20 animate-in fade-in zoom-in duration-500">
              <div className="relative inline-block mb-6">
                <div className="text-8xl animate-bounce">💊</div>
                <div className="absolute inset-0 blur-2xl bg-cyan-400/20 animate-pulse"></div>
              </div>
              <p className="text-xl font-semibold text-cyan-300/90 mb-2">No medications added yet</p>
              <p className="text-sm text-cyan-300/50">Click "Add Medication" to get started</p>
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

        <div className="mt-12 text-center">
          <div className="inline-block bg-gradient-to-r from-cyan-500/5 to-blue-500/5 backdrop-blur-sm rounded-full px-6 py-3 border border-cyan-500/10">
            <p className="text-xs text-cyan-300/40 font-medium flex items-center gap-2">
              <span className="text-sm">✨</span>
              <span>Made with care for your health</span>
              <span className="text-sm">✨</span>
            </p>
          </div>
        </div>
      </div>

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
          onClose={dismissCurrentAlert}
          onRestart={currentAlert.medication ? () => {
            handleRestartMedication(currentAlert.medication!);
            dismissCurrentAlert();
          } : undefined}
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
