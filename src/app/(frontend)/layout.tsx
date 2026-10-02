import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'

import '../globals.css'
import { Navigation, SessionProvider } from '@/components/session'

export const metadata: Metadata = {
  title: 'HitchTracker',
  description: 'Transparante ritinformatie voor taxi-passagiers.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl"><body><SessionProvider>
      <div className="phone"><header className="app-header"><Link className="brand" href="/">HitchTracker</Link></header>{children}<Navigation /></div>
    </SessionProvider></body></html>
  )
}
