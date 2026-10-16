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
  { productId: 'medireminder_tokens_10', cardCount: 10, title: 'بسته ۱۰ توکن' },
  { productId: 'medireminder_tokens_30', cardCount: 30, title: 'بسته ۳۰ توکن' },
  { productId: 'medireminder_cards_100', cardCount: 100, title: 'بسته ۱۰۰ توکن' },
] as const;

/**
 * Retired SKUs are deliberately excluded from the shop catalog, but remain
 * recognized during reconciliation so a successful purchase from an older APK
 * can still be credited if Bazaar reports its unconsumed purchase token.
 */
const LEGACY_CARD_PRODUCTS = [
  { productId: 'medireminder_cards_3', cardCount: 3 },
  { productId: 'medireminder_cards_10', cardCount: 10 },
  { productId: 'medireminder_cards_25', cardCount: 25 },
  { productId: 'medication_card_1', cardCount: 1 },
] as const;

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
    ...LEGACY_CARD_PRODUCTS.map((item) => [item.productId, item.cardCount] as const),
  ]);

  let bestFromOwned = 0;

  for (const purchase of result.purchases) {
    if (!purchase.purchaseToken?.trim()) continue;

    // Prefer the product ID, but also honor the developer payload we attached
    // at checkout. This recovers a paid consumable if Bazaar returns an SKU that
    // an older/newer app catalog no longer recognizes.
    const payloadMatch = /^medireminder-tokens:(1|3|10|25|30|100)$/.exec(
      String(purchase.payload || '').trim(),
    );
    const payloadCount = payloadMatch ? Number(payloadMatch[1]) : 0;
    const cardCount = cardCounts.get(purchase.productId) || payloadCount;
    if (!cardCount) {
      console.warn('[BazaarBilling] ignoring unrecognized owned product:', {
        productId: purchase.productId,
        hasPayload: Boolean(purchase.payload),
        hasPurchaseToken: Boolean(purchase.purchaseToken),
      });
      continue;
    }

    // Persist the entitlement first. The local token ledger prevents a retry
    // from granting the same purchase twice if consumption fails.
    await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount, purchase.productId);

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

export async function purchaseMedicationCards(productId: string): Promise<void> {
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
    payload: `medireminder-tokens:${bundle.cardCount}`,
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

  // Persist the entitlement before consuming. The IndexedDB transaction is the
  // success boundary for the user's cards; do not turn a successful local grant
  // into a purchase failure because a redundant follow-up sync failed.
  await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount, result.purchase.productId);

  try {
    await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
  } catch (error) {
    // The cards are already persisted. A future boot/resume/restore sync retries
    // consumption using the still-pending token, without granting it twice.
    console.warn('[BazaarBilling] purchase granted; consumption will be retried later:', error);
  }
}

/**
 * Public restore entry-point (button + auto on boot / resume).
 * Returns current paid card count.
 *
 * Only unconsumed purchases can be recovered from Bazaar. Once a purchase token
 * is consumed, this offline-only app cannot restore its grant after local data
 * is cleared or the app is reinstalled.
 */
export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  return syncEntitlementsFromBazaar();
}
