import { Capacitor } from '@capacitor/core';
import { CafebazaarPoolakey } from '@salarizadi/capacitor-cafebazaar-poolakey';
import { db } from '../db/database';
import { recordDiagnostic } from './diagnostics';

/* ==========================================================================
 * Bazaar consumable medication-card billing
 *
 * SAFETY INVARIANTS (pinned by bazaarBilling.contracts.test.ts):
 *
 *   1. Entitlement is recorded in IndexedDB BEFORE `consumeProduct` is
 *      called, in BOTH the sync path and the purchase-callback path.
 *      Rationale: if consumption succeeds but the local grant never
 *      committed (crash, tab close, OOM), the user is charged with no
 *      cards. Order = grant → consume, never the reverse.
 *
 *   2. The purchase token is the idempotency key. `db.grantPaidMedicationCards`
 *      is the single transactional boundary that prevents double-crediting
 *      on duplicate delivery (sync re-run, restore, retry).
 *
 *   3. Post-purchase recovery (reconcileWithRetries) covers BOTH failure
 *      modes: thrown purchase result AND non-PURCHASED state. Either can
 *      still leave a real purchase on the Bazaar side that the client
 *      never recorded.
 *
 *   4. Retired SKUs remain parseable for restore but are NOT offered in
 *      the active catalog.
 *
 * All anchor strings asserted by the contract test are preserved verbatim
 * in the bodies below. Refactor with care — renaming a pinned identifier
 * will break the suite.
 * ========================================================================== */

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

export type MedicationCardProduct = {
  productId: string;
  cardCount: number;
  title: string;
  price: string;
};

/** Shape of an owned-purchase record returned by Poolakey's inventory. */
interface OwnedPurchase {
  purchaseToken?: string;
  productId?: string;
  payload?: string;
}

/** Shape of the purchase callback result. */
interface PurchaseResult {
  state?: string;
  purchase?: {
    purchaseToken?: string;
    productId?: string;
    payload?: string;
  };
}

/* --------------------------------------------------------------------------
 * Catalog
 * -------------------------------------------------------------------------- */

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

/**
 * One-time local grant for purchases already confirmed in the Cafe Bazaar
 * developer panel when client inventory is empty (consumed or activity-result
 * lost before grant).
 *
 * The synthetic token encodes the exact bundle breakdown so support staff
 * can audit the grant without a DB dump:
 *   - tokens30 → 30 cards (medireminder_tokens_30)
 *   - 10       → 10 cards (medireminder_cards_10)
 *   - cards25  → 25 cards (medireminder_cards_25)
 *   - 10       → 10 cards (medireminder_tokens_10)
 *   - 3        →  3 cards (medireminder_cards_3)
 *   Total: 30 + 10 + 25 + 10 + 3 = 78 cards
 *
 * Idempotent by purchaseToken — repeated calls do not double-grant.
 */
export const PANEL_CONFIRMED_RECOVERY = {
  purchaseToken: 'bazaar-panel-recovery-v1-tokens30-10-cards25-10-3',
  cardCount: 78,
  productId: 'panel-confirmed-recovery',
  label: 'بازیابی خریدهای تأییدشده پنل بازار (۷۸ کارت)',
} as const;

/* --------------------------------------------------------------------------
 * Constants
 * -------------------------------------------------------------------------- */

const RECONCILE_DEFAULT_ATTEMPTS = 4;
const RECONCILE_DEFAULT_DELAY_MS = 900;
const RECONCILE_AFTER_THROW_ATTEMPTS = 5;
const RECONCILE_AFTER_THROW_DELAY_MS = 1000;
const RECONCILE_BLOCKED_ATTEMPTS = 3;
const RECONCILE_BLOCKED_DELAY_MS = 700;
const RECONCILE_MANUAL_ATTEMPTS = 3;
const RECONCILE_MANUAL_DELAY_MS = 600;

const PAYMENT_NOT_AVAILABLE_MESSAGE =
  'پرداخت کارت دارو فقط در نسخه اندروید نصب‌شده از کافه‌بازار فعال است.';
const MISSING_PUBLIC_KEY_MESSAGE =
  'کلید عمومی پرداخت بازار در بیلد تنظیم نشده است. مقدار BAZAAR_RSA_PUBLIC_KEY را در Secrets مخزن GitHub اضافه کنید.';
const BAZAAR_CONNECT_FAILED_MESSAGE = 'اتصال به سرویس پرداخت کافه‌بازار برقرار نشد.';

