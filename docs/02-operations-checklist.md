# Weekly Operations Checklist

Target: **under 15 minutes** from "session ended" to "it's live in the portal."

Everything below assumes the one-time setup in `01-architecture.md` is done.

---

## Before you start: the one-time prep that makes 15 minutes possible

Do these once and the weekly loop stays short.

- [ ] Zoom → Settings → Recording → **Automatic cloud recording ON**. Never click record again.
- [ ] Zoom → Recording → **Audio transcript ON** (free captions, and it gives you a title).
- [ ] YouTube channel created on the `hello@aimylife.org` account, **Default upload
      visibility = Unlisted** (Settings → Upload defaults).
- [ ] Drive folder tree, shared once:
      ```
      AI My Life/
        Slides/     personal/  business/  revenue/  cert/
        Handouts/   personal/  business/  revenue/  cert/
        Recordings/ (backup copies)
      ```
- [ ] Each slide deck and handout set to **Anyone with the link → Viewer**, once, at
      creation. Re-sharing per file every week is where the time goes.
- [ ] A browser bookmark folder with four tabs: the Sheet, Zoom recordings, YouTube Studio,
      the portal `#admin` page.

---

## Weekly loop

### ⏱ 0:00–0:30 — End the session right

- [ ] Say the closing line: *"Recording and slides hit the portal within 24 hours."*
- [ ] **End Meeting for All** — don't just leave. Leaving can delay the cloud render.
- [ ] Drop any links you promised into the Zoom chat before ending (chat is saved with the
      recording and you'll have them later).

### ⏱ 0:30–3:00 — Pull the recording

Zoom takes 10–40 minutes to render a cloud recording. **Start the next step while you
wait** — come back to this one.

- [ ] zoom.us → **Recordings → Cloud Recordings** → your session.
- [ ] Download **Shared screen with speaker view** (the MP4). Skip the audio-only and
      chat files unless you want them.
- [ ] Optional 30-second trim: Zoom's built-in player has a trim handle — cut the
      pre-session dead air. Don't do a real edit; nobody expects one.

### ⏱ 3:00–6:00 — Upload to YouTube

- [ ] YouTube Studio → **Create → Upload video** → drop the MP4.
- [ ] Title pattern — keep it mechanical:
      `AI My Life — [Track] — S[##]: [Title]`
      e.g. `AI My Life — Small Business — S02: Marketing Content in 30 Minutes a Week`
- [ ] Description: paste the session Summary from the Sheet + the portal URL.
- [ ] Visibility: **Unlisted**. Confirm it — this is the one setting that matters.
- [ ] "Is this made for kids?" → **No**.
- [ ] Copy the video ID while it processes — it's the part after `v=` in the URL:
      `youtube.com/watch?v=`**`dQw4w9WgXcQ`**
- [ ] You do **not** need to wait for processing to finish. Keep going.

> Using Google Drive instead? Upload to `Recordings/`, right-click → Share. For a cohort-only
> recording set access to specific roster emails; for a normal one, "Anyone with the link →
> Viewer." The Video ID is the segment between `/d/` and `/view` in the share URL.

### ⏱ 6:00–9:00 — Update the Sheet

Open the **Sessions** tab and fill in the row for the session that just ran:

- [ ] `Video Kind` → `youtube` (or `drive` / `vimeo`)
- [ ] `Video ID / URL` → the id you copied
- [ ] `Slides URL` → the deck's Drive link
- [ ] `Resource Labels (| sep)` → `Prompt cheat-sheet (PDF)|Worksheet`
- [ ] `Resource URLs (| sep)` → the matching links, **same order**
- [ ] `Status` → `complete`
- [ ] Confirm next week's row has a real date and the Zoom URL — this is what the reminder
      emails will use.

Also glance at the **Roster** tab: any new signups since last week? Any bounces in the
**Email Log**?

### ⏱ 9:00–12:00 — Publish to the portal

- [ ] Sheet toolbar → **AI My Life → Export portal JSON**.
- [ ] Click inside the dialog's text box (it selects all) → copy.
- [ ] Open `https://your-portal-url/#admin`.
- [ ] Paste the JSON into box 2, enter your cohort passcode in box 1.
- [ ] **Mode B — encrypt content** → copy the output.
- [ ] In `index.html`, replace the whole `const PAYLOAD = …;` line with what you copied.
- [ ] Re-upload `index.html` to your host (drag-and-drop on Netlify/Cloudflare, or
      `git push` for GitHub Pages).

*Running Mode A instead?* Replace the `CONTENT = {…}` object with the pasted JSON, leave
`PAYLOAD = null`, re-upload. One step shorter, but your links sit in the page source.

### ⏱ 12:00–15:00 — Verify and tell people

- [ ] Open the portal in a **private/incognito window**. Enter the passcode. The new card
      should be there.
- [ ] Click **Watch** — the video should play. If it shows "Video unavailable," YouTube is
      still processing; check back in ten minutes.
- [ ] Click **Slides** — confirm it opens for someone not signed into your account. This
      is the single most common breakage.
- [ ] Post in your cohort channel / send a one-liner:
      > *Session 2 recording and slides are up in the portal — same passcode as always.*

**Done.**

---

## Monthly, not weekly

- [ ] Skim the **Email Log** for `error` or `skip` rows. Quota exhaustion shows up here.
- [ ] Check `MailApp.getRemainingDailyQuota()` headroom against your roster size.
- [ ] Rotate the portal passcode at the start of each new cohort: `#admin` → Mode A or B →
      update `index.html` **and** the `PORTAL_PASSCODE` script property. Email the new one.
- [ ] Spot-check an unlisted YouTube link in incognito — confirm it hasn't flipped to Public.
- [ ] Back up the Sheet: File → Download → `.xlsx`, drop it in Drive.

---

## When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| No confirmation email | trigger missing, or quota hit | Apps Script → Executions tab; re-run `setup()`; check Email Log |
| Email went out with no Zoom link | no future-dated session for that track | add the row to Sessions with a real date cell |
| Reminders never fire | `Start` column is text, not a date | select column → Format → Number → Date time |
| Reminders fire twice | Email Log rows were deleted | don't delete Email Log rows; it's the dedupe table |
| Portal says "must be served over https" | opened via `file://` | upload to the host, or `python3 -m http.server` |
| Passcode rejected after an update | `VERIFIER`/`PAYLOAD` regenerated with a different passcode | regenerate at `#admin` with the passcode you actually hand out |
| Card appears, video won't play | wrong Video Kind, or full URL pasted where an ID belongs | `youtube` kind wants just `dQw4w9WgXcQ` |
| Student sees "request access" on slides | Drive file not shared | right-click → Share → Anyone with the link → Viewer |
| Wrong track assigned on signup | form wording drifted from `CONFIG.TRACKS` match list | update the `match` arrays in `Code.gs` |

---

## Realistic timing

The 15 minutes is hands-on-keyboard time and it holds once the prep above is done. The part
you don't control is Zoom's cloud render (10–40 min) and YouTube's processing (5–20 min for
a 75-minute video). Plan on **"same evening," not "within 15 minutes of ending."**

The honest sequence: end the session, start the upload, go do something else, come back in
half an hour, and the remaining work really is about 12 minutes.
