"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

interface CheckoutButtonProps {
  stripeEnabled: boolean
}

export function CheckoutButton({ stripeEnabled }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleCheckout() {
    if (!stripeEnabled) {
      toast.info(
        "Stripe ist im Dev-Modus deaktiviert. Zugang manuell in Supabase aktivieren."
      )
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/payments/create-checkout-session", {
        method: "POST",
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Checkout konnte nicht gestartet werden")
      }

      // Redirect to Stripe hosted checkout
      window.location.href = data.url
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Ein Fehler ist aufgetreten"
      )
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleCheckout}
      disabled={loading}
      className="w-full"
      size="lg"
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Weiterleitung zu Stripe…
        </>
      ) : (
        "Jetzt abonnieren"
      )}
    </Button>
  )
}