/* --------------------------------------------------------------------------
 * Connection state
 *
 * Encapsulated in a small class so it can be reset on error (a stuck
 * `connected=true` flag after a service disconnect would make every
 * subsequent call fail). The class is a singleton via `bazaarConnection`.
 * -------------------------------------------------------------------------- */

class BazaarConnection {
  private connected = false;

  /** Returns true if a previous `initialize()` succeeded and was not reset. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Marks the connection as established. */
  markConnected(): void {
    this.connected = true;
  }

  /** Marks the connection as lost so the next call re-initializes. */
  reset(): void {
    this.connected = false;
  }
}

const bazaarConnection = new BazaarConnection();

/* --------------------------------------------------------------------------
 * Pure helpers
 * -------------------------------------------------------------------------- */

function publicKey(): string {
  return (import.meta.env.VITE_BAZAAR_RSA_PUBLIC_KEY || '').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Parses the developer payload attached to a Bazaar purchase and returns
 * the card count it encodes. Three payload formats are accepted for
 * backward compatibility:
 *
 *   - `medireminder-tokens:<n>`             (current — token-pack SKUs)
 *   - `medireminder-extra-medication-cards:<n>` (legacy — extra-cards SKU)
 *   - `medireminder-cards:<n>`              (legacy — original card SKUs)
 *
 * Returns 0 if the payload is absent or matches none of the patterns.
 */
function cardsFromPayload(payload: unknown): number {
  const text = String(payload || '').trim();
  const match =
    /^medireminder-tokens:(\d+)$/.exec(text) ||
    /^medireminder-extra-medication-cards:(\d+)$/.exec(text) ||
    /^medireminder-cards:(\d+)$/.exec(text);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Builds a productId → cardCount lookup covering active + legacy SKUs. */
function productCardMap(): Map<string, number> {
  return new Map<string, number>([
    ...MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount] as const),
    ...LEGACY_CARD_PRODUCTS.map((item) => [item.productId, item.cardCount] as const),
  ]);
}

/* --------------------------------------------------------------------------
 * Connection management
 * -------------------------------------------------------------------------- */

/**
 * Initializes the Cafe Bazaar in-app billing service. Idempotent — a
 * repeated call after a successful init is a no-op. Resets the connection
 * flag on failure so the next call retries from scratch.
 */
async function connectToBazaar(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error(PAYMENT_NOT_AVAILABLE_MESSAGE);
  }
  const key = publicKey();
  if (!key) {
    throw new Error(MISSING_PUBLIC_KEY_MESSAGE);
  }
  if (bazaarConnection.isConnected()) return;

  recordDiagnostic('payment', 'Initializing Cafe Bazaar connection.');
  try {
    const result = await CafebazaarPoolakey.initialize({ rsaPublicKey: key });
    recordDiagnostic('payment', `Cafe Bazaar initialize connected=${Boolean(result.connected)}`);
    if (!result.connected) throw new Error(BAZAAR_CONNECT_FAILED_MESSAGE);
    bazaarConnection.markConnected();
  } catch (error) {
    // Reset so the next call attempts a fresh initialize instead of
    // short-circuiting on a stale `connected=true` after a service blip.
    bazaarConnection.reset();
    throw error;
  }
}

/* --------------------------------------------------------------------------
 * Product catalog
 * -------------------------------------------------------------------------- */

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

  recordDiagnostic(
    'payment',
    `Product list received count=${products.length}/${MEDICATION_CARD_PACKAGES.length}`,
  );
  if (products.length !== MEDICATION_CARD_PACKAGES.length) {
    const found = new Set(products.map((item) => item.productId));
    const missing = MEDICATION_CARD_PACKAGES.filter((item) => !found.has(item.productId));
    throw new Error(
      `این محصولات در بازار قابل دریافت نیستند: ${missing.map((item) => item.productId).join('، ')}. وضعیت فعال‌بودن شناسه‌ها را در پنل بازار بررسی کنید.`,
    );
  }
  return products;
}

/* --------------------------------------------------------------------------
 * Grant + consume (sync path)
 * -------------------------------------------------------------------------- */

/**
 * Resolves the card count for an owned purchase. Preference order:
 *   1. Known product-id → catalog cardCount (durable against payload loss).
 *   2. Developer payload → parsed count (fallback for dynamic bundles).
 *
 * Returns 0 if neither source yields a positive integer.
 */
