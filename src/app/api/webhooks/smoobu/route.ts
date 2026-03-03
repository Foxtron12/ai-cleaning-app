import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  mapSmoobuReservation,
  calculateBookingStatus,
} from '@/lib/smoobu'
import type { SmoobuReservation } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const webhookSecret = process.env.SMOOBU_WEBHOOK_SECRET
    if (webhookSecret) {
      const providedSecret = request.nextUrl.searchParams.get('secret')
      if (providedSecret !== webhookSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const reservation = body as SmoobuReservation

    if (!reservation.id || !reservation.apartment?.id) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Find the property by Smoobu apartment ID
    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .eq('external_id', reservation.apartment.id)
      .single()

    if (!property) {
      // Property not synced yet – ignore or trigger a full sync
      return NextResponse.json({
        success: false,
        message: 'Property not found. Run a full sync first.',
      })
    }

    const bookingData = mapSmoobuReservation(reservation, property.id)
    bookingData.status = calculateBookingStatus(
      reservation.arrival,
      reservation.departure,
      reservation.status === 'cancelled'
    )

    // Upsert: update if exists, insert if new
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('external_id', reservation.id)
      .single()

    if (existing) {
      const { external_id: _, ...updateData } = bookingData
      await supabase
        .from('bookings')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('bookings').insert(bookingData)
    }

    return NextResponse.json({ success: true, bookingId: reservation.id })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
