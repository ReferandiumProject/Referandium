import { PublicKey } from '@solana/web3.js'

export type CpmmCluster = 'mainnet' | 'devnet'

export interface CpmmProgramInfo {
  programId: PublicKey
  authority: PublicKey
  feeAccount: PublicKey
}

const PROGRAMS: Record<CpmmCluster, CpmmProgramInfo> = {
  mainnet: {
    programId: new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
    authority: new PublicKey('GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL'),
    feeAccount: new PublicKey('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8'),
  },
  devnet: {
    programId: new PublicKey('DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb'),
    authority: new PublicKey('CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq'),
    feeAccount: new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy'),
  },
}

export function getClusterFromUrl(url: string): CpmmCluster {
  if (url.includes('devnet')) return 'devnet'
  if (url.includes('mainnet')) return 'mainnet'
  throw new Error(`Cannot determine Solana cluster from RPC URL: ${url}`)
}

export function getCpmmProgramInfo(cluster: CpmmCluster): CpmmProgramInfo {
  return PROGRAMS[cluster]
}
