import type { FareRules } from './fare'

export type ReceiptRide = {
  id: number
  reference: string
  journey: {
    pickupLabel: string
    destinationLabel: string
    startedAt?: string | null
    completedAt?: string | null
  }
  tariffSnapshot: FareRules & { currency: string }
  progress: {
    drivenDistanceMeters: number
    elapsedSeconds: number
    finalFareCents?: number | null
  }
}

// Quote every cell, and keep text that spreadsheet apps interpret as a formula inert.
export const csvCell = (value: string | number | null | undefined): string => {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export const createReceiptCSV = (ride: ReceiptRide): string => {
  const finalFare = ride.progress.finalFareCents
  if (typeof finalFare !== 'number' || !Number.isSafeInteger(finalFare) || finalFare < 0) {
    throw new RangeError('De opgeslagen eindprijs ontbreekt of is ongeldig.')
  }
  const rows: Array<[string, string | number | null | undefined]> = [
    ['Omschrijving', 'Waarde'],
    ['Ritnummer', ride.reference],
    ['Vertrek', ride.journey.pickupLabel],
    ['Bestemming', ride.journey.destinationLabel],
    ['Gestart op', ride.journey.startedAt],
    ['Afgerond op', ride.journey.completedAt],
    ['Valuta', ride.tariffSnapshot.currency],
    ['Gereden afstand (meter)', ride.progress.drivenDistanceMeters],
    ['Ritduur (seconden)', ride.progress.elapsedSeconds],
    ['Starttarief (centen)', ride.tariffSnapshot.startFareCents],
    ['Tarief per kilometer (centen)', ride.tariffSnapshot.pricePerKmCents],
    ['Tarief per minuut (centen)', ride.tariffSnapshot.pricePerMinuteCents],
    ['Eindprijs (centen)', finalFare],
    ['Eindprijs', (finalFare / 100).toFixed(2)],
  ]
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
