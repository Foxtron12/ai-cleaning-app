import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerUser, createServiceClient } from '@/lib/supabase-server'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  try {
    const resolvedParams = await params
    // 2. Validate params
    const parsed = paramsSchema.safeParse(resolvedParams)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ungueltige Dokument-ID', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const documentId = parsed.data.id

    // 3. Fetch document metadata (RLS ensures user_id match)
    const { data: document, error: fetchError } = await supabase
      .from('booking_documents')
      .select('id, storage_path')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !document) {
      return NextResponse.json(
        { error: 'Dokument nicht gefunden oder kein Zugriff' },
        { status: 404 }
      )
    }

    // 4. Delete file from Supabase Storage using service client
    const serviceClient = createServiceClient()
    const { error: storageError } = await serviceClient.storage
      .from('booking-documents')
      .remove([document.storage_path])

    if (storageError) {
      console.error('Storage delete error:', storageError)
      return NextResponse.json(
        { error: `Datei konnte nicht aus dem Speicher gelöscht werden: ${storageError.message}` },
        { status: 500 }
      )
    }

    // 5. Delete metadata from DB
    const { error: deleteError } = await supabase
      .from('booking_documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('DB delete error:', deleteError)
      return NextResponse.json(
        { error: `Metadaten konnten nicht gelöscht werden: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
    console.error('Delete endpoint error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
