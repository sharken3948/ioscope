# ioscope

Onchain wallet analysis tool for ARC Testnet, Base, and Soneium. Paste any wallet address and get an instant risk profile, behavioral classification, and AI-powered summary.

**Live:** [ioscope.xyz](https://ioscope.xyz)

---

## Features

- **Risk scoring** — 0–100 composite score based on transaction history, volume patterns, and contract interactions
- **Bot & MEV detection** — identifies automated wallets, MEV bots, and suspicious activity patterns
- **User classification** — categorizes wallets (retail, whale, trader, airdrop farmer, etc.)
- **AI analysis** — natural language summary of wallet behavior powered by Groq
- **PDF report download** — exportable report with full metrics and risk breakdown
- **Watchlist** — track multiple addresses across chains
- **Multi-chain** — ARC Testnet, Base, Soneium

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Blockchain data | Blockscout Pro API |
| AI | Groq (LLaMA) |

## Running locally

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Add your GROQ_API_KEY to .env.local

# Start dev server
npm run dev
```

```bash
npm run build   # production build
npm run start   # start production server
npm run lint    # run ESLint
```
