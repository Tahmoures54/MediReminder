import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

/**
 * Non-consumable unlock products.
 * These stay owned by the user's Cafe Bazaar account forever and can be
 * restored after reinstall or on a new device (same Bazaar account).
 *
 * IMPORTANT: In the Cafe Bazaar developer panel these SKUs MUST be created
 * as "non-consumable" (غیرمصرف‌شدنی). Do NOT mark them as consumable.
 */
export const MEDICATION_CARD_PACKAGES = [
  { productId: 'medireminder_unlock_5', cardCount: 5, title: 'باز کردن ۵ کارت اضافه', unlimited: false },
  { productId: 'medireminder_unlock_15', cardCount: 15, title: 'باز کردن ۱۵ کارت اضافه', unlimited: false },
  { productId: 'medireminder_unlimited', cardCount: 9999, title: 'دسترسی نامحدود به کارت دارو', unlimited: true },
] as const;

/** Legacy consumable SKUs (old model). We still try to deliver + consume any
 *  outstanding owned tokens so existing buyers are not left hanging. */
const LEGACY_CONSUMABLE_CARD_COUNTS: Record<string, number> = {
  medication_card_1: 1,
  medireminder_cards_3: 3,
  medireminder_cards_10: 10,
  medireminder_cards_25: 25,
};

export type MedicationCardProduct = {
  productId: string;
  cardCount: number;
  title: string;
  price: string;
  unlimited: boolean;
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
        unlimited: item.unlimited,
      });
    }
  }

  if (products.length !== MEDICATION_CARD_PACKAGES.length) {
    const found = new Set(products.map((item) => item.productId));
    const missing = MEDICATION_CARD_PACKAGES.filter((item) => !found.has(item.productId));
    throw new Error(
      `این محصولات در بازار قابل دریافت نیستند: ${missing.map((item) => item.productId).join('، ')}. وضعیت فعال‌بودن شناسه‌ها و نوع «غیرمصرف‌شدنی» را در پنل بازار بررسی کنید.`,
    );
  }
  return products;
}

/**
 * Compute the highest entitlement the user currently owns on Bazaar
 * (non-consumable unlocks) and persist it locally as a cache.
 * Returns the resulting paid card count (9999 means unlimited).
 */
export async function syncEntitlementsFromBazaar(): Promise<number> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();

  let bestCards = 0;
  let hasUnlimited = false;

  const nonConsumableMap = new Map(
    MEDICATION_CARD_PACKAGES.map((p) => [p.productId, p] as const),
  );

  for (const purchase of result.purchases) {
    const pack = nonConsumableMap.get(purchase.productId);
    if (!pack || !purchase.purchaseToken?.trim()) continue;

    // Non-consumable: never consume. Just record ownership.
    if (pack.unlimited) {
      hasUnlimited = true;
    } else {
      bestCards = Math.max(bestCards, pack.cardCount);
    }

    // Idempotent local grant so offline / cache stays consistent.
    await db.grantPaidMedicationCards(purchase.purchaseToken, pack.unlimited ? 9999 : pack.cardCount);
  }

  // Also finish any leftover legacy consumable tokens (old model).
  for (const purchase of result.purchases) {
    const legacyCount = LEGACY_CONSUMABLE_CARD_COUNTS[purchase.productId];
    if (!legacyCount || !purchase.purchaseToken?.trim()) continue;
    try {
      const granted = await db.grantPaidMedicationCards(purchase.purchaseToken, legacyCount);
      if (granted) {
        // Consume only legacy consumables so they do not block anything.
        await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken });
      }
    } catch (e) {
      console.warn('[BazaarBilling] legacy consumable recovery failed:', e);
    }
  }

  const finalCount = hasUnlimited ? 9999 : bestCards;

  // Ensure local cache reflects at least the best non-consumable we saw.
  // (Local may already be higher from previous legacy grants.)
  const localCount = await db.getPaidMedicationCardCount();
  if (finalCount > localCount) {
    // Force the higher entitlement into the ledger with a synthetic token.
    await db.grantPaidMedicationCards(`bazaar-sync-${finalCount}-${Date.now()}`, finalCount - localCount);
  }

  return Math.max(finalCount, await db.getPaidMedicationCardCount());
}

export type MedicationCardPurchaseResult = {
  recoveredPreviousPurchase: boolean;
};

export async function purchaseMedicationCards(productId: string): Promise<MedicationCardPurchaseResult> {
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  // If the user already owns this non-consumable, just sync and return.
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const alreadyOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (alreadyOwned) {
    await syncEntitlementsFromBazaar();
    return { recoveredPreviousPurchase: true };
  }

  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: bundle.productId,
    payload: `medireminder-unlock:${bundle.productId}`,
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

  // Non-consumable → grant only, never consume.
  await db.grantPaidMedicationCards(
    result.purchase.purchaseToken,
    bundle.unlimited ? 9999 : bundle.cardCount,
  );

  // Re-sync so any higher / unlimited entitlement is reflected.
  await syncEntitlementsFromBazaar();

  return { recoveredPreviousPurchase: false };
}

/**
 * Public restore entry-point (button + auto on boot / resume).
 * Returns the number of paid cards now available (9999 = unlimited).
 */
export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  return syncEntitlementsFromBazaar();
}
