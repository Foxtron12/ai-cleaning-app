import { NextRequest, NextResponse } from 'next/server'
import { SmoobuClient } from '@/lib/smoobu'
import { getServerUser } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'
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
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

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

    // Load API key from integrations table (encrypted)
    const { data: integration } = await supabase
      .from('integrations')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('provider', 'smoobu')
      .single()

    if (!integration?.api_key_encrypted) {
      return NextResponse.json(
        { error: 'Smoobu API-Key nicht konfiguriert. Bitte unter Integrationen hinterlegen.' },
        { status: 400 }
      )
    }

    const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)

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
