# 🔧 Technical Documentation

## Architecture Overview

This is a modern web application built with:
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **IndexedDB** - Local database

## Project Structure

```
src/
├── components/
│   ├── MedicationCard.tsx       # Individual medication timer card
│   ├── AddMedicationForm.tsx    # Form for adding new medications
│   ├── ConfirmDialog.tsx        # Reusable confirmation dialog
│   └── NotificationPopup.tsx    # Alert popup for medication reminders
├── db/
│   └── database.ts              # IndexedDB wrapper and data layer
├── utils/
│   └── audio.ts                 # Audio alerts and time formatting
├── App.tsx                      # Main application component
├── main.tsx                     # Application entry point
└── index.css                    # Global styles and animations

public/
├── manifest.json                # PWA manifest
├── sw.js                        # Service worker for offline support
├── icon-192.png                 # App icon (192x192)
└── icon-512.png                 # App icon (512x512)
```

## Data Model

### Medication Interface

```typescript
interface Medication {
  id?: number;              // Auto-incremented database ID
  name: string;             // Medication name
  dosage: string;           // Dosage information (e.g., "500mg")
  intervalHours: number;    // Interval in hours (for display)
  interval: number;         // Interval in seconds (for timers)
  quantity: number;         // Number of pills remaining
  remaining: number;        // Seconds remaining on current timer
  running: boolean;         // Whether timer is currently active
}
```

## Database Layer (IndexedDB)

### Database Structure

The app uses IndexedDB with two object stores:

1. **medications** - Stores medication records
   - Key path: `id` (auto-increment)
   - Indexes: `name`

2. **appState** - Stores application state
   - Key path: `key`
   - Stores: `lastSaved` timestamp, `deviceId`

### Key Operations

```typescript
// Initialize database
const db = new Database();

// CRUD operations
await db.getAllMedications();              // Fetch all medications
await db.addMedication(medication);        // Add new medication
await db.updateMedication(medication);     // Update existing
await db.deleteMedication(id);             // Delete by ID

// State management
await db.getLastSavedTime();               // Get last app close time
await db.setLastSavedTime(timestamp);      // Save current timestamp
await db.getDeviceId();                    // Get unique device ID
```

### Time Tracking Algorithm

When the app loads:

1. Fetch `lastSaved` timestamp from database
2. Calculate `elapsed = currentTime - lastSaved`
3. For each medication with `running === true`:
   - Subtract elapsed time from `remaining`
   - If `remaining <= 0`:
     - Set `running = false`
     - Reset `remaining = interval`
     - Trigger medication alert
4. Update database with new states
5. Save new `lastSaved` timestamp

This ensures timers continue counting down even when the app is closed.

## Timer System

### Timer Update Loop

```typescript
// Update every second
setInterval(() => {
  setMedications(prev => {
    const updated = prev.map(med => {
      if (med.running && med.remaining > 0) {
        return { ...med, remaining: med.remaining - 1 };
      }
      if (med.running && med.remaining <= 0) {
        // Time's up! Trigger alert
        showMedicationAlert(med);
        return { ...med, running: false, remaining: med.interval };
      }
      return med;
    });
    
    // Persist to database
    updated.forEach(med => db.updateMedication(med));
    return updated;
  });
}, 1000);
```

### State Management

React state is used for UI reactivity:
- `medications[]` - Array of all medications
- `showForm` - Toggle add medication form
- `notification` - Current notification popup
- `confirmDialog` - Current confirmation dialog

All state changes are immediately persisted to IndexedDB.

## Audio System

### Alert Sound Generation

Uses Web Audio API to generate beeping sound:

```typescript
const audioContext = new AudioContext();
const oscillator = audioContext.createOscillator();
const gainNode = audioContext.createGain();

oscillator.type = 'sine';           // Sine wave
oscillator.frequency.value = 800;    // 800 Hz pitch

// 5 beeps pattern
for (let i = 0; i < 5; i++) {
  gainNode.gain.setValueAtTime(0.3, time);
  gainNode.gain.setValueAtTime(0, time + 0.2);
  time += 0.4;
}

oscillator.start();
```

### Browser Notifications

```typescript
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification('🔔 Time to Medicate!', {
    body: `${med.name} - ${med.dosage}`,
    icon: '/icon.png',
    tag: `med-${med.id}`,
  });
}
```

## Progressive Web App (PWA)

### Service Worker

Caches essential resources for offline use:

