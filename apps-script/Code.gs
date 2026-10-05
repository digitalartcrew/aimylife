/**
 * AI My Life — registration + reminder automation
 * ------------------------------------------------------------------
 * Container-bound to the Google Sheet that receives your Form responses.
 *
 * FIRST RUN:  Extensions > Apps Script, paste this file, then run setup().
 *             Approve the permission prompt. That's it.
 *
 * Sheets created/used (setup() builds them for you):
 *   Form Responses 1   raw form output — never edit by hand
 *   Roster             the CRM: one row per registrant
 *   Sessions           schedule: dates, Zoom links, recordings, slides
 *   Email Log          audit trail + de-duplication for reminders
 */

/* ==================================================================
   CONFIG
   ================================================================== */
var CONFIG = {
  ORG_NAME:    'AI My Life',
  SITE:        'https://aimylife.org',
  PORTAL_URL:  'https://aimylife.org/portal/',
  REPLY_TO:    'hello@aimylife.org',
  SENDER_NAME: 'AI My Life',

  // 'calendar' adds the registrant as a guest on one shared event per session
  // 'ics'      attaches a calendar file to the confirmation email
  // 'none'     skips invites entirely
  INVITE_MODE: 'calendar',

  REMIND_24H: true,
  REMIND_1H:  true,

  // Sheet names
  ROSTER:   'Roster',
  SESSIONS: 'Sessions',
  LOG:      'Email Log',

  // Canonical track ids. The left side must match the portal's track ids.
  // The right side is a list of substrings to look for in the form answer.
  TRACKS: {
    personal: { name: 'AI for Personal Life',           match: ['personal'] },
    business: { name: 'AI for Small Business',          match: ['small business', 'business'] },
    revenue:  { name: 'AI for Generating Revenue',      match: ['revenue', 'money', 'income'] },
    cert:     { name: 'Google AI Certification Cohort', match: ['certification', 'cert', 'google ai'] }
  }
};

/** The portal passcode lives in Script Properties, not in this file.
 *  Set it once: Project Settings > Script Properties > PORTAL_PASSCODE
 *  (or run setPortalPasscode('...') below one time, then delete the value). */
function getPortalPasscode() {
  return PropertiesService.getScriptProperties().getProperty('PORTAL_PASSCODE') || '(ask us)';
}
function setPortalPasscode(code) {
  PropertiesService.getScriptProperties().setProperty('PORTAL_PASSCODE', code);
}

var HEADERS = {
  ROSTER: ['Timestamp', 'Email', 'Full Name', 'Track', 'Track ID', 'Phone', 'Experience',
           'Goals', 'Status', 'Confirmation Sent', 'Source'],
  SESSIONS: ['Track ID', 'Session #', 'Title', 'Start (date + time)', 'Duration (min)',
             'Zoom Join URL', 'Zoom Passcode', 'Status', 'Summary', 'Tags (comma sep)',
             'Video Kind', 'Video ID / URL', 'Slides URL', 'Resource Labels (| sep)',
             'Resource URLs (| sep)', 'Calendar Event ID'],
  LOG: ['Timestamp', 'Dedup Key', 'Type', 'Email', 'Subject', 'Result']
};

/* ==================================================================
   SETUP — run this once
   ================================================================== */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheet_(ss, CONFIG.ROSTER,   HEADERS.ROSTER);
  ensureSheet_(ss, CONFIG.SESSIONS, HEADERS.SESSIONS);
  ensureSheet_(ss, CONFIG.LOG,      HEADERS.LOG);

  // Seed one example session row so the format is obvious.
  var sessions = ss.getSheetByName(CONFIG.SESSIONS);
  if (sessions.getLastRow() < 2) {
    sessions.appendRow([
      'personal', 1, 'Your First AI Assistant: Setup & Daily Wins',
      new Date(new Date().getTime() + 7 * 864e5), 75,
      'https://us06web.zoom.us/j/00000000000?pwd=EXAMPLE', '123456', 'scheduled',
      'Pick your assistant, set it up, and build three habits that save an hour a week.',
      'getting started, prompting', 'youtube', '', '', 'Prompt cheat-sheet', '', ''
    ]);
  }

  // Reinstall triggers idempotently.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onFormSubmit', 'sendReminders'].indexOf(t.getHandlerFunction()) > -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    'Sheets ready: Roster, Sessions, Email Log.\n' +
    'Triggers installed: on form submit, hourly reminders.\n\n' +
    'Next: fill in the Sessions sheet, then set PORTAL_PASSCODE in Project Settings.'
  );
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() === '') {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn()))
    .setFontWeight('bold').setBackground('#0f2440').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

