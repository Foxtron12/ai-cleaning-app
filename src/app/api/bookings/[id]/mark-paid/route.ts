import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'

/**
 * PATCH /api/bookings/[id]/mark-paid
 * Marks a booking as manually paid (cash / bank transfer).
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const { id: bookingId } = await params

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, payment_status')
    .eq('id', bookingId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ payment_status: 'manual' })
    .eq('id', bookingId)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, payment_status: 'manual' })
}
