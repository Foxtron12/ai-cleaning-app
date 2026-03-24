# PROJ-20: Messaging-Tab (Smoobu-Nachrichten)

## Status: In Progress
**Created:** 2026-03-23
**Last Updated:** 2026-03-23

## Dependencies
- Requires: PROJ-7 (Smoobu API-Integration) — API-Verbindung als Grundlage
- Requires: PROJ-10 (Auth & Multi-Tenancy) — Nutzer-Isolation
- Requires: PROJ-19 (Gäste-Registrierung) — sendMessage() bereits implementiert

## Beschreibung
Eigener Dashboard-Tab „Nachrichten" mit WhatsApp-ähnlicher Thread-Ansicht. Nachrichten werden live aus Smoobu geladen (kein lokaler Sync), Antworten direkt aus der App über die Smoobu Messages API gesendet. Nachrichten-Templates mit Variablen für wiederkehrende Kommunikation.

## User Stories
- Als Vermieter möchte ich alle Gäste-Konversationen in einer Thread-Liste sehen (sortiert nach Aktualität), damit ich schnell den Überblick habe wer geschrieben hat.
- Als Vermieter möchte ich eine Konversation öffnen und den gesamten Nachrichtenverlauf lesen, damit ich den Kontext einer Anfrage verstehe.
- Als Vermieter möchte ich direkt aus der App auf Gäste-Nachrichten antworten, damit ich nicht zwischen App und Smoobu wechseln muss.
- Als Vermieter möchte ich vorgefertigte Nachrichten-Templates mit Platzhaltern (Gastname, Property, Check-in etc.) nutzen, damit ich wiederkehrende Nachrichten schnell versenden kann.
- Als Vermieter möchte ich neue Templates erstellen und bestehende bearbeiten, damit ich meine Standard-Kommunikation anpassen kann.
- Als Vermieter möchte ich sehen welche Konversationen ungelesene Nachrichten haben, damit ich nichts verpasse.
- Als Vermieter möchte ich Konversationen nach Property filtern können, um schnell die relevanten Nachrichten zu finden.

## Acceptance Criteria

### Thread-Liste (Hauptansicht)
- [ ] Sidebar-Navigation: neuer Eintrag „Nachrichten" mit MessageSquare-Icon
- [ ] Thread-Liste: zeigt alle Konversationen sortiert nach letzter Nachricht (neueste oben)
- [ ] Jeder Thread zeigt: Gastname, Property-Name, letzte Nachricht (gekürzt), Zeitstempel, Ungelesen-Badge
- [ ] Property-Filter: Dropdown zur Einschränkung auf bestimmtes Objekt
- [ ] Loading State: Skeleton-Loader während Threads geladen werden
- [ ] Empty State: Hinweis wenn keine Konversationen vorhanden

### Konversations-Ansicht
- [ ] Klick auf Thread öffnet Nachrichtenverlauf (rechte Seite auf Desktop, neue Ansicht auf Mobile)
- [ ] Nachrichten chronologisch sortiert (älteste oben)
- [ ] Visuelle Unterscheidung: Gast-Nachrichten links, eigene Nachrichten rechts (Chat-Bubbles)
- [ ] Zeitstempel pro Nachricht
- [ ] Scroll-to-Bottom bei Öffnung
- [ ] Nachrichten werden per Smoobu API geladen (GET /reservations/{id}/messages)

### Nachricht senden
- [ ] Textfeld am unteren Rand der Konversation
- [ ] Senden-Button (Send-Icon)
- [ ] Enter zum Senden, Shift+Enter für Zeilenumbruch
- [ ] Nachricht wird via Smoobu API gesendet (POST /reservations/{id}/messages)
- [ ] Optimistisches UI: Nachricht erscheint sofort, wird bei Fehler rot markiert
- [ ] Loading-State während des Sendens

### Nachrichten-Templates
- [ ] Template-Button neben dem Textfeld (Vorlagen-Icon)
- [ ] Template-Auswahl: Dropdown/Popover mit verfügbaren Vorlagen
- [ ] Variablen-Unterstützung: `{gastname}`, `{property}`, `{checkin}`, `{checkout}`, `{registrierungslink}`
- [ ] Variablen werden beim Einfügen automatisch mit Buchungsdaten ersetzt
- [ ] Standard-Templates mitliefern: Check-in-Info, Check-out-Erinnerung, Registrierungslink
- [ ] Benutzerdefinierte Templates: Erstellen, Bearbeiten, Löschen über Einstellungen oder Inline