```javascript
const CACHE_NAME = 'medi-reminder-v1';
const urlsToCache = ['/', '/index.html', '/manifest.json', ...];

// Install: Cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch: Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

### Manifest

Defines app metadata for installation:

```json
{
  "name": "AI Medi Reminder",
  "short_name": "Medi Reminder",
  "display": "standalone",      // Fullscreen, no browser UI
  "theme_color": "#00BCD4",
  "background_color": "#1f2937",
  "icons": [...]
}
```

## UI Components

### MedicationCard

Displays individual medication with:
- Timer display (HH:MM:SS)
- Progress bar
- Control buttons (Start/Pause, Reset, Delete)
- Visual indicators (color coding, pulsing dot)

### AddMedicationForm

Form with validation:
- Text inputs for name, dosage
- Number input for quantity
- Interval selection (preset + custom)
- Form state management

### ConfirmDialog

Reusable confirmation modal:
- Title and message
- Yes/Cancel actions
- Callback-based flow control

### NotificationPopup

Alert popup with:
- Large, attention-grabbing design
- Optional "Restart Timer" action
- Sound dismissal on close

## Styling

### Tailwind CSS

Utility-first CSS framework:
- Dark theme colors
- Responsive design (mobile-first)
- Custom animations
- Gradient backgrounds

### Custom Animations

```css
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes bounce-in {
  0% { opacity: 0; transform: scale(0.3); }
  50% { transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
```

### Color Scheme

- Background: Gray-900 gradient
- Primary: Cyan-400/500 (#00BCD4)
- Success: Green-500
- Warning: Orange-500
- Danger: Red-500

## Performance Optimizations

1. **Database Queries**
   - Batch updates to minimize IndexedDB transactions
   - Cache medications in React state

2. **Timer Updates**
   - Single interval for all timers
   - Batch state updates

3. **Re-renders**
   - React.memo for child components (optional improvement)
   - Key-based list rendering

4. **Asset Loading**
   - Lazy load icons
   - Service worker caching

## Browser Compatibility

### Supported Browsers

✅ Chrome 60+ (Desktop & Mobile)
✅ Firefox 55+
✅ Safari 11+ (iOS & macOS)
✅ Edge 79+
✅ Samsung Internet 8+

### Required Features

- IndexedDB API
- Web Audio API (optional, for sound)
- Notification API (optional)
- Service Worker API (optional, for PWA)
- LocalStorage (fallback)

## Security Considerations

1. **Data Privacy**
   - All data stored locally
   - No external API calls
   - No user tracking

2. **Input Validation**
   - Type checking with TypeScript
   - Form validation before database insert
   - Sanitized user inputs

3. **XSS Prevention**
   - React auto-escapes JSX
   - No `dangerouslySetInnerHTML`

## Future Enhancements

Potential improvements:

1. **Edit Functionality**
   - In-place editing of medications
   - Update without delete/re-add

2. **Export/Import**
   - JSON export of medications
   - Backup/restore capability

3. **Statistics**
   - Adherence tracking
   - Missed dose counter
   - Visual charts

4. **Recurring Patterns**
   - Weekly schedules
   - Specific days only

5. **Multiple Reminders**
   - Pre-alerts (10 mins before)
   - Snooze functionality

6. **Cloud Sync** (optional)
   - Multi-device synchronization
   - Requires backend service

## Development

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Deployment

The app is a static site and can be deployed to:
- Netlify
- Vercel
- GitHub Pages
- Any static hosting service

No backend required!

## Testing Recommendations

1. **Unit Tests**
   - Database CRUD operations
   - Time calculation logic
   - Form validation

2. **Integration Tests**
   - Timer flow (start → countdown → alert)
   - Add/delete medication flow
   - Persistence across sessions

3. **E2E Tests**
   - Full user journey
   - Multi-medication scenarios
   - Notification handling

## Known Limitations

1. **Timer Accuracy**
   - Depends on browser tab being open or PWA running
   - Background timers may be throttled

2. **Notification Reliability**
   - Requires notification permission
   - May not work if browser is closed

3. **Data Persistence**
   - Clearing browser data deletes all medications
   - No automatic backup

4. **Browser Support**
   - IndexedDB required (no IE support)
   - Audio may not work in all browsers

## License

This project is provided as-is for educational and personal use.

## Credits

- Built with React + Vite
- Styled with Tailwind CSS
- Icons: Unicode emoji
- Sound: Web Audio API

---

**Converted from**: Python Kivy Application
**Target Platform**: Mobile Web (PWA)
**Database Migration**: SQLite → IndexedDB
