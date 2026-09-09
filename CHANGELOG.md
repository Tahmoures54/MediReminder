# Changelog

All notable changes to MediReminder are documented in this file.

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