/* ==================================================================
   FORM SUBMIT -> roster row + confirmation email + calendar invite
   ================================================================== */
function onFormSubmit(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { return; }

  try {
    var nv = (e && e.namedValues) || {};
    var reg = {
      email: field_(nv, ['email']),
      name:  field_(nv, ['full name', 'name']),
      phone: field_(nv, ['phone', 'mobile']),
      exp:   field_(nv, ['experience', 'comfortable', 'level']),
      goals: field_(nv, ['goal', 'hope to', 'why']),
      rawTrack: field_(nv, ['track', 'workshop', 'which'])
    };

    if (!reg.email || reg.email.indexOf('@') < 0) {
      log_('', 'error', reg.email, 'Form submit', 'Missing or invalid email — row skipped');
      return;
    }

    reg.trackId = resolveTrack_(reg.rawTrack);
    reg.trackName = reg.trackId ? CONFIG.TRACKS[reg.trackId].name : (reg.rawTrack || 'Unassigned');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var roster = ss.getSheetByName(CONFIG.ROSTER) || ensureSheet_(ss, CONFIG.ROSTER, HEADERS.ROSTER);
    roster.appendRow([
      new Date(), reg.email, reg.name, reg.trackName, reg.trackId || '',
      reg.phone, reg.exp, reg.goals, 'registered', '', 'form'
    ]);
    var row = roster.getLastRow();

    var next = nextSession_(reg.trackId);

    if (CONFIG.INVITE_MODE === 'calendar' && next) {
      try { addGuestToSessionEvent_(next, reg.email); }
      catch (err) { log_('', 'warn', reg.email, 'Calendar invite', String(err)); }
    }

    var subject = 'You\'re in — ' + reg.trackName + ' · ' + CONFIG.ORG_NAME;
    var opts = {
      name: CONFIG.SENDER_NAME,
      replyTo: CONFIG.REPLY_TO,
      htmlBody: confirmationHtml_(reg, next)
    };
    if (CONFIG.INVITE_MODE === 'ics' && next) {
      opts.attachments = [Utilities.newBlob(icsFor_(next), 'text/calendar', 'session.ics')];
    }

    MailApp.sendEmail(reg.email, subject, confirmationText_(reg, next), opts);

    roster.getRange(row, HEADERS.ROSTER.indexOf('Confirmation Sent') + 1).setValue(new Date());
    log_('confirm|' + reg.email, 'confirmation', reg.email, subject, 'sent');

  } catch (err) {
    log_('', 'error', '', 'onFormSubmit', String(err));
    throw err;   // surface in the Apps Script executions log
  } finally {
    lock.releaseLock();
  }
}

/** Case-insensitive lookup across form question titles. */
function field_(namedValues, needles) {
  for (var key in namedValues) {
    var k = key.toLowerCase();
    for (var i = 0; i < needles.length; i++) {
      if (k.indexOf(needles[i]) > -1) {
        var v = namedValues[key];
        var s = Array.isArray(v) ? v.join(', ') : String(v);
        if (s.trim()) return s.trim();
      }
    }
  }
  return '';
}

function resolveTrack_(answer) {
  var a = String(answer || '').toLowerCase();
  for (var id in CONFIG.TRACKS) {
    var m = CONFIG.TRACKS[id].match;
    for (var i = 0; i < m.length; i++) {
      if (a.indexOf(m[i]) > -1) return id;
    }
  }
  return '';
}

/* ==================================================================
   SESSIONS
   ================================================================== */