function resolveCardCount(purchase: OwnedPurchase, payloadCount: number): number {
  const cardCounts = productCardMap();
  return cardCounts.get(String(purchase.productId || '')) || payloadCount;
}

/**
 * Grants the entitlement for an owned purchase, then attempts consumption.
 * The grant is recorded BEFORE consumption so a crash between the two does
 * not lose the user's cards. Consumption failure is non-fatal — the next
 * sync will retry, and the purchase remains "owned" on the Bazaar side
 * until consumption succeeds.
 *
 * @returns the number of cards granted (0 if the product was unrecognized).
 */
async function grantOwnedPurchase(purchase: OwnedPurchase): Promise<number> {
  const token = String(purchase.purchaseToken || '').trim();
  if (!token) return 0;

  const payloadCount = cardsFromPayload(purchase.payload);
  const cardCount = resolveCardCount(purchase, payloadCount);
  recordDiagnostic(
    'payment',
    `Owned purchase SKU=${purchase.productId || 'empty'} payloadCards=${payloadCount} mappedCards=${cardCount}`,
  );

  if (!cardCount) {
    console.warn('[BazaarBilling] ignoring unrecognized owned product:', {
      productId: purchase.productId,
      hasPayload: Boolean(purchase.payload),
      hasPurchaseToken: Boolean(purchase.purchaseToken),
    });
    return 0;
  }

  const before = await db.getPaidMedicationCardCount();
  await db.grantPaidMedicationCards(token, cardCount, purchase.productId || 'unknown');
  const after = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Reconciled SKU=${purchase.productId}; credits before=${before}; after=${after}; expected grant=${cardCount}`,
  );

  try {
    await CafebazaarPoolakey.consumeProduct({ token });
    recordDiagnostic('payment', `Consumed Bazaar purchase SKU=${purchase.productId}`);
  } catch (error) {
    // Grant already committed locally. Consumption can be retried by the
    // next sync; the purchase stays "owned" on Bazaar until then.
    recordDiagnostic('payment', `Consume failed SKU=${purchase.productId}; will retry later: ${error}`);
    console.warn('[BazaarBilling] purchase granted but consumption needs retry:', error);
  }

  return cardCount;
}

/* --------------------------------------------------------------------------
 * Sync (reconciliation)
 * -------------------------------------------------------------------------- */

/**
 * Reconciles the local credit balance with Bazaar's owned-purchase list.
 * Every owned purchase is granted (idempotently) and then consumed so the
 * user can re-buy the same pack.
 *
 * @returns `max(bestOwnedGrant, localCredits)` — never lower than what the
 *          user already has locally, even if Bazaar returns nothing.
 */
export async function syncEntitlementsFromBazaar(): Promise<number> {
  recordDiagnostic('payment', 'Starting Bazaar purchase reconciliation.');
  await connectToBazaar();
  const result = await CafebazaarPoolakey.getPurchaseInfo();
  recordDiagnostic('payment', `Bazaar purchase inventory count=${result.purchases.length}`);

  let bestFromOwned = 0;
  for (const purchase of result.purchases) {
    const granted = await grantOwnedPurchase(purchase);
    bestFromOwned = Math.max(bestFromOwned, granted);
  }

  const localCount = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Reconciliation complete; ownedBest=${bestFromOwned}; localCredits=${localCount}`,
  );
  return Math.max(bestFromOwned, localCount);
}

/**
 * Polls Bazaar a few times after checkout. The activity result can arrive
 * late or be dropped entirely by the Android activity stack; retrying the
 * sync surfaces purchases that completed on the Bazaar side but never
 * triggered the purchase callback.
 *
 * Errors inside `syncEntitlementsFromBazaar` are swallowed per-attempt so
 * a single network blip does not abort the whole retry sequence.
 *
 * @returns the final local credit count after the last attempt.
 */
async function reconcileWithRetries(
  label: string,
  attempts = RECONCILE_DEFAULT_ATTEMPTS,
  delayMs = RECONCILE_DEFAULT_DELAY_MS,
): Promise<number> {
  let last = await db.getPaidMedicationCardCount();
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    recordDiagnostic('payment', `${label} retry ${i + 1}/${attempts}`);
    try {
      await syncEntitlementsFromBazaar();
    } catch (error) {
      recordDiagnostic('payment', `${label} retry failed: ${error}`);
    }
    last = await db.getPaidMedicationCardCount();
  }
  return last;
}

