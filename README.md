# AI My Life — Workshop Operations System

A zero-backend system for running four hands-on AI workshop tracks:
**Google Forms → Google Sheets → Apps Script → Zoom → a static passcode-gated portal.**

No server, no database, no auth provider, no monthly bill.

```
.
├── README.md
├── index.html               the public landing page — courses, schedule, how to sign up
├── slides/                  one deck per course, plus two cert extras
│   ├── deck.css                  shared styling for every deck
│   ├── deck.js                   shared nav: buttons, keys, hash, ?notes
│   ├── personal-life.html
│   ├── small-business.html
│   ├── generating-revenue.html
│   ├── google-ai-certification.html
│   ├── cohort-overview.html      why the cert cohort exists
│   └── prompting-course.html     the full prompting curriculum
├── apps-script/
│   ├── Code.gs              paste into the Sheet's Apps Script editor
│   └── appsscript.json      OAuth scopes + runtime
├── portal/
│   └── index.html           the entire student portal, one file
└── docs/
    ├── 01-architecture.md   setup blueprint + known limits
    └── 02-operations-checklist.md   the weekly loop
```

Deploy the repo root and you get `/` (landing), `/slides/…` (decks), `/portal/` (gated archive).

## Quick start

1. Build the registration Form (`docs/01-architecture.md` § Step 1) and link it to a Sheet.
2. Paste the Form's public `viewform` URL into the `LINKS.form` constant at the bottom of
   the root `index.html` — that wires every **Register** button on the landing page.
3. Paste `apps-script/Code.gs` into **Extensions → Apps Script**, run `setup()`.
4. Fill in the **Sessions** tab with dates and Zoom links.
5. Upload the repo root to Cloudflare Pages / Netlify / GitHub Pages over HTTPS.
6. Open `your-url/portal/#admin`, set a real passcode, paste the output back into
   `portal/index.html`.

## The landing page

`index.html` at the repo root is the public, indexable front door. One file, no build step,
same navy/emerald palette as the portal.

- Describes the org, the four tracks, and the three-step signup path.
- **Sessions are Fridays, 6:00–7:00 AM HST**, first class **Friday, Nov 6, 2026**. One live
  hour a week; the four tracks take turns, so each track comes around every four weeks.
- The rotation is driven by the `SCHEDULE` constant in the page's script:

  ```javascript
  const SCHEDULE = {
    firstClass: "2026-11-06",                               // Fri, Hawai'i time
    rotation: ["personal", "business", "revenue", "cert"]   // one per week, repeating
  };
  ```

  Session *N* is *N* weeks after `firstClass` and its track is `rotation[N % 4]`. Edit those
  two values and the hero pill, the rotation list, the per-card "next session" dates, and the
  sign-up CTA all follow. The static HTML holds correct fallback dates for the no-JS case —
  update those too if you change the anchor.
- HST has no DST, so the schedule table lists both standard and daylight equivalents for
  PT/MT/CT/ET. A session instant is always `16:00 UTC Friday`, which is 6 AM HST year-round.
  The script also renders the next session in the visitor's own time zone.
- Every **Register** button carries `data-link="form"`. If `LINKS.form` is left as the
  placeholder they fall back to the on-page `#signup` section rather than a dead Google URL.

## The slide decks

Six decks — one per course, plus two extras for the certification track:

| Deck | Track | Covers |
|---|---|---|
| `personal-life.html` | Personal | Picking an assistant, Context·Role·Task·Format, reusable household templates, what not to hand over |
| `small-business.html` | Business | Source-of-truth doc, AI front desk, one brand brief chained into a month of content, guardrails |
| `generating-revenue.html` | Revenue | Skill → offer, pricing the deliverable, the ten-minute proposal, four contract clauses, getting paid |
| `google-ai-certification.html` | Cert | Exam map, six-week plan, vocabulary drill, responsible AI, practice technique, capstone |
| `cohort-overview.html` | Cert | The short pitch: why self-paced fails, the three pillars |
| `prompting-course.html` | Cert | The full prompting curriculum — five-step framework, precision phrases, chaining |

### How they work

- `deck.css` and `deck.js` are **shared by all six**. Edit the styling or the navigation once
  and every deck picks it up. A deck is then just content plus a standard shell.
- A deck sets its course color with `<body data-track="personal | business | revenue | cert">`.
  The colors match the course cards on the landing page.
- Navigation: on-screen buttons, arrow keys, space, PageUp/Down, Home/End. The URL hash tracks
  the slide, so `prompting-course.html#7` links straight to slide 7.
- Speaker notes are **hidden by default** — they're presenter script, not student material.
  Add `?notes` (`prompting-course.html?notes`) to bring the teleprompter bar back for presenting.
- All six are responsive; the two originals were fixed-width desktop decks.

### Adding a deck

Copy the shell from any existing deck, change `<title>`, the description, `data-track`, and
the footer label, then write `.slide` blocks. The pieces `deck.css` gives you: `.tag`, `h1`,
`h2`, `p.subtitle`, `.grid-2`, `.grid-3`, `.card` (+ `.card.alt`), `.prompt-box`,
`.list` with `.bullet`, and `.note` for caveats.

> `.prompt-box` is `white-space: pre-wrap` — its continuation lines must sit flush at column 0
> in the source, or the indentation renders inside the box.

## The student portal

- Single file. No build step, no dependencies, no CDN.
- Navy `#0a1628` / emerald `#10b981`, responsive down to phone width.
- PBKDF2-SHA256 passcode gate (310k iterations) with optional AES-256-GCM encryption of
  the entire content payload — in encrypted mode the page source contains no usable links.
- Live search across titles, summaries, tags, and resource names; multi-select track chips;
  sort by date or track.
- Lazy video modal supporting YouTube, Vimeo, Google Drive, and raw iframe URLs.
- Built-in `#admin` tool to regenerate the verifier or encrypt new content — runs entirely
  in your browser, nothing is transmitted.
- Keyboard: `/` focuses search, `Esc` closes the player.

**Default passcode is `aimylife2026`. Change it before launch.**

**Must be served over HTTPS or localhost** — `crypto.subtle` is unavailable on `file://`,
so opening the file directly from disk will not unlock.

## What this does and doesn't protect

A client-side gate keeps the archive out of search results and off the open web. It does
not stop a determined person who already has the passcode from sharing what's inside.
Encrypted mode (Mode B) closes the "read the links out of the HTML source" hole; nothing
client-side closes the "a student forwards the YouTube link" hole. For recordings that
genuinely must not leak, host them in Google Drive restricted to roster email addresses
and let Drive enforce access server-side. Details in `docs/01-architecture.md` § 4.

## Cost

| Piece | Cost |
|---|---|
| Google Forms / Sheets / Apps Script | free |
| Static hosting | free |
| YouTube unlisted hosting | free |
| Google Workspace | free via [Google for Nonprofits](https://www.google.com/nonprofits/) |
| Zoom Pro (needed for 40+ min sessions) | ~$150/yr, nonprofit discounts available |