function readSessions_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SESSIONS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  head.forEach(function (h, i) { idx[h] = i; });

  return values.slice(1).map(function (r, i) {
    return {
      row: i + 2,
      trackId: String(r[idx['Track ID']] || '').trim(),
      number: r[idx['Session #']],
      title: String(r[idx['Title']] || '').trim(),
      start: r[idx['Start (date + time)']] instanceof Date ? r[idx['Start (date + time)']] : null,
      minutes: Number(r[idx['Duration (min)']]) || 60,
      zoomUrl: String(r[idx['Zoom Join URL']] || '').trim(),
      zoomPass: String(r[idx['Zoom Passcode']] || '').trim(),
      status: String(r[idx['Status']] || '').trim().toLowerCase(),
      summary: String(r[idx['Summary']] || '').trim(),
      tags: String(r[idx['Tags (comma sep)']] || '').split(',').map(trim_).filter(Boolean),
      videoKind: String(r[idx['Video Kind']] || '').trim().toLowerCase(),
      videoId: String(r[idx['Video ID / URL']] || '').trim(),
      slides: String(r[idx['Slides URL']] || '').trim(),
      resLabels: String(r[idx['Resource Labels (| sep)']] || '').split('|').map(trim_).filter(Boolean),
      resUrls: String(r[idx['Resource URLs (| sep)']] || '').split('|').map(trim_).filter(Boolean),
      eventId: String(r[idx['Calendar Event ID']] || '').trim()
    };
  }).filter(function (s) { return s.title; });
}

function trim_(s) { return String(s).trim(); }

function nextSession_(trackId) {
  var now = new Date();
  var upcoming = readSessions_().filter(function (s) {
    return s.start && s.start > now && s.status !== 'cancelled' &&
           (!trackId || s.trackId === trackId);
  }).sort(function (a, b) { return a.start - b.start; });
  return upcoming[0] || null;
}

/* ==================================================================
   CALENDAR
   ================================================================== */
function addGuestToSessionEvent_(session, email) {
  var cal = CalendarApp.getDefaultCalendar();
  var ev = null;

  if (session.eventId) {
    try { ev = cal.getEventById(session.eventId); } catch (err) { ev = null; }
  }
  if (!ev) {
    var end = new Date(session.start.getTime() + session.minutes * 60000);
    ev = cal.createEvent(
      CONFIG.ORG_NAME + ': ' + session.title,
      session.start, end,
      {
        description: (session.summary ? session.summary + '\n\n' : '') +
                     'Join Zoom: ' + session.zoomUrl +
                     (session.zoomPass ? '\nPasscode: ' + session.zoomPass : '') +
                     '\n\nResource portal: ' + CONFIG.PORTAL_URL,
        location: session.zoomUrl
      }
    );
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(CONFIG.SESSIONS)
      .getRange(session.row, HEADERS.SESSIONS.indexOf('Calendar Event ID') + 1)
      .setValue(ev.getId());
  }
  ev.addGuest(email);
  return ev;
}

