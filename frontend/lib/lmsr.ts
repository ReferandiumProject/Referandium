// Liquidity parameter b is fixed at 100 for all binary (YES/NO) markets at launch.
// This value may be tuned later based on real usage / observed market dynamics.
const B = 100;

/**
 * Return the instantaneous LMSR price of the requested option.
 *
 * price_YES = e^(qYes / b) / (e^(qYes / b) + e^(qNo / b))
 * price_NO  = e^(qNo  / b) / (e^(qYes / b) + e^(qNo / b))
 *
 * The two prices always sum to 1.0.
 */
export function getPrice(
  qYes: number,
  qNo: number,
  option: 'YES' | 'NO'
): number {
  const eYes = Math.exp(qYes / B);
  const eNo = Math.exp(qNo / B);
  const denominator = eYes + eNo;

  return option === 'YES' ? eYes / denominator : eNo / denominator;
}

/**
 * LMSR cost function C(q) = b * ln(e^(qYes / b) + e^(qNo / b)).
 */
export function getCost(qYes: number, qNo: number): number {
  const eYes = Math.exp(qYes / B);
  const eNo = Math.exp(qNo / B);
  return B * Math.log(eYes + eNo);
}

/**
 * USDC cost to buy `sharesToBuy` shares of the given option.
 * Computed as the difference in the LMSR cost function before and after
 * adding the shares to the outstanding quantity of that option.
 */
export function getBuyCost(
  qYes: number,
  qNo: number,
  option: 'YES' | 'NO',
  sharesToBuy: number
): number {
  if (sharesToBuy <= 0) return 0;

  const before = getCost(qYes, qNo);
  const after =
    option === 'YES'
      ? getCost(qYes + sharesToBuy, qNo)
      : getCost(qYes, qNo + sharesToBuy);

  return after - before;
}

/**
 * USDC proceeds from selling `sharesToSell` shares of the given option.
 * Computed as the reduction in the LMSR cost function when the outstanding
 * quantity of that option decreases by the sold amount.
 */
export function getSellProceeds(
  qYes: number,
  qNo: number,
  option: 'YES' | 'NO',
  sharesToSell: number
): number {
  if (sharesToSell <= 0) return 0;

  const before = getCost(qYes, qNo);
  const after =
    option === 'YES'
      ? getCost(qYes - sharesToSell, qNo)
      : getCost(qYes, qNo - sharesToSell);

  return before - after;
}

/**
 * Given a target USDC cost, returns the number of shares that costs
 * approximately that amount to buy.
 */
export function getSharesForBuyCost(
  qYes: number,
  qNo: number,
  option: 'YES' | 'NO',
  targetCost: number
): number {
  if (targetCost <= 0) return 0;

  const eYes = Math.exp(qYes / B);
  const eNo = Math.exp(qNo / B);
  const eOption = option === 'YES' ? eYes : eNo;
  const eOther = option === 'YES' ? eNo : eYes;

  return B * Math.log(
    (Math.exp(targetCost / B) * (eOption + eOther) - eOther) / eOption
  );
}

/**
 * Given a target USDC proceeds, returns the number of shares to sell to
 * receive approximately that amount.
 */
export function getSharesForSellProceeds(
  qYes: number,
  qNo: number,
  option: 'YES' | 'NO',
  targetProceeds: number
): number {
  if (targetProceeds <= 0) return 0;

  const eYes = Math.exp(qYes / B);
  const eNo = Math.exp(qNo / B);
  const eOption = option === 'YES' ? eYes : eNo;
  const eOther = option === 'YES' ? eNo : eYes;

  return B * Math.log(
    eOption / ((eOption + eOther) * Math.exp(-targetProceeds / B) - eOther)
  );
}

/**
 * Generalized instantaneous LMSR price for an arbitrary number of outcomes.
 *
 * price_i = e^(q_i / b) / Σ_j e^(q_j / b)
 */
export function getPriceMulti(quantities: number[], index: number): number {
  const exps = quantities.map((q) => Math.exp(q / B));
  const denominator = exps.reduce((sum, e) => sum + e, 0);
  return exps[index] / denominator;
}

/**
 * Generalized LMSR cost function C(q) = b * ln(Σ_j e^(q_j / b)).
 */
export function getCostMulti(quantities: number[]): number {
  let sum = 0;
  for (const q of quantities) {
    sum += Math.exp(q / B);
  }
  return B * Math.log(sum);
}

/**
 * USDC cost to buy `sharesToBuy` shares of outcome `index` in a multi-outcome market.
 */
export function getBuyCostMulti(
  quantities: number[],
  index: number,
  sharesToBuy: number
): number {
  if (sharesToBuy <= 0) return 0;

  const before = getCostMulti(quantities);
  const after = quantities.map((q, i) => (i === index ? q + sharesToBuy : q));

  return getCostMulti(after) - before;
}

/**
 * USDC proceeds from selling `sharesToSell` shares of outcome `index`.
 */
export function getSellProceedsMulti(
  quantities: number[],
  index: number,
  sharesToSell: number
): number {
  if (sharesToSell <= 0) return 0;

  const before = getCostMulti(quantities);
  const after = quantities.map((q, i) => (i === index ? q - sharesToSell : q));

  return before - getCostMulti(after);
}

/**
 * Given a target USDC cost, returns the number of shares that buys
 * approximately that amount for outcome `index` in a multi-outcome market.
 */
export function getSharesForBuyCostMulti(
  quantities: number[],
  index: number,
  targetCost: number
): number {
  if (targetCost <= 0) return 0;

  const exps = quantities.map((q) => Math.exp(q / B));
  const eOption = exps[index];
  const eOthers = exps.reduce((sum, e, i) => (i === index ? sum : sum + e), 0);

  return B * Math.log(
    (Math.exp(targetCost / B) * (eOption + eOthers) - eOthers) / eOption
  );
}

/**
 * Given a target USDC proceeds, returns the number of shares to sell to
 * receive approximately that amount for outcome `index`.
 */
export function getSharesForSellProceedsMulti(
  quantities: number[],
  index: number,
  targetProceeds: number
): number {
  if (targetProceeds <= 0) return 0;

  const exps = quantities.map((q) => Math.exp(q / B));
  const eOption = exps[index];
  const eOthers = exps.reduce((sum, e, i) => (i === index ? sum : sum + e), 0);

  return B * Math.log(
    eOption / ((eOption + eOthers) * Math.exp(-targetProceeds / B) - eOthers)
  );
}
