import Link from 'next/link';

const linkStyle: React.CSSProperties = {
  color: '#3B82F6', fontSize: '14px', textDecoration: 'none',
};

export default function Footer() {
  return (
    <footer style={{ backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

        {/* Row 1 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', backgroundColor: '#3B82F6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>R</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>Referandium</span>
          </Link>

          {/* Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <Link href="/markets" style={linkStyle}>Markets</Link>
            <Link href="/docs" style={linkStyle}>Docs</Link>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>Twitter</a>
            <a href="https://github.com/ReferandiumProject/Referandium" target="_blank" rel="noopener noreferrer" style={linkStyle}>GitHub</a>
          </div>
        </div>

        {/* Row 2 */}
        <div style={{ marginTop: '32px', borderTop: '1px solid #E5E7EB', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>© 2026 Referandium. Built on Solana.</span>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>Referandium — a USDC prediction market on Solana.</span>
        </div>

      </div>
    </footer>
  );
}