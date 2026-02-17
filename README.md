# 🔮 Referandium

### Prescribe Sound Policies & Shape the Future on Solana 🚀

**Referandium** is not just a prediction market; it is a decentralized **Policy Prescription Market**. It empowers communities to move beyond passive prediction and actively prescribe the future by signaling demand and building consensus on critical issues via the Solana Blockchain.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)](https://aesthetic-gecko-d62bc6.netlify.app)
[![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

---

## 🌟 Key Features

- **⚡ Solana Powered:** Fast, low-cost interactions using the Solana Blockchain.
- **🔐 Wallet Authentication:** Seamless login with Phantom Wallet (Solana Adapter).
- **👤 User Profiles:** Supabase-integrated profile management (Username, Avatar, Bio) tied to wallet addresses.
- **🌍 Multi-Language:** Full support for English 🇺🇸 and Turkish 🇹🇷 (Internationalization).
- **🌗 Dark/Light Mode:** Beautiful, responsive UI with theme switching capabilities.
- **🔍 Advanced Filtering:** Search and filter markets by category (Crypto, Politics, Sports, etc.).
- **📱 Fully Responsive:** Optimized for both desktop and mobile devices.

---

## 🛠 Tech Stack

| Layer             | Technology                                          |
| ----------------- | --------------------------------------------------- |
| **Frontend**      | Next.js 14 (App Router), React 18, TypeScript       |
| **Styling**       | Tailwind CSS, next-themes (Dark Mode)               |
| **Blockchain**    | Solana, Anchor 0.30, @solana/wallet-adapter, Web3.js |
| **Backend & DB**  | Supabase (PostgreSQL)                               |
| **State**         | React Context API                                   |
| **Icons**         | Lucide React                                        |
| **Deployment**    | Netlify                                             |

---

## 📁 Project Structure

```
Referandium-Project/
├── frontend/                  # Next.js 14 App
│   ├── app/
│   │   ├── components/        # Reusable UI components
│   │   ├── context/           # React Context providers (Language, User, Theme)
│   │   ├── utils/             # Translations & helpers
│   │   ├── admin/             # Admin dashboard
│   │   ├── profile/           # User profile page
│   │   ├── markets/           # Markets listing page
│   │   ├── market/[id]/       # Market detail page
│   │   ├── dashboard/         # Dashboard page
│   │   ├── layout.tsx         # Root layout with providers
│   │   └── page.tsx           # Homepage
│   ├── lib/                   # Supabase client
│   └── public/                # Static assets (videos, images)
├── backend/                   # Solana Program (Anchor/Rust)
│   └── programs/
│       └── referandium/       # Smart contract source
│           ├── src/
│           └── Cargo.toml
├── netlify.toml               # Deployment config
└── README.md
```

---

## 🚀 Getting Started

Follow these steps to run the project locally:

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Phantom Wallet](https://phantom.app/) browser extension
- A [Supabase](https://supabase.com/) project (for database)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/referandium.git
cd referandium
```

### 2. Install Dependencies

```bash
cd frontend
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file inside the `frontend/` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Set Up Supabase Tables

Create the following tables in your Supabase project:

**`users` table:**

| Column           | Type      | Notes              |
| ---------------- | --------- | ------------------ |
| `id`             | uuid (PK) | Default: uuid_generate_v4() |
| `wallet_address` | text      | Unique             |
| `username`       | text      |                    |
| `bio`            | text      | Nullable           |
| `avatar_url`     | text      | Nullable           |
| `created_at`     | timestamp | Default: now()     |

**`markets` table:**

| Column           | Type      | Notes              |
| ---------------- | --------- | ------------------ |
| `id`             | uuid (PK) | Default: uuid_generate_v4() |
| `question`       | text      |                    |
| `category`       | text      |                    |
| `image_url`      | text      | Nullable           |
| `outcome`        | text      | Nullable           |
| `created_at`     | timestamp | Default: now()     |

**`votes` table:**

| Column           | Type      | Notes              |
| ---------------- | --------- | ------------------ |
| `id`             | uuid (PK) | Default: uuid_generate_v4() |
| `market_id`      | uuid (FK) | References markets.id |
| `user_wallet`    | text      |                    |
| `vote_direction` | text      | 'yes' or 'no'     |
| `amount_sol`     | numeric   |                    |
| `created_at`     | timestamp | Default: now()     |

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔗 Smart Contract (Anchor / Rust)

The on-chain program is built with **Anchor 0.30** and deployed to **Solana Devnet**.

```bash
cd backend
anchor build
anchor deploy
```

---

## 📸 Screenshots

| Homepage | Markets | Profile |
| :------: | :-----: | :-----: |
| ![Home](https://via.placeholder.com/300x200?text=Homepage) | ![Markets](https://via.placeholder.com/300x200?text=Markets) | ![Profile](https://via.placeholder.com/300x200?text=Profile) |

> Replace placeholders with actual screenshots of your application.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 📬 Contact

- **Project:** [Referandium](https://aesthetic-gecko-d62bc6.netlify.app)
- **GitHub:** [@your-username](https://github.com/your-username)

---

<p align="center">
  <b>Don't just predict the future — prescribe it.</b><br/>
  Built with ❤️ on Solana
</p>
