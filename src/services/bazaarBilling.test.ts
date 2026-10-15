import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

describe('Bazaar purchase safety contracts', () => {
  it('commits local entitlement before attempting to consume the Bazaar token', () => {
    expect(billingSource.indexOf('await db.grantPaidMedicationCards(purchaseToken, cardCount)')).toBeGreaterThanOrEqual(0);
    expect(billingSource.indexOf('await db.grantPaidMedicationCards(purchaseToken, cardCount)'))
      .toBeLessThan(billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: purchaseToken })'));
  });

  it('uses the purchase token as an idempotency key inside the IndexedDB write transaction', () => {
    expect(databaseSource).toContain('const tx = db.transaction(STATE_STORE, \'readwrite\')');
    expect(databaseSource.indexOf('if (tokens.includes(token)) return;'))
      .toBeLessThan(databaseSource.indexOf('count: count + cards, tokens: [...tokens, token]'));
  });

  it('clearly discloses device-local purchase storage before the user buys', () => {
    expect(appSource).toContain('ظرفیت خریداری‌شده فعلاً روی همین دستگاه ذخیره می‌شود');
    expect(appSource).toContain('پاک‌کردن داده‌های برنامه یا نصب مجدد ممکن است ظرفیت را حذف کند');
  });

  it('attempts the explicitly requested purchase even when pending purchases are recovered', () => {
    const recovery = billingSource.indexOf('await restorePendingMedicationCardPurchases();');
    const purchase = billingSource.indexOf('CafebazaarPoolakey.purchaseProduct({');
    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(recovery).toBeLessThan(purchase);
    expect(billingSource).toContain('a user may intentionally buy the same consumable package repeatedly');
    expect(billingSource).not.toContain('if (recoveredCards > 0 || countAfterRecovery > countBeforeRecovery)');
  });

  it('does not keep the purchase dialog open if credit was delivered before a later error', () => {
    expect(appSource).toContain('if (latestCount > countBeforePurchase)');
    expect(appSource).toContain('setShowPurchase(false);\n        setShowAdd(true);');
  });

  it('supports recovery of interrupted consumable purchases', () => {
    expect(billingSource).toContain('export async function restorePendingMedicationCardPurchases(): Promise<number>');
  });
});