/* --------------------------------------------------------------------------
 * Purchase flow
 * -------------------------------------------------------------------------- */

/**
 * Pre-purchase guard: if the user already owns an unconsumed unit of the
 * same SKU, blocks the new purchase and tries to deliver the existing one
 * via `reconcileWithRetries`. This prevents double-charging when a previous
 * purchase's activity result was lost.
 *
 * @returns `true` if the caller should proceed to checkout; `false` if the
 *          pending purchase was successfully delivered (no new charge needed).
 * @throws  if the pending purchase cannot be delivered after retries.
 */
async function preCheckOwnership(
  bundle: (typeof MEDICATION_CARD_PACKAGES)[number],
  countBefore: number,
): Promise<boolean> {
  await syncEntitlementsFromBazaar();
  const owned = await CafebazaarPoolakey.getPurchaseInfo();
  const stillOwned = owned.purchases.some((p) => p.productId === bundle.productId);
  if (!stillOwned) return true;

  recordDiagnostic('payment', `Purchase blocked: previous unconsumed SKU=${bundle.productId}`);
  await reconcileWithRetries('blocked-sku-delivery', RECONCILE_BLOCKED_ATTEMPTS, RECONCILE_BLOCKED_DELAY_MS);
  const afterBlock = await db.getPaidMedicationCardCount();
  if (afterBlock > countBefore) return false;

  throw new Error(
    'ظرفیت خرید قبلی ثبت شده، اما اعلام تحویل به کافه‌بازار کامل نشده است. اتصال اینترنت را بررسی کنید و کمی بعد دوباره تلاش کنید؛ فعلاً هزینه دیگری پرداخت نکنید.',
  );
}

/**
 * Initiates a card-pack purchase. The flow is:
 *
 *   1. Connect + pre-check ownership (block if a previous unit is pending).
 *   2. Open Bazaar checkout with a payload encoding the card count.
 *   3a. On PURCHASED: grant locally, then consume. Grant BEFORE consume so
 *       a crash between the two never loses the user's cards.
 *   3b. On thrown result: poll inventory; if a real purchase landed,
 *       consider it delivered.
 *   3c. On non-PURCHASED state: same poll as 3b — the Bazaar side may
 *       still have completed the purchase despite the state.
 *
 * NOTE: the grant + consume block is intentionally inline (not extracted
 * into a helper) because the contract test pins the exact anchor string
 * `result.purchase.purchaseToken` at the consume call site. Extracting it
 * would require renaming the variable and break the suite.
 *
 * @throws on user-visible failure (cancelled, mismatched SKU, unrecoverable).
 */
