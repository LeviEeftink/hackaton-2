import { RideTracker } from '@/components/ride-tracker'
export default async function RitPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  return <RideTracker rideId={Number((await searchParams).id)} />
}
