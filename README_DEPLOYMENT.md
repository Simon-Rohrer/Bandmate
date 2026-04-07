# Deployment-Anleitung fÃ¼r Bandmate

Diese Anleitung hilft dir dabei, Bandmate auf einer professionellen Hosting-Plattform zu verÃ¶ffentlichen.

## 1. Voraussetzungen
- Ein Account bei [Vercel](https://vercel.com) oder [Netlify](https://netlify.com) (beide haben kostenlose PlÃ¤ne).
- Dein Code in einem GitHub-Repository.

## 2. Hosting auf Vercel (Empfohlen)
Vercel ist ideal fÃ¼r statische Webseiten wie Bandmate.

1.  Verbinde dein GitHub-Konto mit Vercel.
2.  WÃ¤hle das `planingtool`-Repository aus.
3.  **Wichtig**: Da Bandmate kein Build-Framework nutzt, wÃ¤hle "Other" als Framework Preset.
4.  Klicke auf **Deploy**.

## 3. Umgebungsvariablen (Supabase)
Da wir `js/config.js` aus Git ausgeschlossen haben, musst du sicherstellen, dass die App auf dem Server die richtigen Keys hat.

**Option A (Manuell):**
Erstelle eine `js/config.js` direkt auf dem Server (falls dein Hoster das erlaubt) oder checke eine Version ohne sensible Daten ein und ersetze sie manuell.

**Option B (Empfohlen - Build Script):**
Du kannst ein kleines Script in deine `package.json` einbauen, das die `js/config.js` wÃ¤hrend des Deployments aus Umgebungsvariablen generiert.

Beispiel fÃ¼r `package.json`:
```json
"scripts": {
  "build": "node generate-config.js"
}
```

## 4. Supabase RLS anwenden
Vergiss nicht, die Datei `sql/setup_rls.sql` in deinem Supabase SQL-Editor auszufÃ¼hren, bevor du die App Ã¶ffentlich machst!

## 5. E-Mail Versand (SMTP)
Gehe in deinem Supabase Dashboard zu:
**Project Settings > Auth > Email Settings**

Trage dort die Daten eines SMTP-Providers (z.B. [Resend](https://resend.com)) ein, damit deine Nutzer stabil E-Mails erhalten.

---

## Checkliste vor dem Go-Live
- [ ] `privacy.html` ausgefÃ¼llt? (Suche nach ✏️)
- [ ] `impressum.html` ausgefÃ¼llt?
- [ ] RLS SQL in Supabase ausgefÃ¼hrt?
- [ ] Eigene Domain verbunden (SSL aktiv)?
