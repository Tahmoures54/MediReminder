import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

export const MEDICATION_CARD_PACKAGES = [
  { productId: 'medireminder_cards_3', cardCount: 3, title: 'بسته ۳ کارت اضافه' },
  { productId: 'medireminder_cards_10', cardCount: 10, title: 'بسته ۱۰ کارت اضافه' },
  { productId: 'medireminder_cards_25', cardCount: 25, title: 'بسته ۲۵ کارت اضافه' },
] as const;

export type MedicationCardProduct = {
  productId: string;
  cardCount: number;
  title: string;
  price: string;
};

const LEGACY_SINGLE_CARD_PRODUCT_ID = 'medication_card_1';
const LEGACY_PRODUCT_CARD_COUNTS: Record<string, number> = {
  [LEGACY_SINGLE_CARD_PRODUCT_ID]: 1,
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
      `این محصولات در بازار قابل دریافت نیستند: ${missing.map((item) => item.productId).join('، ')}. وضعیت فعال‌بودن شناسه‌ها و بسته برنامه را در پنل بازار بررسی کنید.`,
    );
  }
  return products;
}

async function grantAndConsume(purchaseToken: string, cardCount: number): Promise<void> {
  // Persist the full bundle before consuming the Bazaar token. The token ledger
  // prevents a recovered purchase from granting cards twice.
  await db.grantPaidMedicationCards(purchaseToken, cardCount);
  try {
    await CafebazaarPoolakey.consumeProduct({ token: purchaseToken });
  } catch (error) {
    console.warn('[BazaarBilling] consume deferred; local cards were saved:', error);
  }
}

export async function purchaseMedicationCards(productId: string): Promise<void> {
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: bundle.productId,
    payload: `medireminder-extra-medication-cards:${bundle.cardCount}`,
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

  await grantAndConsume(result.purchase.purchaseToken, bundle.cardCount);
}

/** Recover interrupted purchases. Legacy one-card purchases remain supported. */
export async function restorePendingMedicationCardPurchases(): Promise<void> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();
  const cardCounts = new Map<string, number>([
    ...MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount] as const),
    ...Object.entries(LEGACY_PRODUCT_CARD_COUNTS),
  ]);

  for (const purchase of result.purchases) {
    const cardCount = cardCounts.get(purchase.productId);
    if (!cardCount || !purchase.purchaseToken?.trim()) continue;
    await grantAndConsume(purchase.purchaseToken, cardCount);
  }
}
