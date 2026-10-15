import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

/**
 * Medication-card packs are CONSUMABLE products: users may buy the same pack
 * repeatedly. Grant each purchase token exactly once, then consume it so Bazaar
 * makes that SKU available for another purchase. Because this app has no backend,
 * granted card capacity is stored locally and cannot be reconstructed after the
 * app's local data is erased once the purchase token has been consumed.
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
 * Reconcile any unconsumed purchases from Bazaar. Grant each token idempotently
 * before consuming it: if consumption fails or the app closes mid-flow, a later
 * sync retries consumption without granting the same bundle twice.
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

    // Persist the entitlement first. The local token ledger prevents a retry
    // from granting the same purchase twice if consumption fails.
    await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount);

    try {
      await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken });
    } catch (error) {
      // Keep the granted cards. The token remains visible in Bazaar's inventory
      // and this reconciliation path will retry consumption next time.
      console.warn('[BazaarBilling] purchase granted but consumption needs retry:', error);
    }
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

  // First reconcile a previous purchase that may have been interrupted before
  // Bazaar consumption. If consumption succeeds, the same SKU becomes buyable
  // again. If Bazaar still reports it as owned, do not launch a duplicate flow.
  await syncEntitlementsFromBazaar();
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const stillOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (stillOwned) {
    throw new Error(
      'ظرفیت خرید قبلی ثبت شده، اما اعلام تحویل به کافه‌بازار کامل نشده است. اتصال اینترنت را بررسی کنید و کمی بعد دوباره تلاش کنید؛ فعلاً هزینه دیگری پرداخت نکنید.',
    );
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

  // Grant first, then consume. If consumption fails, the entitlement remains
  // available and a later reconciliation retries consumption idempotently.
  await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount);
  try {
    await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
  } catch (error) {
    console.warn('[BazaarBilling] purchase granted; consumption will be retried later:', error);
  }
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
