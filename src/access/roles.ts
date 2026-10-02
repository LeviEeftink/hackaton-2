import type { Access, FieldAccess } from 'payload'

export type HitchRole = 'passenger' | 'driver' | 'operator' | 'admin'

export type HitchUser = {
  id: number
  role?: HitchRole | null
}

export type RelationshipValue = number | string | { id?: number | string } | null | undefined

export const relationID = (value: RelationshipValue): number | string | undefined => {
  if (typeof value === 'number' || typeof value === 'string') return value
  return value?.id
}

export const isAdmin = (user: HitchUser | null | undefined): boolean => user?.role === 'admin'

export const isOperator = (user: HitchUser | null | undefined): boolean =>
  user?.role === 'operator' || user?.role === 'admin'

export const isDriver = (user: HitchUser | null | undefined): boolean => user?.role === 'driver'

export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

export const operatorsOnly: Access = ({ req }) => isOperator(req.user as HitchUser | null)

export const adminsOnly: Access = ({ req }) => isAdmin(req.user as HitchUser | null)

export const ownUserOrOperator: Access = ({ req }) => {
  const user = req.user as HitchUser | null
  if (!user) return false
  if (isOperator(user)) return true
  return { id: { equals: user.id } }
}

export const ownUserOrOperatorField: FieldAccess = ({ id, req }) => {
  const user = req.user as HitchUser | null
  return Boolean(user && (isOperator(user) || String(user.id) === String(id)))
}

export const rideReadAccess: Access = ({ req }) => {
  const user = req.user as HitchUser | null
  if (!user) return false
  if (isOperator(user)) return true
  return {
    or: [{ passenger: { equals: user.id } }, { driver: { equals: user.id } }]
  } as any
}

export const rideEventReadAccess: Access = ({ req }) => {
  const user = req.user as HitchUser | null
  if (!user) return false
  if (isOperator(user)) return true
  return {
    or: [
      { 'ride.passenger': { equals: user.id } },
      { 'ride.driver': { equals: user.id } }
    ]
  } as any
}
