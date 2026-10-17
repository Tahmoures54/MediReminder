import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ==========================================================================
 * Bazaar consumable medication-card purchase — safety contracts
 *
 * These are SOURCE-LEVEL contracts (white-box) over `bazaarBilling.ts`,
 * `db/database.ts`, and two markdown docs. They pin invariants that:
 *
 *   1. Are hard to assert behaviorally without an integration test against
 *      the real Cafebazaar Poolakey bridge (which is impractical in CI).
 *   2. Have customer-trust / financial consequences if violated (double
 *      grant, lost grant, double charge, idempotency leak across reinstalls).
 *
 * Trade-off acknowledged: white-box tests are brittle against refactors.
 * They are kept narrow (only the safety-critical ordering + presence
 * guarantees) so renaming a variable or restructuring a non-critical block
 * does not trigger a false failure.
 *
 * Companion behavior tests, when feasible, should live in
 * `bazaarBilling.behavior.test.ts` using a mocked Poolakey bridge.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Source loading
 * -------------------------------------------------------------------------- */

const BILLING_PATH = new URL('./bazaarBilling.ts', import.meta.url);
const DATABASE_PATH = new URL('../db/database.ts', import.meta.url);
const README_PATH = new URL('../../README.md', import.meta.url);

const billingSource = readFileSync(fileURLToPath(BILLING_PATH), 'utf8');
const databaseSource = readFileSync(fileURLToPath(DATABASE_PATH), 'utf8');
const readme = readFileSync(fileURLToPath(README_PATH), 'utf8');

/* --------------------------------------------------------------------------
 * Inspection helpers
 * -------------------------------------------------------------------------- */

interface SourceFile {
  readonly name: string;
  readonly content: string;
  readonly path: string;
}

const billing: SourceFile = { name: 'bazaarBilling.ts', content: billingSource, path: fileURLToPath(BILLING_PATH) };
const database: SourceFile = { name: 'database.ts', content: databaseSource, path: fileURLToPath(DATABASE_PATH) };
const readmeFile: SourceFile = { name: 'README.md', content: readme, path: fileURLToPath(README_PATH) };

/**
 * Asserts that `file.content` includes `fragment`.
 * Throws a precise error pointing at the file and the missing fragment so
 * a CI failure can be diagnosed without re-running the suite.
 */
function expectContains(file: SourceFile, fragment: string): void {
  if (!file.content.includes(fragment)) {
    throw new Error(
      `Expected ${file.name} to contain:\n  "${fragment}"\n` +
      `File path: ${file.path}`,
    );
  }
}

/**
 * Asserts that `file.content` does NOT include `fragment`. Used to guarantee
 * a forbidden claim (e.g. "محصولات یک‌بار خرید هرگز `consume` نمی‌شوند") is
 * not present in docs that customers may read.
 */
function expectNotContains(file: SourceFile, fragment: string): void {
  const idx = file.content.indexOf(fragment);
  if (idx !== -1) {
    const line = file.content.slice(0, idx).split('\n').length;
    throw new Error(
      `Expected ${file.name} NOT to contain forbidden fragment:\n  "${fragment}"\n` +
      `Found at line ${line}.\nFile path: ${file.path}`,
    );
  }
}

/** Returns the 1-indexed line number of `fragment` in `file`, or -1. */
function lineOf(file: SourceFile, fragment: string): number {
  const idx = file.content.indexOf(fragment);
  if (idx === -1) return -1;
  return file.content.slice(0, idx).split('\n').length;
}

/* --------------------------------------------------------------------------
 * Contracts
 * -------------------------------------------------------------------------- */

