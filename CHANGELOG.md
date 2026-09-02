# Changelog

## [3.0.0] — 2026-09-02 — Final release

### Added
- **PermissionsBanner**: in-app guidance to enable notifications (and Android battery tips)
- One-tap «فعال‌سازی اعلان‌ها»; banner reappears if permission is still missing
- `RELEASE.md` production checklist for users and publishers
- Re-check notification permission when app returns to foreground

### Included from 2.2.x
- Persistent repeating alerts until dose confirmed
- Confirm («مصرف کردم») → immediately start next-interval timer
- Web Service Worker + native LocalNotifications bridge
- Dismiss does not stop reminders

### Notes
- This is the recommended **production publish** line.
- Tag: `v3.0.0`

## [2.2.0] — 2026-09-02

- Persistent repeating alerts (SW ~45s, native ~2min)
- App ↔ Service Worker full sync
- Native action buttons Taken / Snooze / Dismiss

## [2.1.1] — 2026-09-02

- Edit medication wired; snooze 10/30; version sync

## [2.1.0] — 2026-08-29

- Edit, snooze, absolute-time scheduling polish

## [2.0.0]

- Absolute-time model, history, backup, PWA + Capacitor foundation
