import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

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
    <SessionProvider>
      <div className="phone"><Navigation />{children}<footer className="app-footer">HitchTracker · Transparant van vertrek tot aankomst</footer></div>
    </SessionProvider>
  )
}
