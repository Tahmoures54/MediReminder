import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';

export const MEDICATION_CARD_PRODUCT_ID = 'medication_card_1';

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

export async function getMedicationCardPrice(): Promise<string> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getProducts({ skus: [MEDICATION_CARD_PRODUCT_ID] });
  const product = result.products.find((item) => item.sku === MEDICATION_CARD_PRODUCT_ID);
  if (!product) {
    throw new Error('محصول medication_card_1 در پنل کافه‌بازار ساخته یا فعال نشده است.');
  }
  return product.price;
}

async function grantAndConsume(purchaseToken: string): Promise<void> {
  // Commit the entitlement locally before consuming the Bazaar token. The token
  // ledger makes this idempotent if the app is interrupted and recovers the purchase.
  await db.grantPaidMedicationCard(purchaseToken);
  try {
    await CafebazaarPoolakey.consumeProduct({ token: purchaseToken });
  } catch (error) {
    // The slot is already safely recorded locally; a later startup can retry
    // recovery for any purchase Bazaar still reports as unconsumed.
    console.warn('[BazaarBilling] consume deferred; local slot was saved:', error);
  }
}

export async function purchaseMedicationCard(): Promise<void> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.purchaseProduct({
    productId: MEDICATION_CARD_PRODUCT_ID,
    payload: 'medireminder-extra-medication-card',
  });

  if (result.state !== 'PURCHASED' || !result.purchase?.purchaseToken) {
    throw new Error(
      result.state === 'CANCELLED'
        ? 'خرید را لغو کردید؛ هیچ هزینه‌ای برای کارت ثبت نشد.'
        : 'بازار خرید را تأیید نکرد؛ ظرفیت جدیدی اضافه نشد.',
    );
  }
  if (result.purchase.productId !== MEDICATION_CARD_PRODUCT_ID) {
    throw new Error('شناسه محصول خریداری‌شده با کارت دارو مطابقت ندارد.');
  }

  await grantAndConsume(result.purchase.purchaseToken);
}

/** Recover paid purchases interrupted before local grant/consumption completed. */
export async function restorePendingMedicationCardPurchases(): Promise<void> {
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();
  for (const purchase of result.purchases) {
    if (purchase.productId !== MEDICATION_CARD_PRODUCT_ID || !purchase.purchaseToken?.trim()) continue;
    await grantAndConsume(purchase.purchaseToken);
  }
}
