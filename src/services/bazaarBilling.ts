import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';
import { recordDiagnostic } from './diagnostics';

export const MEDICATION_CARD_PACKAGES = [
  { productId: 'medireminder_tokens_10', cardCount: 10, title: 'بسته ۱۰ توکن' },
  { productId: 'medireminder_tokens_30', cardCount: 30, title: 'بسته ۳۰ توکن' },
  { productId: 'medireminder_cards_100', cardCount: 100, title: 'بسته ۱۰۰ توکن' },
] as const;

const LEGACY_CARD_PRODUCTS = [
  { productId: 'medireminder_cards_3', cardCount: 3 },
  { productId: 'medireminder_cards_10', cardCount: 10 },
  { productId: 'medireminder_cards_25', cardCount: 25 },
  { productId: 'medication_card_1', cardCount: 1 },
] as const;

/** Documented panel purchases that were charged but never landed in local credits (inventory empty). */
export const PANEL_CONFIRMED_RECOVERY = {
  purchaseToken: 'bazaar-panel-recovery-v1-tokens30-10-cards25-10-3',
  cardCount: 78,
  productId: 'panel-confirmed-recovery',
  label: 'بازیابی خریدهای تأییدشده پنل بازار (۷۸ کارت)',
} as const;

export type MedicationCardProduct = {
  productId: string;
  cardCount: number;
  title: string;
  price: string;
};

let connected = false;

function publicKey(): string {
  return (import.meta.env.VITE_BAZAAR_RSA_PUBLIC_KEY || '').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cardsFromPayload(payload: unknown): number {
  const text = String(payload || '').trim();
  const match =
    /^medireminder-tokens:(\d+)$/.exec(text) ||
    /^medireminder-extra-medication-cards:(\d+)$/.exec(text) ||
    /^medireminder-cards:(\d+)$/.exec(text);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function productCardMap(): Map<string, number> {
  return new Map<string, number>([
    ...MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount] as const),
    ...LEGACY_CARD_PRODUCTS.map((item) => [item.productId, item.cardCount] as const),
  ]);
}

async function connectToBazaar(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('پرداخت کارت دارو فقط در نسخه اندروید نصب‌شده از کافه‌بازار فعال است.');
  }
  const key = publicKey();
  if (!key) {
    throw new Error(
      'کلید عمومی پرداخت بازار در بیلد تنظیم نشده است. مقدار BAZAAR_RSA_PUBLIC_KEY را در Secrets مخزن GitHub اضافه کنید.',
    );
  }
  if (connected) return;
  recordDiagnostic('payment', 'Initializing Cafe Bazaar connection.');
  const result = await CafebazaarPoolakey.initialize({ rsaPublicKey: key });
  recordDiagnostic('payment', `Cafe Bazaar initialize connected=${Boolean(result.connected)}`);
  if (!result.connected) throw new Error('اتصال به سرویس پرداخت کافه‌بازار برقرار نشد.');
  connected = true;
}

export async function getMedicationCardProducts(): Promise<MedicationCardProduct[]> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getProducts({
    skus: MEDICATION_CARD_PACKAGES.map((item) => item.productId),
  });

  const products: MedicationCardProduct[] = [];
  for (const item of MEDICATION_CARD_PACKAGES) {
    const product = result.products.find((candidate) => candidate.sku === item.productId);
    if (product) {
      products.push({
        productId: item.productId,
        cardCount: item.cardCount,
        title: item.title,
        price: product.price,
      });
    }
  }

  recordDiagnostic('payment', `Product list received count=${products.length}/${MEDICATION_CARD_PACKAGES.length}`);
  if (products.length !== MEDICATION_CARD_PACKAGES.length) {
    const found = new Set(products.map((item) => item.productId));
    const missing = MEDICATION_CARD_PACKAGES.filter((item) => !found.has(item.productId));
    throw new Error(
      `این محصولات در بازار قابل دریافت نیستند: ${missing.map((item) => item.productId).join('، ')}. وضعیت فعال‌بودن شناسه‌ها را در پنل بازار بررسی کنید.`,
    );
  }
  return products;
}

