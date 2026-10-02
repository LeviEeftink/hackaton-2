import { Account } from '@/components/account'

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = '/' } = await searchParams
  return <Account next={next} />
}
