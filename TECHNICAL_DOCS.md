# Technical Documentation — MediReminder 3.2.1

## Stack

- React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- IndexedDB (`MedicationReminderDB`, schema v5)
- Capacitor 8 (Android Local Notifications, Haptics, Share)
- PWA Service Worker (`public/sw.js`)

## Core model

**Source of truth for timing:** `nextDoseAt` (Unix ms).

UI 1-second tick only *reflects* remaining time; it does not own the schedule.

### Dose lifecycle

```
scheduled (running + nextDoseAt)
  → due (pendingDose=true, running=false)
  → taken  → immediately schedule next nextDoseAt = now + interval
  → snoozed → nextDoseAt = now + snoozeMinutes
```

Dismiss / «بعداً» does **not** clear `pendingDose`.
Follow-up notifications continue until Taken or Snooze.

### Adherence

`statusFor(takenAt, scheduledAt)`:

- early: more than 30 minutes before schedule
- late: more than 60 minutes after schedule
- else on-time

History is capped at **120** records per medication (`trimHistory`).

## Background alerts

| Platform | Mechanism |
|----------|-----------|
| Web/PWA | Service Worker stores alarms; follow-ups ~every 45s while pending |
| Android | LocalNotifications; pending ≈ every 2 min for ~6h pre-scheduled; **re-sync on foreground** extends window |

Sync is **debounced** (`createDebouncedSync`) and native schedules are sent in **chunks** (64).

## Project layout

```
src/
  App.tsx                    # orchestration (UI state + effects)
  hooks/
    useDoseActions.ts        # take / snooze / toggle / reset
  components/                # UI
  db/database.ts             # IndexedDB + types
  utils/
    medication.ts            # normalize, statusFor, toDue (pure)
    alarms.ts                # SW + native bridge
    audio.ts                 # alarm sound + haptics
    permissions.ts           # notification permission + channel
  public/sw.js               # PWA alarms + follow-ups
```

## Design principles

1. **Absolute time** is the single source of truth — never rely on a running JS timer for correctness.
2. **Pending until confirmed** — alarms keep firing until the user explicitly takes or snoozes.
3. **Offline-first** — all data lives in IndexedDB; no network required after install.
4. **Platform bridges stay thin** — React owns state; alarms.ts only schedules / cancels.
