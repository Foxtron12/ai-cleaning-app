import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser } from '@/lib/supabase-server'

const patchSchema = z.object({
  status: z.enum(['created', 'archived']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültiger Status', details: parsed.error.issues },
      { status: 400 }
    )
  }
  const { data, error } = await supabase
    .from('registration_forms')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Status-Update fehlgeschlagen: ' + error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id } = await params
  const { error } = await supabase
    .from('registration_forms')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'Löschen fehlgeschlagen: ' + error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
