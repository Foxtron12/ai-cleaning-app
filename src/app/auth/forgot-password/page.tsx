'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=recovery`
        : '/auth/callback?type=recovery'

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
          </div>
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle className="mx-auto size-10 text-green-500" />
              <div className="space-y-1">
                <p className="font-medium">E-Mail gesendet</p>
                <p className="text-sm text-muted-foreground">
                  Prüfe dein Postfach für <strong>{email}</strong> und klicke auf den Link zum
                  Zurücksetzen des Passworts.
                </p>
              </div>
              <Link href="/login" className="text-sm underline underline-offset-4">
                Zurück zur Anmeldung
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">Passwort zurücksetzen</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Passwort vergessen?</CardTitle>
            <CardDescription>
              Gib deine E-Mail-Adresse ein. Wir schicken dir einen Reset-Link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Wird gesendet...' : 'Reset-Link senden'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    </div>
  )
}
