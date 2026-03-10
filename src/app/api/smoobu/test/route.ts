import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { decrypt } from '@/lib/encryption'
import { SmoobuClient } from '@/lib/smoobu'

/**
 * GET /api/smoobu/test
 * Test the Smoobu API connection using the user's stored (encrypted) API key.
 */
export async function GET() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Load API key from integrations table
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, api_key_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json(
      {
        success: false,
        error: 'Kein Smoobu API-Key hinterlegt. Bitte unter Integrationen konfigurieren.',
      },
      { status: 400 }
    )
  }

  try {
    const { plaintext: apiKey, needsReEncrypt } = decrypt(integration.api_key_encrypted)

    // If key was decrypted with old encryption key, re-encrypt with current key
    if (needsReEncrypt) {
      const { encrypt } = await import('@/lib/encryption')
      await supabase
        .from('integrations')
        .update({ api_key_encrypted: encrypt(apiKey), updated_at: new Date().toISOString() })
        .eq('id', integration.id)
    }

    const smoobu = new SmoobuClient({ apiKey })
    const result = await smoobu.testConnection()

    // Update integration status based on test result
    await supabase
      .from('integrations')
      .update({
        status: result.success ? 'connected' : 'error',
        error_message: result.success ? null : 'API-Key ungültig oder Smoobu nicht erreichbar',
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id)

    return NextResponse.json({
      success: result.success,
      apartmentCount: result.apartmentCount,
      message: result.success
        ? `Verbindung erfolgreich! ${result.apartmentCount} Objekt(e) gefunden.`
        : 'Verbindung fehlgeschlagen. Bitte API-Key pruefen.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      },
      { status: 500 }
    )
  }
}
