import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { PermissionsBanner } from './components/PermissionsBanner';
import { BootScreen } from './components/BootScreen';
import type { PermissionState } from './components/PermissionsBanner';
import { db, type Medication } from './db/database';
import {
  initAllPermissions,
  checkNotificationPermission,
  requestNotificationPermission,
  checkExactAlarmPermission,
  requestExactAlarmPermission,
  setupAndroidChannel,
} from './utils/permissions';
import { playAlarm, stopAlarm, triggerHaptics } from './utils/audio';
import {
  onSwMessage,
  registerNotificationActions,
  cancelMedNotifications,
  dismissSwFollowUps,
  createDebouncedSync,
  syncAllAlarms,
} from './utils/alarms';
import { findMedication, normalize, patchMedications, sortMedications, toDue } from './utils/medication';
import { toMedId } from './utils/ids';
import { backupFilename, downloadJson, readJsonFile } from './utils/backup';
import { useDoseActions } from './hooks/useDoseActions';
import {
  APP_VERSION,
  IN_APP_NAG_MS,
  LOW_STOCK_THRESHOLD,
  PERM_DISMISS_KEY,
  SUPPORT_WHATSAPP_URL,
} from './constants';

type AlertItem = { medication: Medication; title: string; message: string };

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
};

function openSupportWhatsApp() {
  window.open(SUPPORT_WHATSAPP_URL, '_blank', 'noopener,noreferrer');
}

