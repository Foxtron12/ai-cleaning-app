import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gästeregistrierung',
  description: 'Meldeschein ausfüllen',
}

export default function GuestLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {children}
      </div>
    </div>
  )
}
