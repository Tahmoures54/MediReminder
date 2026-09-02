# Changelog

## [3.1.0] — 2026-09-02 — Production hardening

### Reliability
- Native pending follow-ups extended to **~6 hours** (180 × 2 min); **re-sync on app foreground** extends further
- **Debounced** alarm/notification sync (fewer OEM cancel/reschedule races)
- Notification schedule sent in **chunks** for large batches
- Safer `openAlert` (no stale `alert` state race)
- `statusFor` uses explicit scheduled snapshot when recording history

### UX
- Medication actions labeled (ویرایش / گزارش / ریست / حذف)
- Empty stock callout when quantity is 0
- Permissions banner notes **iOS/PWA background limits**

### Build / release
- Default Vite build **without** single-file bundle (reliable SW + PWA assets)
- CI Android versionName **3.1.0**, versionCode 31, artifact names updated
- Extra Android permissions: `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`

## [3.0.0] — 2026-09-02

- PermissionsBanner, WhatsApp support, repeating alerts until confirmed
- Confirm → immediate next timer

## [2.2.0] — 2026-09-02

- SW + native bridge, follow-up nags

## [2.1.x] — 2026-09-02

- Edit medication, snooze 10/30

## [2.0.0]

- Absolute-time model, history, backup, PWA foundation