### API-Integration
- [ ] SmoobuClient erweitern: `getMessages(reservationId, page?)` Methode
- [ ] SmoobuClient erweitern: `getThreads(page?, apartmentIds?)` Methode
- [ ] API-Route: `GET /api/messages/threads` (authentifiziert, lädt Smoobu-Threads)
- [ ] API-Route: `GET /api/messages/[reservationId]` (authentifiziert, lädt Nachrichten einer Buchung)
- [ ] API-Route: `POST /api/messages/[reservationId]` (authentifiziert, sendet Nachricht via Smoobu)

## Edge Cases
- Buchung ohne Smoobu-ID (Direktbuchung aus Wizard ohne Smoobu-Sync): Thread kann nicht geladen werden → Hinweis anzeigen
- Smoobu API nicht verbunden: Nachrichten-Tab zeigt Hinweis „Smoobu-Integration erforderlich"
- Smoobu API Rate-Limit erreicht: Retry-Logik mit Hinweis an den Nutzer
- Sehr lange Konversation (>100 Nachrichten): Pagination mit „Ältere laden"-Button
- Nachricht senden fehlschlägt: Fehler-Toast, Nachricht bleibt im Textfeld
- HTML in Nachrichten (Smoobu liefert teils HTML): Sicher rendern oder zu Plain-Text konvertieren
- Gleichzeitig in Smoobu und App geöffnet: Kein Conflict, da App live aus Smoobu liest
- Template-Variable nicht verfügbar (z.B. kein Registrierungslink generiert): Platzhalter leer lassen oder Warnung

## Nachrichten-Templates (Standard)

### Check-in Information (DE)
```
Liebe/r {gastname},

herzlich willkommen in "{property}"!

Ihr Check-in ist am {checkin}. Hier die wichtigsten Infos:
- Schlüsselübergabe: [PLATZHALTER]
- WLAN-Passwort: [PLATZHALTER]
- Ansprechpartner: [PLATZHALTER]

Falls Sie den Meldeschein noch nicht ausgefüllt haben:
{registrierungslink}

Wir freuen uns auf Sie!
```

### Check-out Reminder (DE)
```
Liebe/r {gastname},

Ihr Aufenthalt in "{property}" endet am {checkout}.

Bitte beachten Sie:
- Check-out bis [PLATZHALTER] Uhr
- Schlüssel [PLATZHALTER]

Vielen Dank für Ihren Besuch!
```

### Registrierungslink (DE/EN)
Bereits implementiert in PROJ-19 (`src/lib/guest-registration-templates.ts`).

## Technical Requirements
- Performance: Thread-Liste < 2s Ladezeit (abhängig von Smoobu API-Antwortzeit)
- Security: Alle API-Routes authentifiziert, Smoobu API-Key verschlüsselt
- Responsive: Mobile-first Chat-UI (375px – 1440px)
- Keine lokale Datenspeicherung: Nachrichten werden live aus Smoobu geladen

---

## Tech Design (Solution Architect) – 2026-03-23

### A) Komponenten-Struktur

```
/dashboard/nachrichten (Messaging-Seite)
├── Smoobu-Check (Integration verbunden? Wenn nein → Hinweisbanner)
├── Layout: Split-View (Desktop) / Single-View (Mobile)
│
├── LINKE SEITE: Thread-Liste
│   ├── Property-Filter (Dropdown)
│   ├── Thread-Karten (scrollbar)
│   │   ├── Gastname + Property-Badge
│   │   ├── Letzte Nachricht (gekürzt, max 2 Zeilen)
│   │   ├── Zeitstempel (relativ: "vor 2 Std.")
│   │   └── Ungelesen-Badge (Zahl)
│   ├── Loading-Skeleton
│   └── Empty State ("Keine Konversationen")
│
└── RECHTE SEITE: Konversations-Ansicht
    ├── Header (Gastname, Property, Check-in/out)
    ├── Nachrichtenverlauf (scrollbar)
    │   ├── Chat-Bubble LINKS (Gast) — grauer Hintergrund
    │   ├── Chat-Bubble RECHTS (Vermieter) — primärer Hintergrund
    │   ├── Zeitstempel-Trenner (Datum)
    │   └── "Ältere laden"-Button (Pagination)
    ├── Template-Leiste
    │   ├── Template-Button → Popover mit Vorlagen
    │   └── Vorlagen-Liste (Standard + Benutzerdefiniert)
    └── Eingabe-Bereich
        ├── Textarea (auto-grow, Shift+Enter = Zeilenumbruch)
        └── Senden-Button (Enter oder Klick)
```

### B) Datenmodell

**Keine neue Tabelle für Nachrichten** — werden live aus Smoobu geladen.

**Neue Tabelle `message_templates`:**

