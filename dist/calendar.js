import { HDate, birthdayOrAnniversary, gematriya } from "./vendor/hdate/index.js";

export const HEBREW_MONTHS = [
  { value: 7, name: "תשרי" },
  { value: 8, name: "חשוון" },
  { value: 9, name: "כסלו" },
  { value: 10, name: "טבת" },
  { value: 11, name: "שבט" },
  { value: 12, name: "אדר" },
  { value: 13, name: "אדר ב׳", leapOnly: true },
  { value: 1, name: "ניסן" },
  { value: 2, name: "אייר" },
  { value: 3, name: "סיוון" },
  { value: 4, name: "תמוז" },
  { value: 5, name: "אב" },
  { value: 6, name: "אלול" },
];

const GREGORIAN_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const SHORT_GREGORIAN_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function isHebrewLeapYear(year) {
  return ((7 * year + 1) % 19) < 7;
}

export function formatHebrewNumber(number) {
  return gematriya(Number(number));
}

export function parseHebrewYear(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;

  if (/^\d{4}$/.test(raw)) return Number(raw);

  const cleaned = raw
    .replace(/[\s'"׳״`\-־]/g, "")
    .replace(/[\u0591-\u05C7]/g, "");
  if (!cleaned || !/^[א-ת]+$/.test(cleaned)) return Number.NaN;

  const values = {
    א: 1,
    ב: 2,
    ג: 3,
    ד: 4,
    ה: 5,
    ו: 6,
    ז: 7,
    ח: 8,
    ט: 9,
    י: 10,
    כ: 20,
    ך: 20,
    ל: 30,
    מ: 40,
    ם: 40,
    נ: 50,
    ן: 50,
    ס: 60,
    ע: 70,
    פ: 80,
    ף: 80,
    צ: 90,
    ץ: 90,
    ק: 100,
    ר: 200,
    ש: 300,
    ת: 400,
  };

  const hasThousandsPrefix = cleaned.startsWith("ה") && cleaned.length > 1;
  const yearLetters = hasThousandsPrefix ? cleaned.slice(1) : cleaned;
  const remainder = [...yearLetters].reduce((sum, letter) => sum + (values[letter] || 0), 0);
  if (!remainder || remainder >= 1000) return Number.NaN;
  return 5000 + remainder;
}

export function getCurrentHebrewYear(date = new Date()) {
  return new HDate(atLocalMidnight(date)).getFullYear();
}

export function birthFromGregorian(dateString, afterSunset) {
  const date = parseIsoDate(dateString);
  if (!date) throw new Error("נא להזין תאריך לידה לועזי מלא.");

  const today = atLocalMidnight(new Date());
  if (date.getTime() > today.getTime()) {
    throw new Error("תאריך הלידה לא יכול להיות בעתיד.");
  }

  if (afterSunset) date.setDate(date.getDate() + 1);
  const hd = new HDate(date);
  return { yy: hd.getFullYear(), mm: hd.getMonth(), dd: hd.getDate() };
}

export function birthFromHebrew(day, month, year) {
  const dd = Number(day);
  const mm = Number(month);
  const yy = parseHebrewYear(year);

  if (!Number.isInteger(yy) || yy < 5000) {
    throw new Error("נא להזין שנת לידה באותיות, למשל תשמ״ט, או במספרים: 5749.");
  }
  if (!Number.isInteger(dd) || dd < 1 || dd > 30 || !Number.isInteger(mm)) {
    throw new Error("התאריך העברי אינו תקין.");
  }
  if (mm === 13 && !isHebrewLeapYear(yy)) {
    throw new Error("בשנה שהוזנה אין אדר ב׳.");
  }

  let hd;
  try {
    hd = new HDate(dd, mm, yy);
  } catch {
    throw new Error("התאריך העברי אינו קיים בלוח השנה.");
  }

  if (hd.getDate() !== dd || hd.getMonth() !== mm || hd.getFullYear() !== yy) {
    throw new Error("התאריך העברי אינו קיים בלוח השנה.");
  }

  const today = atLocalMidnight(new Date());
  if (hd.greg().getTime() > today.getTime()) {
    throw new Error("תאריך הלידה לא יכול להיות בעתיד.");
  }

  return { yy, mm, dd };
}

export function getFutureBirthdays(person, count = 20, fromDate = new Date()) {
  const today = atLocalMidnight(fromDate);
  const currentHebrewYear = getCurrentHebrewYear(today);
  const firstYear = Math.max(currentHebrewYear, person.birth.yy);
  const results = [];

  for (let year = firstYear; results.length < count && year < firstYear + count + 5; year += 1) {
    const birthday = birthdayOrAnniversary(year, person.birth);
    if (!birthday) continue;
    const gregorian = atLocalMidnight(birthday.greg());
    if (gregorian.getTime() < today.getTime()) continue;
    results.push({
      hdate: {
        yy: birthday.getFullYear(),
        mm: birthday.getMonth(),
        dd: birthday.getDate(),
      },
      gregorian,
      age: birthday.getFullYear() - person.birth.yy,
    });
  }

  return results;
}

export function formatHebrewDate(hdate, includeYear = false) {
  const month = monthName(hdate.mm, hdate.yy);
  const year = includeYear ? ` ${gematriya(hdate.yy)}` : "";
  return `${gematriya(hdate.dd)} ב${month}${year}`;
}

export function formatGregorianDate(date, short = false) {
  return (short ? SHORT_GREGORIAN_FORMATTER : GREGORIAN_FORMATTER).format(date);
}

export function relativeDayLabel(date, fromDate = new Date()) {
  const days = Math.round((atLocalMidnight(date) - atLocalMidnight(fromDate)) / 86400000);
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days < 7) return `בעוד ${days} ימים`;
  if (days < 14) return "בעוד שבוע";
  return `בעוד ${days} ימים`;
}

export function buildCalendarFile(people, yearsPerPerson = 20) {
  const createdAt = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ivriyomhuledet//Hebrew Birthdays//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ימי הולדת עבריים",
    "X-WR-CALDESC:ימי הולדת עבריים שנוצרו באמצעות עבריולדת",
  ];

  for (const person of people) {
    const birthdays = getFutureBirthdays(person, yearsPerPerson, createdAt);
    for (const birthday of birthdays) {
      const start = formatIcsDate(birthday.gregorian);
      const endDate = new Date(birthday.gregorian);
      endDate.setDate(endDate.getDate() + 1);
      const end = formatIcsDate(endDate);
      const hebrewDate = formatHebrewDate(birthday.hdate, true);
      const shortHebrewDate = formatHebrewDate(birthday.hdate, false);
      const originalHebrewDate = formatHebrewDate(person.birth, true);
      const gregorianDate = formatGregorianDate(birthday.gregorian);
      const summary = `🎂 יום ההולדת העברי של ${person.name} — ${shortHebrewDate}`;
      const description = [
        `יום ההולדת העברי של ${person.name}`,
        `התאריך העברי השנה: ${hebrewDate}`,
        `התאריך הלועזי השנה: ${gregorianDate}`,
        `תאריך הלידה העברי: ${originalHebrewDate}`,
        "היום העברי מתחיל בשקיעה בערב שלפני.",
        "נוצר באמצעות עבריולדת.",
      ].join("\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:${safeUid(person.id)}-${birthday.hdate.yy}@ivriyomhuledet`,
        `DTSTAMP:${formatIcsTimestamp(createdAt)}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `CATEGORIES:${escapeIcsText("יום הולדת עברי")},${escapeIcsText("עבריולדת")}`,
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT"
      );

      const reminder = reminderTrigger(person.reminder);
      if (reminder) {
        lines.push(
          "BEGIN:VALARM",
          `TRIGGER:${reminder}`,
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeIcsText(summary)}`,
          "END:VALARM"
        );
      }

      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function buildGoogleCalendarEvents(people, yearsPerPerson = 20, fromDate = new Date()) {
  const events = [];

  for (const person of people) {
    for (const birthday of getFutureBirthdays(person, yearsPerPerson, fromDate)) {
      const nextDay = new Date(birthday.gregorian);
      nextDay.setDate(nextDay.getDate() + 1);
      const hebrewDate = formatHebrewDate(birthday.hdate, true);
      const shortHebrewDate = formatHebrewDate(birthday.hdate, false);
      const originalHebrewDate = formatHebrewDate(person.birth, true);
      const gregorianDate = formatGregorianDate(birthday.gregorian);

      events.push({
        personId: person.id,
        hebrewYear: birthday.hdate.yy,
        summary: `🎂 יום ההולדת העברי של ${person.name} — ${shortHebrewDate}`,
        description: [
          `יום ההולדת העברי של ${person.name}`,
          `התאריך העברי השנה: ${hebrewDate}`,
          `התאריך הלועזי השנה: ${gregorianDate}`,
          `תאריך הלידה העברי: ${originalHebrewDate}`,
          "היום העברי מתחיל בשקיעה בערב שלפני.",
          "נוצר באמצעות עבריולדת.",
        ].join("\n"),
        startDate: formatIsoDate(birthday.gregorian),
        endDate: formatIsoDate(nextDay),
        reminderMinutes: reminderMinutes(person.reminder),
      });
    }
  }

  return events;
}

function monthName(month, year) {
  if (month === 12) return isHebrewLeapYear(year) ? "אדר א׳" : "אדר";
  return HEBREW_MONTHS.find((item) => item.value === month)?.name || "";
}

function reminderTrigger(reminder) {
  if (reminder === "evening") return "-PT6H";
  if (reminder === "morning-before") return "-PT15H";
  if (reminder === "three-days") return "-P3D";
  return null;
}

function reminderMinutes(reminder) {
  if (reminder === "evening") return 360;
  if (reminder === "morning-before") return 900;
  if (reminder === "three-days") return 4320;
  return null;
}

function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function atLocalMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatIcsDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatIsoDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIcsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function safeUid(value) {
  return String(value).replace(/[^a-zA-Z0-9-]/g, "-");
}

function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const chunks = [];
  let current = "";

  for (const character of line) {
    const maxBytes = chunks.length === 0 ? 75 : 74;
    if (current && encoder.encode(current + character).length > maxBytes) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }

  chunks.push(current);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}
