# Phase 3 — Graduation Design

> **Status:** Design. Schema and snapshot built; nothing on-chain yet. Written 2026-08-27.
> Read `STARTUP_SENTIMENT_V2_SPEC.md` §6 first — that holds the product decisions. This document is how to execute them without losing money or leaving a graduation half-finished.

---

## 1. The problem this document exists to solve

Graduation cannot be atomic. It spans an off-chain ledger and several independent on-chain operations, and **none of them can join the database transaction.**

pump.fun has no equivalent problem: its migration is one on-chain transaction. Ours is not, so these states are all reachable and every one will eventually occur:

- minted, no liquidity
- liquidity created, founder never paid
- founder paid twice, because a retry could not tell

**The first decision is therefore not code, it is a state machine.** Every step tracked, individually retryable, nothing assumed to have completed. The precedent is the `deposits` table's `detected → sweeping → swept → credited`, and the reason `sweeping` exists applies at every step here: an operation submitted with an unknown outcome must be distinguishable from one never started, or the retry does it twice.

That distinction has already cost real money. On 2026-08-20 the withdrawal path recorded **eight debits against five on-chain transfers**, because nothing tied a ledger row to a specific chain event.

---

## 2. The concrete case: `designr`

A real graduated startup in the database, deliberately preserved as the Phase 3 fixture.

| | |
|---|---|
| Capital target | 50.000000 USDC |
| **Real pool** | **53.649884 USDC** |
| Tokens sold to holders | **78,149,999.495993** |
| Tokens unsold → LP | **21,850,000.504006** |
| Truncation dust → LP | **0.000001** |
| Total supply | **100,000,000.000000** |
| Holders | **1** |

**The split is computed from the actual pool, never the target.** Buys are discrete so the pool overshoots — 53.65 against a 50 target. Splitting on the target would strand the difference with nothing able to claim it.

| | |
|---|---|
| Founder (1/3) | 17.883294 |
| Liquidity (2/3) | 35.766590 |

`founder = TRUNC(pool / 3, 6)`, `liquidity = pool − founder`. Deriving the second from the first makes them sum exactly; computing both independently would leave dust unassigned. The remainder goes to liquidity, which is burned and permanent, rather than to a party who could withdraw it.

⚠️ **One holder holds the entire float**, and the first mainnet graduation will look like this too. A token whose whole circulating supply sits at one address is one sell away from zero. Worth knowing when choosing which startup goes first.

---

## 3. Decisions taken 2026-08-27

**The founder receives no token allocation.** pump.fun's model: they get tokens by *buying*, using the first-buyer right they already have at listing, and their holding is treated like anyone else's. An allocation carved out of the unsold portion was priced and rejected — on `designr`'s numbers a 5% founder share would let one address extract 23% of the liquidity and halve the price again, on top of the ~49% drop already baked in.

⚠️ The founder's first-buy lockup **ends at graduation by construction**. It is an off-chain rule and nothing on-chain enforces it once tokens leave. Making it survive would need on-chain vesting, which was explicitly not wanted.

**Graduation triggers automatically** at threshold, with no manual step. That makes the preconditions in §12 mandatory rather than advisory: anything that would strand it halfway must stop it before it starts.

**Token name and symbol come from the founder at listing**, validated and unique across live startups — two tokens sharing a ticker is an impersonation vector nothing on-chain will prevent. An admin may correct it at graduation, because it cannot be changed once written.

**Holders claim; the platform does not distribute.** See §5.

**Tokens are delivered to the holder's Privy embedded wallet.** Every user has one and its address is already stored server-side, so nobody is excluded for lacking a wallet — which matters because the platform is deliberately built for people who do not have one.

---

## 4. Token parameters

| | Decision | Why |
|---|---|---|
| Supply | 100,000,000 | Equals `v_s`; the curve's arithmetic already assumes it |
| **Decimals** | **6** | Matches USDC and the pump.fun convention. 10¹⁴ base units, far inside `u64` |
| **Freeze authority** | **null at creation** | A freezable token lets the issuer freeze anyone's balance. Serious holders check this. Not negotiable |
| **Mint authority** | held, then revoked | Revoking is what makes the supply credible |
| Metadata | Metaplex: name, symbol, URI | Without it the token is an unnamed mint in every wallet |

