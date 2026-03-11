import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'
import { autoGenerateInvoices } from '@/lib/auto-generate-invoices'

const schema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum (YYYY-MM-DD)'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum (YYYY-MM-DD)'),
})

export async function POST(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { fromDate, toDate } = parsed.data
  if (fromDate > toDate) {
    return NextResponse.json({ error: 'Von-Datum muss vor dem Bis-Datum liegen' }, { status: 400 })
  }

  try {
    const result = await autoGenerateInvoices(user.id, supabase, {
      directOnly: false,
      fromDate,
      toDate,
    })
    return NextResponse.json({ success: true, created: result.created })
  } catch (error) {
    console.error('Bulk generate invoices error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk-Generierung fehlgeschlagen' },
      { status: 500 }
    )
  }
}
