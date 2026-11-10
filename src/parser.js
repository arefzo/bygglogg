// Naturlig tids-tolkning på svenska.
// Exempel: "igår 7:30-16:00", "2h 30m", "förra fredagen 6 timmar",
// "12/5 07-15", "en och en halv timme", "kvart", "2026-05-12 22-06".
//
// Parsern är avsiktligt förlåtande men redovisar alltid vad den förstått,
// så att användaren kan rätta i formuläret innan rapporten sparas.

const WEEKDAYS = {
  söndag: 0,
  måndag: 1,
  tisdag: 2,
  onsdag: 3,
  torsdag: 4,
  fredag: 5,
  lördag: 6,
};

const NUMBER_WORDS = {
  noll: 0,
  en: 1,
  ett: 1,
  två: 2,
  tre: 3,
  fyra: 4,
  fem: 5,
  sex: 6,
  sju: 7,
  åtta: 8,
  nio: 9,
  tio: 10,
  elva: 11,
  tolv: 12,
  tretton: 13,
  fjorton: 14,
  femton: 15,
  sexton: 16,
  sjutton: 17,
  arton: 18,
  nitton: 19,
  tjugo: 20,
  trettio: 30,
  fyrtio: 40,
  femtio: 50,
  sextio: 60,
};

const DAY_MS = 86400000;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isoDate(date) {
  const d = startOfDay(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function fromIso(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

function addDays(date, days) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function normalize(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function clock(hours, minutes) {
  return `${pad(hours)}:${pad(minutes)}`;
}

function toNumber(token) {
  if (token == null) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
  return NUMBER_WORDS[token] ?? null;
}

/**
 * Tolkar fritext om arbetstid.
 * @param {string} raw
 * @param {{now?: Date}} [options]
 * @returns {{
 *   ok: boolean,
 *   date: string,
 *   dateInferred: boolean,
 *   start: string|null,
 *   end: string|null,
 *   minutes: number|null,
 *   lunchHint: boolean,
 *   summary: string,
 *   source: string
 * }}
 */
export function parseTimeInput(raw, { now = new Date() } = {}) {
  const source = String(raw ?? '').trim();
  const today = startOfDay(now);
  let text = normalize(source);

  const result = {
    ok: false,
    date: isoDate(today),
    dateInferred: true,
    start: null,
    end: null,
    minutes: null,
    lunchHint: false,
    summary: '',
    source,
  };

  if (!text) {
    result.summary = 'Skriv t.ex. "igår 7:30-16:00" eller "2h 30m".';
    return result;
  }

  let date = null;
  const mask = (value) => {
    text = text.replace(value, ' ');
  };

  // 1. Explicit ISO-datum (2026-05-12)
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const parsed = fromIso(`${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`);
    if (parsed) {
      date = parsed;
      result.dateInferred = false;
      mask(iso[0]);
    }
  }

  // 2. Tidsintervall (07:30-16:00, 7-16, kl 7 till 16, 7.30-16.00)
  let startMinutes = null;
  let endMinutes = null;
  let explicitEnd = false;

  const rangeRe =
    /(?:kl\.?\s*)?\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|till|to)\s*(\d{1,2})(?:[:.](\d{2}))?\b/;
  const range = text.match(rangeRe);
  if (range) {
    const after = text.slice(range.index + range[0].length, range.index + range[0].length + 14);
    const looksLikeDuration = !range[2] && !range[4] && /\b(tim|h|min)/.test(after);
    const from = Number(range[1]);
    const to = Number(range[3]);
    const fromMin = Number(range[2] ?? 0);
    const toMin = Number(range[4] ?? 0);
    const plausible =
      from >= 0 && from <= 24 && to >= 0 && to <= 24 && fromMin < 60 && toMin < 60;

    if (!looksLikeDuration && plausible) {
      startMinutes = from * 60 + fromMin;
      endMinutes = to * 60 + toMin;
      explicitEnd = true;
      if (endMinutes <= startMinutes) endMinutes += 24 * 60; // nattpass
      mask(range[0]);
    }
  }

  let durationMinutes = null;

  if (!explicitEnd) {
    // 3a. "1h30", "2 h 15"
    const hWithMinutes = text.match(/\b(\d{1,2})\s*h\s*(\d{1,2})\b/);
    // 3b. "2h", "2,5 timmar", "tre timme"
    const hourUnit = text.match(
      /\b(\d+(?:[.,]\d+)?|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|elva|tolv)\s*(?:tim(?:mar|me|mes)?|h)\b/,
    );
    // 3c. "45 min", "30m"
    const minuteUnit = text.match(/\b(\d{1,3})\s*(?:min(?:uter|ut)?|m)\b/);

    if (hWithMinutes) {
      durationMinutes = Number(hWithMinutes[1]) * 60 + Math.min(Number(hWithMinutes[2]), 59);
      mask(hWithMinutes[0]);
    } else if (/\b(en\s+och\s+en\s+halv|halvannan)\s*tim/.test(text)) {
      durationMinutes = 90;
      mask(text.match(/\b(en\s+och\s+en\s+halv|halvannan)\s*tim(?:me|mar)?\b/)[0]);
    } else if (/\b(en\s+halv|halv)\s*tim/.test(text)) {
      durationMinutes = 30;
      mask(text.match(/\b(en\s+halv|halv)\s*tim(?:me|mar)?\b/)[0]);
    } else if (/\bhalvtimme\b/.test(text)) {
      durationMinutes = 30;
      mask('halvtimme');
    } else if (/\b(en\s+)?kvart\b/.test(text)) {
      durationMinutes = 15;
      mask(text.match(/\b(en\s+)?kvart\b/)[0]);
    } else if (hourUnit) {
      const amount = toNumber(hourUnit[1]) ?? 0;
      durationMinutes = Math.round(amount * 60);
      // "2 timmar 30 minuter" – plocka upp efterföljande minuter.
      if (minuteUnit && minuteUnit.index > hourUnit.index) {
        durationMinutes += Number(minuteUnit[1]);
        mask(minuteUnit[0]);
      }
      mask(hourUnit[0]);
    } else if (minuteUnit) {
      durationMinutes = Number(minuteUnit[1]);
      mask(minuteUnit[0]);
    }
  }

  // 4. Datum i löptext
  if (!date) {
    if (/\bi\s*förrgår\b|\bförrgår\b/.test(text)) {
      date = addDays(today, -2);
      result.dateInferred = false;
    } else if (/\bi\s*går\b|\bigår\b/.test(text)) {
      date = addDays(today, -1);
      result.dateInferred = false;
    } else if (/\bi\s*dag\b|\bidag\b/.test(text)) {
      date = today;
      result.dateInferred = false;
    } else {
      const weekday = text.match(
        /\b(?:(förra|förrförra|nästa|senaste|i|på)\s+)?(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)(?:en|s|dagen)?\b/,
      );
      if (weekday) {
        const target = WEEKDAYS[weekday[2]];
        const modifier = weekday[1] ?? '';
        let base = addDays(today, -((today.getDay() - target + 7) % 7));
        const monday = addDays(today, -((today.getDay() + 6) % 7));
        if (modifier === 'förra') {
          // "förra fredagen" = senaste fredagen, men om den ligger i innevarande vecka
          // menas veckan innan.
          if (base.getTime() >= monday.getTime()) base = addDays(base, -7);
        }
        if (modifier === 'förrförra') {
          if (base.getTime() >= monday.getTime()) base = addDays(base, -7);
          base = addDays(base, -7);
        }
        if (modifier === 'nästa') base = addDays(base, 7);
        if (modifier === 'senaste' && base.getTime() === today.getTime()) base = addDays(base, -7);
        date = base;
        result.dateInferred = false;
      }
    }
  }

  // 5. Numeriskt datum (12/5, 12.5.26) – läses sist eftersom punkter även kan vara klockslag
  if (!date) {
    const numeric = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      let year = numeric[3] ? Number(numeric[3]) : today.getFullYear();
      if (year < 100) year += 2000;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        let candidate = new Date(year, month - 1, day);
        candidate.setHours(0, 0, 0, 0);
        if (!numeric[3] && candidate.getTime() - today.getTime() > 45 * DAY_MS) {
          candidate = new Date(year - 1, month - 1, day);
        }
        if (!Number.isNaN(candidate.getTime())) {
          date = candidate;
          result.dateInferred = false;
        }
      }
    }
  }

  if (!date) date = today;
  result.date = isoDate(date);

  if (explicitEnd) {
    const startH = Math.floor(startMinutes / 60) % 24;
    const startM = startMinutes % 60;
    const endTotal = endMinutes;
    const endH = Math.floor(endTotal / 60) % 24;
    const endM = endTotal % 60;
    result.start = clock(startH, startM);
    result.end = clock(endH, endM);
    result.minutes = endTotal - startMinutes;
    result.lunchHint = startMinutes < 12 * 60 && endTotal > 12 * 60 + 30;
    result.ok = true;
  } else if (durationMinutes != null) {
    result.minutes = durationMinutes;
    result.ok = durationMinutes > 0;
  }

  if (!result.ok) {
    result.summary = 'Kunde inte hitta någon tid. Prova "igår 7:30-16:00", "2h 30m" eller "måndag 6 timmar".';
    return result;
  }

  const dateLabel = formatDateLabel(date, today);
  const timeLabel =
    result.start && result.end
      ? `${result.start}–${result.end}`
      : formatDuration(result.minutes);
  result.summary = `${dateLabel} · ${timeLabel} · ${formatDuration(result.minutes)}`;
  return result;
}

export function formatDateLabel(date, today = new Date()) {
  const d = startOfDay(date);
  const t = startOfDay(today);
  const diff = Math.round((d.getTime() - t.getTime()) / DAY_MS);
  if (diff === 0) return 'Idag';
  if (diff === -1) return 'Igår';
  if (diff === -2) return 'I förrgår';
  if (diff === 1) return 'Imorgon';

  const sameYear = d.getFullYear() === t.getFullYear();
  const formatted = d.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDuration(minutes) {
  if (minutes == null) return '–';
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} h ${pad(m)} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Kort form: "8,5 h" */
export function formatHours(minutes) {
  if (minutes == null) return '–';
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
}
