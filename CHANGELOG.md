# Changelog

All notable changes to MediReminder are documented in this file.

## [2.1.0] — 2026-08-29

### Added
- **Edit medication**: edit name, dosage, quantity and interval from the card (✏️ button).
- Interval change while a timer is running keeps proportional remaining time.
- Proper 10 / 30 minute snooze from the alarm popup (native + in-app).

### Changed
- Version bump to 2.1.0.
- Refactored `App.tsx` for readability and maintainability.
- Improved `AddMedicationForm` to support both create and edit modes.
- Cleaner `MedicationCard` layout with dedicated edit action.
- More accurate dose status calculation (early / on-time / late) based on scheduled time.
- Expanded `.gitignore` for safer Android / signing workflows.
- Added MIT LICENSE.

### Fixed
- Snooze handler signature mismatch between `NotificationPopup` and `App`.
- Quantity validation now allows 0 (empty stock) instead of forcing > 0 on edit.

### Notes for release
- Offline-first, local-only data model unchanged.
- Android production builds still require a proper release keystore.
- PWA + Capacitor Android paths both supported.

## [2.0.0] — previous

- Absolute-time dose scheduling as source of truth.
- Explicit dose lifecycle: scheduled → due → taken / snoozed.
- Persistent pending-dose state across restarts.
- Native Android local notifications (synced only on schedule change).
- Low-stock visibility and dose history.
- JSON backup / restore.
- Accessibility and reduced-motion foundations.