function icsFor_(s) {
  var fmt = function (d) {
    return Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  };
  var end = new Date(s.start.getTime() + s.minutes * 60000);
  var desc = ((s.summary ? s.summary + '\\n\\n' : '') +
              'Join Zoom: ' + s.zoomUrl +
              (s.zoomPass ? '\\nPasscode: ' + s.zoomPass : '')).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI My Life//EN', 'BEGIN:VEVENT',
    'UID:' + s.trackId + '-' + s.number + '@aimylife.org',
    'DTSTAMP:' + fmt(new Date()),
    'DTSTART:' + fmt(s.start),
    'DTEND:' + fmt(end),
    'SUMMARY:' + CONFIG.ORG_NAME + ': ' + s.title,
    'LOCATION:' + s.zoomUrl,
    'DESCRIPTION:' + desc,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

/* ==================================================================
   REMINDERS — hourly trigger
   ================================================================== */
function sendReminders() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (err) { return; }

  try {
    var now = new Date();
    var sent = sentKeys_();
    var roster = activeRoster_();
    var quota = MailApp.getRemainingDailyQuota();

    readSessions_().forEach(function (s) {
      if (!s.start || s.status === 'cancelled') return;
      var hours = (s.start - now) / 3600000;

      var kind = null;
      if (CONFIG.REMIND_24H && hours > 23 && hours <= 25) kind = '24h';
      else if (CONFIG.REMIND_1H && hours > 0.5 && hours <= 1.5) kind = '1h';
      if (!kind) return;

      var people = roster.filter(function (p) { return !s.trackId || p.trackId === s.trackId; });

      people.forEach(function (p) {
        var key = ['remind', kind, s.trackId, s.number, p.email].join('|');
        if (sent[key]) return;
        if (quota <= 2) { log_(key, 'skip', p.email, 'Reminder', 'daily mail quota exhausted'); return; }

        var subject = (kind === '1h' ? 'Starting in 1 hour: ' : 'Tomorrow: ') + s.title;
        try {
          MailApp.sendEmail(p.email, subject, reminderText_(p, s, kind), {
            name: CONFIG.SENDER_NAME,
            replyTo: CONFIG.REPLY_TO,
            htmlBody: reminderHtml_(p, s, kind)
          });
          quota--;
          sent[key] = true;
          log_(key, 'reminder-' + kind, p.email, subject, 'sent');
        } catch (err) {
          log_(key, 'error', p.email, subject, String(err));
        }
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function activeRoster_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ROSTER);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (h) { return String(h).trim(); });
  var iEmail = head.indexOf('Email'), iName = head.indexOf('Full Name');
  var iTrack = head.indexOf('Track ID'), iStatus = head.indexOf('Status');

  var seen = {}, out = [];
  v.slice(1).forEach(function (r) {
    var email = String(r[iEmail] || '').trim().toLowerCase();
    var status = String(r[iStatus] || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return;
    if (status === 'unsubscribed' || status === 'dropped') return;
    var key = email + '|' + r[iTrack];
    if (seen[key]) return;
    seen[key] = true;
    out.push({ email: email, name: String(r[iName] || '').trim(), trackId: String(r[iTrack] || '').trim() });
  });
  return out;
}

/* ==================================================================
   LOGGING
   ================================================================== */
function log_(key, type, email, subject, result) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.LOG) || ensureSheet_(ss, CONFIG.LOG, HEADERS.LOG);
    sh.appendRow([new Date(), key, type, email, subject, result]);
  } catch (err) { /* never let logging break the send */ }
}

function sentKeys_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.LOG);
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
    if (r[0]) map[r[0]] = true;
  });
  return map;
}

/* ==================================================================
   EMAIL TEMPLATES
   ================================================================== */
function fmtWhen_(d) {
  if (!d) return 'TBA';
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(d, tz, 'EEEE, MMMM d') + ' at ' +
         Utilities.formatDate(d, tz, 'h:mm a') + ' ' +
         Utilities.formatDate(d, tz, 'zzz');
}

