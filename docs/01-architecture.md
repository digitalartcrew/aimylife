# Architecture & Workflow Blueprint

No server, no database, no auth provider. Google Workspace does the data and email work;
one static HTML file does the student-facing portal.

---

## 1. The system at a glance

```
                    ┌──────────────────────┐
  Visitor ────────▶ │  index.html          │   public landing page: tracks, schedule,
                    │  (landing)           │   signup steps, slide decks
                    └──────────┬───────────┘
                               │ "Register" button
                               ▼
                    ┌──────────────────────┐
  Student ────────▶ │  Google Form         │   one form, "Which track?" dropdown
                    │  (registration)      │
                    └──────────┬───────────┘
                               │ native link
                               ▼
                    ┌──────────────────────┐
                    │  Google Sheet        │  ← the only database
                    │  ├ Form Responses 1  │     raw, never edited
                    │  ├ Roster            │     the CRM
                    │  ├ Sessions          │     schedule + Zoom + recordings
                    │  └ Email Log         │     audit + dedupe
                    └──────────┬───────────┘
                               │ onFormSubmit trigger
                               ▼
                    ┌──────────────────────┐
                    │  Apps Script         │  free, runs on Google's servers
                    │  • confirmation mail │
                    │  • calendar invite   │
                    │  • 24h + 1h reminders│
                    │  • exportPortalJson()│
                    └──────────┬───────────┘
                               │ you paste JSON weekly
                               ▼
  Student ────────▶ ┌──────────────────────┐ ────▶ YouTube (unlisted)
   + passcode       │  portal/index.html   │ ────▶ Google Drive (slides/PDFs)
                    │  static, 1 file      │
                    └──────────────────────┘
                     hosted free on GitHub Pages / Netlify / Cloudflare Pages
```