### The 18 → 6 decimal problem

Off-chain holdings are `numeric(40,18)`; on-chain tokens have 6. Every balance is truncated, and the truncation is not free.

Measured on `designr`: 78,149,999.495993321707579287 becomes 78,149,999.495993, losing 0.000000321707579287.

**Rule: truncate each holder DOWN, assign the accumulated remainder to the LP.** Rounding up would mint more than the supply, which is worse than any rounding loss — the total must be exactly 100,000,000. The remainder is recorded as `dust_to_lp`, not discarded.

⚠️ **A holder truncating to exactly zero gets nothing and no token account.** Creating one costs ~0.002 SOL to deliver nothing. Recorded as `dust_zero` with the original amount — visible, explained, never silently dropped.

---

## 5. Claim, not distribution

**Graduation does not send tokens to anyone.** The holder allocation is minted into an escrow account, and each holder claims when they choose.

### Why

**The user has to come to the app either way.** An embedded wallet is not a browser extension — it cannot connect to Raydium. Whatever a holder wants to do with their tokens, they do it through us. So pushing tokens to them buys no convenience: their journey is identical, minus one button.

What pushing does buy is **paying ~0.002 SOL of account rent for every holder who never comes back.** At 500 holders that is ~1 SOL per graduation regardless of interest.

**And it removes the most dangerous part of the design.** Pushing means hundreds of transfers, batched across dozens of transactions, any of which can fail halfway — the batching, partial-failure and resume machinery existed entirely to survive that. Claiming reduces graduation to about five transactions, and a failed claim affects one person who simply retries, rather than everyone.

### The honest cost

Unclaimed tokens sit in a platform-controlled account, so an observer sees most of the supply held by us, and the circulating figure is ambiguous until claimed.

⚠️ **But note that pushing has the same property in substance.** Tokens in embedded wallets can only move through our app either way. Claiming makes the custody visible rather than creating it. That is a reason to be careful with how it is presented, not a reason to prefer the illusion.

### Rules

- **Claims never expire.** No deadline, no forfeiture, no sweeping unclaimed tokens back. The tokens belong to the holder; they take them whenever they want. A time limit would create a "you did not come, so we kept it" outcome that is both wrong and indefensible.
- **The escrow is a dedicated account, not the platform's general wallet** — same trust, far better blast radius and legibility.
- **The claim ledger is published**: who is owed what, and what has been claimed. If the platform visibly holds most of the supply, the offsetting fact must be equally visible.
- **The platform pays the claim's gas and the recipient's account rent.** The user has no SOL, by design.

---

## 6. The snapshot

**Before any on-chain action, freeze the holder list and amounts into an immutable table.** Everything downstream reads the snapshot, never live holdings.

Recomputing per attempt would let a retry produce different amounts than the first, with nothing afterwards able to establish which figures were used. The snapshot is also the audit record: when someone asks in six months why an address is owed a particular number of tokens, the answer must be a row.

**Trading is already frozen at this point**, and this was verified rather than assumed — both `buy_curve_tokens` and `sell_curve_tokens` were called against `designr` and both refused with *"This startup is not raising capital"*. An admin freeze is a separate condition and halts the graduation on its own.

**Built and verified.** Reading back stored columns rather than the function's own arithmetic:

```
pool    53.649884 = founder 17.883294 + liquidity 35.766590
tokens  78,149,999.495993 + 21,850,000.504006 + 0.000001 = 100,000,000.000000
```

🐛 It was wrong twice before this, and both were caught here rather than on-chain. It required `curves.frozen_at`, which is the *admin* freeze rather than graduation, and it reconciled at the precision values were **computed** in rather than **stored** in — on `designr` the rounding happened to land, and on another distribution it would not have.

---

## 7. Order of operations

