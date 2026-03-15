# PROJ-17: Buchungs-Dokumenten-Upload

## Status: In Review
**Created:** 2026-03-15
**Last Updated:** 2026-03-15

## Dependencies
- Requires: PROJ-2 (Buchungsmanagement) - Buchungs-Detail-Sheet als UI-Basis
- Requires: PROJ-6 (Beherbergungssteuer-Tracking) - BhSt-Befreiungsstatus
- Requires: PROJ-10 (User Authentication & Multi-Tenancy) - Supabase Storage mit User-Isolation

---

## Beschreibung

Vermieter können im Buchungs-Detail-Sheet beliebige Dokumente zu einer Buchung hochladen und verwalten. Primärer Anwendungsfall: **Befreiungsbelege für die Beherbergungssteuer** (z.B. amtlicher Nachweis für Geschäftsreisende, Bescheid bei Langzeitaufenthalt, Schulungsnachweise). Die Dokumente werden in Supabase Storage gespeichert und sind dauerhaft mit der Buchung verknüpft.

---

## User Stories

1. Als Vermieter möchte ich im Buchungs-Detail-Sheet mehrere Dokumente hochladen können (PDF, JPG, PNG), damit ich Befreiungsbelege direkt bei der Buchung archiviere.
2. Als Vermieter möchte ich alle hochgeladenen Dokumente einer Buchung in einer Liste sehen, damit ich jederzeit prüfen kann, welche Belege vorhanden sind.
3. Als Vermieter möchte ich einzelne Dokumente wieder löschen können, damit ich veraltete oder falsche Uploads entfernen kann.
4. Als Vermieter möchte ich hochgeladene Dokumente direkt im Browser öffnen oder herunterladen können, damit ich sie bei Bedarf prüfen kann.

---

## Acceptance Criteria

### AC-1: Upload-Bereich im Buchungs-Detail-Sheet

- [ ] Im Buchungs-Detail-Sheet (Drawer/Sheet-Komponente) gibt es einen neuen Abschnitt „Dokumente / Belege"
- [ ] Der Abschnitt ist immer sichtbar (nicht nur bei befreiten Buchungen) – für BhSt-Befreiungsbelege aber auch für sonstige Buchungsdokumente
- [ ] Der Upload-Bereich zeigt:
  - Drag-and-Drop-Zone ODER Button „Dokument hochladen"
  - Erlaubte Formate: PDF, JPG, JPEG, PNG
  - Maximale Dateigröße: 10 MB pro Datei
  - Mehrere Dateien gleichzeitig hochladbar
- [ ] Beim Upload erscheint ein Ladeindikator pro Datei
- [ ] Nach erfolgreichem Upload erscheint die Datei sofort in der Dokumenten-Liste (kein Seiten-Reload nötig)
- [ ] Bei Fehler (zu groß, falsches Format, Netzwerkfehler) erscheint eine verständliche Fehlermeldung per Toast

### AC-2: Dokumenten-Liste

