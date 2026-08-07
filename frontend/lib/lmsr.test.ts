import { describe, it, expect } from 'vitest'
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

function expectClose(actual: number, expected: number, label: string) {
  expect(actual, label).toBeCloseTo(expected, 9)
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

describe('lmsr', () => {
  it('round-trips binary buy and sell costs', () => {
    let passed = 0

    for (const [qYes, qNo] of qPairs) {
      for (const option of optionLabels) {
        for (const target of targets) {
          const shares = getSharesForBuyCost(qYes, qNo, option, target)
          const cost = getBuyCost(qYes, qNo, option, shares)
          expectClose(cost, target, `buy qYes=${qYes} qNo=${qNo} option=${option} target=${target}`)
          passed++
        }
      }
    }

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
          expectClose(proceeds, target, `sell qYes=${qYes} qNo=${qNo} option=${option} target=${target}`)
          passed++
        }
      }
    }

    expect(passed).toBeGreaterThan(0)
  })

  it('matches multi-outcome functions against binary functions and round-trips inverses', () => {
    let multiPassed = 0

    for (const [qYes, qNo] of qPairs) {
      expectClose(getPriceMulti([qYes, qNo], 0), getPrice(qYes, qNo, 'YES'), `price YES qYes=${qYes} qNo=${qNo}`)
      multiPassed++
      expectClose(getPriceMulti([qYes, qNo], 1), getPrice(qYes, qNo, 'NO'), `price NO qYes=${qYes} qNo=${qNo}`)
      multiPassed++
      expectClose(getCostMulti([qYes, qNo]), getCost(qYes, qNo), `cost qYes=${qYes} qNo=${qNo}`)
      multiPassed++

      for (const option of optionLabels) {
        for (const shares of [1, 5, 10, 50, 100]) {
          const idx = option === 'YES' ? 0 : 1
          expectClose(
            getBuyCostMulti([qYes, qNo], idx, shares),
            getBuyCost(qYes, qNo, option, shares),
            `buyCost ${option} qYes=${qYes} qNo=${qNo} shares=${shares}`
          )
          multiPassed++

          const maxShares = option === 'YES' ? qYes : qNo
          if (maxShares >= shares) {
            expectClose(
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
          expectClose(costMulti, target, `buy inverse ${option} qYes=${qYes} qNo=${qNo} target=${target}`)
          multiPassed++

          const maxShares = option === 'YES' ? qYes : qNo
          if (maxShares > 0) {
            const maxProceeds = getSellProceedsMulti([qYes, qNo], idx, maxShares)
            if (target <= maxProceeds) {
              const sharesSell = getSharesForSellProceedsMulti([qYes, qNo], idx, target)
              if (sharesSell <= maxShares) {
                const proceedsMulti = getSellProceedsMulti([qYes, qNo], idx, sharesSell)
                expectClose(proceedsMulti, target, `sell inverse ${option} qYes=${qYes} qNo=${qNo} target=${target}`)
                multiPassed++
              }
            }
          }
        }
      }
    }

    const triple = [10, 20, 30]
    const triplePrices = triple.map((_, i) => getPriceMulti(triple, i))
    expectClose(triplePrices.reduce((a, b) => a + b, 0), 1, '3-outcome prices sum to 1')
    multiPassed++

    const tripleCostBefore = getCostMulti(triple)
    const tripleCostAfterBuy0 = getCostMulti(triple.map((q, i) => (i === 0 ? q + 5 : q)))
    expectClose(
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
    expect(price0After).toBeGreaterThan(price0Before)
    expect(price1After).toBeLessThan(price1Before)
    multiPassed++

    const quad = [5, 15, 25, 35]
    for (let i = 0; i < quad.length; i++) {
      const shares = getSharesForBuyCostMulti(quad, i, 2)
      const cost = getBuyCostMulti(quad, i, shares)
      expectClose(cost, 2, `4-outcome round-trip buy index=${i}`)
      multiPassed++
    }

    expect(multiPassed).toBeGreaterThan(0)
  })
})
