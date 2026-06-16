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
}

const PHONE_KEYS = ["phone", "mobile", "number", "contact", "whatsapp", "tel", "ph", "msisdn"];
const NAME_KEYS = ["name", "customer", "client", "fullname", "full name", "lead", "person", "first_name", "last_name"];
const EMAIL_KEYS = ["email", "mail", "e-mail"];
const PROJECT_KEYS = ["project", "property", "township", "society", "company", "location", "scheme", "interest", "enquiry"];
const BUDGET_KEYS = ["budget", "amount", "value", "price", "investment", "बजट"];
const TERRITORY_KEYS = ["territory", "city", "location", "area", "region", "zone"];
const NOTE_KEYS = ["note", "notes", "remark", "remarks", "comment", "requirement", "message", "source"];

const IGNORE_KEYS = ["ad_name", "adset_name", "campaign_name", "form_name", "ad name", "campaign name"];

function digitsLen(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

function cleanPhone(s: string): string {
  const t = (s ?? "").toString().trim();
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
      
      for (const r of dataRows) {
        const text = r.join(" ");
        // Find a plausible phone number: optional + code, followed by 9-14 digits
        const phoneMatch = text.match(/(?:\+\d{1,3}[\s\-]?)?(?:\d[\s\-]?){9,14}/);
        if (!phoneMatch) {
          skipped++;
          continue;
        }
        
        let extractedPhone = cleanPhone(phoneMatch[0]);
        if (digitsLen(extractedPhone) < 7 || seen.has(extractedPhone)) {
          skipped++;
          continue;
        }
        
        seen.add(extractedPhone);
        
        // Guess name as the word right before the phone match, if it exists
        const beforePhone = text.substring(0, phoneMatch.index).trim();
        const words = beforePhone.split(/\s+/);
        let extractedName = null;
        if (words.length > 0) {
          const lastWord = words[words.length - 1];
          // If the last word is letters only, assume it's a name
          if (/^[a-zA-Z]+$/.test(lastWord) && lastWord.toLowerCase() !== "p") {
            extractedName = lastWord;
          } else if (words.length > 1 && /^[a-zA-Z]+$/.test(words[words.length - 2])) {
             extractedName = words[words.length - 2];
          }
        }
        
        // If we still didn't get a good name, and text is long, let's just leave it null
        // rather than using the entire raw dump.
        
        newLeads.push({
          phone: extractedPhone,
          name: extractedName,
          email: null,
          project: null,
          budget: null,
          territory: null,
          notes: text.length > extractedPhone.length + 10 ? text : null,
        });
      }
      return { leads: newLeads, skipped, total: dataRows.length };
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
  return { leads, skipped, total: dataRows.length };
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
