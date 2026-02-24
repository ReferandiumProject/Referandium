export default {
  logo: <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>📖 Referandium Docs</span>,
  project: {
    link: 'https://github.com/ReferandiumProject/referandium',
  },
  docsRepositoryBase: 'https://github.com/ReferandiumProject/referandium/tree/main/docs',
  useNextSeoProps() {
    return {
      titleTemplate: '%s – Referandium Documentation',
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="Referandium Documentation" />
      <meta property="og:description" content="Technical documentation and whitepaper for Referandium - Solana-based prediction markets and NFT auctions" />
    </>
  ),
  banner: {
    key: 'referandium-dev',
    text: (
      <a href="https://github.com/ReferandiumProject/referandium" target="_blank" rel="noreferrer">
        🚧 Referandium is in active development. Follow progress on GitHub →
      </a>
    ),
  },
  footer: {
    text: (
      <span>
        {new Date().getFullYear()} © <a href="https://referandium.io" target="_blank" rel="noreferrer">Referandium</a>
      </span>
    ),
  },
  primaryHue: 220,
  darkMode: true,
  nextThemes: {
    defaultTheme: 'dark',
  },
}
