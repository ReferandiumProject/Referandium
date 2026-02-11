# Referandium — Solana Smart Contract

Anchor-based Solana program for the Referandium Policy Prescription Market.

## Prerequisites

- [Rust](https://rustup.rs/)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (v1.18+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v0.30+)
- Node.js 18+

## Quick Start

```bash
# Install JS dependencies (for tests)
npm install

# Build the program
anchor build

# Run tests on localnet
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

## Program Instructions

| Instruction | Description |
|---|---|
| `initialize_vault` | One-time setup: creates the platform vault PDA |
| `create_market` | Creates a new policy prescription market |
| `vote` | Casts YES/NO vote with SOL deposit into escrow |
| `settle_market` | Resolves a market (admin only) |

## Architecture

```
programs/referandium/src/lib.rs
├── VaultAccount    — Platform-level state (authority, market count)
├── MarketAccount   — Per-market state (question, votes, pool, outcome)
├── VoteAccount     — Per-user-per-market vote record
├── VoteDirection   — Enum: Yes | No
└── MarketOutcome   — Enum: Pending | Yes | No
```

SOL deposits go into a per-market escrow PDA (`seeds = ["escrow", market_key]`), ensuring funds are isolated per market.