Jedes Template hat:
- Eindeutige ID (UUID)
- Nutzer-Zuordnung (user_id)
- Name (z.B. "Check-in Info")
- Nachrichtentext mit Platzhaltern ({gastname}, {property}, etc.)
- Sprache (de/en)
- Standard-Flag (nicht löschbar)
- Sortierreihenfolge
- Erstellungszeitpunkt

Gespeichert in: Supabase mit RLS (Nutzer sehen nur eigene Templates)

**Verfügbare Template-Variablen:**

| Variable | Quelle | Beispiel |
|----------|--------|---------|
| {gastname} | Buchung: Vor- + Nachname | "Max Mustermann" |
| {property} | Property: Name | "Apartment Dresden City" |
| {checkin} | Buchung: Check-in Datum | "25.03.2026" |
| {checkout} | Buchung: Check-out Datum | "28.03.2026" |
| {registrierungslink} | PROJ-19: Token-URL | "https://app.../guest/register/..." |

### C) Datenfluss

```
Thread-Liste laden:
  App → API /api/messages/threads → SmoobuClient.getThreads()
  → Smoobu API → Thread-Liste zurück

Konversation öffnen:
  App → API /api/messages/[reservationId] → SmoobuClient.getMessages()
  → Smoobu API → Nachrichten zurück

Nachricht senden:
  App (optimistisch anzeigen) → API POST /api/messages/[reservationId]
  → SmoobuClient.sendMessage() → Smoobu API → OTA-Kanal

Template einfügen:
  Template wählen → Variablen ersetzen → Text ins Eingabefeld
```

### D) API-Routen

| Route | Methode | Zweck |
|-------|---------|-------|
| /api/messages/threads | GET | Thread-Übersicht aus Smoobu (mit Property-Filter) |
| /api/messages/[reservationId] | GET | Nachrichten einer Buchung laden |
| /api/messages/[reservationId] | POST | Nachricht via Smoobu senden |

Alle authentifiziert, nutzen verschlüsselten Smoobu API-Key.

### E) SmoobuClient-Erweiterung

| Methode | Smoobu-Endpoint | Beschreibung |
|---------|----------------|--------------|
| getThreads(page?, apartmentIds?) | GET /threads | Thread-Übersicht mit Ungelesen-Zähler |
| getMessages(reservationId, page?) | GET /reservations/{id}/messages | Nachrichtenverlauf |
| sendMessage() | POST /reservations/{id}/messages | Bereits vorhanden (PROJ-19) |

### F) Tech-Entscheidungen

| Entscheidung | Begründung |
|-------------|------------|
| Kein lokaler Nachrichten-Sync | Weniger Komplexität, immer aktuelle Daten |
| Templates in Supabase | Nutzer können eigene Templates erstellen |
| Split-View Layout | WhatsApp-Muster, Desktop beides gleichzeitig |
| Optimistisches UI beim Senden | Fühlt sich schnell an, Fehler werden nachträglich markiert |
| HTML-zu-Text Konvertierung | Sicherheit (XSS), Smoobu liefert teils HTML |

### G) Packages

Kein neues Package nötig — alles bereits installiert (shadcn/ui, date-fns, lucide-react).

### H) Neue Dateien

```
src/app/dashboard/nachrichten/page.tsx            — Messaging-Seite
src/components/dashboard/message-thread-list.tsx   — Thread-Liste
src/components/dashboard/message-conversation.tsx  — Chat-Ansicht
src/components/dashboard/message-templates.tsx     — Template-Auswahl
src/app/api/messages/threads/route.ts              — Threads laden
src/app/api/messages/[reservationId]/route.ts      — Nachrichten laden + senden
src/lib/message-template-defaults.ts               — Standard-Templates
supabase/migrations/..._message_templates.sql      — Templates-Tabelle
```

### I) Bestehende Dateien zu ändern

| Datei | Änderung |
|-------|----------|
| src/components/dashboard/app-sidebar.tsx | Nav-Eintrag "Nachrichten" |
| src/lib/smoobu.ts | getThreads() + getMessages() |
| src/lib/types.ts | MessageTemplate Type |
| src/lib/database.types.ts | Regenerieren nach Migration |

### J) Build-Reihenfolge

1. DB-Migration (message_templates + Standard-Templates + RLS)
2. SmoobuClient erweitern (getThreads, getMessages)
3. API-Routen (threads, messages GET/POST)
4. Sidebar-Eintrag ("Nachrichten")
5. Thread-Liste (linke Seite)
6. Konversations-Ansicht (Chat-UI)
7. Nachricht senden (Eingabe + optimistisches UI)
8. Template-System (Popover + Variable-Ersetzung + CRUD)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