// Try to dynamically import Capacitor App plugin if available (for final release)
async function getCapacitorApp() {
  try {
    const mod = await import('@capacitor/app');
    return mod.App;
  } catch {
    return null;
  }
}

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [report, setReport] = useState<Medication | null>(null);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [isNative, setIsNative] = useState(false);
  const [exactAlarmGranted, setExactAlarmGranted] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [permBannerHidden, setPermBannerHidden] = useState(() => {
    try {
      return sessionStorage.getItem(PERM_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [bootDone, setBootDone] = useState(false);

  const medsRef = useRef<Medication[]>([]);
  const alertId = useRef<number | null>(null);
  const nagTimer = useRef<number | null>(null);
  const tickLock = useRef(false);
  const deletedIdsRef = useRef(new Set<number>());
  const debouncedSync = useRef(createDebouncedSync(400));
  const resumeSyncTimeout = useRef<number | null>(null);

  useEffect(() => {
    medsRef.current = medications;
  }, [medications]);

  const persist = useCallback(async (m: Medication) => {
    await db.updateMedication(m);
  }, []);

  const load = useCallback(async () => {
    const all = sortMedications((await db.getAllMedications()).map(normalize));
    setMedications(all);
  }, []);

  const latestMed = useCallback((m: Medication) => {
    return findMedication(medsRef.current, m.id) ?? m;
  }, []);

  const exportBackup = useCallback(async () => {
    const payload = await db.exportBackup();
    downloadJson(backupFilename(), payload);
  }, []);

  const importBackup = useCallback(
    async (file: File) => {
      try {
        const payload = await readJsonFile(file);
        await db.importBackup(payload as Awaited<ReturnType<typeof db.exportBackup>>);
        await load();
      } catch (error) {
        console.error(error);
        setConfirm({
          title: 'ورود پشتیبان ناموفق بود',
          message: 'فایل معتبر نیست یا خراب است.',
          confirmLabel: 'متوجه شدم',
          showCancel: false,
          variant: 'info',
          onConfirm: () => setConfirm(null),
        });
      }
    },
    [load]
  );

  const requestImport = useCallback(
    (file: File) => {
      setConfirm({
        title: 'جایگزینی داده‌ها',
        message:
          'ورود پشتیبان همه داروهای فعلی این دستگاه را پاک می‌کند و با محتویات فایل جایگزین می‌کند. این کار برگشت‌پذیر نیست.',
        variant: 'danger',
        confirmLabel: 'جایگزین کن',
        cancelLabel: 'انصراف',
        onConfirm: () => {
          setConfirm(null);
          void importBackup(file);
        },
      });
    },
    [importBackup]
  );

  const openAlert = useCallback((m: Medication, force = false) => {
    if (!force && alertId.current === m.id) return;
    alertId.current = m.id ?? null;
    setAlert({
      medication: m,
      title: 'زمان مصرف دارو',
      message: `وقت مصرف ${m.name} (${m.dosage}) فرا رسیده است.\nلطفاً پس از مصرف، دکمه «مصرف کردم» را بزنید.`,
    });
    // On mobile, audio may need gesture — but we try
    playAlarm().catch(() => {});
    triggerHaptics().catch(() => {});
  }, []);

  const closeAlertUi = useCallback(() => {
    stopAlarm();
    setAlert(null);
  }, []);

  const { takeDose, snooze, toggle, reset, takeDoseRef, snoozeRef } = useDoseActions({
    persist,
    setMedications,
    alertIdRef: alertId,
    setAlert: () => setAlert(null),
  });

  const clearNagTimer = useCallback(() => {
    if (nagTimer.current != null) {
      window.clearTimeout(nagTimer.current);
      nagTimer.current = null;
    }
  }, []);

  useEffect(() => {
    clearNagTimer();
    if (!medications.some((m) => m.pendingDose)) return;
    if (alert) return;

    nagTimer.current = window.setTimeout(() => {
      const pending = medsRef.current.filter((m) => m.pendingDose);
      const next = pending.find((m) => m.id !== alertId.current) ?? pending[0];
      if (next) openAlert(next, true);
    }, IN_APP_NAG_MS);

    return clearNagTimer;
  }, [medications, alert, openAlert, clearNagTimer]);

  // Boot sequence — final release: check only, no auto-prompt
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const native = Capacitor.isNativePlatform();
        const permCheck = await initAllPermissions(); // only checks + channel
        const status = permCheck.notification ? 'granted' : await checkNotificationPermission();
        const exactAlarm = await checkExactAlarmPermission();
        await registerNotificationActions();
        await load();
        if (!active) return;
        setIsNative(native);
        setExactAlarmGranted(exactAlarm);
        setPermission(status);
        setBootError(null);
        setBootDone(true);
      } catch (error) {
        if (!active) return;
        console.error('[MediReminder] boot failed:', error);
        setBootError(error instanceof Error ? error.message : 'خطای ناشناخته در راه‌اندازی برنامه');
        setBootDone(false);
      }
    })();
    return () => {
      active = false;
      debouncedSync.current.cancel();
      if (resumeSyncTimeout.current) {
        clearTimeout(resumeSyncTimeout.current);
      }
    };
  }, [load, bootAttempt]);

  // Resume / visibility handling — critical for mobile accuracy
  useEffect(() => {
    const handleVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const status = await checkNotificationPermission();
        const exactAlarm = await checkExactAlarmPermission();
        setPermission(status);
        setExactAlarmGranted(exactAlarm);
        const current = medsRef.current;
        if (current.some((m) => m.pendingDose || m.running)) {
          await syncAllAlarms(current);
        }
        // Also trigger immediate tick check for overdue doses
        const now = Date.now();
        for (const m of current) {
          if (m.running && m.nextDoseAt && m.nextDoseAt <= now && !m.pendingDose) {
            const due = toDue(normalize(m), now);
            setMedications((prev) => prev.map((x) => (x.id === m.id ? due : x)));
            persist(due).catch(() => {});
            openAlert(due, true);
          }
        }
      } catch (e) {
        console.warn('[App] visibility sync failed', e);
      }
    };

    document.addEventListener('visibilitychange', handleVisible);

    // Capacitor App plugin listeners for true mobile resume
    let appListeners: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      const CapApp = await getCapacitorApp();
      if (!CapApp) return;
      try {
        const l1 = await CapApp.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) {
            console.info('[App] appStateChange active');
            await handleVisible();
          }
        });
        const l2 = await CapApp.addListener('resume', async () => {
          console.info('[App] resume');
          // Small delay for system to settle
          if (resumeSyncTimeout.current) clearTimeout(resumeSyncTimeout.current);
          resumeSyncTimeout.current = window.setTimeout(() => {
            void handleVisible();
          }, 300);
        });
        appListeners = [l1, l2];

        // Back button handling — close modals first
        const l3 = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (alert) {
            closeAlertUi();
            return;
          }
          if (confirm) {
            setConfirm(null);
            return;
          }
          if (report) {
            setReport(null);
            return;
          }
          if (editing || showAdd) {
            setEditing(null);
            setShowAdd(false);
            return;
          }
          if (!canGoBack) {
            // Let system handle exit, or minimize
            CapApp.exitApp().catch(() => {});
          }
        });
        appListeners.push(l3);
      } catch (e) {
        console.warn('[App] CapApp listeners failed', e);
      }
    })();

    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      appListeners.forEach((l) => l.remove().catch(() => {}));
    };
  }, [alert, confirm, report, editing, showAdd, closeAlertUi, openAlert, persist]);

  const handleRequestPermission = async () => {
    try {
      const ok = await requestNotificationPermission();
      if (ok === 'granted') {
        await setupAndroidChannel();
        setExactAlarmGranted(await requestExactAlarmPermission());
        setPermission('granted');
        setPermBannerHidden(false);
        try {
          sessionStorage.removeItem(PERM_DISMISS_KEY);
        } catch {
          /* ignore */
        }
        await syncAllAlarms(medsRef.current);
      } else {
        setPermission(await checkNotificationPermission());
      }
    } catch (e) {
      console.warn('[App] request permission failed', e);
      setPermission(await checkNotificationPermission());
    }
  };

  const handleRequestExactAlarm = async () => {
    try {
      const granted = await requestExactAlarmPermission();
      setExactAlarmGranted(granted);
      if (granted) await syncAllAlarms(medsRef.current);
    } catch (e) {
      console.warn('[App] exact alarm request failed', e);
    }
  };

  const dismissPermBanner = () => {
    setPermBannerHidden(true);
    try {
      sessionStorage.setItem(PERM_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // Accurate tick — handles mobile throttling by using absolute time
  useEffect(() => {
    const tick = async () => {
      if (tickLock.current) return;
      tickLock.current = true;
      try {
        const now = Date.now();
        const current = medsRef.current;
        const updates = new Map<number, Medication>();
        const dueToPersist: Medication[] = [];

        for (const m of current) {
          const id = toMedId(m.id);
          if (id == null || deletedIdsRef.current.has(id)) continue;
          const n = normalize(m);
          if (n.running && n.nextDoseAt && n.nextDoseAt <= now) {
            const due = toDue(n, now);
            updates.set(id, due);
            dueToPersist.push(due);
            openAlert(due, true);
          } else if (n.running && n.remaining !== m.remaining) {
            updates.set(id, n);
          }
        }

        if (updates.size) {
          setMedications((prev) => patchMedications(prev, updates));
          const stillLive = dueToPersist.filter((m) => {
            const id = toMedId(m.id);
            return id != null && !deletedIdsRef.current.has(id);
          });
          if (stillLive.length) await Promise.all(stillLive.map(persist));
        }
      } finally {
        tickLock.current = false;
      }
    };
    void tick();
    // Use 1s interval but also handle visibility — when hidden, interval may throttle to 1min
    // So we also use a more frequent check when visible, and rely on resume sync when hidden
    const id = window.setInterval(() => {
      void tick();
    }, 1000);
    return () => window.clearInterval(id);
  }, [openAlert, persist]);

  useEffect(() => {
    if (!bootDone) return;
    debouncedSync.current.schedule(medications);
  }, [medications, bootDone]);

  useEffect(() => {
    if (!bootDone) return;
    const due = medications.find((m) => m.pendingDose);
    if (due) openAlert(due, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDone]);

  useEffect(() => {
    return onSwMessage((msg) => {
      if (msg.type === 'ALARMS_LIST') return;
      const id = Number(msg.medicationId);
      if (!Number.isFinite(id)) return;
      const m = findMedication(medsRef.current, id);
      if (!m) return;

      if (msg.type === 'ALARM_TAKEN') {
        takeDoseRef.current({ ...m, pendingDose: true, running: false, remaining: 0 });
      } else if (msg.type === 'ALARM_SNOOZED') {
        snoozeRef.current({ ...m, pendingDose: true, running: false, remaining: 0 }, msg.minutes ?? 10);
      } else if (msg.type === 'ALARM_TRIGGERED' || msg.type === 'ALARM_DISMISSED') {
        openAlert({ ...m, pendingDose: true, running: false, remaining: 0 }, true);
      }
    });
  }, [openAlert, takeDoseRef, snoozeRef]);

  useEffect(() => {
    if (!isNative) return;

    const received = LocalNotifications.addListener('localNotificationReceived', (n) => {
      const id = Number(n.extra?.medicationId);
      const m = findMedication(medsRef.current, id);
      if (m) {
        if (!m.pendingDose) {
          const due = toDue(m);
          setMedications((v) => sortMedications(v.map((x) => (x.id === m.id ? due : x))));
          persist(due).catch(() => {});
          openAlert(due, true);
        } else {
          openAlert(m, true);
        }
      }
    });

    const action = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = Number(e.notification.extra?.medicationId);
      const m = findMedication(medsRef.current, id);
      if (!m) return;
      const act = e.actionId;

      if (act === 'taken') {
        takeDoseRef.current({ ...m, pendingDose: true, running: false, remaining: 0 });
      } else if (act === 'snooze') {
        snoozeRef.current({ ...m, pendingDose: true, running: false, remaining: 0 }, 10);
      } else {
        openAlert({ ...m, pendingDose: true, running: false, remaining: 0 }, true);
      }
    });

    return () => {
      received.then((l) => l.remove()).catch(() => {});
      action.then((l) => l.remove()).catch(() => {});
    };
  }, [isNative, openAlert, persist, takeDoseRef, snoozeRef]);

  const add = async (d: {
    name: string;
    condition: string;
    dosage: string;
    intervalHours: number;
    quantity: number;
    startImmediately: boolean;
  }) => {
    const now = Date.now();
    const interval = d.intervalHours * 3600;
    const m: Medication = {
      name: d.name,
      condition: d.condition,
      dosage: d.dosage,
      quantity: d.quantity,
      intervalHours: d.intervalHours,
      interval,
      remaining: interval,
      running: d.startImmediately,
      pendingDose: false,
      nextDoseAt: d.startImmediately ? now + interval * 1000 : undefined,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    const id = await db.addMedication(m);
    setMedications((v) => sortMedications([...v, { ...m, id }]));
    setShowAdd(false);
  };

  const saveEdit = async (d: {
    name: string;
    condition: string;
    dosage: string;
    intervalHours: number;
    quantity: number;
    startImmediately: boolean;
  }) => {
    if (!editing?.id) return;
    const now = Date.now();
    const newInterval = d.intervalHours * 3600;
    const oldInterval = Math.max(1, editing.interval || 1);

    let remaining = editing.remaining;
    let nextDoseAt = editing.nextDoseAt;
    let running = editing.running;
    let pendingDose = editing.pendingDose;

    if (editing.running && newInterval !== oldInterval) {
      const ratio = remaining / oldInterval;
      remaining = Math.max(1, Math.round(ratio * newInterval));
      nextDoseAt = now + remaining * 1000;
    } else if (!editing.running && !editing.pendingDose) {
      remaining = newInterval;
      nextDoseAt = undefined;
    }

    if (d.startImmediately && !running && !pendingDose) {
      running = true;
      pendingDose = false;
      remaining = newInterval;
      nextDoseAt = now + newInterval * 1000;
    }

    const updated: Medication = {
      ...editing,
      name: d.name,
      condition: d.condition,
      dosage: d.dosage,
      quantity: d.quantity,
      intervalHours: d.intervalHours,
      interval: newInterval,
      remaining,
      running,
      pendingDose,
      nextDoseAt,
      updatedAt: now,
    };

    setMedications((v) => sortMedications(v.map((x) => (x.id === updated.id ? updated : x))));
    await persist(updated);
    setEditing(null);
  };

  const remove = (m: Medication) =>
    setConfirm({
      title: 'حذف دارو',
      message: `آیا از حذف «${m.name}» مطمئن هستید؟ تاریخچه مصرف این دارو هم پاک می‌شود.`,
      variant: 'danger',
      confirmLabel: 'حذف',
      onConfirm: () => {
        const id = toMedId(m.id);
        setConfirm(null);
        if (id != null) deletedIdsRef.current.add(id);
        setMedications((v) => v.filter((x) => toMedId(x.id) !== id));
        if (alertId.current === id) {
          alertId.current = null;
          stopAlarm();
          setAlert(null);
        }
        if (editing && toMedId(editing.id) === id) setEditing(null);

        void (async () => {
          try {
            if (id != null) {
              await db.deleteMedication(id);
              await cancelMedNotifications(id);
              dismissSwFollowUps(id);
            }
          } catch (error) {
            console.error('[MediReminder] delete failed:', error);
            if (id != null) deletedIdsRef.current.delete(id);
            await load();
            setConfirm({
              title: 'حذف انجام نشد',
              message: 'ذخیره‌سازی دستگاه دارو را حذف نکرد. دوباره تلاش کنید.',
              confirmLabel: 'متوجه شدم',
              showCancel: false,
              variant: 'info',
              onConfirm: () => setConfirm(null),
            });
          }
        })();
      },
    });

  const requestReset = (m: Medication) => {
    if (m.pendingDose) {
      setConfirm({
        title: 'ریست تایمر',
        message: `دوز در انتظار تأیید «${m.name}» به‌عنوان رد شده در گزارش ثبت می‌شود.`,
        variant: 'danger',
        confirmLabel: 'ریست و ثبت رد شده',
        onConfirm: () => {
          setConfirm(null);
          void reset(m);
        },
      });
      return;
    }
    void reset(m);
  };

  const dueCount = useMemo(() => medications.filter((m) => m.pendingDose).length, [medications]);
  const lowStockCount = useMemo(
    () => medications.filter((m) => m.quantity > 0 && m.quantity <= LOW_STOCK_THRESHOLD).length,
    [medications]
  );
  const emptyCount = useMemo(() => medications.filter((m) => m.quantity <= 0).length, [medications]);
  const formVisible = showAdd || editing !== null;
  const showPermBanner = (permission !== 'granted' || (isNative && !exactAlarmGranted)) && !permBannerHidden;

  if (bootError) {
    return (
      <BootScreen
        error={bootError}
        onRetry={() => {
          setBootError(null);
          setBootAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  if (!bootDone) {
    return <BootScreen />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white antialiased selection:bg-cyan-500/30">
      {/* Safe area top spacer for native */}
      <div className="h-[var(--sat)] w-full bg-slate-950 lg:hidden" aria-hidden />

      <div className="mx-auto flex min-h-screen min-h-[100dvh] max-w-lg flex-col px-4 py-4 pb-[calc(1rem+var(--sab))] sm:py-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-2xl font-black leading-tight text-cyan-300 sm:text-3xl">
                💊 یادآور هوشمند دارو
              </h1>
              <p className="mt-1 text-sm text-slate-400">یادآوری مکرر تا تأیید مصرف دارو — دقیق و آفلاین</p>
            </div>
            <span className="shrink-0 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
              v{APP_VERSION}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowAdd(true);
              }}
              className="col-span-2 rounded-2xl bg-gradient-to-b from-cyan-400 to-cyan-600 px-5 py-3.5 text-[15px] font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition active:scale-[0.98] hover:from-cyan-300 hover:to-cyan-500 sm:col-span-1 touch-manipulation"
            >
              + افزودن دارو
            </button>
            <button
              type="button"
              onClick={openSupportWhatsApp}
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3.5 text-sm font-semibold text-emerald-200 transition active:scale-[0.98] hover:bg-emerald-500/25 touch-manipulation"
              aria-label="پشتیبانی واتساپ"
              title="پشتیبانی واتساپ"
            >
              💬 پشتیبانی
            </button>
            <button
              type="button"
              onClick={() => void exportBackup()}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-semibold text-slate-200 transition active:scale-[0.98] hover:bg-white/10 touch-manipulation"
            >
              خروجی پشتیبان
            </button>
            <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-semibold text-slate-200 transition active:scale-[0.98] hover:bg-white/10 touch-manipulation">
              ورود پشتیبان
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) requestImport(file);
                }}
              />
            </label>
          </div>

          {showPermBanner && (
            <PermissionsBanner
              permission={permission}
              exactAlarmGranted={exactAlarmGranted}
              onRequest={handleRequestPermission}
              onRequestExactAlarm={handleRequestExactAlarm}
              onDismiss={dismissPermBanner}
            />
          )}

          {dueCount > 0 && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200">
              <span className="font-bold">⏰ {dueCount} دارو منتظر تأیید مصرف است.</span> هشدارها تا زدن «مصرف کردم» یا «اسنوز»
              ادامه می‌یابند.
            </div>
          )}

          {(lowStockCount > 0 || emptyCount > 0) && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
              {emptyCount > 0 ? `${emptyCount} دارو تمام شده است. ` : ''}
              {lowStockCount > 0 ? `${lowStockCount} دارو موجودی کمی دارد.` : ''}
            </div>
          )}
        </header>

        {formVisible && (
          <div className="mb-5 animate-slide-in-from-top">
            <AddMedicationForm
              initial={editing ?? undefined}
              onSubmit={editing ? saveEdit : add}
              onCancel={() => {
                setShowAdd(false);
                setEditing(null);
              }}
            />
          </div>
        )}

        <div className="flex-1 space-y-4">
          {medications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-700 p-8 text-center sm:p-12">
              <div className="text-6xl" aria-hidden="true">
                💊
              </div>
              <h2 className="mt-4 text-xl font-bold">هنوز دارویی ثبت نشده</h2>
              <p className="mt-2 text-sm text-slate-400">اولین دارو را اضافه کنید و یادآوری را شروع کنید.</p>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowAdd(true);
                }}
                className="mt-6 rounded-2xl bg-gradient-to-b from-cyan-400 to-cyan-600 px-6 py-3.5 text-[15px] font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition active:scale-[0.98] hover:from-cyan-300 hover:to-cyan-500 touch-manipulation"
              >
                افزودن اولین دارو
              </button>
              <p className="mt-6 text-xs text-slate-500">
                نکته: برای یادآوری دقیق، مجوز اعلان را فعال کنید و در اندروید باتری را روی «بدون محدودیت» بگذارید.
              </p>
            </div>
          ) : (
            medications.map((m, i) => (
              <MedicationCard
                key={m.id}
                medication={m}
                index={i + 1}
                onToggle={() => toggle(m)}
                onReset={() => requestReset(m)}
                onDelete={() => remove(m)}
                onEdit={() => {
                  setShowAdd(false);
                  setEditing(m);
                  // Scroll to form on mobile
                  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
                }}
                onShowReport={() => setReport(m)}
                onTake={() => takeDose(m)}
                onSnooze={() => snooze(m, 10)}
              />
            ))
          )}
        </div>

        <footer className="mt-8 pb-[calc(1rem+var(--sab))] text-center text-xs text-slate-500">
          <p className="leading-relaxed">
            داده‌ها فقط روی همین دستگاه ذخیره می‌شوند. تا تأیید «مصرف کردم»، یادآوری تکرار می‌شود و سپس تایمر دوز بعدی
            بلافاصله شروع می‌شود.
          </p>
          <p className="mt-2 text-slate-600">MediReminder v{APP_VERSION} — ابزار یادآوری است و جایگزین توصیه پزشک نیست.</p>
        </footer>
      </div>

      {alert && (
        <NotificationPopup
          title={alert.title}
          message={alert.message}
          onClose={closeAlertUi}
          onRestart={() => takeDose(latestMed(alert.medication))}
          onSnooze={(minutes) => snooze(latestMed(alert.medication), minutes)}
          isMedicationAlert
        />
      )}

      {report && (
        <ReportModal
          medication={findMedication(medications, report.id) ?? report}
          onClose={() => setReport(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          variant={confirm.variant}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel}
          showCancel={confirm.showCancel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
