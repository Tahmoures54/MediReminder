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
  openAndroidAppSettings,
  openBatteryOptimizationSettings,
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
  const dueTransitionRef = useRef(new Set<string>());
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

  const latestMed = useCallback((m: Medication) => findMedication(medsRef.current, m.id) ?? m, []);

  const claimDueTransition = useCallback((m: Medication) => {
    const id = toMedId(m.id);
    if (id == null) return false;
    const cycle = `${id}:${m.nextDoseAt ?? 'none'}`;
    if (dueTransitionRef.current.has(cycle)) return false;
    dueTransitionRef.current.add(cycle);
    if (dueTransitionRef.current.size > 500) {
      const first = dueTransitionRef.current.values().next().value;
      if (first) dueTransitionRef.current.delete(first);
    }
    return true;
  }, []);

  const openAlert = useCallback((m: Medication, force = false) => {
    if (!force && alertId.current === m.id) return;
    alertId.current = m.id ?? null;
    setAlert({
      medication: m,
      title: 'زمان مصرف دارو',
      message: `وقت مصرف ${m.name} (${m.dosage}) فرا رسیده است.\nلطفاً پس از مصرف، دکمه «مصرف کردم» را بزنید.`,
    });
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const native = Capacitor.isNativePlatform();
        const permCheck = await initAllPermissions();
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
      if (resumeSyncTimeout.current) clearTimeout(resumeSyncTimeout.current);
    };
  }, [load, bootAttempt]);

  useEffect(() => {
    const handleVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const status = await checkNotificationPermission();
        const exactAlarm = await checkExactAlarmPermission();
        setPermission(status);
        setExactAlarmGranted(exactAlarm);
        const current = medsRef.current;
        if (current.some((m) => m.pendingDose || m.running)) await syncAllAlarms(current);
        const now = Date.now();
        for (const m of current) {
          if (m.running && m.nextDoseAt && m.nextDoseAt <= now && !m.pendingDose && claimDueTransition(m)) {
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
    let appListeners: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      const CapApp = await getCapacitorApp();
      if (!CapApp) return;
      try {
        const l1 = await CapApp.addListener('appStateChange', async ({ isActive }) => {
          if (isActive) await handleVisible();
        });
        const l2 = await CapApp.addListener('resume', async () => {
          if (resumeSyncTimeout.current) clearTimeout(resumeSyncTimeout.current);
          resumeSyncTimeout.current = window.setTimeout(() => void handleVisible(), 300);
        });
        appListeners = [l1, l2];
        const l3 = await CapApp.addListener('backButton', ({ canGoBack }) => {
          if (alert) return closeAlertUi();
          if (confirm) return setConfirm(null);
          if (report) return setReport(null);
          if (editing || showAdd) {
            setEditing(null);
            setShowAdd(false);
            return;
          }
          if (!canGoBack) CapApp.exitApp().catch(() => {});
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
  }, [alert, confirm, report, editing, showAdd, closeAlertUi, openAlert, persist, claimDueTransition]);

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
      } else setPermission(await checkNotificationPermission());
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

  const handleOpenBatterySettings = async () => {
    try {
      await openBatteryOptimizationSettings();
    } catch (e) {
      console.warn('[App] battery settings failed', e);
    }
  };

  const handleOpenAppSettings = async () => {
    try {
      await openAndroidAppSettings();
    } catch (e) {
      console.warn('[App] app settings failed', e);
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
          if (n.running && n.nextDoseAt && n.nextDoseAt <= now && claimDueTransition(n)) {
            const due = toDue(n, now);
            updates.set(id, due);
            dueToPersist.push(due);
            openAlert(due, true);
          } else if (n.running && n.remaining !== m.remaining) updates.set(id, n);
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
    const id = window.setInterval(() => void tick(), 1000);
    return () => window.clearInterval(id);
  }, [claimDueTransition, openAlert, persist]);

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
      if (msg.type === 'ALARM_TAKEN') takeDoseRef.current({ ...m, pendingDose: true, running: false, remaining: 0 });
      else if (msg.type === 'ALARM_SNOOZED')
        snoozeRef.current({ ...m, pendingDose: true, running: false, remaining: 0 }, msg.minutes ?? 10);
      else if (msg.type === 'ALARM_TRIGGERED' || msg.type === 'ALARM_DISMISSED')
        openAlert({ ...m, pendingDose: true, running: false, remaining: 0 }, true);
    });
  }, [openAlert, takeDoseRef, snoozeRef]);

  useEffect(() => {
    if (!isNative) return;
    const received = LocalNotifications.addListener('localNotificationReceived', (n) => {
      const id = Number(n.extra?.medicationId);
      const m = findMedication(medsRef.current, id);
      if (!m) return;
      if (!m.pendingDose && claimDueTransition(m)) {
        const due = toDue(m);
        setMedications((v) => sortMedications(v.map((x) => (x.id === m.id ? due : x))));
        persist(due).catch(() => {});
        openAlert(due, true);
      } else openAlert(m, true);
    });
    const action = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = Number(e.notification.extra?.medicationId);
      const m = findMedication(medsRef.current, id);
      if (!m) return;
      const act = e.actionId;
      if (act === 'taken') takeDoseRef.current({ ...m, pendingDose: true, running: false, remaining: 0 });
      else if (act === 'snooze') snoozeRef.current({ ...m, pendingDose: true, running: false, remaining: 0 }, 10);
      else openAlert({ ...m, pendingDose: true, running: false, remaining: 0 }, true);
    });
    return () => {
      received.then((l) => l.remove()).catch(() => {});
      action.then((l) => l.remove()).catch(() => {});
    };
  }, [isNative, openAlert, persist, takeDoseRef, snoozeRef, claimDueTransition]);

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
    setEditing(null);
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
      remaining = Math.max(1, Math.round((remaining / oldInterval) * newInterval));
      nextDoseAt = now + remaining * 1000;
    } else if (!editing.running && !editing.pendingDose) remaining = newInterval;
    if (d.startImmediately && !running && !pendingDose) {
      running = true;
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
    setMedications((v) => sortMedications(v.map((x) => (x.id === editing.id ? updated : x))));
    await persist(updated);
    setEditing(null);
    setShowAdd(false);
  };

  const remove = async (m: Medication) => {
    if (m.id == null) return;
    setConfirm({
      title: 'حذف دارو',
      message: `«${m.name}» حذف شود؟ این کار برگشت‌پذیر نیست.`,
      variant: 'danger',
      confirmLabel: 'حذف',
      cancelLabel: 'انصراف',
      onConfirm: () => {
        setConfirm(null);
        void (async () => {
          const id = m.id!;
          deletedIdsRef.current.add(id);
          await cancelMedNotifications(id);
          dismissSwFollowUps(id);
          await db.deleteMedication(id);
          setMedications((v) => v.filter((x) => x.id !== id));
          if (alertId.current === id) {
            alertId.current = null;
            stopAlarm();
            setAlert(null);
          }
        })();
      },
    });
  };

  const requestReset = (m: Medication) => {
    setConfirm({
      title: 'بازنشانی دارو',
      message: `تایمر «${m.name}» متوقف و وضعیت فعلی پاک شود؟`,
      variant: 'danger',
      confirmLabel: 'بازنشانی',
      cancelLabel: 'انصراف',
      onConfirm: () => {
        setConfirm(null);
        void reset(m);
      },
    });
  };

  const formVisible = showAdd || editing != null;
  const dueCount = useMemo(() => medications.filter((m) => m.pendingDose).length, [medications]);
  const lowStockCount = useMemo(
    () => medications.filter((m) => m.quantity > 0 && m.quantity <= LOW_STOCK_THRESHOLD).length,
    [medications]
  );
  const emptyCount = useMemo(() => medications.filter((m) => m.quantity <= 0).length, [medications]);

  const showPermBanner =
    !permBannerHidden &&
    (permission !== 'granted' ||
      (isNative && !exactAlarmGranted) ||
      (isNative && Capacitor.getPlatform() === 'android'));

  if (bootError) {
    return (
      <BootScreen
        error={bootError}
        onRetry={() => {
          setBootError(null);
          setBootAttempt((n) => n + 1);
        }}
      />
    );
  }

  if (!bootDone) return <BootScreen />;

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-5">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">یادآور دارو</h1>
              <p className="mt-1 text-xs text-slate-400">نسخه {APP_VERSION} · آفلاین و روی دستگاه شما</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowAdd((v) => !v);
                }}
                className="rounded-2xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950"
              >
                {formVisible ? 'بستن فرم' : '+ دارو'}
              </button>
              <button
                type="button"
                onClick={openSupportWhatsApp}
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"
              >
                پشتیبانی
              </button>
            </div>
          </div>

          {showPermBanner && (
            <PermissionsBanner
              permission={permission}
              exactAlarmGranted={exactAlarmGranted}
              onRequest={handleRequestPermission}
              onRequestExactAlarm={handleRequestExactAlarm}
              onOpenBatterySettings={isNative ? () => void handleOpenBatterySettings() : undefined}
              onOpenAppSettings={isNative ? () => void handleOpenAppSettings() : undefined}
              onDismiss={dismissPermBanner}
            />
          )}

          {dueCount > 0 && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-100">
              <span className="font-bold">⏰ {dueCount} دارو منتظر تأیید مصرف است.</span>
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
          <div className="mb-5">
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
            <div className="rounded-3xl border border-dashed border-slate-700 p-8 text-center">
              <div className="text-6xl" aria-hidden="true">
                💊
              </div>
              <h2 className="mt-4 text-xl font-bold">هنوز دارویی ثبت نشده</h2>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowAdd(true);
                }}
                className="mt-6 rounded-2xl bg-cyan-500 px-6 py-3.5 text-[15px] font-bold text-slate-950"
              >
                افزودن اولین دارو
              </button>
            </div>
          ) : (
            medications.map((m, i) => (
              <MedicationCard
                key={m.id}
                medication={m}
                index={i + 1}
                onToggle={() => void toggle(m)}
                onReset={() => requestReset(m)}
                onDelete={() => void remove(m)}
                onEdit={() => {
                  setShowAdd(false);
                  setEditing(m);
                }}
                onShowReport={() => setReport(m)}
                onTake={() => void takeDose(m)}
                onSnooze={() => void snooze(m, 10)}
              />
            ))
          )}
        </div>

        <footer className="mt-8 text-center text-xs text-slate-500">
          <p>MediReminder v{APP_VERSION} — ابزار یادآوری است و جایگزین توصیه پزشک نیست.</p>
        </footer>
      </div>

      {alert && (
        <NotificationPopup
          title={alert.title}
          message={alert.message}
          onClose={closeAlertUi}
          onRestart={() => void takeDose(latestMed(alert.medication))}
          onSnooze={(minutes) => void snooze(latestMed(alert.medication), minutes)}
          isMedicationAlert
        />
      )}

      {report && (
        <ReportModal medication={findMedication(medications, report.id) ?? report} onClose={() => setReport(null)} />
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
