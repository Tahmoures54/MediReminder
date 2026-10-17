import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  getProducts: vi.fn(),
  getPurchaseInfo: vi.fn(),
  purchaseProduct: vi.fn(),
  consumeProduct: vi.fn(),
  getPaidMedicationCardCount: vi.fn(),
  grantPaidMedicationCards: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@salarizadi/capacitor-cafebazaar-poolakey', () => ({
  CafebazaarPoolakey: {
    initialize: mocks.initialize,
    getProducts: mocks.getProducts,
    getPurchaseInfo: mocks.getPurchaseInfo,
    purchaseProduct: mocks.purchaseProduct,
    consumeProduct: mocks.consumeProduct,
  },
}));

vi.mock('../db/database', () => ({
  db: {
    getPaidMedicationCardCount: mocks.getPaidMedicationCardCount,
    grantPaidMedicationCards: mocks.grantPaidMedicationCards,
  },
}));

vi.mock('./diagnostics', () => ({ recordDiagnostic: vi.fn() }));

import { MEDICATION_CARD_PACKAGES, purchaseMedicationCards, restorePendingMedicationCardPurchases } from './bazaarBilling';

type OwnedPurchase = { purchaseToken: string; productId: string; payload: string };
let balance: number;
let owned: OwnedPurchase[];
let creditedTokens: Set<string>;
let purchaseSequence: number;
let grantShouldFail: boolean;

function purchased(token: string, productId = 'medireminder_tokens_10') {
  return {
    state: 'PURCHASED',
    purchase: { purchaseToken: token, productId, payload: 'medireminder-tokens:10' },
  };
}

describe('Bazaar consumable purchase behavior', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BAZAAR_RSA_PUBLIC_KEY', 'test-public-key');
    balance = 0;
    owned = [];
    creditedTokens = new Set();
    purchaseSequence = 0;
    grantShouldFail = false;

    mocks.initialize.mockReset().mockResolvedValue({ connected: true });
    mocks.getProducts.mockReset().mockResolvedValue({ products: [] });
    mocks.getPurchaseInfo.mockReset().mockImplementation(async () => ({ purchases: [...owned] }));
    mocks.purchaseProduct.mockReset().mockImplementation(async ({ productId, payload }: { productId: string; payload: string }) => {
      const token = `purchase-${++purchaseSequence}`;
      const item = { purchaseToken: token, productId, payload };
      owned.push(item);
      return { state: 'PURCHASED', purchase: item };
    });
    mocks.consumeProduct.mockReset().mockImplementation(async ({ token }: { token: string }) => {
      owned = owned.filter((purchase) => purchase.purchaseToken !== token);
      return {};
    });
    mocks.getPaidMedicationCardCount.mockReset().mockImplementation(async () => balance);
    mocks.grantPaidMedicationCards.mockReset().mockImplementation(async (token: string, count: number) => {
      if (grantShouldFail) throw new Error('IndexedDB write failed');
      if (creditedTokens.has(token)) return false;
      creditedTokens.add(token);
      balance += count;
      return true;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('exposes only the current token-pack SKUs and grants the exact purchased amount', async () => {
    expect(MEDICATION_CARD_PACKAGES.map((item) => [item.productId, item.cardCount])).toEqual([
      ['medireminder_tokens_10', 10],
      ['medireminder_tokens_30', 30],
      ['medireminder_cards_100', 100],
    ]);

    await purchaseMedicationCards('medireminder_tokens_10');

    expect(balance).toBe(10);
    expect(mocks.grantPaidMedicationCards).toHaveBeenCalledWith(
      'purchase-1',
      10,
      'medireminder_tokens_10',
    );
    expect(mocks.consumeProduct).toHaveBeenCalledWith({ token: 'purchase-1' });
    expect(owned).toHaveLength(0);
  });

  it('does not double-credit a repeated delivery of the same purchase token', async () => {
    mocks.purchaseProduct.mockResolvedValue(purchased('same-token'));
    await purchaseMedicationCards('medireminder_tokens_10');
    await purchaseMedicationCards('medireminder_tokens_10');

    expect(balance).toBe(10);
    expect(mocks.grantPaidMedicationCards).toHaveBeenCalledTimes(2);
    expect(mocks.consumeProduct).toHaveBeenCalledWith({ token: 'same-token' });
  });

  it('does not consume a purchase when local persistence fails, and restores it later', async () => {
    grantShouldFail = true;
    await expect(purchaseMedicationCards('medireminder_tokens_10')).rejects.toThrow('IndexedDB write failed');
    expect(mocks.consumeProduct).not.toHaveBeenCalled();
    expect(owned).toHaveLength(1);
    expect(balance).toBe(0);

    grantShouldFail = false;
    await restorePendingMedicationCardPurchases();

    expect(balance).toBe(10);
    expect(mocks.consumeProduct).toHaveBeenCalledWith({ token: 'purchase-1' });
    expect(owned).toHaveLength(0);
  });

  it('keeps the granted balance when consumeProduct fails and retries consumption during restore', async () => {
    mocks.consumeProduct.mockRejectedValueOnce(new Error('consume unavailable'));
    await purchaseMedicationCards('medireminder_tokens_10');

    expect(balance).toBe(10);
    expect(owned).toHaveLength(1);

    await restorePendingMedicationCardPurchases();

    expect(balance).toBe(10);
    expect(mocks.grantPaidMedicationCards).toHaveBeenCalledTimes(2);
    expect(mocks.consumeProduct).toHaveBeenCalledTimes(2);
    expect(owned).toHaveLength(0);
  });

  it('handles a user-cancelled checkout without granting credit or consuming anything', async () => {
    vi.useFakeTimers();
    mocks.purchaseProduct.mockResolvedValue({ state: 'CANCELLED' });

    const result = purchaseMedicationCards('medireminder_tokens_10');
    // Attach the rejection assertion before advancing timers so Vitest does not
    // report the expected cancellation as an unhandled rejection.
    const rejection = expect(result).rejects.toThrow('خرید را لغو کردید');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(balance).toBe(0);
    expect(mocks.grantPaidMedicationCards).not.toHaveBeenCalled();
    expect(mocks.consumeProduct).not.toHaveBeenCalled();
  });
});
