# Technical Documentation — MediReminder 3.2.0

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

Dismiss / «بعداً» does **not** clear `pendingDose`. Follow-up notifications continue until Taken or Snooze.

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
  App.tsx                 # orchestration
  components/             # UI
  db/database.ts          # IndexedDB + types
  utils/alarms.ts         # SW + native bridge
  utils/audio.ts          # alarm sound + haptics
  utils/permissions.ts    # notification permission + channel
public/sw.js              # PWA alarms + follow-ups
```

## Privacy

No backend. No analytics by default. Data stays on device. JSON backup is user-initiated.

## Build

```bash
npm ci && npm run check
npx cap sync android
```

Default Vite build uses **split assets** (not single-file) so SW caching stays reliable.
