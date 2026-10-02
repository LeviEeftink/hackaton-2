import { RideSummary } from '@/components/ride-summary'
export default async function EindPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return <RideSummary rideId={Number((await searchParams).id)} />
}
