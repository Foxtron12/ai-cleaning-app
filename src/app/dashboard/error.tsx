'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <h2 className="text-lg font-semibold">Etwas ist schiefgelaufen</h2>
      <p className="text-sm text-muted-foreground">
        {error.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
      </p>
      <button
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        onClick={reset}
      >
        Erneut versuchen
      </button>
    </div>
  )
}
