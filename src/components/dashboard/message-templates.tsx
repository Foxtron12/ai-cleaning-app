'use client'

import { useState, useRef } from 'react'
import { FileText, Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { replaceTemplateVariables, TEMPLATE_VARIABLES } from '@/lib/message-template-defaults'
import type { MessageTemplate } from '@/lib/types'

interface MessageTemplatesProps {
  templates: MessageTemplate[]
  onInsert: (text: string) => void
  variables: {
    guestFirstName?: string
    checkInDate?: string
    checkOutDate?: string
    numberOfGuests?: string
    preCheckInLink?: string
    guestAreaLateCheckOutLink?: string
    companyName?: string
  }
  onTemplatesChange: () => void
}

export function MessageTemplates({
  templates,
  onInsert,
  variables,
  onTemplatesChange,
}: MessageTemplatesProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newLanguage, setNewLanguage] = useState<'de' | 'en'>('de')
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSelectTemplate = (template: MessageTemplate) => {
    const resolvedText = replaceTemplateVariables(template.body, variables)
    onInsert(resolvedText)
    setPopoverOpen(false)
  }

  const handleCreateNew = () => {
    setEditingTemplate(null)
    setNewName('')
    setNewBody('')
    setNewLanguage('de')
    setEditDialogOpen(true)
    setPopoverOpen(false)
  }

  const handleEdit = (template: MessageTemplate) => {
    setEditingTemplate(template)
    setNewName(template.name)
    setNewBody(template.body)
    setNewLanguage(template.language)
    setEditDialogOpen(true)
    setPopoverOpen(false)
  }

  const handleDelete = async (template: MessageTemplate) => {
    if (template.is_default) {
      toast.error('Standard-Vorlagen koennen nicht geloescht werden')
      return
    }

    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', template.id)

    if (error) {
      toast.error('Fehler beim Loeschen der Vorlage')
      return
    }

    toast.success('Vorlage geloescht')
    onTemplatesChange()
  }

  /** Insert a placeholder at the current cursor position in the textarea */
  const insertAtCursor = (placeholder: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setNewBody((prev) => prev + placeholder)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = newBody.slice(0, start)
    const after = newBody.slice(end)
    const updated = before + placeholder + after
    setNewBody(updated)

    // Restore cursor position after the inserted placeholder
    requestAnimationFrame(() => {
      const newPos = start + placeholder.length
      textarea.selectionStart = newPos
      textarea.selectionEnd = newPos
      textarea.focus()
    })
  }

  const handleSave = async () => {
    if (!newName.trim() || !newBody.trim()) {
      toast.error('Name und Text sind Pflichtfelder')
      return
    }

    setIsSaving(true)

    try {
      if (editingTemplate) {
        // Update existing
        const { error } = await supabase
          .from('message_templates')
          .update({
            name: newName.trim(),
            body: newBody.trim(),
            language: newLanguage,
          })
          .eq('id', editingTemplate.id)

        if (error) throw error
        toast.success('Vorlage aktualisiert')
      } else {
        // Create new
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Nicht angemeldet')

        const maxOrder = templates.reduce((max, t) => Math.max(max, t.sort_order), 0)

        const { error } = await supabase
          .from('message_templates')
          .insert({
            user_id: user.id,
            name: newName.trim(),
            body: newBody.trim(),
            language: newLanguage,
            is_default: false,
            sort_order: maxOrder + 1,
          })

        if (error) throw error
        toast.success('Vorlage erstellt')
      }

      setEditDialogOpen(false)
      onTemplatesChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Nachrichtenvorlage einfuegen"
          >
            <FileText className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-80 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3 pb-2">
            <h4 className="text-sm font-semibold">Vorlagen</h4>
            <p className="text-xs text-muted-foreground">
              Klicken Sie auf eine Vorlage, um sie einzufuegen.
            </p>
          </div>
          <Separator />
          <ScrollArea className="max-h-[300px]">
            <div className="flex flex-col">
              {templates.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Keine Vorlagen vorhanden
                </div>
              ) : (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-start gap-2 p-2 hover:bg-accent/50 group"
                  >
                    <button
                      onClick={() => handleSelectTemplate(template)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {template.name}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {template.language.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {template.body.slice(0, 100)}...
                      </p>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleEdit(template)}
                        aria-label={`${template.name} bearbeiten`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      {!template.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(template)}
                          aria-label={`${template.name} loeschen`}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={handleCreateNew}
            >
              <Plus className="size-4" />
              Neue Vorlage erstellen
            </Button>
          </div>
          {/* Variable hint */}
          <Separator />
          <div className="p-2">
            <p className="text-xs text-muted-foreground mb-1">Verfuegbare Variablen:</p>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <Badge key={v.key} variant="secondary" className="text-xs font-mono">
                  {v.key}
                </Badge>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? 'Aendern Sie die Vorlage und speichern Sie.'
                : 'Erstellen Sie eine neue Nachrichtenvorlage mit Platzhaltern.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Check-in Info"
                />
              </div>
              <div className="w-24">
                <Label htmlFor="template-language">Sprache</Label>
                <Select value={newLanguage} onValueChange={(v) => setNewLanguage(v as 'de' | 'en')}>
                  <SelectTrigger id="template-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">DE</SelectItem>
                    <SelectItem value="en">EN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="template-body">Nachrichtentext</Label>
              <Textarea
                id="template-body"
                ref={textareaRef}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Hi {{guestFirstName}}, ..."
                rows={8}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1.5 mb-1">
                Klicke auf einen Platzhalter, um ihn an der Cursorposition einzufuegen:
              </p>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Button
                    key={v.key}
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs font-mono"
                    onClick={() => insertAtCursor(v.key)}
                    title={v.description}
                  >
                    {v.key}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Speichern...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
