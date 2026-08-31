// Lead import parsing — smart column mapping for CSV/Excel/paste.
// Telecaller-friendly: works with messy headers, header-less lists, and
// single-column phone dumps. Phone is the only required field.

export interface ParsedLead {
  name: string | null;
  phone: string;
  email: string | null;
  project: string | null; // stored in contacts.company_name
  budget: string | null;
  territory: string | null;
  notes: string | null;
}

export interface ParseResult {
  leads: ParsedLead[];
  skipped: number;
  total: number;
  /** Which lead fields actually got data (for the "we understood your file" chips). */
  mappedFields?: string[];
}

/** Optional lead fields, in display order — used to report what mapped. */
const FIELD_ORDER: (keyof ParsedLead)[] = [
  "phone", "name", "email", "project", "budget", "territory", "notes",
];

/** The fields that ended up with at least one value across the parsed leads —
 *  an honest "here's what we pulled out" signal for both header and dump files. */
function mappedFieldsOf(leads: ParsedLead[]): string[] {
  return FIELD_ORDER.filter((f) => leads.some((l) => l[f] != null && String(l[f]).trim() !== ""));
}

const PHONE_KEYS = ["phone", "mobile", "number", "contact", "whatsapp", "tel", "ph", "msisdn"];
const NAME_KEYS = ["name", "customer", "client", "fullname", "full name", "lead", "person", "first_name", "last_name"];
const EMAIL_KEYS = ["email", "mail", "e-mail"];
const PROJECT_KEYS = ["project", "property", "township", "society", "company", "location", "scheme", "interest", "enquiry"];
const BUDGET_KEYS = ["budget", "amount", "value", "price", "investment", "बजट"];
const TERRITORY_KEYS = ["territory", "city", "location", "area", "region", "zone"];
const NOTE_KEYS = ["note", "notes", "remark", "remarks", "comment", "requirement", "message", "source"];

// Facebook lead-ad export metadata — never map these to a lead field (e.g.
// "campaign_id" must not become the project, "created_time" not a note).
const IGNORE_KEYS = [
  "ad_name", "adset_name", "campaign_name", "form_name", "ad name", "campaign name",
  "ad_id", "adset_id", "campaign_id", "form_id", "created_time", "is_organic", "platform", "lead_id",
];

function digitsLen(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function cleanPhone(s: string): string {
  const t = (s ?? "").toString().trim().replace(/^p:/i, "");
  const plus = t.startsWith("+");
  const digits = t.replace(/\D/g, "");
  return plus ? `+${digits}` : digits;
}

function findCol(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => {
    const x = (h ?? "").toString().trim().toLowerCase();
    if (!x) return false;
    if (IGNORE_KEYS.some((ig) => x.includes(ig))) return false;
    return keys.some((k) => x === k || x.includes(k));
  });
}

/**
 * Drop digits the regex picked up from the text around a phone number.
 *
 * Only for the free-text branch, where the pattern has no way to tell a house
 * number from the start of a mobile. A number already carrying a country code
 * is left exactly as it is; so is anything ten digits or shorter.
 */
function trimStrayDigits(phone: string): string {
  const plus = phone.startsWith("+");
  const d = phone.replace(/\D/g, "");
  if (plus || d.length <= 10 || d.length > 12) return phone;
  if (d.startsWith("91")) return phone;          // 91XXXXXXXXXX, genuine
  const tail = d.slice(-10);
  // Indian mobiles start 6-9. If the last ten do not, this is some other kind
  // of number and guessing would do more harm than leaving it alone.
  return /^[6-9]/.test(tail) ? tail : phone;
}

/** Words that turn up beside a pasted number and are never the person. */
const NOT_A_NAME = new Set([
  "mr", "mrs", "ms", "sir", "madam", "mam", "ji", "shri", "smt", "dr",
  "phone", "mobile", "mob", "no", "num", "number", "contact", "call", "cell",
  "tel", "whatsapp", "wa", "name", "lead", "client", "customer", "p",
  // Address fragments sit right beside a number constantly in this data
  // ("Plot 35, Sector 12 98123…") and would otherwise become the lead's name.
  "plot", "sector", "block", "flat", "house", "road", "street", "near", "opp",
  "floor", "tower", "society", "colony", "nagar", "phase",
]);

