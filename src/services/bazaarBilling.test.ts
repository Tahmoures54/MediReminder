import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');
const billingDocs = readFileSync(fileURLToPath(new URL('../../BAZAAR_BILLING.md', import.meta.url)), 'utf8');
const restoreDocs = readFileSync(fileURLToPath(new URL('../../RESTORE_APP.md', import.meta.url)), 'utf8');

describe('Bazaar consumable medication-card purchase safety', () => {
  it('consumes card-pack purchases using the purchase token', () => {
    expect(billingSource).toContain('await CafebazaarPoolakey.consumeProduct({ token })');
    expect(billingSource).toContain('await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');
    expect(billingSource).toContain('payload: `medireminder-tokens:${bundle.cardCount}`');
  });

  it('records the entitlement before attempting consumption in both purchase paths', () => {
    const syncGrant = billingSource.indexOf('await db.grantPaidMedicationCards(token, cardCount, purchase.productId || \'unknown\')');
    const syncConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token })');
    const purchaseGrant = billingSource.indexOf('await db.grantPaidMedicationCards(');
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
    expect(databaseSource).toContain('const alreadyGrantedByLegacyLedger = alreadyInState');
    expect(databaseSource).toContain('const shouldRepair = existing.credited !== false && !alreadyInState');
    expect(databaseSource.indexOf('const alreadyGrantedByLegacyLedger = alreadyInState'))
      .toBeLessThan(databaseSource.indexOf('count: count + cards, tokens: [...tokens, token]'));
  });

  it('recovers inventory after non-PURCHASED or thrown purchase results', () => {
    expect(billingSource).toContain('reconcileWithRetries');
    expect(billingSource).toContain('after-purchase-throw');
    expect(billingSource).toContain('after-non-purchased');
    expect(billingSource).toContain('Recovered credits despite state=');
  });

  it('parses legacy and current developer payloads for card counts', () => {
    expect(billingSource).toContain('medireminder-tokens:(\\d+)');
    expect(billingSource).toContain('medireminder-extra-medication-cards:(\\d+)');
  });

  it('documents the consumable model and the local-data recovery limitation accurately', () => {
    expect(billingDocs).toContain('**مصرف‌شدنی (Consumable)**');
    expect(billingDocs).toContain('نمی‌تواند اعتبار محلی آن خرید را از کافه‌بازار بازسازی کند');
    expect(restoreDocs).toContain('مصرف‌شدنی');
    expect(restoreDocs).toContain('تضمین‌شده قابل بازیابی نیست');
    expect(billingDocs).not.toContain('محصولات یک‌بار خرید هرگز `consume` نمی‌شوند');
  });

  it('exposes sync and panel recovery paths', () => {
    expect(billingSource).toContain('export async function syncEntitlementsFromBazaar');
    expect(billingSource).toContain('export async function restorePendingMedicationCardPurchases');
    expect(billingSource).toContain('export async function applyPanelConfirmedRecoveryGrant');
    expect(billingSource).toContain("purchaseToken: 'bazaar-panel-recovery-v1-tokens30-10-cards25-10-3'");
    expect(billingSource).toContain('cardCount: 78');
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