Running cost: **$0**, assuming Zoom's free tier or a Zoom Pro seat you already pay for.
Apply to [Google for Nonprofits](https://www.google.com/nonprofits/) — a 501(c)(3) gets
Workspace free, which raises your daily email cap from 100 to 1,500.

---

## 2. Build it in order

### Step 1 — The registration Form

Create **one** form, not four. A single form with a track question means one sheet,
one script, one roster.

| # | Question | Type | Required |
|---|----------|------|----------|
| — | *Setting:* Collect email addresses → **Responder input** (or Verified) | — | — |
| 1 | Full name | Short answer | ✅ |
| 2 | Which track are you joining? | Multiple choice | ✅ |
| 3 | Phone (optional, for session reminders) | Short answer | ☐ |
| 4 | How comfortable are you with AI tools today? | Multiple choice | ☐ |
| 5 | What do you hope to get out of this? | Paragraph | ☐ |
| 6 | I agree sessions are recorded and shared with the cohort | Checkbox | ✅ |

Track question options — use this exact wording so the script's matcher resolves them:

- `AI for Personal Life`
- `AI for Small Business`
- `AI for Generating Revenue`
- `Google AI Certification Study Cohort`

> The script matches on substrings (`personal`, `business`, `revenue`, `cert`), so minor
> rewording is fine. If you rename a track entirely, update `CONFIG.TRACKS` in `Code.gs`.

Then: **Responses → Link to Sheets → Create a new spreadsheet.** Name it
`AI My Life — Operations`.

### Step 2 — Install the script

1. In that Sheet: **Extensions → Apps Script**.
2. Delete the placeholder, paste all of `apps-script/Code.gs`, save.
3. Run `setup()`. Approve the permission screen (you'll see "unverified app" — that's
   normal for your own script; click *Advanced → Go to …*).
4. `setup()` creates the Roster / Sessions / Email Log tabs and installs both triggers.
5. **Project Settings → Script Properties → Add**: `PORTAL_PASSCODE` = your cohort passcode.
6. Reload the Sheet. An **AI My Life** menu appears in the toolbar.

### Step 3 — Fill in the Sessions sheet

This one tab drives Zoom links in emails, calendar invites, *and* the portal.

| Column | Example | Notes |
|---|---|---|
| Track ID | `personal` | must match the portal track id exactly |
| Session # | `1` | |
| Title | `Your First AI Assistant` | |
| Start (date + time) | `1/14/2026 18:30:00` | must be a real date cell, not text |
| Duration (min) | `75` | |
| Zoom Join URL | `https://us06web.zoom.us/j/…` | use a **recurring** meeting per track |
| Zoom Passcode | `123456` | |
| Status | `scheduled` | `cancelled` suppresses reminders |
| Summary | one or two sentences | shown on the portal card |
| Tags (comma sep) | `prompting, mobile` | feeds portal search |
| Video Kind | `youtube` / `drive` / `vimeo` / `url` | filled in after the session |
| Video ID / URL | `dQw4w9WgXcQ` | the **id**, not the full link (except `url` kind) |
| Slides URL | Drive share link | |
| Resource Labels (\| sep) | `Cheat-sheet\|Worksheet` | pipe-separated, pairs with URLs |
| Resource URLs (\| sep) | `https://…\|https://…` | same order as labels |
| Calendar Event ID | *(leave blank)* | the script fills this in |

**Format the date column first:** select it → Format → Number → Date time. A text date
silently breaks reminders.

### Step 4 — Zoom

Create **one recurring meeting per track** (Zoom → Meetings → Schedule → Recurring, "No
fixed time"). One stable join URL for the whole track, pasted into every session row.

Settings to turn on:
- **Record to the cloud** automatically (Pro) — or local recording on free.
- **Waiting room** on. **Require passcode** on.
- **Only authenticated users** off — your students aren't on your Workspace domain.

Free Zoom caps group meetings at 40 minutes. For 75-minute workshops you need Zoom Pro
(~$150/yr, often discounted for nonprofits) or you break at 40 minutes and restart.

### Step 5 — Deploy the site

Upload the **repo root** to any static host — that publishes the public landing page at `/`,
the slide decks at `/slides/`, and the gated portal at `/portal/`:

| Host | How | Custom domain |
|---|---|---|
| **Cloudflare Pages** | drag-and-drop the folder | free, free SSL |
| **Netlify Drop** | drag onto app.netlify.com/drop | free |
| **GitHub Pages** | push repo, Settings → Pages | free |
| **Squarespace/Wix** | embed via a Code block, or host the file elsewhere and link out | varies |

Point `aimylife.org` at it. Then paste your Form's public `viewform` URL into the `LINKS.form`
constant at the bottom of the root `index.html` so every **Register** button on the landing
page points at the real form.

**The portal must be served over HTTPS.** The Web Crypto API is unavailable on `file://`, so
double-clicking the HTML file will show an error instead of unlocking. To test locally:
`python3 -m http.server 8000` then open `http://localhost:8000/` for the landing page and
`http://localhost:8000/portal/` for the archive.

### Step 6 — Set your real passcode

1. Open `https://your-portal-url/#admin`.
2. Type the passcode you want (e.g. `emerald-cohort-26`).
3. Click **Mode A — verifier only**, copy the output, paste it over the `VERIFIER` block
   in `index.html`. Re-upload.
4. Put the same passcode into Script Properties as `PORTAL_PASSCODE` so confirmation
   emails hand out the right one.

The shipped default is `aimylife2026` — change it before launch.

---

## 3. What each automation does

| Trigger | Function | Effect |
|---|---|---|
| Form submitted | `onFormSubmit` | appends to Roster, resolves the track, finds the next session for it, adds the person as a guest on that session's calendar event, sends a branded confirmation with the Zoom link + portal passcode, stamps the send time |
| Every hour | `sendReminders` | emails everyone in a track ~24h and ~1h before each session; the Email Log prevents duplicates |
| Menu click | `exportPortalJson` | reads the Sessions sheet and renders portal-ready JSON in a copyable dialog |
| Menu click | `sendTestConfirmation` | sends yourself the exact email a student gets |

All email is sent with `MailApp`, which is free and has no external dependency.

---

## 4. Known limits — read before launch

**Daily email quota.** Consumer Gmail: **100 recipients/day**. Google Workspace:
**1,500/day**. A 60-person cohort getting a 24h + 1h reminder = 120 emails in a day, which
blows past the consumer cap. Get the nonprofit Workspace grant, or set `REMIND_1H: false`.
The script checks `MailApp.getRemainingDailyQuota()` and logs skips rather than failing
silently — check the Email Log tab.

**The passcode gate is a lock on the door, not a vault.** Anyone determined can read the
page source. Two levels of defense:

| | Mode A (default) | Mode B (encrypted) |
|---|---|---|
| Passcode check | PBKDF2-SHA256, 310k iterations | same derivation |
| Content in source | readable JSON | AES-256-GCM ciphertext |
| Without the passcode you get | the video links | an unreadable blob |

Mode B is strictly better and costs you one extra paste per week. Generate it at `#admin`.

**Even Mode B can't stop link sharing.** Once a student unlocks the page, they can copy the
YouTube URL and send it anywhere. If a recording genuinely must not leak, host it in Google
Drive shared only to roster addresses — viewers then have to be signed in to a permitted
Google account, and Drive enforces that server-side. Use `drive` as the Video Kind. The
tradeoff is friction: students must be signed into the right Google account.

For most free community workshops, unlisted YouTube + a passcode gate is the right call.
Reserve Drive-restricted hosting for anything with student faces, names, or business details
in it.

**Calendar invites come from your personal calendar.** `CalendarApp.getDefaultCalendar()`
uses the account that owns the script. Create a dedicated `hello@aimylife.org` account and
own everything from there — form, sheet, script, calendar, Zoom, YouTube channel.

---

## 5. Optional: skip the weekly paste

`exportPortalJson()` can be published as a web app returning JSON, and the portal can fetch
it at load time — no re-upload per session. Add to `Code.gs`:

```javascript
function doGet() {
  return ContentService
    .createTextOutput(exportPortalJsonSilent_())
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deploy → New deployment → Web app → Execute as *me*, Access *Anyone*.

**This makes your recording links publicly readable at that URL.** It defeats the point of
the gate. Only do this if your recordings are genuinely non-sensitive, and accept that the
portal becomes a convenience wrapper rather than an access control. The weekly paste is 90
seconds — recommended to keep it.
