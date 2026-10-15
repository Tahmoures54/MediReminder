import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');

describe('Bazaar consumable medication-card purchase safety', () => {
  it('consumes card-pack purchases using the purchase token', () => {
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    expect(billingSource).toContain('CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');
  });

  it('records the entitlement before attempting consumption in both purchase paths', () => {
    const syncGrant = billingSource.indexOf('await db.grantPaidMedicationCards(purchase.purchaseToken, cardCount)');
    const syncConsume = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct({ token: purchase.purchaseToken })');
    const purchaseGrant = billingSource.indexOf('await db.grantPaidMedicationCards(result.purchase.purchaseToken, bundle.cardCount)');
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

  it('exposes syncEntitlementsFromBazaar as the restore path', () => {
    expect(billingSource).toContain('export async function syncEntitlementsFromBazaar');
    expect(billingSource).toContain('export async function restorePendingMedicationCardPurchases');
    expect(billingSource).toContain('return syncEntitlementsFromBazaar()');
  });

  it('uses the existing Cafe Bazaar product IDs', () => {
    expect(billingSource).toContain('medireminder_cards_3');
    expect(billingSource).toContain('medireminder_cards_10');
    expect(billingSource).toContain('medireminder_cards_25');
  });
});
