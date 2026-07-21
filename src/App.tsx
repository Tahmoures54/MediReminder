import { useState, useEffect, useRef } from 'react';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { db, Medication, HistoryRecord } from './db/database';
import { playAlarm, stopAlarm } from './utils/audio';

const SUPPORT_WEBSITE = "https://mediremind-brown.vercel.app/";
const LOW_STOCK_THRESHOLD = 5;

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; medication?: Medication } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [reportMedication, setReportMedication] = useState<Medication | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadMedications();
    
    intervalRef.current = setInterval(() => {
      updateTimers();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      stopAlarm();
    };
  }, []);

  const loadMedications = async () => {
    try {
      const meds = await db.getAllMedications();
      const lastSaved = await db.getLastSavedTime();
      const now = Math.floor(Date.now() / 1000);
      
      if (lastSaved > 0) {
        const elapsed = now - lastSaved;
        const updatedMeds = meds.map(med => {
          if (med.running) {
            med.remaining -= elapsed;
            if (med.remaining <= 0) {
              med.running = false;
              med.remaining = med.interval;
              setTimeout(() => showMedicationAlert(med), 2000);
            }
          }
          return med;
        });
        
        for (const med of updatedMeds) {
          await db.updateMedication(med);
        }
        
        setMedications(updatedMeds);
      } else {
        setMedications(meds);
      }
      
      await db.setLastSavedTime(now);
    } catch (error) {
      console.error('Failed to load medications:', error);
    }
  };

  const updateTimers = async () => {
    setMedications(prev => {
      const updated = prev.map(med => {
        if (med.running) {
          if (med.remaining > 0) {
            return { ...med, remaining: med.remaining - 1 };
          } else {
            showMedicationAlert(med);
            return { ...med, running: false, remaining: med.interval };
          }
        }
        return med;
      });
      
      updated.forEach(med => db.updateMedication(med));
      return updated;
    });
  };

  const showMedicationAlert = (med: Medication) => {
    playAlarm();
    setNotification({
      title: "🔔 Time to Medicate!",
      message: `Take now:\n💊 ${med.name}\n⚖️ Dosage: ${med.dosage}`,
      medication: med
    });
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Time to Medicate!', {
        body: `${med.name} - ${med.dosage}`,
        icon: '/icon.png',
        tag: `med-${med.id}`,
      });
    }
  };

  const recordDose = (med: Medication): HistoryRecord[] => {
    const nowMs = Date.now();
    const updatedHistory = med.history || [];
    let status: 'on-time' | 'early' | 'late' = 'on-time';
    
    if (updatedHistory.length > 0) {
      const latestTaken = Math.max(...updatedHistory.map(h => h.takenAt));
      const diffMs = nowMs - latestTaken;
      const targetMs = med.interval * 1000;
      
      const THIRTY_MINS = 30 * 60 * 1000;
      const SIXTY_MINS = 60 * 60 * 1000;
      
      if (diffMs < targetMs - THIRTY_MINS) {
        status = 'early';
      } else if (diffMs > targetMs + SIXTY_MINS) {
        status = 'late';
      }
    }
    
    return [...updatedHistory, { takenAt: nowMs, status }];
  };

  const handleAddMedication = async (medData: Omit<Medication, 'id' | 'remaining' | 'running' | 'history'>) => {
    const newMed: Medication = {
      ...medData,
      remaining: medData.interval,
      running: false,
      history: []
    };
    
    const id = await db.addMedication(newMed);
    newMed.id = id;
    
    setMedications(prev => [...prev, newMed]);
    setShowForm(false);
    
    setTimeout(() => {
      setNotification({
        title: "💡 Reminder",
        message: "Tap ▶ Start after each dose."
      });
    }, 300);
  };

  const handleToggleMedication = async (med: Medication) => {
    const wasRunning = med.running;
    
    const confirmMessage = wasRunning
      ? "Pause the timer?"
      : `Did you take ${med.name} (${med.dosage}) now?\nTimer will start after confirmation.`;
    
    setConfirmDialog({
      title: "Confirm",
      message: confirmMessage,
      onConfirm: async () => {
        const updatedHistory = !wasRunning ? recordDose(med) : med.history;

        const updatedMed = {
          ...med,
          running: !wasRunning,
          quantity: !wasRunning && med.quantity > 0 ? med.quantity - 1 : med.quantity,
          history: updatedHistory
        };
        
        await db.updateMedication(updatedMed);
        setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
        
        if (!wasRunning && updatedMed.quantity <= LOW_STOCK_THRESHOLD) {
          setTimeout(() => {
            setNotification({
              title: "💊 Low Stock Alert",
              message: `Only ${updatedMed.quantity} pill${updatedMed.quantity > 1 ? 's' : ''} left of ${updatedMed.name}.\nPlease refill soon.`
            });
          }, 500);
        }
        
        setConfirmDialog(null);
      }
    });
  };

  const handleResetMedication = async (med: Medication) => {
    setConfirmDialog({
      title: "Reset Timer",
      message: "Reset timer to full interval?",
      onConfirm: async () => {
        const updatedMed = { ...med, remaining: med.interval };
        await db.updateMedication(updatedMed);
        setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
        setConfirmDialog(null);
      }
    });
  };

  const handleDeleteMedication = async (med: Medication) => {
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

  const handleRestartMedication = async (med: Medication) => {
    const updatedHistory = recordDose(med);
    const updatedMed = { ...med, running: true, history: updatedHistory };
    await db.updateMedication(updatedMed);
    setMedications(prev => prev.map(m => m.id === med.id ? updatedMed : m));
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-sky-900 to-slate-900 relative overflow-hidden">
      
      {/* Animated Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-32 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pb-24 relative z-10">
        
        {/* Premium Header with Glow Effect */}
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

        {/* Action Buttons with Premium Design */}
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

        {/* Medications List with Stagger Animation */}
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

        {/* Premium Footer */}
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

      {/* Modals and Popups */}
      {reportMedication && (
        <ReportModal 
          medication={reportMedication} 
          onClose={() => setReportMedication(null)} 
        />
      )}

      {notification && (
        <NotificationPopup
          title={notification.title}
          message={notification.message}
          onClose={() => {
            setNotification(null);
            stopAlarm();
          }}
          onRestart={notification.medication ? () => {
            handleRestartMedication(notification.medication!);
            setNotification(null);
            stopAlarm();
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