function shell_(innerHtml) {
  return '' +
  '<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">' +
      '<tr><td style="background:#0a1628;padding:26px 30px">' +
        '<div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-.3px">AI My Life</div>' +
        '<div style="color:#34d399;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;margin-top:3px">Hands-on AI workshops</div>' +
      '</td></tr>' +
      '<tr><td style="padding:30px;color:#0f172a;font-size:15px;line-height:1.6">' + innerHtml + '</td></tr>' +
      '<tr><td style="background:#f8fafc;padding:18px 30px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">' +
        CONFIG.ORG_NAME + ' · <a href="' + CONFIG.SITE + '" style="color:#059669">aimylife.org</a><br>' +
        'Questions? Just reply to this email.' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

function btn_(href, label) {
  return '<a href="' + href + '" style="display:inline-block;background:#10b981;color:#04160f;' +
         'font-weight:700;text-decoration:none;padding:13px 24px;border-radius:9px;font-size:15px">' +
         label + '</a>';
}

function confirmationHtml_(reg, s) {
  var first = (reg.name || '').split(' ')[0] || 'there';
  var body = '<p style="margin:0 0 16px">Hi ' + first + ',</p>' +
    '<p style="margin:0 0 18px">You\'re registered for <strong>' + reg.trackName + '</strong>. ' +
    'Everything you need is below — save this email.</p>';

  if (s) {
    body +=
      '<table role="presentation" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:11px;margin:0 0 22px">' +
      '<tr><td style="padding:18px 20px">' +
        '<div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#059669;font-weight:700">Your next session</div>' +
        '<div style="font-size:17px;font-weight:700;margin:7px 0 4px;color:#064e3b">' + s.title + '</div>' +
        '<div style="color:#166534;font-size:14px">' + fmtWhen_(s.start) + ' · ' + s.minutes + ' minutes</div>' +
        (s.zoomUrl ? '<div style="margin-top:16px">' + btn_(s.zoomUrl, 'Join the Zoom room') + '</div>' : '') +
        (s.zoomPass ? '<div style="margin-top:12px;color:#166534;font-size:13px">Zoom passcode: <strong>' + s.zoomPass + '</strong></div>' : '') +
      '</td></tr></table>';
  } else {
    body += '<p style="margin:0 0 22px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:9px;font-size:14px">' +
            'Dates for your track are being finalized. We\'ll email you the Zoom link as soon as it\'s scheduled.</p>';
  }

  body +=
    '<div style="border-top:1px solid #e2e8f0;padding-top:20px">' +
      '<div style="font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:#64748b;font-weight:700">Student resource portal</div>' +
      '<p style="margin:7px 0 12px;font-size:14px">Recordings, slide decks, and prompt cheat-sheets from every session live here:</p>' +
      '<p style="margin:0 0 8px"><a href="' + CONFIG.PORTAL_URL + '" style="color:#059669;font-weight:600">' + CONFIG.PORTAL_URL + '</a></p>' +
      '<p style="margin:0;font-size:14px">Passcode: <strong style="background:#f1f5f9;padding:3px 9px;border-radius:5px;font-family:monospace">' + getPortalPasscode() + '</strong></p>' +
      '<p style="margin:12px 0 0;font-size:12px;color:#64748b">Please keep this passcode within the cohort — it\'s how we keep recordings available for free.</p>' +
    '</div>' +
    '<p style="margin:24px 0 0">See you soon,<br><strong>The AI My Life team</strong></p>';

  return shell_(body);
}

function confirmationText_(reg, s) {
  var lines = [
    'Hi ' + ((reg.name || '').split(' ')[0] || 'there') + ',', '',
    'You are registered for ' + reg.trackName + '.', ''
  ];
  if (s) {
    lines.push('NEXT SESSION', s.title, fmtWhen_(s.start) + ' (' + s.minutes + ' min)',
               'Zoom: ' + s.zoomUrl);
    if (s.zoomPass) lines.push('Zoom passcode: ' + s.zoomPass);
  } else {
    lines.push('Dates for your track are being finalized — we will email your Zoom link shortly.');
  }
  lines.push('', 'STUDENT PORTAL', CONFIG.PORTAL_URL, 'Passcode: ' + getPortalPasscode(), '',
             'Questions? Reply to this email.', '— ' + CONFIG.ORG_NAME);
  return lines.join('\n');
}

function reminderHtml_(p, s, kind) {
  var first = (p.name || '').split(' ')[0] || 'there';
  var lead = kind === '1h'
    ? 'We go live in about an hour.'
    : 'Quick reminder — your session is tomorrow.';
  var body =
    '<p style="margin:0 0 16px">Hi ' + first + ',</p>' +
    '<p style="margin:0 0 20px">' + lead + '</p>' +
    '<table role="presentation" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:11px;margin:0 0 22px">' +
    '<tr><td style="padding:18px 20px">' +
      '<div style="font-size:17px;font-weight:700;color:#064e3b">' + s.title + '</div>' +
      '<div style="color:#166534;font-size:14px;margin-top:4px">' + fmtWhen_(s.start) + '</div>' +
      (s.zoomUrl ? '<div style="margin-top:16px">' + btn_(s.zoomUrl, 'Join the Zoom room') + '</div>' : '') +
      (s.zoomPass ? '<div style="margin-top:12px;color:#166534;font-size:13px">Passcode: <strong>' + s.zoomPass + '</strong></div>' : '') +
    '</td></tr></table>' +
    '<p style="margin:0;font-size:14px;color:#475569">Can\'t make it live? The recording lands in the ' +
      '<a href="' + CONFIG.PORTAL_URL + '" style="color:#059669;font-weight:600">student portal</a> within 24 hours.</p>';
  return shell_(body);
}

function reminderText_(p, s, kind) {
  return [
    'Hi ' + ((p.name || '').split(' ')[0] || 'there') + ',', '',
    kind === '1h' ? 'We go live in about an hour.' : 'Reminder: your session is tomorrow.', '',
    s.title, fmtWhen_(s.start), 'Zoom: ' + s.zoomUrl,
    s.zoomPass ? 'Passcode: ' + s.zoomPass : '', '',
    'Recording posts to ' + CONFIG.PORTAL_URL + ' within 24 hours.', '', '— ' + CONFIG.ORG_NAME
  ].filter(function (l) { return l !== ''; }).join('\n');
}

/* ==================================================================
   PORTAL EXPORT — turns the Sessions sheet into portal JSON
   ================================================================== */
function exportPortalJson() {
  var tracks = [];
  var colors = { personal: '#34d399', business: '#38bdf8', revenue: '#fbbf24', cert: '#c084fc' };
  var shorts = { personal: 'Personal', business: 'Business', revenue: 'Revenue', cert: 'Cert Prep' };
  for (var id in CONFIG.TRACKS) {
    tracks.push({ id: id, name: CONFIG.TRACKS[id].name, short: shorts[id] || id, color: colors[id] || '#64748b' });
  }

  var sessions = readSessions_()
    .filter(function (s) { return s.videoId || s.slides; })   // only published rows
    .map(function (s) {
      var out = {
        id: s.trackId + '-' + padNum_(s.number),
        track: s.trackId,
        number: s.number,
        title: s.title,
        date: s.start ? Utilities.formatDate(s.start, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        duration: s.minutes ? s.minutes + ' min' : '',
        summary: s.summary,
        tags: s.tags
      };
      if (s.videoId) {
        out.video = (s.videoKind === 'url')
          ? { kind: 'url', url: s.videoId }
          : { kind: s.videoKind || 'youtube', id: s.videoId };
      }
      if (s.slides) out.slides = s.slides;
      if (s.resUrls.length) {
        out.resources = s.resUrls.map(function (url, i) {
          return { label: s.resLabels[i] || 'Resource ' + (i + 1), url: url };
        });
      }
      return out;
    });

  var payload = {
    updated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM yyyy'),
    tracks: tracks,
    sessions: sessions
  };
  var json = JSON.stringify(payload, null, 2);

  // Show it in a copyable dialog.
  var html = HtmlService.createHtmlOutput(
    '<textarea style="width:100%;height:420px;font-family:ui-monospace,Menlo,monospace;font-size:11px" ' +
    'onclick="this.select()" readonly>' +
    json.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
    '</textarea><p style="font:13px system-ui">Click the box to select all, then copy.</p>'
  ).setWidth(720).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Portal content JSON (' + sessions.length + ' sessions)');

  return json;
}

function padNum_(n) {
  var s = String(n || 0);
  return s.length < 2 ? '0' + s : s;
}

/* ==================================================================
   MENU
   ================================================================== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AI My Life')
    .addItem('Run setup', 'setup')
    .addSeparator()
    .addItem('Export portal JSON', 'exportPortalJson')
    .addItem('Send reminders now', 'sendReminders')
    .addItem('Email a test confirmation to me', 'sendTestConfirmation')
    .addToUi();
}

function sendTestConfirmation() {
  var me = Session.getActiveUser().getEmail();
  var reg = { email: me, name: 'Test Student', trackId: 'personal', trackName: CONFIG.TRACKS.personal.name };
  MailApp.sendEmail(me, '[TEST] ' + CONFIG.ORG_NAME + ' confirmation',
    confirmationText_(reg, nextSession_('personal')),
    { name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO,
      htmlBody: confirmationHtml_(reg, nextSession_('personal')) });
  SpreadsheetApp.getUi().alert('Test confirmation sent to ' + me);
}
