import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  SmoobuClient,
  mapSmoobuApartment,
  mapSmoobuReservation,
  calculateBookingStatus,
} from '@/lib/smoobu'

export async function POST() {
  try {
    const apiKey = process.env.SMOOBU_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'SMOOBU_API_KEY not configured' },
        { status: 500 }
      )
    }

    const smoobu = new SmoobuClient({ apiKey })
    const supabase = createServiceClient()

    // 1. Sync apartments/properties
    const apartments = await smoobu.getApartments()
    const propertyMap = new Map<number, string>() // external_id → uuid

    for (const apartment of apartments) {
      const propertyData = mapSmoobuApartment(apartment)

      const { data: existing } = await supabase
        .from('properties')
        .select('id')
        .eq('external_id', apartment.id)
        .single()

      if (existing) {
        // Update existing property – sync location + set tax city if not manually configured
        const updateData: Record<string, unknown> = {
          name: propertyData.name,
          street: propertyData.street,
          city: propertyData.city,
          zip: propertyData.zip,
          country: propertyData.country,
          timezone: propertyData.timezone,
          synced_at: new Date().toISOString(),
        }
        // Auto-set accommodation_tax_city from Smoobu location if currently null
        if (propertyData.city) {
          const { data: currentProp } = await supabase
            .from('properties')
            .select('accommodation_tax_city')
            .eq('id', existing.id)
            .single()
          if (!currentProp?.accommodation_tax_city) {
            updateData.accommodation_tax_city = propertyData.city
          }
        }
        await supabase
          .from('properties')
          .update(updateData)
          .eq('id', existing.id)
        propertyMap.set(apartment.id, existing.id)
      } else {
        // Insert new property
        const { data: inserted } = await supabase
          .from('properties')
          .insert(propertyData)
          .select('id')
          .single()
        if (inserted) {
          propertyMap.set(apartment.id, inserted.id)
          // Auto-set tax config from city_tax_rules if city matches
          if (propertyData.city) {
            const { data: rule } = await supabase
              .from('city_tax_rules')
              .select('tax_model, tax_rate')
              .eq('city', propertyData.city)
              .single()
            if (rule) {
              await supabase
                .from('properties')
                .update({
                  accommodation_tax_model: rule.tax_model,
                  accommodation_tax_rate: rule.tax_rate,
                })
                .eq('id', inserted.id)
            }
          }
        }
      }
    }

    // 2. Sync reservations (last 12 months + next 12 months)
    const now = new Date()
    const from = new Date(now)
    from.setMonth(from.getMonth() - 12)
    const to = new Date(now)
    to.setMonth(to.getMonth() + 12)

    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]

    const reservations = await smoobu.getAllReservations(fromStr, toStr)

    let synced = 0
    let created = 0
    let updated = 0

    for (const reservation of reservations) {
      // Skip blocked/maintenance bookings
      if (reservation['is-blocked-booking']) continue

      const propertyId = propertyMap.get(reservation.apartment?.id)
      if (!propertyId) continue

      const bookingData = mapSmoobuReservation(reservation, propertyId)
      const isCancelled = reservation.type?.toLowerCase().includes('cancellation')
      bookingData.status = calculateBookingStatus(
        reservation.arrival,
        reservation.departure,
        isCancelled
      )

      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('external_id', reservation.id)
        .single()

      if (existing) {
        // Update existing booking
        const { external_id: _, ...updateData } = bookingData
        await supabase
          .from('bookings')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        updated++
      } else {
        // Insert new booking
        await supabase.from('bookings').insert(bookingData)
        created++
      }
      synced++
    }

    // 3. Update last sync timestamp in settings
    await supabase
      .from('settings')
      .update({ smoobu_last_sync: new Date().toISOString() })
      .not('id', 'is', null)

    return NextResponse.json({
      success: true,
      properties: apartments.length,
      reservations: {
        total: synced,
        created,
        updated,
      },
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Smoobu sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
