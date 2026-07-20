import {
  getPrice,
  getCost,
  getBuyCost,
  getSellProceeds,
  getSharesForBuyCost,
  getSharesForSellProceeds,
  getPriceMulti,
  getCostMulti,
  getBuyCostMulti,
  getSellProceedsMulti,
  getSharesForBuyCostMulti,
  getSharesForSellProceedsMulti,
} from './lmsr'

function assertClose(actual: number, expected: number, label: string) {
  const tolerance = 1e-9
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

const optionLabels: Array<'YES' | 'NO'> = ['YES', 'NO']
const qPairs: Array<[number, number]> = [
  [0, 0],
  [10, 0],
  [0, 10],
  [5, 5],
  [50, 30],
  [100, 100],
  [1000, 500],
]
const targets = [0.01, 0.1, 1, 5, 10, 50, 100, 500]

let passed = 0

// Round-trip buy: target cost -> shares -> getBuyCost should equal target.
for (const [qYes, qNo] of qPairs) {
  for (const option of optionLabels) {
    for (const target of targets) {
      const shares = getSharesForBuyCost(qYes, qNo, option, target)
      const cost = getBuyCost(qYes, qNo, option, shares)
      assertClose(cost, target, `buy qYes=${qYes} qNo=${qNo} option=${option} target=${target}`)
      passed++
    }
  }
}

// Round-trip sell: target proceeds -> shares -> getSellProceeds should equal target.
for (const [qYes, qNo] of qPairs) {
  for (const option of optionLabels) {
    for (const target of targets) {
      const maxShares = option === 'YES' ? qYes : qNo
      if (maxShares <= 0) continue
      const maxProceeds = getSellProceeds(qYes, qNo, option, maxShares)
      if (target > maxProceeds) continue

      const shares = getSharesForSellProceeds(qYes, qNo, option, target)
      if (shares > maxShares) continue

      const proceeds = getSellProceeds(qYes, qNo, option, shares)
      assertClose(proceeds, target, `sell qYes=${qYes} qNo=${qNo} option=${option} target=${target}`)
      passed++
    }
  }
}

console.log(`All ${passed} LMSR round-trip assertions passed.`)

// Regression: multi-outcome functions must match the binary functions exactly for 2 outcomes.
let multiPassed = 0

for (const [qYes, qNo] of qPairs) {
  assertClose(getPriceMulti([qYes, qNo], 0), getPrice(qYes, qNo, 'YES'), `price YES qYes=${qYes} qNo=${qNo}`)
  multiPassed++
  assertClose(getPriceMulti([qYes, qNo], 1), getPrice(qYes, qNo, 'NO'), `price NO qYes=${qYes} qNo=${qNo}`)
  multiPassed++
  assertClose(getCostMulti([qYes, qNo]), getCost(qYes, qNo), `cost qYes=${qYes} qNo=${qNo}`)
  multiPassed++

  for (const option of optionLabels) {
    for (const shares of [1, 5, 10, 50, 100]) {
      const idx = option === 'YES' ? 0 : 1
      assertClose(
        getBuyCostMulti([qYes, qNo], idx, shares),
        getBuyCost(qYes, qNo, option, shares),
        `buyCost ${option} qYes=${qYes} qNo=${qNo} shares=${shares}`
      )
      multiPassed++

      const maxShares = option === 'YES' ? qYes : qNo
      if (maxShares >= shares) {
        assertClose(
          getSellProceedsMulti([qYes, qNo], idx, shares),
          getSellProceeds(qYes, qNo, option, shares),
          `sellProceeds ${option} qYes=${qYes} qNo=${qNo} shares=${shares}`
        )
        multiPassed++
      }
    }
  }

  for (const option of optionLabels) {
    for (const target of targets) {
      const idx = option === 'YES' ? 0 : 1
      const sharesBuy = getSharesForBuyCostMulti([qYes, qNo], idx, target)
      const costMulti = getBuyCostMulti([qYes, qNo], idx, sharesBuy)
      assertClose(costMulti, target, `buy inverse ${option} qYes=${qYes} qNo=${qNo} target=${target}`)
      multiPassed++

      const maxShares = option === 'YES' ? qYes : qNo
      if (maxShares > 0) {
        const maxProceeds = getSellProceedsMulti([qYes, qNo], idx, maxShares)
        if (target <= maxProceeds) {
          const sharesSell = getSharesForSellProceedsMulti([qYes, qNo], idx, target)
          if (sharesSell <= maxShares) {
            const proceedsMulti = getSellProceedsMulti([qYes, qNo], idx, sharesSell)
            assertClose(proceedsMulti, target, `sell inverse ${option} qYes=${qYes} qNo=${qNo} target=${target}`)
            multiPassed++
          }
        }
      }
    }
  }
}

// 3+ outcome cases: prices sum to 1, buy cost consistency, and directional price moves.
const triple = [10, 20, 30]
const triplePrices = triple.map((_, i) => getPriceMulti(triple, i))
assertClose(triplePrices.reduce((a, b) => a + b, 0), 1, '3-outcome prices sum to 1')
multiPassed++

const tripleCostBefore = getCostMulti(triple)
const tripleCostAfterBuy0 = getCostMulti(triple.map((q, i) => (i === 0 ? q + 5 : q)))
assertClose(
  getBuyCostMulti(triple, 0, 5),
  tripleCostAfterBuy0 - tripleCostBefore,
  '3-outcome buy cost equals cost function delta'
)
multiPassed++

const price0Before = getPriceMulti(triple, 0)
const tripleAfterBuy = triple.map((q, i) => (i === 0 ? q + 10 : q))
const price0After = getPriceMulti(tripleAfterBuy, 0)
const price1After = getPriceMulti(tripleAfterBuy, 1)
const price1Before = getPriceMulti(triple, 1)
if (!(price0After > price0Before && price1After < price1Before)) {
  throw new Error('3-outcome buy did not raise target price and lower others')
}
multiPassed++

// 4-outcome round-trip buy cost inverse.
const quad = [5, 15, 25, 35]
for (let i = 0; i < quad.length; i++) {
  const shares = getSharesForBuyCostMulti(quad, i, 2)
  const cost = getBuyCostMulti(quad, i, shares)
  assertClose(cost, 2, `4-outcome round-trip buy index=${i}`)
  multiPassed++
}

console.log(`All ${multiPassed} multi-outcome assertions passed.`)