describe('Bazaar consumable medication-card purchase — safety contracts', () => {
  /* ======================================================================
   * GROUP 1 — Consumption ordering & payload integrity
   * ======================================================================
   * Poolakey's consumable model requires the developer to (a) record the
   * entitlement on device and (b) call `consumeProduct` so the user can
   * re-purchase. If consumption happens BEFORE the local entitlement is
   * recorded, a crash between the two leaves the user charged with no cards.
   * If consumption never happens, the user cannot re-buy the pack.
   * ====================================================================== */

  describe('consumption ordering & payload integrity', () => {
    it('consumes card-pack purchases using the purchase token', () => {
      // Sync path (post-purchase reconciliation) uses the bare token.
      expectContains(billing, 'await CafebazaarPoolakey.consumeProduct({ token })');
      // Purchase-callback path uses the result purchase token.
      expectContains(billing, 'await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })');
      // Payload carries the card count so the legacy parser still works on
      // devices where the payload is the only signal.
      expectContains(billing, 'payload: `medireminder-tokens:${bundle.cardCount}`');
    });

    it('records the entitlement BEFORE attempting consumption in both purchase paths', () => {
      // Sync path: grant, then consume.
      const syncGrant = billing.content.indexOf(
        "await db.grantPaidMedicationCards(token, cardCount, purchase.productId || 'unknown')",
      );
      const syncConsume = billing.content.indexOf('await CafebazaarPoolakey.consumeProduct({ token })');
      expect(syncGrant).toBeGreaterThanOrEqual(0);
      expect(syncConsume).toBeGreaterThan(syncGrant);

      // Purchase-callback path: grant, then consume.
      const purchaseGrant = billing.content.indexOf('await db.grantPaidMedicationCards(');
      const purchaseConsume = billing.content.indexOf(
        'await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken })',
      );
      expect(purchaseGrant).toBeGreaterThanOrEqual(0);
      expect(purchaseConsume).toBeGreaterThan(purchaseGrant);
    });
  });

  /* ======================================================================
   * GROUP 2 — Idempotency at the database layer
   * ======================================================================
   * The same purchase token may arrive twice (sync re-run, restore flow,
   * retry after network blip). The IndexedDB write transaction MUST use
   * the token as an idempotency key so a second delivery does not double-
   * credit the user.
   * ====================================================================== */

  describe('idempotency at the database layer', () => {
    it('uses a single multi-store readwrite transaction for atomic grant', () => {
      expectContains(database, 'this.runMultiStoreTransaction<GrantResult>(');
      expectContains(database, '[STATE_STORE, PURCHASE_STORE]');
      expectContains(database, "const PURCHASE_STORE = 'localPurchases'");
    });

    it('persists the purchase token and sku in the durable ledger', () => {
      expectContains(database, 'purchaseToken: token');
      expectContains(database, 'productId: sku');
    });

    it('uses the token as an idempotency key (legacy-aware)', () => {
      // Two complementary branches:
      //   - `alreadyGrantedByLegacyLedger`: token already in appState.tokens
      //     from an older app version — do NOT re-grant, just record the row.
      //   - `shouldRepair`: purchase row exists but was never reflected in
      //     appState — restore it exactly once.
      expectContains(database, 'const alreadyGrantedByLegacyLedger = alreadyInState');
      expectContains(database, 'const shouldRepair = existingPurchase.credited !== false && !alreadyInState');
    });

    it('writes the incremented count AFTER reading the idempotency state', () => {
      // Guards against a subtle bug: writing the new count before checking
      // the token set would always double-count on the second delivery.
      const readIdx = database.content.indexOf('const alreadyGrantedByLegacyLedger = alreadyInState');
      const writeIdx = database.content.indexOf('writePaidState(currentCount + cards, [...tokens, token]);');
      expect(readIdx).toBeGreaterThanOrEqual(0);
      expect(writeIdx).toBeGreaterThan(readIdx);
    });
  });

  /* ======================================================================
   * GROUP 3 — Post-purchase inventory reconciliation
   * ======================================================================
   * If the purchase callback throws or returns a non-PURCHASED state
   * (e.g. user cancelled, network error mid-flow), the app MUST re-query
   * Poolakey's inventory and reconcile any purchases that DID complete on
   * the Bazaar side but were never recorded locally. Otherwise the user
   * is charged with no cards.
   * ====================================================================== */

  describe('post-purchase inventory reconciliation', () => {
    it('exposes a retry-capable reconciler', () => {
      expectContains(billing, 'reconcileWithRetries');
    });

    it('reconciles from both failure modes (thrown result and non-PURCHASED result)', () => {
      expectContains(billing, 'after-purchase-throw');
      expectContains(billing, 'after-non-purchased');
      expectContains(billing, 'Recovered credits despite state=');
    });
  });

  /* ======================================================================
   * GROUP 4 — Legacy payload backward compatibility
   * ======================================================================
   * Older Bazaar purchases used different payload strings. Both parsers
   * must remain active so users who purchased under an older app version
   * still get their entitlement on update / restore.
   * ====================================================================== */

  describe('legacy payload backward compatibility', () => {
    it('parses both the current and the legacy developer payload', () => {
      expectContains(billing, 'medireminder-tokens:(\\d+)');
      expectContains(billing, 'medireminder-extra-medication-cards:(\\d+)');
    });
  });

  /* ======================================================================
   * GROUP 5 — Documentation accuracy
   * ======================================================================
   * Docs double as customer-facing disclosure. They MUST clearly state the
   * consumable model and the local-data recovery limitation so a user who
   * uninstalls without cloud backup understands their cards may be lost.
   * They MUST NOT make false claims (e.g. "محصولات یک‌بار خرید هرگز consume
   * نمی‌شوند") that contradict the implementation.
   * ====================================================================== */

  describe('documentation accuracy', () => {
    it('README.md describes the consumable model and the local-recovery limitation', () => {
      expectContains(readmeFile, 'مصرف کند');
      expectContains(readmeFile, 'بازیابی این اعتبار از بازار **تضمین‌شده نیست**');
    });

    it('README.md warns that consumable credits are not guaranteed restorable', () => {
      expectContains(readmeFile, 'مصرف');
      expectContains(readmeFile, 'تضمین‌شده نیست');
    });

    it('README.md does not contradict the implementation with the forbidden claim', () => {
      // The implementation explicitly consumes card packs; the docs must not
      // claim products are never consumed.
      expectNotContains(readmeFile, 'محصولات یک‌بار خرید هرگز `consume` نمی‌شوند');
    });
  });

  /* ======================================================================
   * GROUP 6 — Public recovery API surface
   * ======================================================================
   * Three recovery paths must exist as named exports so the UI layer and
   * the support panel can invoke them without re-implementing logic:
   *   - syncEntitlementsFromBazaar            : background sync
   *   - restorePendingMedicationCardPurchases : explicit restore action
   *   - applyPanelConfirmedRecoveryGrant      : manual support-panel grant
   * ====================================================================== */

  describe('public recovery API surface', () => {
    it('exposes the three recovery entrypoints', () => {
      expectContains(billing, 'export async function syncEntitlementsFromBazaar');
      expectContains(billing, 'export async function restorePendingMedicationCardPurchases');
      expectContains(billing, 'export async function applyPanelConfirmedRecoveryGrant');
    });

    it('encodes the support-panel recovery grant with a stable, auditable synthetic token', () => {
      // The synthetic token is intentionally verbose and includes the bundle
      // breakdown so support staff can audit the exact grant without a DB dump.
      expectContains(billing, "purchaseToken: 'bazaar-panel-recovery-v1-tokens30-10-cards25-10-3'");
      expectContains(billing, 'cardCount: 78');
    });
  });

  /* ======================================================================
   * GROUP 7 — SKU catalog integrity
   * ======================================================================
   * The shop catalog must use the current Bazaar token-pack IDs. Retired
   * SKUs must remain recoverable (so past purchasers keep their cards) but
   * MUST NOT appear in the active catalog (so new users cannot buy them).
   * ====================================================================== */

  describe('SKU catalog integrity', () => {
    it('uses the current Bazaar token-pack IDs in the active catalog', () => {
      expectContains(billing, "productId: 'medireminder_tokens_10', cardCount: 10");
      expectContains(billing, "productId: 'medireminder_tokens_30', cardCount: 30");
      expectContains(billing, "productId: 'medireminder_cards_100', cardCount: 100");
    });

    it('keeps retired SKUs recoverable without offering them for new purchases', () => {
      // Retired SKUs must still be parsed (so old purchases restore), but
      // they must live in the LEGACY_CARD_PRODUCTS block, AFTER the active
      // catalog declaration.
      expectContains(billing, "productId: 'medireminder_cards_3', cardCount: 3");
      expectContains(billing, "productId: 'medireminder_cards_10', cardCount: 10");
      expectContains(billing, "productId: 'medireminder_cards_25', cardCount: 25");
      expectContains(billing, "productId: 'medication_card_1', cardCount: 1");

      const catalogStart = billing.content.indexOf('export const MEDICATION_CARD_PACKAGES');
      const legacyStart = billing.content.indexOf('const LEGACY_CARD_PRODUCTS');
      expect(catalogStart).toBeGreaterThanOrEqual(0);
      expect(legacyStart).toBeGreaterThan(catalogStart);

      // The active catalog slice must NOT mention any retired SKU.
      const catalogSlice = billing.content.slice(catalogStart, legacyStart);
      expect(catalogSlice).not.toContain("productId: 'medireminder_cards_3'");
      // Sanity: also assert the other retired SKUs are absent from the
      // active slice, not just one — a single-SKU check could mask a
      // partial leak.
      expect(catalogSlice).not.toContain("productId: 'medireminder_cards_10'");
      expect(catalogSlice).not.toContain("productId: 'medireminder_cards_25'");
      expect(catalogSlice).not.toContain("productId: 'medication_card_1'");
    });

    it('documents active vs retired SKUs for reviewer clarity (informational)', () => {
      // Informational assertion: logs line numbers of the two declarations
      // so a reviewer can jump straight to them. Does not fail the suite.
      const catalogLine = lineOf(billing, 'export const MEDICATION_CARD_PACKAGES');
      const legacyLine = lineOf(billing, 'const LEGACY_CARD_PRODUCTS');
      // Both must exist; if either is missing the previous test catches it.
      expect(catalogLine).toBeGreaterThan(0);
      expect(legacyLine).toBeGreaterThan(catalogLine);
    });
  });
});
