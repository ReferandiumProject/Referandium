# Referandium

**The World's First Policy Prescription Market**

Vote with your conviction. Join the community hedge fund on Solana.

## Features

- ✅ **Equal Voting Power**: 1 Wallet = 1 Vote
- 💰 **Investment Pool**: Invest SOL with each vote
- 📊 **Live Statistics**: Real-time participant count and total pool (TVL)
- 🔗 **Pump.fun Integration**: Direct token trading links
- 💬 **Social Feed**: Twitter and Telegram integration
- 🎨 **Modern UI**: Clean, professional, and trustworthy design

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Language**: TypeScript

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
referandium/
├── app/
│   ├── components/
│   │   ├── ReferendumCard.tsx    # Market card component
│   │   └── VotingModal.tsx       # Voting modal component
│   ├── dashboard/
│   │   └── page.tsx              # Dashboard with market grid
│   ├── data/
│   │   └── mockData.ts           # Mock data
│   ├── types.ts                  # TypeScript type definitions
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
├── public/                       # Static files
└── package.json                  # Project dependencies
```

## Usage

### Landing Page (/)
- Hero section with "Policy Prescription Market" branding
- "Launch App" CTA button
- Feature highlights

### Dashboard (/dashboard)
1. View active policy markets
2. Click "YES" or "NO" to vote on any market
3. Enter SOL amount to invest in the modal
4. Submit your vote (currently works with mock data)

## Development Notes

- Currently working with mock data
- Solana Web3.js integration for blockchain connectivity (coming soon)
- Wallet connection via Phantom/Solflare (coming soon)
- Backend API integration (coming soon)

## Terminology

This is a **Policy Prescription Market**, not a prediction or betting platform. Users vote on policy outcomes and contribute to a community hedge fund.

## License

MIT