1. **Snapshot** — off-chain, reversible, first
2. **Create the mint** — 100,000,000, no freeze authority
3. **Create metadata**
4. **Move the LP allocation into the pool** (tokens_to_lp + dust, with 2/3 of the USDC)
5. **Burn the LP tokens**
6. **Pay the founder** — 1/3 of the pool
7. **Revoke mint authority**

The holder allocation stays in escrow throughout and is never part of this sequence. Claims happen independently, afterwards, one at a time.

**Why the founder is paid last.** It is the only irreversible outflow of USDC to a party outside the system. Everything before it is reversible or recoverable; once paid, the money is gone.

**Why revocation is last.** Revoking earlier would make a mint retry impossible if anything still needs issuing.

---

## 8. The state machine

| State | Meaning | Next |
|---|---|---|
| `pending` | Graduated, nothing started | `snapshotted` |
| `snapshotted` | Holder list and split frozen | `minting` |
| `minting` | Mint submitted, outcome unknown | `minted` / `halted` |
| `minted` | Mint exists, holder allocation in escrow | `pooling` |
| `pooling` | Pool creation submitted | `pooled` / `halted` |
| `pooled` | Liquidity exists | `burning` |
| `burning` | LP burn submitted | `burned` / `halted` |
| `burned` | Liquidity permanent | `paying_founder` |
| `paying_founder` | Payout submitted | `founder_paid` / `halted` |
| `founder_paid` | Founder has their third | `revoking` |
| `revoking` | Revocation submitted | `complete` / `halted` |
| `complete` | **Terminal success** | — |
| `halted` | **Needs a human. Never advances on its own** | manual |

Per holder: `claimable → claiming → claimed`, plus `failed` and `dust_zero`.

Every `-ing` state means *submitted, outcome unknown*. That is what makes retries safe.

---

## 9. Recovery rules

**Nothing resumes without first reading the chain.**

| State | Question to the chain |
|---|---|
| `minting` | Does the mint exist with the expected supply? |
| `pooling` | Does the pool exist? |
| `burning` | Is the LP supply zero? |
| `paying_founder` | Did the transfer land? |
| `revoking` | Is the mint authority null? |
| `claiming` | Does the holder's account hold the expected amount? |

This is exactly the rule the withdrawal path violated: `finalize_withdrawal` sat outside the try block, so a failure left the row pending with the balance already debited and nothing retrying — money moved, ledger silent.

⚠️ **A step whose outcome cannot be determined moves to `halted`, never retried.** Retrying an unknown is how funds get sent twice. `halted` means a human looks, and it is the correct answer when the honest state is "I do not know."

**A halted graduation must be impossible to miss** — in the admin panel and in the hourly integrity checks, alongside `deposits_needing_attention`. The most repeated lesson of this project is that a system failing silently costs more than the failure itself.

---

## 10. The DEX — Raydium CPMM (decided 2026-08-27)

Chosen by reading the SDKs' own exported constants rather than their documentation, which has proved the more reliable source repeatedly this week.

| | Raydium CPMM | Orca Whirlpools | Meteora |
|---|---|---|---|
| Constant product | **yes** | no — CLMM only | yes |
| LP representation | **fungible SPL mint** | **position NFT** | fungible SPL mint |
| Devnet program IDs | exported, distinct | same as mainnet | ambiguous |
| Burnable | **yes, standard SPL burn** | not meaningfully | yes, but not via SDK |

**Orca is disqualified by the NFT positions** — burning one makes liquidity unreachable rather than permanent, and the program is not built for the difference.

⚠️ **`lockLp` is not a burn, and this distinction is the point.** Raydium's lock sends LP to a lock program and mints a fee NFT; the position remains claimable. Meteora is worse — it exposes `moveLockedLp`, so a lock is explicitly reversible. Spec §6 requires liquidity **nobody, including the platform, can withdraw**. Only burning achieves that. Locking instead would produce a system we believed was permanent and was not.

**The burn is a plain SPL `Burn`, not an SDK call.** Raydium has no burn method; the LP is a standard SPL mint. Worth writing down, because someone looking for `raydium.burn()` will not find one and may reach for `lockLp` instead.

