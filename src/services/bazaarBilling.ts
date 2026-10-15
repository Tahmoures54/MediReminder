import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

/**
 * Existing Cafe Bazaar one-time products (یک‌بار خرید).
 * We treat them as NON-CONSUMABLE: never call consumeProduct for these SKUs.
 * Ownership stays on the user's Bazaar account and can be restored after reinstall.
 */
export const MEDICATION_CARD_PACKAGES = [
  { productId: 'medireminder_cards_3', cardCount: 3, title: 'بسته ۳ کارت اضافه' },
  { productId: 'medireminder_cards_10', cardCount: 10, title: 'بسته ۱۰ کارت اضافه' },
  { productId: 'medireminder_cards_25', cardCount: 25, title: 'بسته ۲۵ کارت اضافه' },
] as const;

/** Very old single-card SKU (if any pending owned token remains). */
const LEGACY_SINGLE_CARD_PRODUCT_ID = 'medication_card_1';

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

async function connectToBazaar(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('پرداخت کارت دارو فقط در نسخه اندروید نصب‌شده از کافه‌بازار فعال است.');
  }
  const key = publicKey();
  if (!key) {
    throw new Error('کلید عمومی پرداخت بازار در بیلد تنظیم نشده است. مقدار BAZAAR_RSA_PUBLIC_KEY را در Secrets مخزن GitHub اضافه کنید.');
  }
  if (connected) return;
  const result = await CafebazaarPoolakey.initialize({ rsaPublicKey: key });
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

  if (products.length !== MEDICATION_CARD_PACKAGES.length) {
    const found = new Set(products.map((item) => item.productId));
    const missing = MEDICATION_CARD_PACKAGES.filter((item) => !found.has(item.productId));
    throw new Error(
      `این محصولات در بازار قابل دریافت نیستند: ${missing.map((item) => item.productId).join('، ')}. وضعیت فعال‌بودن شناسه‌ها را در پنل بازار بررسی کنید.`,
    );
  }
  return products;
}

/**
 * Sync owned purchases from Bazaar → local cache.
 * Source of truth is Bazaar ownership (we never consume these SKUs).
 * Returns the total paid card count after sync.
 */
export async function syncEntitlementsFromBazaar(): Promise<number> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();

  const cardCounts = new Map<string, number>([
    ...MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount] as const),
    [LEGACY_SINGLE_CARD_PRODUCT_ID, 1],
  ]);

  let bestFromOwned = 0;

  for (const purchase of result.purchases) {
    const cardCount = cardCounts.get(purchase.productId);
    if (!cardCount || !purchase.purchaseToken?.trim()) continue;

    // Grant idempotently (token ledger prevents double-count).
    await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount);
    bestFromOwned = Math.max(bestFromOwned, cardCount);
  }

  // Local may already be higher from earlier grants; take the max.
  const localCount = await db.getPaidMedicationCardCount();
  return Math.max(bestFromOwned, localCount);
}

export type MedicationCardPurchaseResult = {
  recoveredPreviousPurchase: boolean;
};

export async function purchaseMedicationCards(productId: string): Promise<MedicationCardPurchaseResult> {
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  // Already owned? Just sync and return (non-consumable cannot be bought again).
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const alreadyOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (alreadyOwned) {
    await syncEntitlementsFromBazaar();
    return { recoveredPreviousPurchase: true };
  }

  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: bundle.productId,
    payload: `medireminder-cards:${bundle.cardCount}`,
  });

  if (result.state !== 'PURCHASED' || !result.purchase?.purchaseToken) {
    throw new Error(
      result.state === 'CANCELLED'
        ? 'خرید را لغو کردید؛ هیچ هزینه‌ای ثبت نشد.'
        : 'بازار خرید را تأیید نکرد؛ کارت اضافه‌ای فعال نشد.',
    );
  }
  if (result.purchase.productId !== bundle.productId) {
    throw new Error('شناسه محصول خریداری‌شده با بسته انتخاب‌شده مطابقت ندارد.');
  }

  // NON-CONSUMABLE: grant only — do NOT call consumeProduct.
  await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount);
  await syncEntitlementsFromBazaar();

  return { recoveredPreviousPurchase: false };
}

/**
 * Public restore entry-point (button + auto on boot / resume).
 * Returns current paid card count.
 */
export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  return syncEntitlementsFromBazaar();
}
