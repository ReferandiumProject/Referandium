# Referandium

Referandium is a startup sentiment market. Startups list, the crowd validates them with free daily voting tokens, validated startups raise USDC on a bonding curve, and successful raises graduate to a real SPL token on Solana. That is the entire product — `referandium.com` serves this and nothing else.

## Tech stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend / database:** Supabase (PostgreSQL)
- **Authentication:** Privy
- **Payments:** Stripe (sandbox)
- **Blockchain:** Solana devnet, USDC

## Status

Not production-ready. Everything runs against Solana devnet with a sandbox payment processor — no real money moves anywhere.

## Project layout

- `frontend/` — Next.js application
- `backend/` — Solana programs
- `database/` — schema

## Getting started

```bash
cd frontend
npm install
npm run dev
```

The dev server is pinned to port 3000: http://localhost:3000.

`frontend/.env.local` is required — see `frontend/.env.example` for the variables it must contain. Never commit real secrets; `.env.local` is gitignored.

## Documentation

Design documentation and the development log live in a separate private repository, available on request.
