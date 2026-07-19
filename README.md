# Referandium

> **Private work-in-progress.** This repo is a shared development workspace and is not production-ready.

## What this project is

**Referandium** is a Polymarket-style USDC prediction market on Solana.

This codebase also serves **Startup Sentiment Market**, a separate startup long/short sentiment product. The two products share infrastructure and are served from the same monorepo on two subdomains.

## Tech stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend / database:** Supabase (PostgreSQL)
- **Authentication:** Privy
- **Blockchain:** Solana Devnet

## Current status

- **Startup Sentiment Market:** live and complete.
- **Referandium:** rebuild in progress. The schema, core pages, and trading logic exist but have not been live-tested yet.

## Project layout

- `frontend/` — Next.js application
- `backend/` — Solana / Anchor programs
- `database/` — Supabase migrations and schema

## Getting started

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.example .env.local
# Fill in all values in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- `frontend/.env.local` is gitignored. Never commit real secrets.
- All on-chain operations currently target **Solana Devnet**.
