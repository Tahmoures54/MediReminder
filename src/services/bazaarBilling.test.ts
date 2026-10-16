import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');
const billingDocs = readFileSync(fileURLToPath(new URL('../../BAZAAR_BILLING.md', import.meta.url)), 'utf8');
const restoreDocs = readFileSync(fileURLToPath(new URL('../../RESTORE_APP.md', import.meta.url)), 'utf8');

describe('Bazaar consumable medication-token purchase safety', () => {
  it('consumes new token-pack purchases using the purchase token', () => {
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');
    expect(billingSource).toContain('MEDICATION_TOKEN_PACKAGES');
  });

  it('records the token grant before attempting consumption in both purchase paths', () => {
    const syncGrant = billingSource.indexOf('await db.grantPaidMedicationCards(purchase.purchaseToken, tokenCount)');
    const syncConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    const purchaseGrant = billingSource.indexOf('await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.tokenCount)');
    const purchaseConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');

    expect(syncGrant).toBeGreaterThanOrEqual(0);
    expect(syncConsume).toBeGreaterThan(syncGrant);
    expect(purchaseGrant).toBeGreaterThanOrEqual(0);
    expect(purchaseConsume).toBeGreaterThan(purchaseGrant);
  });

  it('uses the purchase token as an idempotency key inside the IndexedDB write transaction', () => {
    expect(databaseSource).toContain("const tx = db.transaction(STATE_STORE, 'readwrite')");
    expect(databaseSource.indexOf('if (tokens.includes(token)) return;'))
      .toBeLessThan(databaseSource.indexOf('count: count + cards, tokens: [...tokens, token]'));
  });

  it('spends one token atomically with creating each medication after the first free one', () => {
    expect(databaseSource).toContain('addMedicationWithToken(medication: Medication, consumeToken: boolean)');
    expect(databaseSource).toContain("db.transaction([STORE_NAME, STATE_STORE], 'readwrite')");
    expect(databaseSource).toContain('count: count - 1');
    expect(databaseSource).toContain('if (count < 1)');
  });

  it('keeps old pending card-pack SKUs recoverable while using new token SKUs for sales', () => {
    expect(billingSource).toContain('medireminder_tokens_10');
    expect(billingSource).toContain('medireminder_tokens_30');
    expect(billingSource).toContain('medireminder_tokens_100');
    expect(billingSource).toContain('medireminder_cards_3');
    expect(billingSource).toContain('medireminder_cards_10');
    expect(billingSource).toContain('medireminder_cards_25');
  });

  it('documents consumable packs and local-data recovery limits', () => {
    expect(billingDocs).toContain('مصرف‌شدنی');
    expect(billingDocs).toContain('نمی‌تواند موجودی محلی را از کافه‌بازار بازسازی کند');
    expect(restoreDocs).toContain('مصرف‌شدنی');
    expect(restoreDocs).toContain('تضمین‌شده قابل بازیابی نیست');
  });

  it('exposes the token restore path', () => {
    expect(billingSource).toContain('export async function syncEntitlementsFromBazaar');
    expect(billingSource).toContain('export async function restorePendingMedicationTokenPurchases');
    expect(billingSource).toContain('return syncEntitlementsFromBazaar()');
  });
});
