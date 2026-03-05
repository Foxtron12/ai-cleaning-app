'use client'

import { useEffect, useState, useMemo } from 'react'
import { MapPin, Save, Plus, X, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Property, CityTaxRule } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PropertyForm {
  accommodation_tax_city: string
  accommodation_tax_model: string
  accommodation_tax_rate: string
  default_cleaning_fee: string
  tags: string[]
}

function formatModelLabel(model: string): string {
  switch (model) {
    case 'gross_percentage': return 'Brutto %'
    case 'net_percentage': return 'Netto %'
    case 'per_person_per_night': return 'Pro Person/Nacht'
    case 'per_room_per_night': return 'Pro Zimmer/Nacht'
    default: return model || '–'
  }
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [cityRules, setCityRules] = useState<CityTaxRule[]>([])
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Record<string, PropertyForm>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({})
  const [showTagInput, setShowTagInput] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function fetchData() {
      const [{ data: propData }, { data: rulesData }] = await Promise.all([
        supabase.from('properties').select('*').order('name'),
        supabase.from('city_tax_rules').select('*').order('city'),
      ])

      const props = (propData ?? []) as Property[]
      const rules = (rulesData ?? []) as CityTaxRule[]

      setProperties(props)
      setCityRules(rules)

      // Initialize forms from properties with city_tax_rules auto-fill
      const initialForms: Record<string, PropertyForm> = {}
      for (const prop of props) {
        const matchingRule = rules.find(
          (r) => r.city === (prop.accommodation_tax_city ?? prop.city)
        )
        initialForms[prop.id] = {
          accommodation_tax_city: prop.accommodation_tax_city ?? prop.city ?? '',
          accommodation_tax_model: prop.accommodation_tax_model ?? matchingRule?.tax_model ?? '',
          accommodation_tax_rate: String(prop.accommodation_tax_rate ?? matchingRule?.tax_rate ?? ''),
          default_cleaning_fee: prop.default_cleaning_fee != null ? String(prop.default_cleaning_fee) : '',
          tags: prop.tags ?? [],
        }
      }
      setForms(initialForms)
      setLoading(false)
    }
    fetchData()
  }, [])

  // Build city→rule lookup
  const rulesByCity = useMemo(() => {
    const map = new Map<string, CityTaxRule>()
    cityRules.forEach((r) => map.set(r.city, r))
    return map
  }, [cityRules])

  function updateForm(propId: string, field: keyof PropertyForm, value: string | string[]) {
    setForms((prev) => ({
      ...prev,
      [propId]: { ...prev[propId], [field]: value },
    }))
  }

  function handleCityChange(propId: string, city: string) {
    updateForm(propId, 'accommodation_tax_city', city)
    // Auto-fill from city_tax_rules when city matches
    const rule = rulesByCity.get(city)
    if (rule) {
      setForms((prev) => ({
        ...prev,
        [propId]: {
          ...prev[propId],
          accommodation_tax_city: city,
          accommodation_tax_model: rule.tax_model,
          accommodation_tax_rate: String(rule.tax_rate),
        },
      }))
    }
  }

  async function saveProperty(propId: string) {
    const form = forms[propId]
    if (!form) return

    setSaving((prev) => ({ ...prev, [propId]: true }))
    try {
      const updates: Record<string, unknown> = {
        accommodation_tax_city: form.accommodation_tax_city || null,
        accommodation_tax_model: form.accommodation_tax_model || null,
        accommodation_tax_rate: form.accommodation_tax_rate ? parseFloat(form.accommodation_tax_rate) : null,
        default_cleaning_fee: form.default_cleaning_fee ? parseFloat(form.default_cleaning_fee) : null,
        tags: form.tags.length > 0 ? form.tags : null,
        updated_at: new Date().toISOString(),
      }

      await supabase.from('properties').update(updates).eq('id', propId)

      // Update local state
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propId
            ? {
                ...p,
                accommodation_tax_city: (updates.accommodation_tax_city as string) ?? null,
                accommodation_tax_model: (updates.accommodation_tax_model as string) ?? null,
                accommodation_tax_rate: (updates.accommodation_tax_rate as number) ?? null,
                tags: (updates.tags as string[]) ?? null,
              }
            : p
        )
      )
    } finally {
      setSaving((prev) => ({ ...prev, [propId]: false }))
    }
  }

  function addTag(propId: string) {
    const tag = (tagInputs[propId] ?? '').trim()
    if (!tag) return
    const form = forms[propId]
    if (!form) return
    const newTags = [...new Set([...form.tags, tag])]
    updateForm(propId, 'tags', newTags)
    setTagInputs((prev) => ({ ...prev, [propId]: '' }))
    setShowTagInput((prev) => ({ ...prev, [propId]: false }))
  }

  function removeTag(propId: string, tag: string) {
    const form = forms[propId]
    if (!form) return
    updateForm(propId, 'tags', form.tags.filter((t) => t !== tag))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Objekte</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="h-8 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Objekte</h2>
        <p className="text-sm text-muted-foreground">{properties.length} Objekte aus Smoobu</p>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Keine Objekte vorhanden. Bitte zuerst Smoobu-Sync ausführen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {properties.map((prop) => {
            const form = forms[prop.id]
            if (!form) return null
            const matchingRule = rulesByCity.get(form.accommodation_tax_city)

            return (
              <Card key={prop.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{prop.name}</CardTitle>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {[prop.street, [prop.zip, prop.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Keine Adresse'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {form.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                          <button
                            className="ml-1 hover:text-destructive"
                            onClick={() => removeTag(prop.id, tag)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                      {showTagInput[prop.id] ? (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault()
                            addTag(prop.id)
                          }}
                        >
                          <Input
                            autoFocus
                            className="h-6 w-24 text-xs"
                            value={tagInputs[prop.id] ?? ''}
                            onChange={(e) =>
                              setTagInputs((prev) => ({ ...prev, [prop.id]: e.target.value }))
                            }
                            placeholder="Tag..."
                            onBlur={() =>
                              setShowTagInput((prev) => ({ ...prev, [prop.id]: false }))
                            }
                          />
                        </form>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          onClick={() =>
                            setShowTagInput((prev) => ({ ...prev, [prop.id]: true }))
                          }
                        >
                          <Tag className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Steuereinstellungen */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Steuereinstellungen</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Steuer-Stadt</Label>
                        <Input
                          value={form.accommodation_tax_city}
                          onChange={(e) => handleCityChange(prop.id, e.target.value)}
                          placeholder={prop.city ?? 'Stadt'}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Berechnungsart</Label>
                        <Select
                          value={form.accommodation_tax_model}
                          onValueChange={(v) => updateForm(prop.id, 'accommodation_tax_model', v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Nicht konfiguriert" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gross_percentage">Brutto %</SelectItem>
                            <SelectItem value="net_percentage">Netto %</SelectItem>
                            <SelectItem value="per_person_per_night">Pro Person/Nacht</SelectItem>
                            <SelectItem value="per_room_per_night">Pro Zimmer/Nacht</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          Satz ({form.accommodation_tax_model?.includes('percentage') ? '%' : 'EUR'})
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={form.accommodation_tax_rate}
                          onChange={(e) => updateForm(prop.id, 'accommodation_tax_rate', e.target.value)}
                          className="h-8 text-sm"
                          placeholder="–"
                        />
                      </div>
                    </div>
                    {matchingRule && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Stadtregel: {matchingRule.city} – {formatModelLabel(matchingRule.tax_model)} {matchingRule.tax_rate}
                        {matchingRule.tax_model.includes('percentage') ? '%' : ' EUR'}
                        {matchingRule.description ? ` (${matchingRule.description})` : ''}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Reinigungsgebühr */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Preiseinstellungen</h4>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Standard-Reinigungsgebühr (EUR)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={form.default_cleaning_fee}
                        onChange={(e) => updateForm(prop.id, 'default_cleaning_fee', e.target.value)}
                        className="h-8 text-sm"
                        placeholder="z.B. 80"
                      />
                      <p className="text-xs text-muted-foreground">
                        Wird im Buchungs-Wizard automatisch vorausgefüllt.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <Button
                    size="sm"
                    className="w-full"
                    disabled={saving[prop.id]}
                    onClick={() => saveProperty(prop.id)}
                  >
                    <Save className="mr-2 h-3 w-3" />
                    {saving[prop.id] ? 'Wird gespeichert...' : 'Speichern'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
