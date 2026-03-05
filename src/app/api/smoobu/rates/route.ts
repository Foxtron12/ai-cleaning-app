import { NextRequest, NextResponse } from 'next/server'
import { SmoobuClient } from '@/lib/smoobu'
import { z } from 'zod'

const querySchema = z.object({
  apartmentId: z.coerce.number().int().positive(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).default(1),
  children: z.coerce.number().int().min(0).default(0),
  promoCode: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const parsed = querySchema.safeParse(searchParams)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungueltige Parameter', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { apartmentId, checkIn, checkOut, adults, children, promoCode } = parsed.data

    if (checkIn >= checkOut) {
      return NextResponse.json(
        { error: 'Check-out muss nach Check-in liegen' },
        { status: 400 }
      )
    }

    const apiKey = process.env.SMOOBU_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'SMOOBU_API_KEY nicht konfiguriert' },
        { status: 500 }
      )
    }

    const client = new SmoobuClient({ apiKey })

    const result = await client.getRates({
      apartmentId,
      arrivalDate: checkIn,
      departureDate: checkOut,
      adults,
      children,
      promoCode,
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
