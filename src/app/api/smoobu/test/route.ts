import { NextResponse } from 'next/server'
import { SmoobuClient } from '@/lib/smoobu'

export async function GET() {
  try {
    const apiKey = process.env.SMOOBU_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'SMOOBU_API_KEY not configured' },
        { status: 500 }
      )
    }

    const smoobu = new SmoobuClient({ apiKey })
    const result = await smoobu.testConnection()

    return NextResponse.json({
      success: result.success,
      apartmentCount: result.apartmentCount,
      message: result.success
        ? `Verbindung erfolgreich! ${result.apartmentCount} Objekt(e) gefunden.`
        : 'Verbindung fehlgeschlagen. Bitte API-Key prüfen.',
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
