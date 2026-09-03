# Changelog

## [3.2.0] — 2026-09-03 — Scale-ready release

### Reliability
- Dose **history capped** at 120 entries per medication (schema v5)
- **ErrorBoundary** around the app root
- Android permissions: `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`
- `sanitizeMedication` on all DB writes
- Optional `dueScheduledAt` field for stable adherence snapshots

### Docs
- TECHNICAL_DOCS rewritten for current architecture
- RELEASE checklist for public store launch

## [3.1.0] — 2026-09-02 — Production hardening

- Native follow-ups ~6 hours + foreground re-sync
- Debounced alarm sync + chunked native schedules
- Safer openAlert; labeled card actions; empty stock UX
iOS limits in permissions banner
- Vite multi-asset build (no single-file default)

## [3.0.0] — 2026-09-02

- PermissionsBanner, WhatsApp support, repeating alerts until confirmed

## [2.2.0] — 2026-09-02

- SW + native bridge

## [2.1.x] — 2026-09-02

- Edit medication, snooze

## [2.0.0]

- Absolute-time foundation
