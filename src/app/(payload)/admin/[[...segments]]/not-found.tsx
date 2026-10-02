import type { Metadata } from 'next'
import { NotFoundPage, generatePageMetadata } from '@payloadcms/next/views'

import config from '@payload-config'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<Record<string, string | string[]>>
}

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

export default function NotFound({ params, searchParams }: Args) {
  return NotFoundPage({ config, params, searchParams, importMap })
}
