import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const updateProfileSchema = z.object({
  display_name: z.string().max(100).nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
  brand_name: z.string().max(200).nullable().optional(),
  street: z.string().max(200).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  tax_id: z.string().max(50).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
})

export async function GET() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, ...parsed.data })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
