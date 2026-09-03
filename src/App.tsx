import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { PermissionsBanner } from './components/PermissionsBanner';
import { db, Medication, HistoryRecord } from './db/database';
import {
  initAllPermissions,
  checkNotificationPermission,
  requestNotificationPermission,
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

const APP_VERSION = '3.2.0';
const IN_APP_NAG_MS = 45_000;
const PERM_DISMISS_KEY = 'medireminder-perm-banner-dismissed';
const SUPPORT_WHATSAPP = '989160684552';
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'سلام، درباره MediReminder نیاز به پشتیبانی دارم.'
)}`;

type AlertItem = { medication: Medication; title: string; message: string };

function normalize(m: Medication): Medication {
  const now = Date.now();
  const interval = Number(m.interval) || Number(m.intervalHours) * 3600 || 3600;
  let next = m.nextDoseAt;
  if (m.running && !next) {
    next = now + Math.max(1, m.remaining || interval) * 1000;
  }
  const remaining =
    next && m.running ? Math.max(0, Math.ceil((next - now) / 1000)) : Math.max(0, m.remaining || 0);
  return {
    ...m,
    interval,
    intervalHours: Number(m.intervalHours) || Math.max(1, Math.round(interval / 3600)),
    remaining,
    running: Boolean(m.running),
    pendingDose: Boolean(m.pendingDose),
    history: m.history || [],
    createdAt: m.createdAt || now,
    updatedAt: m.updatedAt || now,
    nextDoseAt: next,
  };
}

/** Prefer scheduled time of this dose when available. */
function statusFor(m: Medication, takenAt: number, scheduledAt?: number): HistoryRecord['status'] {
  const scheduled = scheduledAt ?? m.dueScheduledAt ?? m.nextDoseAt ?? m.lastTakenAt;
  if (!scheduled) return 'on-time';
  const delta = takenAt - scheduled;
  if (delta < -30 * 60 * 1000) return 'early';
  if (delta > 60 * 60 * 1000) return 'late';
  return 'on-time';
}

function openSupportWhatsApp() {
  window.open(SUPPORT_WHATSAPP_URL, '_blank', 'noopener,noreferrer');
}

export default function App() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [alert, setAlert] = useState<AlertItem | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [report, setReport] = useState<Medication | null>(null);
  const [permission, setPermission] = useState('unknown');
  const [isNative, setIsNative] = useState(false);
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
  const takeDoseRef = useRef<(m: Medication) => Promise<void>>(async () => {});
  const snoozeRef = useRef<(m: Medication, minutes?: number) => Promise<void>>(async () => {});
  const debouncedSync = useRef(createDebouncedSync(400));

  useEffect(() => {
    medsRef.current = medications;
  }, [medications]);

  const persist = useCallback(async (m: Medication) => {
    await db.updateMedication(m);
  }, []);

  const load = useCallback(async () => {
    const all = (await db.getAllMedications()).map(normalize);
    setMedications(all);
  }, []);

  const openAlert = useCallback((m: Medication, force = false) => {
    if (!force && alertId.current === m.id) return;
    alertId.current = m.id ?? null;
    setAlert({
      medication: m,
      title: 'زمان مصرف دارو',
      message: `وقت مصرف ${m.name} (${m.dosage}) فرا رسیده است.\nلطفاً پس از مصرف، دکمه «مصرف کردم» را بزنید.`,
    });
    playAlarm();
    triggerHaptics();
  }, []);

  const closeAlertUi = useCallback(() => {
    stopAlarm();
    setAlert(null);
  }, []);

  const clearNagTimer = () => {
    if (nagTimer.current != null) {
      window.clearTimeout(nagTimer.current);
      nagTimer.current = null;
    }
  };

  useEffect(() => {
    clearNagTimer();
    if (!medications.some((m) => m.pendingDose)) return;
    if (alert) return;

    nagTimer.current = window.setTimeout(() => {
      const still = medsRef.current.find((m) => m.pendingDose);
      if (still) openAlert(still, true);
    }, IN_APP_NAG_MS);

    return clearNagTimer;
  }, [medications, alert, openAlert]);

  useEffect(() => {
    (async () => {
      const native = Capacitor.isNativePlatform();
      setIsNative(native);
      const p = await initAllPermissions();
      const status = p.notification ? 'granted' : await checkNotificationPermission();
      setPermission(status);
      await registerNotificationActions();
      await load();
      setBootDone(true);
    })();
    return () => debouncedSync.current.cancel();
  }, [load]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const status = await checkNotificationPermission();
      setPermission(status);
      const current = medsRef.current;
      if (current.some((m) => m.pendingDose || m.running)) {
        await syncAllAlarms(current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const handleRequestPermission = async () => {
    const ok = await requestNotificationPermission();
    if (ok) {
      await setupAndroidChannel();
      setPermission('granted');
      setPermBannerHidden(false);
      try {
        sessionStorage.removeItem(PERM_DISMISS_KEY);
      } catch {}
      await syncAllAlarms(medsRef.current);
    } else {
      setPermission(await checkNotificationPermission());
    }
  };

  const dismissPermBanner = () => {
    setPermBannerHidden(true);
    try {
      sessionStorage.setItem(PERM_DISMISS_KEY, '1');
    } catch {}
  };

  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      const current = medsRef.current;
      let changed = false;
      const next = current.map((m) => {
        const n = normalize(m);
        if (n.running && n.nextDoseAt && n.nextDoseAt <= now) {
          changed = true;
          const due = {
            ...n,
            running: false,
            pendingDose: true,
            remaining: 0,
            dueScheduledAt: n.nextDoseAt ?? now,
            updatedAt: now,
          };
          openAlert(due, true);
          return due;
        }
        if (n.running && n.remaining !== m.remaining) {
          changed = true;
          return n;
        }
        return n;
      });
      if (changed) {
        setMedications(next);
        await Promise.all(next.filter((m, i) => m !== current[i]).map(persist));
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
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
      alertId.current = null;
      stopAlarm();
      setAlert(null);
    },
    [persist]
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
      alertId.current = null;
      stopAlarm();
      setAlert(null);
    },
    [persist]
  );

  takeDoseRef.current = takeDose;
  snoozeRef.current = snooze;

  useEffect(() => {
    return onSwMessage((msg) => {
      // ✅ اصلاح: اگر پیام ALARMS_LIST باشد، medicationId ندارد و باید نادیده گرفته شود
      if (msg.type === 'ALARMS_LIST') return;

      const id = Number(msg.medicationId);
      if (!Number.isFinite(id)) return;
      const m = medsRef.current.find((x) => x.id === id);
      if (!m) return;

      if (msg.type === 'ALARM_TAKEN') {
        takeDoseRef.current({ ...m, pendingDose: true, running: false, remaining: 0 });
      } else if (msg.type === 'ALARM_SNOOZED') {
        snoozeRef.current({ ...m, pendingDose: true, running: false, remaining: 0 }, msg.minutes ?? 10);
      } else if (msg.type === 'ALARM_TRIGGERED' || msg.type === 'ALARM_DISMISSED') {
        openAlert({ ...m, pendingDose: true, running: false, remaining: 0 }, true);
      }
    });
  }, [openAlert]);

  useEffect(() => {
    if (!isNative) return;

    const received = LocalNotifications.addListener('localNotificationReceived', (n) => {
      const id = Number(n.extra?.medicationId);
      const m = medsRef.current.find((x) => x.id === id);
      if (m) {
        if (!m.pendingDose) {
          const due = {
            ...m,
            running: false,
            pendingDose: true,
            remaining: 0,
            dueScheduledAt: m.nextDoseAt ?? Date.now(),
            updatedAt: Date.now(),
          };
          setMedications((v) => v.map((x) => (x.id === m.id ? due : x)));
          persist(due);
          openAlert(due, true);
        } else {
          openAlert(m, true);
        }
      }
    });

    const action = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = Number(e.notification.extra?.medicationId);
      const m = medsRef.current.find((x) => x.id === id);
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
      received.then((l) => l.remove());
      action.then((l) => l.remove());
    };
  }, [isNative, openAlert, persist]);

  const toggle = async (m: Medication) => {
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
  };

  const reset = async (m: Medication) => {
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
    if (alertId.current === m.id) {
      alertId.current = null;
      stopAlarm();
      setAlert(null);
    }
  };

  const add = async (d: {
    name: string;
    dosage: string;
    intervalHours: number;
    quantity: number;
    startImmediately: boolean;
  }) => {
    const now = Date.now();
    const interval = d.intervalHours * 3600;
    const m: Medication = {
      name: d.name,
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
    setMedications((v) => [...v, { ...m, id }]);
    setShowAdd(false);
  };

  const saveEdit = async (d: {
    name: string;
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

    setMedications((v) => v.map((x) => (x.id === updated.id ? updated : x)));
    await persist(updated);
    setEditing(null);
  };

  const remove = (m: Medication) =>
    setConfirm({
      title: 'حذف دارو',
      message: `آیا از حذف «${m.name}» مطمئن هستید؟`,
      onConfirm: async () => {
        if (m.id != null) {
          await db.deleteMedication(m.id);
          await cancelMedNotifications(m.id);
          dismissSwFollowUps(m.id);
        }
        setMedications((v) => v.filter((x) => x.id !== m.id));
        setConfirm(null);
        if (alertId.current === m.id) {
          alertId.current = null;
          stopAlarm();
          setAlert(null);
        }
        if (editing?.id === m.id) setEditing(null);
      },
    });

  const exportBackup = async () => {
    const payload = await db.exportBackup();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediReminder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        await db.importBackup(payload);
        await load();
        alertId.current = null;
        setAlert(null);
        setEditing(null);
      } catch {
        setConfirm({
          title: 'پشتیبان نامعتبر',
          message: 'فایل انتخاب‌شده قابل بازیابی نیست.',
          onConfirm: () => setConfirm(null),
        });
      }
    };
    input.click();
  };

  const activeCount = useMemo(() => medications.filter((m) => m.running).length, [medications]);
  const dueCount = useMemo(() => medications.filter((m) => m.pendingDose).length, [medications]);
  const formVisible = showAdd || editing !== null;
  const showPermBanner = permission !== 'granted' && permission !== 'unknown' && !permBannerHidden;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-slate-950 text-white">
      <div className="mx-auto max-w-lg px-4 py-6">
        <header className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black text-cyan-300">💊 MediReminder</h1>
              <p className="mt-1 text-sm text-gray-400">یادآوری مکرر تا تأیید مصرف دارو</p>
            </div>
            <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
              v{APP_VERSION}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-gray-800 p-3">
              <b className="block text-xl">{medications.length}</b>
              <span className="text-xs text-gray-400">دارو</span>
            </div>
            <div className="rounded-xl bg-gray-800 p-3">
              <b className="block text-xl text-cyan-300">{activeCount}</b>
              <span className="text-xs text-gray-400">فعال</span>
            </div>
            <div className="rounded-xl bg-gray-800 p-3">
              <b className="block text-xl text-red-300">{dueCount}</b>
              <span className="text-xs text-gray-400">نیازمند اقدام</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEditing(null);
                setShowAdd(true);
              }}
              className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-gray-950"
            >
              + افزودن دارو
            </button>
            <button onClick={exportBackup} className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm">
              ⬇ پشتیبان
            </button>
            <button onClick={importBackup} className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm">
              ⬆ بازیابی
            </button>
            <button
              type="button"
              onClick={openSupportWhatsApp}
              className="rounded-xl border border-emerald-600/50 bg-emerald-600/20 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-600/30"
              aria-label="پشتیبانی واتساپ"
              title="پشتیبانی واتساپ"
            >
              💬 پشتیبانی
            </button>
          </div>

          {showPermBanner && (
            <PermissionsBanner
              permission={permission}
              onRequest={handleRequestPermission}
              onDismiss={dismissPermBanner}
            />
          )}

          {dueCount > 0 && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {dueCount} دارو منتظر تأیید مصرف است. هشدارها تا زدن «مصرف کردم» یا «اسنوز» ادامه می‌یابند.
            </p>
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

        <div className="space-y-4">
          {medications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-700 p-12 text-center">
              <div className="text-6xl">💊</div>
              <h2 className="mt-4 text-xl font-bold">هنوز دارویی ثبت نشده</h2>
              <p className="mt-2 text-sm text-gray-400">اولین دارو را اضافه کنید و یادآوری را شروع کنید.</p>
            </div>
          ) : (
            medications.map((m, i) => (
              <MedicationCard
                key={m.id}
                medication={m}
                index={i + 1}
                onToggle={() => toggle(m)}
                onReset={() => reset(m)}
                onDelete={() => remove(m)}
                onEdit={() => {
                  setShowAdd(false);
                  setEditing(m);
                }}
                onShowReport={() => setReport(m)}
                onTake={() => takeDose(m)}
                onSnooze={() => snooze(m, 10)}
              />
            ))
          )}
        </div>

        <footer className="mt-8 space-y-3 pb-8 text-center text-xs text-gray-500">
          <p>
            داده‌ها فقط روی همین دستگاه ذخیره می‌شوند. تا تأیید «مصرف کردم»، یادآوری تکرار می‌شود و سپس تایمر دوز بعدی
            بلافاصله شروع می‌شود.
          </p>
          <button
            type="button"
            onClick={openSupportWhatsApp}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-600/20"
          >
            <span aria-hidden="true">💬</span>
            پشتیبانی واتساپ
          </button>
          <p className="text-gray-600">MediReminder v{APP_VERSION} — ابزار یادآوری است و جایگزین توصیه پزشک نیست.</p>
        </footer>
      </div>

      {alert && (
        <NotificationPopup
          title={alert.title}
          message={alert.message}
          onClose={closeAlertUi}
          onRestart={() => takeDose(alert.medication)}
          onSnooze={(minutes) => snooze(alert.medication, minutes)}
          isMedicationAlert
        />
      )}

      {report && <ReportModal medication={report} onClose={() => setReport(null)} />}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
