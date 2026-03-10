"use client"

import { Check } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckoutButton } from "./checkout-button"

const features = [
  "Unbegrenzter Zugang zum Dashboard",
  "Automatische Meldebescheinigungen",
  "Finanzberichte & Steuer-Export",
  "Smoobu-Integration mit Live-Daten",
]

interface ProductCardProps {
  priceAmount: number // in cents
  productName: string
  stripeEnabled: boolean
}

export function ProductCard({
  priceAmount,
  productName,
  stripeEnabled,
}: ProductCardProps) {
  const priceEur = (priceAmount / 100).toFixed(2).replace(".", ",")

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <Badge variant="secondary" className="w-fit mx-auto mb-2">
          Einmalzahlung
        </Badge>
        <CardTitle className="text-2xl">{productName}</CardTitle>
        <CardDescription>
          Einmal zahlen, lebenslang nutzen. Kein Abo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <span className="text-4xl font-bold">{priceEur} €</span>
          <p className="text-sm text-muted-foreground mt-1">
            inkl. MwSt. · einmalig
          </p>
        </div>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-600 shrink-0" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <CheckoutButton stripeEnabled={stripeEnabled} />
      </CardFooter>
    </Card>
  )
}
