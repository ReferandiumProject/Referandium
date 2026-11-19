import Link from 'next/link'
import { Brand } from './ui'

const links = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/docs', label: 'Docs' },
]

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Link href="/" aria-label="Referandium home">
            <Brand />
          </Link>
          <p className="mt-2 text-[13px] text-muted">
            Startups validated by the crowd, funded on Solana.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/ReferandiumProject/Referandium"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted transition-colors hover:text-ink"
          >
            GitHub
          </a>
          <span className="text-faint">© 2026 Referandium</span>
        </div>
      </div>
    </footer>
  )
}
