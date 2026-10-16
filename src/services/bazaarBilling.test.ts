import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');
const billingDocs = readFileSync(fileURLToPath(new URL('../../BAZAAR_BILLING.md', import.meta.url)), 'utf8');
const restoreDocs = readFileSync(fileURLToPath(new URL('../../RESTORE_APP.md', import.meta.url)), 'utf8');

describe('Bazaar consumable medication-card purchase safety', () => {
  it('consumes card-pack purchases using the purchase token', () => {
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');
    expect(billingSource).toContain('payload: `medireminder-tokens:${bundle.cardCount}`');
  });

  it('records the entitlement before attempting consumption in both purchase paths', () => {
    const syncGrant = billingSource.indexOf('await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount, purchase.productId)');
    const syncConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    const purchaseGrant = billingSource.indexOf('await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount, result.purchase.productId)');
    const purchaseConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');

    expect(syncGrant).toBeGreaterThanOrEqual(0);
    expect(syncConsume).toBeGreaterThan(syncGrant);
    expect(purchaseGrant).toBeGreaterThanOrEqual(0);
    expect(purchaseConsume).toBeGreaterThan(purchaseGrant);
  });

  it('uses the purchase token as an idempotency key inside the IndexedDB write transaction', () => {
    expect(databaseSource).toContain("const tx = db.transaction([STATE_STORE, PURCHASE_STORE], 'readwrite')");
    expect(databaseSource).toContain("const PURCHASE_STORE = 'localPurchases'");
    expect(databaseSource).toContain('purchaseToken: token');
    expect(databaseSource).toContain('productId: sku');
    expect(databaseSource).toContain('const alreadyGrantedByLegacyLedger = tokens.includes(token)');
    expect(databaseSource.indexOf('const alreadyGrantedByLegacyLedger = tokens.includes(token)'))
      .toBeLessThan(databaseSource.indexOf('count: count + cards, tokens: [...tokens, token]'));
  });

  it('does not turn a persisted successful purchase into a failure due to a redundant post-purchase sync', () => {
    const purchaseStart = billingSource.indexOf('export async function purchaseMedicationCards');
    const restoreStart = billingSource.indexOf('export async function restorePendingMedicationCardPurchases');
    const purchaseBody = billingSource.slice(purchaseStart, restoreStart);
    const consumeAt = purchaseBody.indexOf('await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');

    expect(purchaseStart).toBeGreaterThanOrEqual(0);
    expect(restoreStart).toBeGreaterThan(purchaseStart);
    expect(consumeAt).toBeGreaterThanOrEqual(0);
    expect(purchaseBody.slice(consumeAt)).not.toContain('await syncEntitlementsFromBazaar()');
    expect(purchaseBody).toContain('await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount)');
  });

  it('documents the consumable model and the local-data recovery limitation accurately', () => {
    expect(billingDocs).toContain('**مصرف‌شدنی (Consumable)**');
    expect(billingDocs).toContain('نمی‌تواند اعتبار محلی آن خرید را از کافه‌بازار بازسازی کند');
    expect(restoreDocs).toContain('مصرف‌شدنی');
    expect(restoreDocs).toContain('تضمین‌شده قابل بازیابی نیست');
    expect(billingDocs).not.toContain('محصولات یک‌بار خرید هرگز `consume` نمی‌شوند');
  });

  it('exposes syncEntitlementsFromBazaar as the restore path', () => {
    expect(billingSource).toContain('export async function syncEntitlementsFromBazaar');
    expect(billingSource).toContain('export async function restorePendingMedicationCardPurchases');
    expect(billingSource).toContain('return syncEntitlementsFromBazaar()');
  });

  it('uses the current Bazaar token-pack IDs in the shop catalog', () => {
    expect(billingSource).toContain("productId: 'medireminder_tokens_10', cardCount: 10");
    expect(billingSource).toContain("productId: 'medireminder_tokens_30', cardCount: 30");
    expect(billingSource).toContain("productId: 'medireminder_cards_100', cardCount: 100");
  });

  it('keeps retired SKUs recoverable without offering them for new purchases', () => {
    expect(billingSource).toContain("productId: 'medireminder_cards_3', cardCount: 3");
    expect(billingSource).toContain("productId: 'medireminder_cards_10', cardCount: 10");
    expect(billingSource).toContain("productId: 'medireminder_cards_25', cardCount: 25");
    expect(billingSource).toContain("productId: 'medication_card_1', cardCount: 1");
    const catalogStart = billingSource.indexOf('export const MEDICATION_CARD_PACKAGES');
    const legacyStart = billingSource.indexOf('const LEGACY_CARD_PRODUCTS');
    expect(legacyStart).toBeGreaterThan(catalogStart);
    expect(billingSource.slice(catalogStart, legacyStart)).not.toContain('medireminder_cards_3');
  });
});
