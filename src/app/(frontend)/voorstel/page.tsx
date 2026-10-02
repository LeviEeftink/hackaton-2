import { Quote } from '@/components/quote'
export default async function VoorstelPage({ searchParams }: { searchParams: Promise<{ route?: string }> }) {
  return <Quote routeId={Number((await searchParams).route)} />
}
