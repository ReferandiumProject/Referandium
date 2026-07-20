import { getBuyCost, getSellProceeds, getSharesForBuyCost, getSharesForSellProceeds } from './lmsr'

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
