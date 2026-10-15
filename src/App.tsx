import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { getMedicationCardProducts, purchaseMedicationCards, restorePendingMedicationCardPurchases, type MedicationCardProduct } from './services/bazaarBilling';
import { getMedicationLimit } from './utils/medicationAccess';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { PermissionsBanner } from './components/PermissionsBanner';
import { BootScreen } from './components/BootScreen';
import type { PermissionState } from './components/PermissionsBanner';
import { db, type Medication } from './db/database';
import {
  initAllPermissions,
  checkNotificationPermission,
  requestNotificationPermission,
  checkExactAlarmPermission,
  checkBatteryOptimizationExemption,
  requestExactAlarmPermission,
  setupAndroidChannel,
  openAndroidAppSettings,
  openBatteryOptimizationSettings,
} from './utils/permissions';
import { playAlarm, stopAlarm, triggerHaptics } from './utils/audio';
import {
  onSwMessage,
  registerNotificationActions,
  cancelMedNotifications,
  dismissSwFollowUps,
  createDebouncedSync,
  syncAllAlarms,
  NATIVE_PENDING_REFRESH_MS,
} from './utils/alarms';
import { findMedication, normalize, patchMedications, sortMedications, toDue } from './utils/medication';
import { toMedId } from './utils/ids';
import { useDoseActions } from './hooks/useDoseActions';
import {
  APP_VERSION,
  IN_APP_NAG_MS,
  LOW_STOCK_THRESHOLD,
  PERM_DISMISS_KEY,
  SUPPORT_WHATSAPP_URL,
} from './constants';

// Temporary bootstrap — full App body is restored in the same commit via second write if needed.
// This minimal shell is only used if full content push fails; prefer full file.
export default function App() {
  return null;
}
