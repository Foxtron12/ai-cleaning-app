'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
      },
    })

    if (authError) {
      if (
        authError.message.toLowerCase().includes('already registered') ||
        authError.message.toLowerCase().includes('user already exists')
      ) {
        setError('Diese E-Mail-Adresse ist bereits registriert.')
      } else if (authError.message.toLowerCase().includes('password')) {
        setError('Passwort muss mindestens 6 Zeichen lang sein.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
            <h1 className="text-xl font-semibold">Vermietung Dashboard</h1>
          </div>
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <CheckCircle className="mx-auto size-10 text-green-500" />
              <div className="space-y-1">
                <p className="font-medium">Konto erstellt!</p>
                <p className="text-sm text-muted-foreground">
                  Wir haben eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet.
                  Bitte klicke auf den Link, um dein Konto zu aktivieren.
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
          <h1 className="text-xl font-semibold">Vermietung Dashboard</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Konto erstellen</CardTitle>
            <CardDescription>Registriere dich mit E-Mail und Passwort</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Max Mustermann"
                />
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 6 Zeichen"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Konto wird erstellt...' : 'Konto erstellen'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Bereits ein Konto?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  )
}
