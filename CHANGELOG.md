# Changelog

All notable changes to MediReminder are documented in this file.

## [3.3.0] — 2026-09-11

### Fixed
- Restored `src/App.tsx` after it was replaced with `PLACEHOLDER`, which blanked the production build.
- 1-second UI ticks no longer write `remaining` to IndexedDB; only due-state transitions are persisted.
- Overdue native doses now schedule repeating follow-up notifications, not a single one-shot alert.
- Service Worker uses network-first navigation, caches hashed assets on fetch, and honors `SKIP_WAITING`.
- Report modal animations use the app’s own CSS utilities (no missing `animate-in` classes).

### Improved
- JSON backup import/export in the header, with a destructive-import confirmation.
- Doses more than 4 hours late are classified as `missed`; reset while pending records `skipped`.
- Report hash is labeled as a text fingerprint, not a digital signature; missed/skipped counts included.
- Medications are sorted pending → running → stopped. Empty state, low-stock banner, and Persian interval presets.
- Confirm dialogs distinguish dangerous actions; reset-while-pending asks before recording a skip.
- Unit tests for scheduling/adherence helpers and time formatting (`npm test`).

## [3.2.1] — 2026-09-09

### Improved
- **Refactor**: extracted pure medication helpers (`normalize`, `statusFor`, `toDue`) into `src/utils/medication.ts`.
- **Refactor**: moved take / snooze / toggle / reset into `src/hooks/useDoseActions.ts` so `App.tsx` is leaner and the same handlers are shared with native notification actions and the Service Worker bridge.
- Restored `TECHNICAL_DOCS.md` with current architecture notes.
- Minor robustness: safer empty `catch` blocks and clearer boot loading state.

### Notes
- Behaviour and data model are unchanged (still offline-first, absolute-time scheduling).
- Version bump to 3.2.1 for the maintainability release.

## [3.2.0] — previous

- Persistent repeating alerts until dose is confirmed.
- Immediate next-dose timer after confirmation.
- JSON backup, adherence report, medication edit.
- Notification permission guidance + WhatsApp support.
- Data stays on-device only.
