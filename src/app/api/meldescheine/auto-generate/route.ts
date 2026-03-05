import { NextRequest, NextResponse } from 'next/server'
import { autoGenerateMeldescheine } from '@/lib/auto-generate-meldeschein'
import { verifyAuth } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const authorized = await verifyAuth(request.headers.get('authorization'))
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await autoGenerateMeldescheine()
    return NextResponse.json({ success: true, created: result.created })
  } catch (error) {
    console.error('Auto-generate meldescheine route error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-generation failed' },
      { status: 500 }
    )
  }
}