- [ ] Alle hochgeladenen Dokumente werden als Liste angezeigt:
  - Datei-Icon (PDF/Bild je nach Typ)
  - Dateiname (original)
  - Dateigröße (z.B. „1,2 MB")
  - Upload-Datum
  - Button „Öffnen/Herunterladen"
  - Button „Löschen" (Trash-Icon, mit kurzem Bestätigungsklick oder direkt)
- [ ] Wenn keine Dokumente vorhanden sind, wird ein leerer Zustand angezeigt: „Noch keine Dokumente – Beleg hochladen"
- [ ] Die Liste wird beim Öffnen des Detail-Sheets automatisch geladen

### AC-3: Datenspeicherung

- [ ] Dokumente werden in **Supabase Storage** gespeichert, in einem Bucket `booking-documents`
- [ ] Pfadstruktur: `{user_id}/{booking_id}/{filename}` – strikt nach User und Buchung getrennt
- [ ] Metadaten werden in einer neuen Tabelle `booking_documents` gespeichert:

  | Spalte | Typ | Beschreibung |
  |--------|-----|-------------|
  | `id` | uuid, PK | Auto-generiert |
  | `booking_id` | uuid, FK → bookings.id | Verknüpfte Buchung |
  | `user_id` | uuid, FK → auth.users.id | Besitzer (RLS) |
  | `file_name` | text | Originaler Dateiname |
  | `file_size` | int8 | Dateigröße in Bytes |
  | `mime_type` | text | z.B. `application/pdf` |
  | `storage_path` | text | Pfad im Supabase-Storage-Bucket |
  | `created_at` | timestamptz | Upload-Zeitpunkt |

- [ ] RLS-Policy: Nutzer können nur ihre eigenen `booking_documents` lesen/schreiben/löschen
- [ ] Storage-Policy: Nutzer können nur Dateien unter `{user_id}/` lesen/schreiben/löschen

### AC-4: Öffnen und Herunterladen

- [ ] Klick auf „Öffnen/Herunterladen" generiert einen **signierten temporären URL** (Supabase `createSignedUrl`, Gültigkeitsdauer: 60 Sekunden)
- [ ] PDFs werden in einem neuen Browser-Tab geöffnet
- [ ] Bilder werden in einem neuen Browser-Tab geöffnet oder direkt heruntergeladen
- [ ] Der signierte URL läuft ab – kein dauerhafter öffentlicher Zugriff

### AC-5: Löschen

- [ ] Klick auf Löschen löscht:
  1. Die Datei aus Supabase Storage
  2. Den Metadaten-Eintrag in `booking_documents`
- [ ] Nach dem Löschen verschwindet der Eintrag sofort aus der Liste (optimistic update oder Reload)
- [ ] Fehler beim Löschen (z.B. Storage-Fehler) werden per Toast angezeigt; der Eintrag bleibt in der Liste

---

## Edge Cases

1. **Doppelter Dateiname:** Wenn eine Datei mit gleichem Namen nochmals hochgeladen wird, wird die neue Datei mit einem Timestamp-Suffix gespeichert (`beleg_20260315_143022.pdf`), um Konflikte zu vermeiden
2. **Buchung gelöscht:** Wenn eine Buchung gelöscht wird, bleiben Dokumente in Storage bestehen (Storage wird NICHT kaskadiert gelöscht) – entsprechender Hinweis im Code. Ggf. manuelles Cleanup nötig.
3. **Großer Upload:** Upload-Fortschritt ist sichtbar bei Dateien > 1 MB
4. **Gleichzeitige Uploads:** Mehrere Dateien können gleichzeitig hochgeladen werden (parallele Upload-Requests)
5. **Offline-Zustand:** Fehler wird angezeigt, keine Datei wird in der Liste angezeigt
6. **Mobil:** Der Upload-Bereich funktioniert auf Mobilgeräten über die native Dateiauswahl (kein Drag-and-Drop nötig)

---

## Datenbankänderungen

1. **Neue Tabelle:** `booking_documents` (mit RLS)
2. **Supabase Storage Bucket:** `booking-documents` (privat, kein öffentlicher Zugriff)

---

## Betroffene Dateien (Orientierung für Entwickler)

| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/booking-detail-sheet.tsx` | Neuer Abschnitt „Dokumente/Belege" mit Upload + Liste |
| `src/app/api/booking-documents/upload/route.ts` (neu) | Datei-Upload-Endpoint (Supabase Storage + DB-Insert) |
| `src/app/api/booking-documents/[id]/route.ts` (neu) | DELETE-Endpoint (Storage + DB-Delete) |
| Supabase Migration | Neue Tabelle `booking_documents` mit RLS |
| Supabase Storage | Bucket `booking-documents` mit Storage-Policies anlegen |

---

## Tech Design (Solution Architect)
**Hinzugefügt:** 2026-03-15

### Überblick
Neuer Dokumenten-Upload direkt im Buchungs-Detail-Sheet. Erfordert:
- 1 neue DB-Tabelle (`booking_documents`) mit RLS
- 1 neuer Supabase Storage Bucket (`booking-documents`) mit Storage-Policies
- 2 neue API-Endpoints (Upload + Delete)
- 1 UI-Erweiterung im bestehenden Booking-Detail-Sheet

---

### Komponenten-Baum

```
BookingDetailSheet (bestehend, 704 Zeilen)
├── [bestehend] SheetHeader mit Gastname
├── [bestehend] Buchungsdetails (Zeitraum, Finanzen, etc.)
├── [bestehend] Action-Buttons (Rechnung, Meldeschein, etc.)
├── Separator
├── [NEU] Abschnitt „Dokumente / Belege"
│   ├── Upload-Button „Dokument hochladen" (+ hidden file input)
│   │   ├── Akzeptiert: PDF, JPG, JPEG, PNG
│   │   ├── Max: 10 MB pro Datei
│   │   ├── Mehrfach-Upload möglich
│   │   └── Ladeindikator pro Datei
│   ├── Dokumenten-Liste (wenn Dokumente vorhanden)
│   │   └── Pro Dokument:
│   │       ├── Datei-Icon (FileText für PDF, Image für Bilder)
│   │       ├── Dateiname + Dateigröße + Datum
│   │       ├── Button „Öffnen" → signierter URL → neuer Tab
│   │       └── Button „Löschen" (Trash-Icon)
│   └── Leerer Zustand: „Noch keine Dokumente"
├── Separator
├── [bestehend] Bearbeiten-Dialog
```

### Datenmodell

**Neue Tabelle: `booking_documents`**
```
Jedes Dokument hat:
- Eindeutige ID (auto-generiert)
- Buchungs-Referenz (booking_id → bookings.id)
- Besitzer (user_id → auth.users.id) – für RLS
- Originaler Dateiname
- Dateigröße in Bytes
- MIME-Typ (application/pdf, image/jpeg, etc.)
- Speicherpfad im Storage-Bucket
- Upload-Zeitpunkt

Gespeichert in: Supabase Postgres + Supabase Storage
```

**Supabase Storage Bucket: `booking-documents`**
```
Bucket-Typ: Privat (kein öffentlicher Zugriff)
Pfadstruktur: {user_id}/{booking_id}/{dateiname_mit_timestamp}
Zugriff: Nur über signierte URLs (60 Sek. Gültigkeit)
```

### Datenfluss

**Upload:**
1. Nutzer wählt Datei(en) im Detail-Sheet
2. Frontend validiert: Format (PDF/JPG/PNG) + Größe (≤ 10 MB)
3. POST `/api/booking-documents/upload` mit FormData (Datei + booking_id)
4. API-Endpoint: Prüft Auth → Upload in Storage → Insert in `booking_documents` → Response mit Metadaten
5. Frontend fügt neues Dokument sofort zur Liste hinzu

**Öffnen/Herunterladen:**
1. Klick auf „Öffnen" → Frontend ruft `supabase.storage.createSignedUrl()` auf
2. Signierter URL (60 Sek.) wird generiert
3. Neuer Browser-Tab öffnet die Datei

**Löschen:**
1. Klick auf „Löschen" → DELETE `/api/booking-documents/[id]`
2. API-Endpoint: Prüft Auth → Löscht aus Storage → Löscht aus DB → Response
3. Frontend entfernt Eintrag aus der Liste

### Sicherheit

| Schicht | Schutz |
|---------|--------|
| **API-Endpoints** | Auth-Check: nur eingeloggte User |
| **DB (RLS)** | `booking_documents` hat RLS: `user_id = auth.uid()` für alle Operationen |
| **Storage-Policies** | User kann nur unter `{own_user_id}/` lesen/schreiben/löschen |
| **Datei-Zugriff** | Nur über signierte URLs (60 Sek.), kein dauerhafter Link |
| **Validierung** | Server-seitig: Dateityp + Dateigröße + Zod-Schema |

### Betroffene Dateien

| Datei | Neu/Änderung | Beschreibung |
|-------|-------------|-------------|
| `src/components/dashboard/booking-detail-sheet.tsx` | Änderung | Upload-Button + Dokumenten-Liste |
| `src/app/api/booking-documents/upload/route.ts` | Neu | Upload-Endpoint (Auth + Storage + DB-Insert) |
| `src/app/api/booking-documents/[id]/route.ts` | Neu | Delete-Endpoint (Auth + Storage-Delete + DB-Delete) |
| `src/lib/database.types.ts` | Änderung | Neuer Typ `booking_documents` |
| Supabase Migration | Neu | Tabelle `booking_documents` + RLS-Policies |
| Supabase Storage | Neu | Bucket `booking-documents` + Storage-Policies |

### Keine neuen Packages
- Supabase Storage API ist bereits verfügbar über `@supabase/supabase-js`
- Alle UI-Komponenten (Button, Sheet, etc.) sind bereits installiert

### Tech-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| API-Endpoint für Upload (nicht direkt vom Client) | Server kann Auth prüfen + Dateityp/Größe validieren + service_role für Storage verwenden |
| Signierte URLs statt öffentlicher Bucket | Sicherheit: Dokumente sind sensibel (Befreiungsbelege mit personenbezogenen Daten) |
| Metadaten in separater Tabelle (nicht JSONB in bookings) | Saubere Struktur, RLS pro Dokument, einfaches Löschen, keine Locking-Probleme bei parallelen Uploads |
| Timestamp im Dateinamen | Verhindert Konflikte bei doppelten Dateinamen |
| Upload-Button statt Drag-and-Drop | Einfacher, funktioniert auf Mobil, kein extra Package nötig. Drag-and-Drop kann später ergänzt werden. |

---

## Deployment
_To be added by /deploy_

---

## QA Test Results

**Tested:** 2026-03-15
**App URL:** http://localhost:3000/dashboard/buchungen (Buchungs-Detail-Sheet)
**Tester:** QA Engineer (AI)
**Build:** PASS (production build succeeds without errors)

### Acceptance Criteria Status

#### AC-1: Upload-Bereich im Buchungs-Detail-Sheet
- [x] Neuer Abschnitt "Dokumente / Belege" im Buchungs-Detail-Sheet vorhanden (booking-detail-sheet.tsx line 834)
- [x] Abschnitt ist immer sichtbar (nicht nur bei befreiten Buchungen) -- `DocumentsSection` wird ohne Bedingung gerendert
- [x] Upload-Button "Hochladen" vorhanden (line 521-534)
- [x] Erlaubte Formate: PDF, JPG, JPEG, PNG -- sowohl client-seitig (line 352, 410) als auch server-seitig (upload/route.ts line 5, 42)
- [x] Maximale Dateigroesse: 10 MB -- sowohl client-seitig (line 353, 414) als auch server-seitig (upload/route.ts line 6, 50)
- [x] Mehrere Dateien gleichzeitig hochladbar (`multiple` Attribut auf file input, line 539)
- [x] Ladeindikator pro Datei (line 555-563, uploading-State mit Keys)
- [x] Nach erfolgreichem Upload erscheint Datei sofort in der Liste (line 444-446: `setDocuments(prev => [json.document, ...prev])`)
- [x] Bei Fehler erscheint verstaendliche Fehlermeldung per Toast (line 411, 415, 419, 439, 449)
- [ ] BUG-1: Es gibt keinen Drag-and-Drop-Upload-Bereich. Die AC sagt "Drag-and-Drop-Zone ODER Button" -- nur der Button ist implementiert. Da die Tech Design Entscheidung explizit "Upload-Button statt Drag-and-Drop" waehlt und die AC ein ODER erlaubt, ist dies akzeptabel aber erwaehnenswert.

#### AC-2: Dokumenten-Liste
- [x] Dokumente als Liste angezeigt mit: Datei-Icon (PDF/Bild je nach Typ, line 361-366), Dateiname (line 583), Dateigroesse (line 587), Upload-Datum (line 587), Button "Oeffnen" (line 590-598), Button "Loeschen" (line 599-612)
- [x] Leerer Zustand: "Noch keine Dokumente -- Beleg hochladen" (line 567-570)
- [x] Liste wird beim Oeffnen des Detail-Sheets automatisch geladen (useEffect mit fetchDocuments, line 398-400)

#### AC-3: Datenspeicherung
- [x] Dokumente in Supabase Storage Bucket `booking-documents` gespeichert (upload/route.ts line 90)
- [x] Pfadstruktur: `{user_id}/{booking_id}/{filename}` -- korrekt implementiert (upload/route.ts line 83)
- [x] Metadaten-Tabelle `booking_documents` mit korrekten Spalten (Migration vorhanden, database.types.ts line 41-51)
- [x] RLS-Policy: Nutzer koennen nur eigene `booking_documents` lesen/schreiben/loeschen (Migration line 20-31)
- [x] Storage-Policy: Nutzer koennen nur unter `{user_id}/` lesen/schreiben/loeschen (Migration line 51-72)

#### AC-4: Oeffnen und Herunterladen
- [x] Klick auf "Oeffnen" generiert signierten temporaeren URL mit 60 Sekunden Gueltigkeit (line 472: `createSignedUrl(doc.storage_path, 60)`)
- [x] Datei wird in neuem Browser-Tab geoeffnet (line 479: `window.open(data.signedUrl, '_blank', 'noopener,noreferrer')`)
- [x] Signierter URL laeuft ab -- kein dauerhafter oeffentlicher Zugriff

#### AC-5: Loeschen
- [x] Klick auf Loeschen loescht Datei aus Storage UND DB-Eintrag ([id]/route.ts line 47-66)
- [x] Nach dem Loeschen verschwindet Eintrag sofort aus der Liste (line 502: `setDocuments(prev => prev.filter(...))`)
- [x] Fehler beim Loeschen werden per Toast angezeigt (line 497), Eintrag bleibt in der Liste

### Edge Cases Status

#### EC-1: Doppelter Dateiname
- [x] Timestamp-Suffix im Dateinamen verhindert Konflikte (upload/route.ts line 80-82: `${timestamp}_${sanitizedName}`)

#### EC-2: Buchung geloescht
- [x] `ON DELETE CASCADE` auf `booking_id` FK loescht Metadaten-Eintraege (Migration line 8). Storage-Dateien bleiben allerdings bestehen (kein automatisches Cleanup) -- korrektes Verhalten lt. Spec.

#### EC-3: Grosser Upload (Fortschrittsanzeige)
- [ ] BUG-2: Kein Upload-Fortschritt sichtbar. Es gibt nur einen Spinner ("Wird hochgeladen...") aber keine prozentuale Fortschrittsanzeige. Die AC sagt "Upload-Fortschritt ist sichtbar bei Dateien > 1 MB" -- das ist nur teilweise erfuellt (Spinner ja, Prozent nein).

#### EC-4: Gleichzeitige Uploads
- [x] Parallele Upload-Requests via `Promise.all` (line 408, 459)

#### EC-5: Offline-Zustand
- [x] Netzwerkfehler zeigt Toast-Fehlermeldung (line 449)

#### EC-6: Mobil
- [x] Upload funktioniert ueber native Dateiauswahl (hidden file input mit `accept` Attribut)

### Security Audit Results
- [x] Authentication: Upload-Endpoint prueft Auth per `getServerUser()` (upload/route.ts line 14-16)
- [x] Authentication: Delete-Endpoint prueft Auth per `getServerUser()` ([id]/route.ts line 14-16)
- [x] Authorization: Upload-Endpoint prueft ob Buchung dem User gehoert (upload/route.ts line 65-77)
- [x] Authorization: Delete-Endpoint prueft `user_id` Match (route.ts line 37: `.eq('user_id', user.id)`)
- [x] Authorization: RLS-Policies auf DB-Tabelle (SELECT, INSERT, DELETE mit `auth.uid() = user_id`)
- [x] Authorization: Storage-Policies pruefen `(storage.foldername(name))[1] = auth.uid()::text`
- [x] Input Validation: Dateityp server-seitig validiert (upload/route.ts line 42-47)
- [x] Input Validation: Dateigroesse server-seitig validiert (upload/route.ts line 50-55)
- [x] Input Validation: Leere Dateien abgefangen (upload/route.ts line 57-61)
- [x] Input Validation: `booking_id` per Zod als UUID validiert (upload/route.ts line 8-10, 33-39)
- [x] Input Validation: Document ID per Zod als UUID validiert ([id]/route.ts line 5-7, 22-28)
- [x] Dateinamen werden sanitized: Sonderzeichen durch Unterstriche ersetzt (upload/route.ts line 81: `file.name.replace(/[^a-zA-Z0-9._-]/g, '_')`)
- [x] Storage-Upload mit `upsert: false` -- keine versehentliche Ueberschreibung (upload/route.ts line 93)
- [x] Rollback bei DB-Insert-Fehler: Upload-Datei wird aus Storage geloescht (upload/route.ts line 120-121)
- [x] Service-Client fuer Storage-Operationen (nicht der User-Client) -- korrekte Berechtigungsebene
- [x] MIME-Type CHECK-Constraint in der DB (Migration line 11)
- [x] File-Size CHECK-Constraint > 0 in der DB (Migration line 10)
- [ ] BUG-3: Der Upload-Endpoint sendet den Auth-Token NICHT explizit im Request-Header (booking-detail-sheet.tsx line 431-433: fetch ohne Authorization-Header). Die Session wird stattdessen ueber Cookies geleitet. Das funktioniert, aber ist inkonsistent mit anderen Endpoints im Projekt (z.B. Meldeschein-Upload sendet explizit `Authorization: Bearer`). Kein Sicherheitsproblem, da `getServerUser()` Cookies ausliest.
- [x] Keine Secrets exponiert in Client-Bundle
- [x] Signierte URLs haben 60-Sekunden-Ablauf -- minimale Fenster fuer unbefugten Zugriff

### Cross-Browser & Responsive
- [x] Desktop (1440px): Dokumenten-Bereich korrekt im Sheet dargestellt
- [x] Tablet (768px): Dokumenten-Liste passt sich an
- [x] Mobil (375px): Dateinamen truncated (`truncate` class), Icons kompakt, Buttons nutzbar

### Bugs Found

#### BUG-1: Kein Drag-and-Drop (nur Button-Upload)
- **Severity:** Low
- **Description:** Nur Button-Upload implementiert, kein Drag-and-Drop-Bereich. Tech Design waehlt explizit "Upload-Button statt Drag-and-Drop", AC erlaubt "ODER".
- **Priority:** Nice to have (Erweiterung fuer spaeter)

#### BUG-2: Kein prozentualer Upload-Fortschritt
- **Severity:** Low
- **Steps to Reproduce:**
  1. Lade eine grosse Datei (z.B. 5 MB PDF) hoch
  2. Expected: Prozentualer Fortschritt sichtbar
  3. Actual: Nur Spinner "Wird hochgeladen..." ohne Prozentangabe
- **Priority:** Nice to have -- Spinner reicht fuer normale Nutzung

#### BUG-3: Auth-Token nicht explizit im Upload-Request-Header
- **Severity:** Low
- **Description:** Upload und Delete Requests senden keinen expliziten Authorization-Header. Funktioniert ueber Session-Cookies, ist aber inkonsistent mit dem Rest der App.
- **Priority:** Nice to have (Konsistenz)

### Summary
- **Acceptance Criteria:** 22/23 Sub-Kriterien bestanden, 1 akzeptabel (Drag-and-Drop ODER Button)
- **Edge Cases:** 5/6 bestanden (1 Low: fehlender Upload-Prozent)
- **Bugs Found:** 3 total (0 critical, 0 high, 0 medium, 3 low)
- **Security:** PASS -- sehr gruendliche Sicherheitsimplementierung (Auth, RLS, Storage Policies, Input Validation, Zod, Rollback)
- **Production Ready:** JA
- **Recommendation:** Deploy. Alle Bugs sind Low-Severity und betreffen UX-Extras (Drag-and-Drop, Fortschrittsanzeige) oder Code-Konsistenz. Die Sicherheitsimplementierung ist vorbildlich.
