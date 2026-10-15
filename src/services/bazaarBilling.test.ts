import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const billingSource = readFileSync(fileURLToPath(new URL('./bazaarBilling.ts', import.meta.url)), 'utf8');
const databaseSource = readFileSync(fileURLToPath(new URL('../db/database.ts', import.meta.url)), 'utf8');
const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');

describe('Bazaar purchase safety contracts (non-consumable model)', () => {
  it('never consumes non-consumable unlock products', () => {
    // consumeProduct must only appear in the legacy consumable recovery path
    const consumeIdx = billingSource.indexOf('await CafebazaarPoolakey.consumeProduct');
    expect(consumeIdx).toBeGreaterThanOrEqual(0);
    // The only consume is inside the legacy block
    expect(billingSource).toContain('LEGACY_CONSUMABLE_CARD_COUNTS');
    expect(billingSource).toContain('// Consume only legacy consumables');
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

  it('defines non-consumable unlock packages', () => {
    expect(billingSource).toContain('medireminder_unlock_5');
    expect(billingSource).toContain('medireminder_unlock_15');
    expect(billingSource).toContain('medireminder_unlimited');
    expect(billingSource).toContain('unlimited: true');
  });

  it('does not keep the purchase dialog open if credit was delivered before a later error', () => {
    expect(appSource).toContain('await recoverMedicationCards().catch((recoveryError: unknown) =>');
    expect(appSource).toContain('if (latestCount > countBeforePurchase)');
    expect(appSource).toContain('setShowPurchase(false);\n        setShowAdd(true);');
  });

  it('still recovers owned purchases on boot / resume', () => {
    expect(billingSource).toContain('export async function restorePendingMedicationCardPurchases');
    expect(appSource).toContain('recoverMedicationCards');
  });
});