/**
 * The person's name from the text around a phone number.
 *
 * Walks outward from the number collecting word-shaped tokens — so
 * "Narendra Singh 9175004551" yields "Narendra Singh" rather than "Singh",
 * and "+91 98373 37656 Naresh" (a shared contact, pasted as-is) still finds
 * "Naresh" on the other side. Stops at anything that is not a word, which is
 * what keeps "Plot 35, Sector 12" out of the name field.
 */
function pickName(chunk: string, dir: "backwards" | "forwards" = "backwards"): string | null {
  const words = chunk.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const ordered = dir === "backwards" ? [...words].reverse() : words;

  const picked: string[] = [];
  for (const raw of ordered) {
    const w = raw.replace(/^[^\p{L}]+|[^\p{L}\p{M}.'-]+$/gu, "");
    if (!w) break;
    // Letters (any script — Hindi names are pasted in Devanagari too), with
    // the punctuation a name legitimately carries.
    if (!/^[\p{L}][\p{L}\p{M}.'-]*$/u.test(w)) break;
    if (NOT_A_NAME.has(w.toLowerCase().replace(/[.'-]/g, ""))) break;
    picked.push(w);
    // Four words is already "Ram Prasad Singh Yadav"; past that it is a
    // sentence and taking it would put an address in the name column.
    if (picked.length === 4) break;
  }
  if (!picked.length) return null;
  const name = (dir === "backwards" ? picked.reverse() : picked).join(" ").trim();
  return name.length >= 2 ? name : null;
}

export function parseRows(rows: string[][]): ParseResult {
  const clean = rows
    .map((r) => r.map((c) => (c ?? "").toString()))
    .filter((r) => r.some((c) => c.trim() !== ""));
  if (clean.length === 0) return { leads: [], skipped: 0, total: 0 };

  const first = clean[0];
  const firstHasPhone = first.some((c) => digitsLen(c) >= 7);
  const headerLooks = findCol(first, PHONE_KEYS) >= 0 || findCol(first, NAME_KEYS) >= 0;
  const hasHeader = headerLooks && !firstHasPhone;

  let phoneCol = -1, nameCol = -1, emailCol = -1, projectCol = -1, budgetCol = -1, territoryCol = -1, noteCol = -1;
  let dataRows: string[][];

  if (hasHeader) {
    const h = first;
    phoneCol = findCol(h, PHONE_KEYS);
    nameCol = findCol(h, NAME_KEYS);
    emailCol = findCol(h, EMAIL_KEYS);
    projectCol = findCol(h, PROJECT_KEYS);
    budgetCol = findCol(h, BUDGET_KEYS);
    territoryCol = findCol(h, TERRITORY_KEYS);
    noteCol = findCol(h, NOTE_KEYS);
    dataRows = clean.slice(1);
  } else {
    dataRows = clean;
  }

  // No phone column found → try to guess
  if (phoneCol < 0) {
    const cols = Math.max(...dataRows.map((r) => r.length), 0);
    // If it's basically a single column dump, regex extract phone and name
    if (cols <= 2 && !hasHeader) {
      const newLeads: ParsedLead[] = [];
      let skipped = 0;
      const seen = new Set<string>();
      
      // A NAME ON ITS OWN LINE ABOVE THE NUMBER.
      //
      // Copying a contact out of a phone gives three lines — "Anand Pratap
      // Singh", "Phone", "+91 8826223530" — and every one of those first two
      // lines was counted as "skipped (no phone)" and thrown away, so the lead
      // imported with a blank name from a paste that plainly contained one.
      // A line with no number is now held as a candidate for the next line
      // that has one, and cleared as soon as it is used or superseded.
      let carriedName: string | null = null;

      for (const r of dataRows) {
        const text = r.join(" ");
        // Find a plausible phone number: optional + code, followed by 9-14 digits
        const phoneMatch = text.match(/(?:\+\d{1,3}[\s\-]?)?(?:\d[\s\-]?){9,14}/);
        if (!phoneMatch) {
          // Not a lead by itself, but it may be the name of the next one.
          const maybe = pickName(text, "forwards");
          if (maybe) carriedName = maybe;
          skipped++;
          continue;
        }
        
        // THE NUMBER SWALLOWING THE DIGITS NEXT TO IT.
        //
        // "Plot 35, Sector 12 9812345671" matched as "12 9812345671" — the
        // pattern cannot tell a house number from the start of a phone number,
        // so a real lead imported under a phone that does not exist. An Indian
        // mobile is ten digits, optionally behind 91 or a 0; anything longer
        // that is NOT behind a country code has picked something up on the way
        // in, and the last ten are the ones that matter.
        const extractedPhone = trimStrayDigits(cleanPhone(phoneMatch[0]));
        if (digitsLen(extractedPhone) < 7 || seen.has(extractedPhone)) {
          skipped++;
          continue;
        }
        
        seen.add(extractedPhone);
        
        // THE WHOLE NAME, NOT THE LAST WORD OF IT.
        //
        // This used to take the single word before the number, so
        // "Narendra Singh 9175004551" imported as "Singh" — a lead the rep
        // then greets by surname, and one nobody can find by searching the
        // name they were given. Indian names are routinely two or three
        // words; taking one is wrong far more often than it is right.
        const before = text.substring(0, phoneMatch.index).trim();
        const after = text.substring(phoneMatch.index! + phoneMatch[0].length).trim();
        // The line's own text wins; a name carried down from the line above is
        // only used when this line has none of its own.
        const extractedName = pickName(before) ?? pickName(after, "forwards") ?? carriedName;
        carriedName = null;

        // Notes are what is LEFT once the name and the number are accounted
        // for. Keeping the raw line meant every lead carried a note that just
        // repeated its own name and phone back — noise in the one field a rep
        // actually reads before dialling.
        const leftover = text
          .replace(phoneMatch[0], " ")
          .replace(extractedName ?? "", " ")
          .replace(/\s+/g, " ")
          .trim();

        newLeads.push({
          phone: extractedPhone,
          name: extractedName,
          email: null,
          project: null,
          budget: null,
          territory: null,
          notes: leftover.length >= 3 ? leftover : null,
        });
      }
      return { leads: newLeads, skipped, total: dataRows.length, mappedFields: mappedFieldsOf(newLeads) };
    }
    
    // Otherwise fallback to column with most digits
    let best = -1, bestScore = 0;
    for (let c = 0; c < cols; c++) {
      const score = dataRows.reduce((n, r) => n + (digitsLen(r[c] ?? "") >= 7 ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    phoneCol = best;
    if (nameCol < 0) {
      for (let c = 0; c < cols; c++) { if (c !== phoneCol) { nameCol = c; break; } }
    }
  }

  const leads: ParsedLead[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of dataRows) {
    const phoneRaw = phoneCol >= 0 ? r[phoneCol] ?? "" : "";
    let phone = cleanPhone(phoneRaw);
    
    // If phone has more than 15 digits, it's likely a merged row. Try regex fallback.
    if (phone.length > 15) {
      const pm = phoneRaw.match(/(?:\+\d{1,3}[\s\-]?)?(?:\d[\s\-]?){9,14}/);
      if (pm) phone = cleanPhone(pm[0]);
    }
    
    if (digitsLen(phone) < 7 || phone.length > 15) { skipped++; continue; }
    if (seen.has(phone)) { skipped++; continue; }
    seen.add(phone);
    
    const val = (i: number) => (i >= 0 ? (r[i] ?? "").toString().trim() : "");
    leads.push({
      phone,
      name: val(nameCol) || null,
      email: val(emailCol) || null,
      project: val(projectCol) || null,
      budget: val(budgetCol) || null,
      territory: val(territoryCol) || null,
      notes: val(noteCol) || null,
    });
  }
  return { leads, skipped, total: dataRows.length, mappedFields: mappedFieldsOf(leads) };
}

/**
 * Decode a raw file buffer to text, honouring the byte-order mark. Facebook
 * lead-ad CSV exports are **UTF-16LE** (and tab-delimited) — reading them as
 * UTF-8 turns every row into garbage, so detect the encoding first.
 */
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder("utf-8").decode(buf);
  // No BOM: if a sample is full of NUL bytes it's UTF-16LE without a mark.
  const n = Math.min(b.length, 2000);
  let nul = 0;
  for (let i = 0; i < n; i++) if (b[i] === 0) nul++;
  if (n > 0 && nul / n > 0.2) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

export function parseCSV(text: string): string[][] {
  let delim = ',';
  const firstLine = text.split(/\r?\n/)[0] || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  if (tabs > commas && tabs > semis) delim = '\t';
  else if (semis > commas && semis > tabs) delim = ';';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delim && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

/** Parse pasted text (TSV from Excel, or CSV). */
export function parsePasted(text: string): ParseResult {
  const rows = text.includes("\t") 
    ? text.split(/\r?\n/).map((l) => l.split("\t"))
    : parseCSV(text);
  return parseRows(rows);
}
