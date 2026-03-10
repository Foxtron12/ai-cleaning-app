'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein.')
      return
    }

    setLoading(true)

    const { error: authError } = await supabase.auth.updateUser({ password })

    if (authError) {
      if (authError.message.toLowerCase().includes('expired') || authError.message.toLowerCase().includes('invalid')) {
        setError('Dieser Link ist abgelaufen. Bitte fordere einen neuen Reset-Link an.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <h1 className="text-xl font-semibold">Neues Passwort</h1>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Passwort zurücksetzen</CardTitle>
            <CardDescription>Wähle ein neues Passwort für dein Konto</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Neues Passwort</Label>
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
              <div className="space-y-2">
                <Label htmlFor="confirm">Passwort bestätigen</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Wird gespeichert...' : 'Passwort speichern'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
