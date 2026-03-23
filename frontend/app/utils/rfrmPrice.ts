const DEXSCREENER_PAIR_URL =
  'https://api.dexscreener.com/latest/dex/pairs/solana/HffSGZkQXShU7iFJE8wvqRVM3R7RogiLgR5geepUFHHd';

export async function getRFRMPrice(): Promise<number> {
  try {
    const res = await fetch(DEXSCREENER_PAIR_URL);
    if (!res.ok) throw new Error(`DexScreener API error: ${res.status}`);
    const data = await res.json();
    const priceUsd = parseFloat(data?.pair?.priceUsd ?? '0');
    if (priceUsd <= 0) throw new Error('Invalid RFRM price');
    return priceUsd;
  } catch (err) {
    console.error('Failed to fetch RFRM price:', err);
    throw err;
  }
}

export function calculateRFRMForUSD(usdAmount: number, rfrmPrice: number): number {
  if (rfrmPrice <= 0) return 0;
  return usdAmount / rfrmPrice;
}
