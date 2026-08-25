# MediReminder 2.0.0

MediReminder is an offline-first medication reminder and dose tracking application built with React, TypeScript, Vite and Capacitor.

## Release highlights

- Absolute-time dose scheduling instead of UI timer state as the source of truth.
- Explicit dose lifecycle: scheduled → due → taken / snoozed.
- Persistent pending-dose state so an alarm survives app restarts.
- Native Android local notifications synchronized only when the schedule changes.
- Low-stock visibility and dose history.
- JSON backup and restore without a server.
- Safer Android release workflow: production signing is mandatory for release builds.
- Accessibility and reduced-motion foundations.
- Local-only data model; no medication data is sent to a backend.

## Development

```bash
npm ci
npm run typecheck
npm run build
```

For Android:

```bash
npx cap sync android
npx cap open android
```

## Important

MediReminder is a reminder and tracking tool. It does not diagnose conditions, prescribe treatment, or replace a physician or pharmacist.