### Program IDs diverge

| | Devnet | Mainnet |
|---|---|---|
| CPMM create | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` |
| Fee destination | `9y8ENuuZ3b19quffx9hQvRVygG5ky6snHfRvGpuSfeJy` | `7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5` |

**Genuinely different on-chain programs**, so devnet proves the flow and not the program. Take them from configuration; a hardcoded devnet id reaching mainnet is what `MAINNET_MIGRATION.md` §2 exists to prevent.

### Pool cost is read, not assumed

`createPoolFee` lives in the on-chain AMM config, not an SDK constant. ⚠️ **Because graduation is automatic**, the precondition that refuses to start when the treasury cannot cover it must read the current fee, not a figure someone wrote down once. A stale constant would let a graduation begin that cannot finish.

⚠️ **Keep pool creation and the burn behind an interface.** Devnet and mainnet need different program IDs at minimum, and the rest of the state machine must stay DEX-independent.

---

## 11. Cost model

| Item | SOL | Paid |
|---|---|---|
| Mint account | ~0.0015 | at graduation |
| Metadata | ~0.0056 | at graduation |
| Escrow token account | ~0.00204 | at graduation |
| Pool creation | DEX config + rent | at graduation |
| **Per claim:** recipient account | 0.00204 | **when claimed** |
| **Per claim:** transfer | 0.000005 | **when claimed** |

**Graduation itself is nearly fixed cost** — a handful of accounts plus the pool, independent of holder count. That is the main practical gain of claiming over pushing: a 500-holder graduation costs the same as a 5-holder one, and the ~1 SOL of holder rent is spent only for people who actually appear.

**Measure it on devnet.** SOL is free there but the *count* is real: record actual consumption and multiply by the mainnet price. That is what turned "roughly 2%" into a measured 0.7% on the Stripe currency work.

⚠️ **The treasury's SOL is shared.** An empty fee payer stops **withdrawals and deposit sweeps for every user**. Graduation must be included in the admin panel's "how many withdrawals can we still pay for" figure, and must refuse to start if it cannot cover itself.

---

## 12. Preconditions — checked before anything begins

Graduation is automatic and unattended, so it must refuse to start rather than stop halfway. A graduation that never began is recoverable; one abandoned mid-flight at three in the morning is not.

- Curve is graduated and not under an admin freeze
- Token symbol present and valid
- Supply reconciles: holders + LP + dust = 100,000,000 exactly
- Split reconciles: founder + liquidity = pool exactly
- Treasury holds enough SOL for the whole graduation **plus** normal operations
- No existing graduation for this startup

Failing any of these creates the graduation in `halted` with the reason recorded — visible, rather than nothing happening.

---

## 13. Edge cases

| Case | Handling |
|---|---|
| Zero holders | Cannot occur if a pool exists; halt and require a human |
| One holder | Allowed — this is `designr` |
| Holder truncating to zero | `dust_zero`, no account, amount recorded |
| Holder without an embedded wallet | Claimable but not claimable *yet*; they get an address on next sign-in. Never dropped |
| Holder who never claims | Stays claimable forever. No expiry, no sweep |
| Pool overshoots the target | Normal — always split on the actual pool |
| Claim fails after submission | `claiming` stays; resume checks the chain before retrying |
| Treasury lacks SOL mid-graduation | Halt |
| Same startup graduating twice | `graduations.startup_id` is UNIQUE |

---

## 13a. After graduation — what the platform shows and holds

**`startup_holdings` is never mutated by graduation or by a claim.** It stays exactly as it was, as the historical record of what each person held when trading stopped. The snapshot in `graduation_holders` is derived from it and is what everything downstream reads.

⚠️ **But the UI must stop presenting it as a live balance**, or the same tokens appear twice — once in the platform as a holding, once on-chain after the claim. Nothing in the ledger is wrong; the screen would be.

After graduation a holder's position is one of three things, and the interface has to say which:

| | Shown as |
|---|---|
| `claimable` | "You are owed N tokens — claim them" |
| `claimed` | "Claimed. Held in your wallet." with the transaction |
| `dust_zero` | "Your holding was below the smallest on-chain unit" with the original amount |

**The startup page changes character at graduation.** No buy or sell, no curve price — the curve no longer exists as a market. What belongs there instead: the mint address, a link to the pool, the claim state for the viewer, and the graduation figures (pool, founder share, liquidity, supply split). Price, if shown at all, comes from the DEX and not from us.

⚠️ **Do not show a stale curve price after graduation.** The last curve price was ~$0.000563 on `designr` while the LP opens near $0.000289 — roughly half. Displaying the old number would state a value that is knowably wrong by 49% at the moment it appears.

**Claiming is offered wherever the holding is visible** — the startup page and the profile. It is one button: the server does the transfer with delegated signing and pays the gas and the account rent.

---

## 14. Reconciliation

A graduation is complete only when these hold, checked automatically rather than eyeballed:

1. On-chain mint supply is exactly **100,000,000**
2. Escrow balance + Σ(claimed) = `tokens_to_holders`
3. LP allocation = `tokens_to_lp` + `dust_to_lp`
4. (1) = (2) + (3) — nothing minted that nobody owns
5. `founder_usdc` + `liquidity_usdc` = `pool_usdc` exactly
6. LP supply is zero — the burn happened
7. Mint authority is null

**Add this to the hourly integrity checks**, next to the six already running. A graduation that reconciles is finished; one that does not is `halted`, whatever its status column says.

---

## 15. Devnet vs mainnet

| | Devnet | Mainnet |
|---|---|---|
| USDC mint | ours, fake | the real one; wrong value = accepting a worthless token |
| Raydium program | `DRay…` | `CPMMoo…` — different program |
| SOL cost | free | real, competing with withdrawals |
| Congestion | none | priority fees required, transactions drop |
| Confirmation | fast | slower; unknown-outcome submissions are the normal case |
| Reorgs | rare | wait for depth before treating a step as done |
| Sniping / MEV | absent | present in the seconds after the pool opens |
| Mistakes | free | permanent |

**Devnet can prove:** the state machine, deliberate mid-flight failure and resume, mint and metadata, authority revocation, the claim flow at realistic holder counts, the 18→6 truncation summing to exactly 100,000,000, SOL cost, and reconciliation between snapshot and chain. That is the majority of the work and effectively all of the risk this design addresses — and devnet is *better* for it, because the process can be killed halfway on purpose.

**Devnet cannot prove:** pool economics, price discovery, sniping in the seconds after migration, congestion behaviour, or whether wallets and explorers index the token.

**Therefore: make the first mainnet graduation deliberately small.** It is the only place the remaining questions can be answered, and the only moment when the cost of the answer is a choice.

⚠️ **`MAINNET_MIGRATION.md` §0 applies here.** Devnet graduations must not carry over — a row referencing a devnet mint would be meaningless on mainnet and, worse, would look complete.

---

## 16. Build order

1. ✅ Schema — `graduations`, `graduation_holders`, `graduation_events`
2. ✅ Snapshot and split, off-chain, **verified against `designr`**
3. Adjust the schema for claim rather than distribution
4. Mint creation and metadata, with resume
5. Escrow funding and the claim flow, with resume
6. **Fault injection: kill a claim mid-flight and confirm resume completes it exactly once**
7. Pool creation and LP burn, behind the interface
8. Founder payout
9. Authority revocation
10. Reconciliation check, wired into the hourly run
11. Admin surface: state, history, and a halted graduation nobody can miss
12. A full multi-holder graduation on devnet, end to end, verified against the chain

⚠️ **`designr` has exactly one holder**, which exercises no concurrency and no partial-failure path. A synthetic multi-holder graduation is needed before the claim flow can be called tested. **Do not clean up `designr`** — it is the record of a real graduation.

Step 6 is where the design either survives or does not. Everything before it is scaffolding for a system that has to survive being interrupted.
