import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

/**
 * Consumable token packs. A token is spent when adding a medication after the
 * first free medication. Legacy card-pack purchases remain recoverable if pending.
 */
export const MEDICATION_TOKEN_PACKAGES = [
  { productId: 'medireminder_tokens_10', tokenCount: 10, title: 'شارژ ۱۰ توکن' },
  { productId: 'medireminder_tokens_30', tokenCount: 30, title: 'شارژ ۳۰ توکن' },
  { productId: 'medireminder_cards_100', tokenCount: 100, title: 'شارژ ۱۰۰ توکن' },
] as const;

const LEGACY_CARD_PACKAGES = [
  { productId: 'medireminder_cards_3', tokenCount: 3 },
  { productId: 'medireminder_cards_10', tokenCount: 10 },
  { productId: 'medireminder_cards_25', tokenCount: 25 },
] as const;
const LEGACY_SINGLE_CARD_PRODUCT_ID = 'medication_card_1';

export type MedicationTokenProduct = {
  productId: string;
  tokenCount: number;
  title: string;
  price: string;
};
export type MedicationCardProduct = MedicationTokenProduct;

let connected = false;

function publicKey(): string {
  return (import.meta.env.VITE_BAZAAR_RSA_PUBLIC_KEY || '').trim();
}

async function connectToBazaar(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('پرداخت توکن شارژ فقط در نسخه اندروید نصب‌شده از کافه‌بازار فعال است.');
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

export async function getMedicationTokenProducts(): Promise<MedicationTokenProduct[]> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getProducts({
    skus: MEDICATION_TOKEN_PACKAGES.map((item) => item.productId),
  });

  const products: MedicationCardProduct[] = [];
  for (const item of MEDICATION_TOKEN_PACKAGES) {
    const product = result.products.find((candidate) => candidate.sku === item.productId);
    if (product) {
      products.push({
        productId: item.productId,
        tokenCount: item.tokenCount,
        title: item.title,
        price: product.price,
      });
    }
  }

  if (products.length !== MEDICATION_TOKEN_PACKAGES.length) {
    const found = new Set(products.map((item) => item.productId));
    const missing = MEDICATION_TOKEN_PACKAGES.filter((item) => !found.has(item.productId));
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

  const tokenCounts = new Map<string, number>([
    ...MEDICATION_TOKEN_PACKAGES.map((item) => [item.productId, item.tokenCount] as const),
    ...LEGACY_CARD_PACKAGES.map((item) => [item.productId, item.tokenCount] as const),
    [LEGACY_SINGLE_CARD_PRODUCT_ID, 1],
  ]);

  for (const purchase of result.purchases) {
    const tokenCount = tokenCounts.get(purchase.productId);
    if (!tokenCount || !purchase.purchaseToken?.trim()) continue;

    // Persist the entitlement first. The local token ledger prevents a retry
    // from granting the same purchase twice if consumption fails.
    await db.grantPaidMedicationCards(purchase.purchaseToken, tokenCount);

    try {
      await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken });
    } catch (error) {
      // Keep the granted cards. The purchase token remains visible in Bazaar's inventory
      // and this reconciliation path will retry consumption next time.
      console.warn('[BazaarBilling] purchase granted but consumption needs retry:', error);
    }
  }

  // Return the current spendable local balance, not the size of a still-pending bundle.
  const localCount = await db.getPaidMedicationCardCount();
  return localCount;
}

export async function purchaseMedicationTokens(productId: string): Promise<void> {
  await connectToBazaar();
  const bundle = MEDICATION_TOKEN_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  // First reconcile a previous purchase that may have been interrupted before
  // Bazaar consumption. If consumption succeeds, the same SKU becomes buyable
  // again. If Bazaar still reports it as owned, do not launch a duplicate flow.
  await syncEntitlementsFromBazaar();
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const stillOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (stillOwned) {
    throw new Error(
      'شارژ خرید قبلی ثبت شده، اما اعلام تحویل به کافه‌بازار کامل نشده است. اتصال اینترنت را بررسی کنید و کمی بعد دوباره تلاش کنید؛ فعلاً هزینه دیگری پرداخت نکنید.',
    );
  }

  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: bundle.productId,
    payload: `medireminder-tokens:${bundle.tokenCount}`,
  });

  if (result.state !== 'PURCHASED' || !result.purchase?.purchaseToken) {
    throw new Error(
      result.state === 'CANCELLED'
        ? 'خرید را لغو کردید؛ هیچ هزینه‌ای ثبت نشد.'
        : 'بازار خرید را تأیید نکرد؛ توکنی اضافه نشد.',
    );
  }
  if (result.purchase.productId !== bundle.productId) {
    throw new Error('شناسه محصول خریداری‌شده با بسته انتخاب‌شده مطابقت ندارد.');
  }

  // Persist the entitlement before consuming. The IndexedDB transaction is the
  // success boundary for the user's token balance; do not turn a successful local grant
  // into a purchase failure because a redundant follow-up sync failed.
  await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.tokenCount);

  try {
    await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
  } catch (error) {
    // The tokens are already persisted. A future boot/resume/restore sync retries
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
export async function restorePendingMedicationTokenPurchases(_onlyProductId?: string): Promise<number> {
  return syncEntitlementsFromBazaar();
}
