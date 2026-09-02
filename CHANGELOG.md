# Changelog

All notable changes to MediReminder are documented in this file.

## [2.2.0] — 2026-09-02

### Added
- **Persistent repeating alerts until dose is confirmed**
  - Web/PWA: Service Worker follow-ups every ~45s with action buttons (مصرف کردم / اسنوز / بعداً)
  - Native Android: pre-scheduled follow-ups every ~2 minutes while `pendingDose` is true
  - In-app popup re-opens automatically if closed without confirmation
- Full bridge between App ↔ Service Worker (`src/utils/alarms.ts`)
- Native notification action types: Taken / Snooze 10m / Dismiss

### Behavior
- **«مصرف کردم»**: stops all follow-ups **and immediately starts** the next-interval timer
- **«اسنوز»**: stops current nags, schedules a new alarm in 10 or 30 minutes
- **«بعداً» / بستن اعلان**: does **not** stop reminders — patient must confirm or snooze
- Background: SW + LocalNotifications keep notifying even when the app is not in the foreground

### Fixed
- App was not syncing schedules to the Service Worker (web alarms were incomplete)
- Pending doses no longer stop notifying after the first alert

## [2.1.1] — 2026-09-02

### Fixed
- Edit medication fully wired; form supports create + edit
- Snooze 10 / 30 minutes from NotificationPopup
- Version badge aligned; quantity 0 allowed on edit
- Proportional remaining time when interval changes while running

## [2.1.0] — 2026-08-29

### Added
- Edit medication from the card
- 10 / 30 minute snooze from the alarm popup

### Changed
- Absolute-time scheduling as source of truth
- MIT LICENSE

## [2.0.0] — previous

- Absolute-time dose scheduling
- Dose lifecycle: scheduled → due → taken / snoozed
- Native Android local notifications
- Low-stock, history, JSON backup/restore
