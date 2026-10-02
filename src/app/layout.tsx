import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'HitchTracker',
  description: 'Transparante ritinformatie voor taxi-passagiers.',
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