export async function purchaseMedicationCards(productId: string): Promise<void> {
  recordDiagnostic('payment', `Purchase flow started SKU=${productId}`);
  await connectToBazaar();
  const bundle = MEDICATION_CARD_PACKAGES.find((item) => item.productId === productId);
  if (!bundle) throw new Error('بسته انتخاب‌شده معتبر نیست.');

  const countBefore = await db.getPaidMedicationCardCount();

  // Pre-check: if an unconsumed unit of the same SKU is already owned,
  // deliver it instead of charging the user again.
  const shouldProceed = await preCheckOwnership(bundle, countBefore);
  if (!shouldProceed) return;

  recordDiagnostic('payment', `Opening Bazaar checkout SKU=${bundle.productId}; expected cards=${bundle.cardCount}`);

  // Issue the purchase. The payload survives in the Bazaar record so the
  // card count can be recovered even if the SKU mapping is later lost.
  let result: PurchaseResult;
  try {
    result = await CafebazaarPoolakey.purchaseProduct({
      productId: bundle.productId,
      payload: `medireminder-tokens:${bundle.cardCount}`,
    });
  } catch (error) {
    recordDiagnostic('payment', `purchaseProduct threw: ${error}`);
    const recovered = await reconcileWithRetries('after-purchase-throw', RECONCILE_AFTER_THROW_ATTEMPTS, RECONCILE_AFTER_THROW_DELAY_MS);
    if (recovered > countBefore) {
      recordDiagnostic('payment', `Recovered credits after purchase throw; before=${countBefore}; after=${recovered}`);
      return;
    }
    throw error instanceof Error ? error : new Error(String(error || 'خرید ناموفق بود.'));
  }

  recordDiagnostic(
    'payment',
    `Bazaar checkout result state=${result.state}; purchaseReturned=${Boolean(result.purchase)}; sku=${result.purchase?.productId || 'empty'}; hasToken=${Boolean(result.purchase?.purchaseToken)}`,
  );

  if (result.state === 'PURCHASED' && result.purchase?.purchaseToken) {
    // SKU sanity check — a mismatched productId would indicate a Bazaar-side
    // routing bug and must surface as an error, not a silent grant.
    if (result.purchase.productId && result.purchase.productId !== bundle.productId) {
      throw new Error('شناسه محصول خریداری‌شده با بسته انتخاب‌شده مطابقت ندارد.');
    }
    const before = await db.getPaidMedicationCardCount();
    recordDiagnostic(
      'payment',
      `Persisting confirmed purchase SKU=${bundle.productId}; cards before=${before}; grant=${bundle.cardCount}`,
    );
    // Grant BEFORE consume — see invariant #1 in the file header.
    await db.grantPaidMedicationCards(
      result.purchase.purchaseToken,
      bundle.cardCount,
      result.purchase.productId || bundle.productId,
    );
    const after = await db.getPaidMedicationCardCount();
    recordDiagnostic('payment', `Local grant complete SKU=${bundle.productId}; cards before=${before}; after=${after}`);

    try {
      await CafebazaarPoolakey.consumeProduct({ token: result.purchase.purchaseToken });
      recordDiagnostic('payment', `Purchase consumed successfully SKU=${bundle.productId}`);
    } catch (error) {
      // Grant already committed locally. Consumption can be retried by the
      // next sync; the purchase stays "owned" on Bazaar until then.
      recordDiagnostic('payment', `Consume deferred SKU=${bundle.productId}: ${error}`);
      console.warn('[BazaarBilling] purchase granted; consumption will be retried later:', error);
    }
    return;
  }

  recordDiagnostic('payment', `Non-PURCHASED state=${result.state}; starting inventory recovery`);
  const recovered = await reconcileWithRetries('after-non-purchased', RECONCILE_AFTER_THROW_ATTEMPTS, RECONCILE_AFTER_THROW_DELAY_MS);
  if (recovered > countBefore) {
    recordDiagnostic('payment', `Recovered credits despite state=${result.state}; before=${countBefore}; after=${recovered}`);
    return;
  }

  throw new Error(
    result.state === 'CANCELLED'
      ? 'خرید را لغو کردید؛ اگر مبلغی کسر شده با «بازیابی خرید قبلی» یا پشتیبانی اقدام کنید و دوباره پرداخت نکنید.'
      : 'بازار خرید را تأیید نکرد؛ اگر مبلغی کسر شده دوباره پرداخت نکنید و بازیابی را امتحان کنید.',
  );
}

/* --------------------------------------------------------------------------
 * Restore + panel recovery
 * -------------------------------------------------------------------------- */

/**
 * Manual / startup restore. Polls Bazaar a few times to surface any
 * purchases whose activity result was lost. The optional `onlyProductId`
 * parameter is accepted for future per-SKU restore but currently unused —
 * the restore flow always reconciles the full inventory.
 */
export async function restorePendingMedicationCardPurchases(_onlyProductId?: string): Promise<number> {
  recordDiagnostic('payment', 'Manual/startup restore requested.');
  return reconcileWithRetries('manual-restore', RECONCILE_MANUAL_ATTEMPTS, RECONCILE_MANUAL_DELAY_MS);
}

/**
 * One-time local grant for purchases already confirmed in the Cafe Bazaar
 * developer panel when client inventory is empty (consumed or activity-result
 * lost before grant). Idempotent by fixed purchaseToken — repeated calls
 * report `granted: false` without re-crediting.
 */
export async function applyPanelConfirmedRecoveryGrant(): Promise<{ granted: boolean; totalCredits: number }> {
  const before = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Panel recovery requested; localCredits=${before}; grant=${PANEL_CONFIRMED_RECOVERY.cardCount}`,
  );
  const didGrant = await db.grantPaidMedicationCards(
    PANEL_CONFIRMED_RECOVERY.purchaseToken,
    PANEL_CONFIRMED_RECOVERY.cardCount,
    PANEL_CONFIRMED_RECOVERY.productId,
  );
  const after = await db.getPaidMedicationCardCount();
  recordDiagnostic(
    'payment',
    `Panel recovery done; granted=${didGrant}; credits before=${before}; after=${after}`,
  );
  return { granted: didGrant, totalCredits: after };
}
