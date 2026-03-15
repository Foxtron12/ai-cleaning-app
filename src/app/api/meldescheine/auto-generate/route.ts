import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { autoGenerateMeldescheine } from '@/lib/auto-generate-meldeschein'

export async function POST() {
  const { user, supabase } = await getServerUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  try {
    const result = await autoGenerateMeldescheine(user.id, supabase)
    return NextResponse.json({ success: true, created: result.created, skipped: result.skipped })
  } catch (error) {
    console.error('Auto-generate meldescheine route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-generation failed' },
      { status: 500 }
    )
  }
}
