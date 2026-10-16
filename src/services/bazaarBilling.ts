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

export async function syncEntitlementsFromBazaar(): Promise<number> {
  recordDiagnostic('payment', 'Starting Bazaar purchase reconciliation.');
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();
  recordDiagnostic('payment', `Bazaar purchase inventory count=${result.purchases.length}`);

  const cardCounts = new Map<string, number>([
    ...MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount] as const),
    ...LEGACY_CARD_PRODUCTS.map((item) => [item.productId, item.cardCount] as const),
  ]);

  let bestFromOwned = 0;
  for (const purchase of result.purchases) {
    if (!purchase.purchaseToken?.trim()) continue;
    const payloadMatch = /^medireminder-tokens:(1|3|10|25|30|100)$/.exec(
      String(purchase.payload || '').trim(),
    );
    const payloadCount = payloadMatch ? Number(payloadMatch[1]) : 0;
    const cardCount = cardCounts.get(purchase.productId) || payloadCount;
    recordDiagnostic('payment', `Owned purchase SKU=${purchase.productId || 'empty'} payloadCards=${payloadCount} mappedCards=${cardCount}`);

    if (!cardCount) {
      console.warn('[BazaarBilling] ignoring unrecognized owned product:', {
        productId: purchase.productId,
        hasPayload: Boolean(purchase.payload),
        hasPurchaseToken: Boolean(purchase.purchaseToken),
      });
      continue;
    }

    const before = await db.getPaidMedicationCardCount();
    await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount, purchase.productId);
    const after = await db.getPaidMedicationCardCount();
    recordDiagnostic('payment', `Reconciled SKU=${purchase.productId}; credits before=${before}; after=${after}; expected grant=${cardCount}`);

    try {
      await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken });
      recordDiagnostic('payment', `Consumed Bazaar purchase SKU=${purchase.productId}`);
    } catch (error) {
      console.warn('[BazaarBilling] purchase granted but consumption needs retry:', error);
    }
    bestFromOwned = Math.max(bestFromOwned, cardCount);
  }

  const localCount = await db.getPaidMedicationCardCount();
  recordDiagnostic('payment', `Reconciliation complete; ownedBest=${bestFromOwned}; localCredits=${localCount}`);
  return Math.max(bestFromOwned, localCount);
}

export async function purchaseMedicationCards(productId: string): Promise<void> {
  recordDiagnostic('payment', `Purchase flow started SKU=${productId}`);
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  await syncEntitlementsFromBazaar();
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const stillOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (stillOwned) {
    recordDiagnostic('payment', `Purchase blocked: previous unconsumed SKU=${bundle.productId}`);
    throw new Error(
      'ظرفیت خرید قبلی ثبت شده، اما اعلام تحویل به کافه‌بازار کامل نشده است. اتصال اینترنت را بررسی کنید و کمی بعد دوباره تلاش کنید؛ فعلاً هزینه دیگری پرداخت نکنید.',
    );
  }

  recordDiagnostic('payment', `Opening Bazaar checkout SKU=${bundle.productId}; expected cards=${bundle.cardCount}`);
  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: bundle.productId,
    payload: `medireminder-tokens:${bundle.cardCount}`,
  });
  recordDiagnostic('payment', `Bazaar checkout result state=${result.state}; purchaseReturned=${Boolean(result.purchase)}; sku=${result.purchase?.productId || 'empty'}`);

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

  const before = await db.getPaidMedicationCardCount();
  recordDiagnostic('payment', `Persisting confirmed purchase SKU=${bundle.productId}; cards before=${before}; grant=${bundle.cardCount}`);
  await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount, result.purchase.productId);
  const after = await db.getPaidMedicationCardCount();
  recordDiagnostic('payment', `Local grant complete SKU=${bundle.productId}; cards before=${before}; after=${after}`);

  try {
    await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
    recordDiagnostic('payment', `Purchase consumed successfully SKU=${bundle.productId}`);
  } catch (error) {
    console.warn('[BazaarBilling] purchase granted; consumption will be retried later:', error);
  }
}

export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  recordDiagnostic('payment', 'Manual/startup restore requested.');
  return syncEntitlementsFromBazaar();
}
