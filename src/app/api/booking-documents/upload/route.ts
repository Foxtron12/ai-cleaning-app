import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser, createServiceClient } from '@/lib/supabase-server'

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const uploadMetaSchema = z.object({
  booking_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  // 1. Auth check
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  try {
    // 2. Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const bookingId = formData.get('booking_id') as string | null

    if (!file || !bookingId) {
      return NextResponse.json(
        { error: 'Datei und booking_id sind erforderlich' },
        { status: 400 }
      )
    }

    // 3. Validate booking_id with Zod
    const metaParsed = uploadMetaSchema.safeParse({ booking_id: bookingId })
    if (!metaParsed.success) {
      return NextResponse.json(
        { error: 'Ungültige booking_id', details: metaParsed.error.issues },
        { status: 400 }
      )
    }

    // 4. Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Ungültiges Dateiformat. Erlaubt: PDF, JPG, PNG` },
        { status: 400 }
      )
    }

    // 5. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Datei ist zu groß. Maximal 10 MB erlaubt.` },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Datei ist leer' },
        { status: 400 }
      )
    }

    // 6. Verify booking belongs to user (RLS will enforce this too)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Buchung nicht gefunden oder kein Zugriff' },
        { status: 404 }
      )
    }

    // 7. Generate unique filename with timestamp to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueFileName = `${timestamp}_${sanitizedName}`
    const storagePath = `${user.id}/${bookingId}/${uniqueFileName}`

    // 8. Upload file to Supabase Storage using service client (bypasses storage RLS for server)
    const serviceClient = createServiceClient()
    const fileBuffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await serviceClient.storage
      .from('booking-documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload fehlgeschlagen: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // 9. Insert metadata into booking_documents table
    const { data: document, error: insertError } = await supabase
      .from('booking_documents')
      .insert({
        booking_id: bookingId,
        user_id: user.id,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback: delete the uploaded file from storage
      await serviceClient.storage
        .from('booking-documents')
        .remove([storagePath])

      console.error('DB insert error:', insertError)
      return NextResponse.json(
        { error: `Metadaten konnten nicht gespeichert werden: ${insertError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, document })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    console.error('Upload endpoint error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
