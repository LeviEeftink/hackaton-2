import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import '../globals.css'

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
    <html lang="nl">
      <body>
        <div className="phone">{children}</div>
      </body>
    </html>
  )
}
