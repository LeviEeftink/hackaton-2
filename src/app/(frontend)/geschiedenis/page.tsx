import type { Metadata } from 'next'

import { History } from '@/components/history'

export const metadata: Metadata = { title: 'Mijn ritten · HitchTracker' }

export default function GeschiedenisPage() {
  return <History />
}
