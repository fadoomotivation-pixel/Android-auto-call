// TypeScript port of android/.../data/ScanListParser.kt. SAME RULES, so a list
// read in the browser gives the same leads as the Android Scan list. Keep the
// two in step: a rule changed in one must change in the other (tests in
// scanParser.test.ts mirror ScanListParserTest + ScanListParserOcrTest).

export type ScanRow = {
  name: string | null; // best guess at the person's name
  phone: string; // 10-digit mobile when valid, otherwise the digits as read
  valid: boolean;
  duplicate: boolean; // same number already earlier in this list
  line: number; // index of the input line
};

const NUMBER = /(?:\+\s*)?\d(?:[\s.\-()]{0,2}\d){6,24}/g;
const WA_STAMP = /^\s*\[[^\]]{3,40}]\s*/;
const WA_STAMP_PLAIN = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*-\s*/i;
const WA_SENDER = /^[^:]{1,40}:\s+/;
const LABELS = /\b(?:name|naam|mob(?:ile)?|ph(?:one)?|no|number|num|contact|cell|tel|whatsapp|wa|call|forwarded|sr|s\.?\s?no)\b\.?\s*[:\-=]?/gi;
const LOOKALIKE: Record<string, string> = { O: "0", o: "0", D: "0", I: "1", l: "1", "|": "1", i: "1", S: "5", s: "5", B: "8", Z: "2" };
const TOKEN = /[^\s.\-()/,:]+/g;
const TAIL = /\d[\d \-.]*$/;
const HEAD = /^\s*\d[\d \-.]*/;

const isDigit = (c: string) => c >= "0" && c <= "9";
const digitsOf = (s: string) => s.replace(/\D/g, "");

type Num = { first: number; last: number; digits: string };

export function lines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

export function parse(text: string): ScanRow[] {
  return parseLines(lines(text));
}

/** 10-digit Indian mobile or null. Accepts +91 / 91 / 0 / 091 prefixes. */
export function normalize(digitsIn: string): string | null {
  let d = digitsOf(digitsIn);
  if (d.length === 12 && d.startsWith("91")) d = d.substring(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.substring(1);
  else if (d.length === 13 && d.startsWith("091")) d = d.substring(3);
  return d.length === 10 && d[0] >= "6" && d[0] <= "9" ? d : null;
}

/** The last 10 digits, the same key the database dedups on. */
export function key(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = digitsOf(phone).slice(-10);
  return d.length === 10 ? d : null;
}

/** Fixes OCR letter/digit confusions inside number-looking tokens only. */
export function fixOcrDigits(line: string): string {
  return line.replace(TOKEN, (v) => {
    const core = v.startsWith("+") ? v.substring(1) : v;
    if (!core) return v;
    const chars = [...core];
    const digits = chars.filter(isDigit).length;
    const looks = chars.length - digits;
    const ok =
      digits >= 2 && looks >= 1 && looks <= 3 &&
      chars.every((c) => isDigit(c) || c in LOOKALIKE) &&
      (isDigit(chars[0]) || isDigit(chars[chars.length - 1]));
    return ok ? [...v].map((c) => LOOKALIKE[c] ?? c).join("") : v;
  });
}

function findNumbers(line: string): Num[] {
  const res: Num[] = [];
  for (const m of line.matchAll(NUMBER)) {
    const first = m.index ?? 0;
    const last = first + m[0].length - 1;
    const digits = digitsOf(m[0]);
    if (digits.length < 7) continue;
    if (digits.length > 13) {
      // Two numbers OCR'd with only a space between them.
      const parts = digits.match(/.{1,10}/g) ?? [];
      if (digits.length % 10 === 0 && parts.every((p) => normalize(p) !== null)) {
        parts.forEach((p) => res.push({ first, last, digits: p }));
        continue;
      }
    }
    res.push({ first, last, digits });
  }
  return res;
}

/** Re-joins a number OCR split over two lines; the line count is kept. */
export function joinSplit(input: string[]): string[] {
  const out = [...input];
  const full = (s: string) => findNumbers(s).some((n) => normalize(n.digits) !== null);
  let i = 0;
  while (i < out.length - 1) {
    const a = out[i].trimEnd();
    const b = out[i + 1];
    const t = TAIL.exec(a);
    const h = HEAD.exec(b);
    if (t && h && !full(a) && !full(b)) {
      const td = digitsOf(t[0]);
      const hd = digitsOf(h[0]);
      if (td.length >= 3 && td.length <= 8 && hd.length >= 2 && hd.length <= 8 && normalize(td + hd) !== null) {
        out[i] = a.substring(0, t.index) + td + hd;
        out[i + 1] = b.substring(h.index + h[0].length);
        i += 2;
        continue;
      }
    }
    i++;
  }
  return out;
}

function stripChatPrefix(s: string): string {
  const stamped = WA_STAMP.test(s) || WA_STAMP_PLAIN.test(s);
  let t = s.replace(WA_STAMP, "").replace(WA_STAMP_PLAIN, "");
  // The sender of a stamped chat line is not the lead.
  if (stamped) t = t.replace(WA_SENDER, "");
  return t;
}

function safeSub(s: string, from: number, to: number): string {
  return from >= 0 && from <= to && to <= s.length ? s.substring(from, to) : "";
}

function cleanName(s: string): string | null {
  const t = s
    .replace(LABELS, " ")
    .replace(/[^\p{L}\s.']/gu, " ")
    .replace(/(^|\s)[.']+|[.']+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if ((t.match(/\p{L}/gu) ?? []).length < 2) return null;
  const words = t.split(" ").filter((w) => w.trim() !== "").slice(0, 3);
  return words.map((w) => w.charAt(0).toUpperCase() + w.substring(1)).join(" ").substring(0, 40);
}

export function parseLines(linesIn: string[]): ScanRow[] {
  const ls = joinSplit(linesIn.map(fixOcrDigits));
  const out: ScanRow[] = [];
  const seen = new Set<string>();
  let prevNameLine: string | null = null;
  let prevHadNumber = false;
  ls.forEach((rawLine, idx) => {
    const line = stripChatPrefix(rawLine);
    const numbers = findNumbers(line);
    if (numbers.length === 0) {
      prevNameLine = cleanName(line);
      prevHadNumber = false;
      return;
    }
    numbers.forEach((num, n) => {
      const before = safeSub(line, n === 0 ? 0 : numbers[n - 1].last + 1, num.first);
      const after = safeSub(line, num.last + 1, numbers[n + 1]?.first ?? line.length);
      let name = cleanName(before) ?? cleanName(after);
      if (name === null && n === 0 && !prevHadNumber) name = prevNameLine;
      const norm = normalize(num.digits);
      const phone = norm ?? num.digits;
      const dup = seen.has(phone);
      seen.add(phone);
      out.push({ name, phone, valid: norm !== null, duplicate: dup, line: idx });
    });
    prevNameLine = null;
    prevHadNumber = true;
  });
  return out;
}

export function defaultScanTag(d = new Date()): string {
  return "Scanned list · " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
