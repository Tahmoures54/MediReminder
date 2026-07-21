import { useState, useEffect, useRef } from 'react';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { db, Medication } from './db/database';
import { playAlarm, stopAlarm } from './utils/audio';

const SUPPORT_WEBSITE = "https://www.aimedireminder.com";
const LOW_STOCK_THRESHOLD = 5;

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; medication?: Medication } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadMedications();
    
    // Update timers every second
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
      
      // Check for elapsed time since last visit
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
              // Schedule notification
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
            // Time's up!
            showMedicationAlert(med);
            return { ...med, running: false, remaining: med.interval };
          }
        }
        return med;
      });
      
      // Save to database
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
    
    // Also try browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Time to Medicate!', {
        body: `${med.name} - ${med.dosage}`,
        icon: '/icon.png',
        tag: `med-${med.id}`,
      });
    }
  };

  const handleAddMedication = async (medData: Omit<Medication, 'id' | 'remaining' | 'running'>) => {
    const newMed: Medication = {
      ...medData,
      remaining: medData.interval,
      running: false
    };
    
    const id = await db.addMedication(newMed);
    newMed.id = id;
    
    setMedications(prev => [...prev, newMed]);
    setShowForm(false);
    
    // Show reminder to start timer
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
        const updatedMed = {
          ...med,
          running: !wasRunning,
          quantity: !wasRunning && med.quantity > 0 ? med.quantity - 1 : med.quantity
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
    const updatedMed = { ...med, running: true };
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-2xl mx-auto p-4 pb-20">
        {/* Header - اصلاح شده */}
        <div className="mb-6 pt-4">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <span className="text-3xl md:text-4xl">💊</span>
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent whitespace-nowrap">
              MediReminder AI
            </span>
          </h1>
        </div>

        {/* Add Medication Form */}
        <div className="mb-6">
          {!showForm ? (
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-300 shadow-lg hover:shadow-green-500/50 animate-pulse"
              >
                ➕ Add Medication
              </button>
              <button
                onClick={() => window.open(SUPPORT_WEBSITE, '_blank')}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-orange-500/50"
              >
                💡 Health Tips
              </button>
            </div>
          ) : (
            <AddMedicationForm
              onSubmit={handleAddMedication}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>

        {/* Medications List */}
        <div className="space-y-4">
          {medications.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-6xl mb-4">💊</div>
              <p className="text-lg">No medications added yet</p>
              <p className="text-sm mt-2">Click "Add Medication" to get started</p>
            </div>
          ) : (
            medications.map((med, index) => (
              <MedicationCard
                key={med.id}
                medication={med}
                index={index + 1}
                onToggle={() => handleToggleMedication(med)}
                onReset={() => handleResetMedication(med)}
                onDelete={() => handleDeleteMedication(med)}
              />
            ))
          )}
        </div>
      </div>

      {/* Notification Popup */}
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

      {/* Confirm Dialog */}
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
