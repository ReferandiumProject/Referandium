'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Re-mounts page content on navigation so each page fades up into place.
 * Uses `backwards` fill so no transform lingers after the animation:
 * a leftover transform would turn `position: fixed` modals into
 * wrapper-relative ones.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-[fade-up_0.5s_cubic-bezier(0.2,0.7,0.2,1)_backwards]">
      {children}
    </div>
  )
}
