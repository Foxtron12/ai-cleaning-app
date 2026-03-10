import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export function DevModeNotice() {
  return (
    <Alert variant="destructive" className="max-w-md mx-auto">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Entwicklungsmodus</AlertTitle>
      <AlertDescription>
        Stripe ist deaktiviert. Zugang kann manuell in Supabase aktiviert werden
        (profiles → is_paid = true).
      </AlertDescription>
    </Alert>
  )
}