async function grantOwnedPurchase(purchase: {
  purchaseToken?: string;
  productId?: string;
  payload?: string;
}): Promise<number> {
  const token = String(purchase.purchaseToken || '').trim();
  if (!token) return 0;

  const cardCounts = productCardMap();
  const payloadCount = cardsFromPayload(purchase.payload);
  const cardCount = cardCounts.get(String(purchase.productId || '')) || payloadCount;
  recordDiagnostic(
    'payment',
    `Owned purchase SKU=${purchase.productId || 'empty'} payloadCards=${payloadCount} mappedCards=${cardCount}`,
  );

  if (!cardCount) {
    console.warn('[BazaarBilling] ignoring unrecognized owned product:', {
      productId: purchase.productId,
      hasPayload: Boolean(purchase.payload),
      hasPurchaseToken: Boolean(purchase.purchaseToken),
    });
    return 0;
  }

  const before = await db.getPaidMedicationCardCount();
  await db.grantPaidMedicationCards(token, cardCount, purchase.productId || 'unknown');
  const after = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Reconciled SKU=${purchase.productId}; credits before=${before}; after=${after}; expected grant=${cardCount}`,
  );

  try {
    await CafebazaarPoolakey.consumeProduct({ token });
    recordDiagnostic('payment', `Consumed Bazaar purchase SKU=${purchase.productId}`);
  } catch (error) {
    recordDiagnostic('payment', `Consume failed SKU=${purchase.productId}; will retry later: ${error}`);
    console.warn('[BazaarBilling] purchase granted but consumption needs retry:', error);
  }

  return cardCount;
}

export async function syncEntitlementsFromBazaar(): Promise<number> {
  recordDiagnostic('payment', 'Starting Bazaar purchase reconciliation.');
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();
  recordDiagnostic('payment', `Bazaar purchase inventory count=${result.purchases.length}`);

  let bestFromOwned = 0;
  for (const purchase of result.purchases) {
    const granted = await grantOwnedPurchase(purchase);
    bestFromOwned = Math.max(bestFromOwned, granted);
  }

  const localCount = await db.getPaidMedicationCardCount();
  recordDiagnostic('payment', `Reconciliation complete; ownedBest=${bestFromOwned}; localCredits=${localCount}`);
  return Math.max(bestFromOwned, localCount);
}

/** Poll Bazaar a few times after checkout — activity result can arrive late or be dropped. */
async function reconcileWithRetries(label: string, attempts = 4, delayMs = 900): Promise<number> {
  let last = await db.getPaidMedicationCardCount();
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    recordDiagnostic('payment', `${label} retry ${i + 1}/${attempts}`);
    try {
      await syncEntitlementsFromBazaar();
    } catch (error) {
      recordDiagnostic('payment', `${label} retry failed: ${error}`);
    }
    last = await db.getPaidMedicationCardCount();
  }
  return last;
}

export async function purchaseMedicationCards(productId: string): Promise<void> {
  recordDiagnostic('payment', `Purchase flow started SKU=${productId}`);
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  const countBefore = await db.getPaidMedicationCardCount();
  await syncEntitlementsFromBazaar();
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const stillOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (stillOwned) {
    recordDiagnostic('payment', `Purchase blocked: previous unconsumed SKU=${bundle.productId}`);
    await reconcileWithRetries('blocked-sku-delivery', 3, 700);
    const afterBlock = await db.getPaidMedicationCardCount();
    if (afterBlock > countBefore) return;
    throw new Error(
      'ظرفیت خرید قبلی ثبت شده، اما اعلام تحویل به کافه‌بازار کامل نشده است. اتصال اینترنت را بررسی کنید و کمی بعد دوباره تلاش کنید؛ فعلاً هزینه دیگری پرداخت نکنید.',
    );
  }

  recordDiagnostic('payment', `Opening Bazaar checkout SKU=${bundle.productId}; expected cards=${bundle.cardCount}`);
  let result: {
    state?: string;
    purchase?: { purchaseToken?: string; productId?: string; payload?: string };
  };
  try {
    result = await CafebazaarPoolakey.purchaseProduct({
      productId: bundle.productId,
      payload: `medireminder-tokens:${bundle.cardCount}`,
    });
  } catch (error) {
    recordDiagnostic('payment', `purchaseProduct threw: ${error}`);
    const recovered = await reconcileWithRetries('after-purchase-throw', 5, 1000);
    if (recovered > countBefore) {
      recordDiagnostic('payment', `Recovered credits after purchase throw; before=${countBefore}; after=${recovered}`);
      return;
    }
    throw error instanceof Error ? error : new Error(String(error || 'خرید ناموفق بود.'));
  }

  recordDiagnostic(
    'payment',
    `Bazaar checkout result state=${result.state}; purchaseReturned=${Boolean(result.purchase)}; sku=${result.purchase?.productId || 'empty'}; hasToken=${Boolean(result.purchase?.purchaseToken)}`,
  );

  if (result.state === 'PURCHASED' && result.purchase?.purchaseToken) {
    if (result.purchase.productId && result.purchase.productId !== bundle.productId) {
      throw new Error('شناسه محصول خریداری‌شده با بسته انتخاب‌شده مطابقت ندارد.');
    }
    const before = await db.getPaidMedicationCardCount();
    recordDiagnostic(
      'payment',
      `Persisting confirmed purchase SKU=${bundle.productId}; cards before=${before}; grant=${bundle.cardCount}`,
    );
    await db.grantPaidMedicationCards(
      result.purchase.purchaseToken,
      bundle.cardCount,
      result.purchase.productId || bundle.productId,
    );
    const after = await db.getPaidMedicationCardCount();
    recordDiagnostic('payment', `Local grant complete SKU=${bundle.productId}; cards before=${before}; after=${after}`);

    try {
      await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
      recordDiagnostic('payment', `Purchase consumed successfully SKU=${bundle.productId}`);
    } catch (error) {
      recordDiagnostic('payment', `Consume deferred SKU=${bundle.productId}: ${error}`);
      console.warn('[BazaarBilling] purchase granted; consumption will be retried later:', error);
    }
    return;
  }

  recordDiagnostic('payment', `Non-PURCHASED state=${result.state}; starting inventory recovery`);
  const recovered = await reconcileWithRetries('after-non-purchased', 5, 1000);
  if (recovered > countBefore) {
    recordDiagnostic('payment', `Recovered credits despite state=${result.state}; before=${countBefore}; after=${recovered}`);
    return;
  }

  throw new Error(
    result.state === 'CANCELLED'
      ? 'خرید را لغو کردید؛ اگر مبلغی کسر شده با «بازیابی خرید قبلی» یا پشتیبانی اقدام کنید و دوباره پرداخت نکنید.'
      : 'بازار خرید را تأیید نکرد؛ اگر مبلغی کسر شده دوباره پرداخت نکنید و بازیابی را امتحان کنید.',
  );
}

export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  recordDiagnostic('payment', 'Manual/startup restore requested.');
  return reconcileWithRetries('manual-restore', 3, 600);
}

/**
 * One-time local grant for purchases already confirmed in the Cafe Bazaar developer panel
 * when client inventory is empty (consumed or activity-result lost before grant).
 * Idempotent by fixed purchaseToken.
 */
export async function applyPanelConfirmedRecoveryGrant(): Promise<{ granted: boolean; totalCredits: number }> {
  const before = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Panel recovery requested; localCredits=${before}; grant=${PANEL_CONFIRMED_RECOVERY.cardCount}`,
  );
  const didGrant = await db.grantPaidMedicationCards(
    PANEL_CONFIRMED_RECOVERY.purchaseToken,
    PANEL_CONFIRMED_RECOVERY.cardCount,
    PANEL_CONFIRMED_RECOVERY.productId,
  );
  const after = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Panel recovery done; granted=${didGrant}; credits before=${before}; after=${after}`,
  );
  return { granted: didGrant, totalCredits: after };
}
