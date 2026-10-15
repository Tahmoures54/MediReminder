# Android alarm reliability notes

MediReminder schedules alarms with Android's native local-notification API; the Android notification queue does not depend on the React screen staying open for each scheduled notification to fire.

## Current safeguards

- Exact-alarm and notification permissions are checked and exposed in the app's permission UI.
- The build manifest requests notification, exact-alarm, and boot-completed permissions.
- Future doses and pending-dose follow-ups are pre-scheduled natively.
- Follow-ups are spaced 15 minutes apart, with up to 36 notifications per medication (about 9 hours of pre-scheduled follow-up coverage).
- The app resynchronizes schedules on startup/resume and attempts a queue refresh while the process is alive.

## Important limits

Android vendors can restrict background activity, and users can disable notifications, alarm access, or sound. A force-stop can prevent app components from running until the app is opened again. The bounded queue also cannot guarantee indefinite repeat alerts if a dose remains unconfirmed for longer than its pre-scheduled window and the app never resumes.

## Release-device test checklist

Test on a physical Android phone, with the actual release APK:

1. Grant notification permission and exact-alarm access.
2. Schedule a dose 2–3 minutes ahead, close the screen, and verify the sound and notification.
3. Leave a dose unconfirmed and verify that a repeat notification arrives about 15 minutes later.
4. Reboot the phone and verify a scheduled dose still fires.
5. Test with battery saver enabled and review the manufacturer's app battery settings.
6. Deny notification/exact-alarm permission and verify that the app clearly warns the user.

Do not advertise guaranteed alarms in every device state until these tests pass on representative devices.
