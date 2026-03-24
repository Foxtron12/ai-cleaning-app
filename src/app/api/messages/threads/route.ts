import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { SmoobuClient } from '@/lib/smoobu'
import { decrypt } from '@/lib/encryption'

/**
 * GET /api/messages/threads
 * Load message threads from Smoobu API.
 * Query params: page (number), apartmentId (number)
 */
export async function GET(request: NextRequest) {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const apartmentIdParam = searchParams.get('apartmentId')
  const apartmentIds = apartmentIdParam ? [parseInt(apartmentIdParam, 10)] : undefined

  // Get Smoobu API key
  const { data: integration } = await supabase
    .from('integrations')
    .select('api_key_encrypted')
    .eq('user_id', user.id)
    .eq('provider', 'smoobu')
    .eq('status', 'connected')
    .single()

  if (!integration?.api_key_encrypted) {
    return NextResponse.json(
      { error: 'Smoobu integration not connected', code: 'SMOOBU_NOT_CONNECTED' },
      { status: 400 }
    )
  }

  try {
    const { plaintext: apiKey } = decrypt(integration.api_key_encrypted)
    const smoobu = new SmoobuClient({ apiKey })
    const result = await smoobu.getThreads({ page, apartmentIds })

    return NextResponse.json(result)
  } catch (err) {
    console.error('Failed to load message threads:', err)
    return NextResponse.json(
      { error: 'Failed to load message threads' },
      { status: 502 }
    )
  }
}
