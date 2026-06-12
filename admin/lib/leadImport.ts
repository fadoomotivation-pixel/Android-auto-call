// Lead import parsing — smart column mapping for CSV/Excel/paste.
// Telecaller-friendly: works with messy headers, header-less lists, and
// single-column phone dumps. Phone is the only required field.

export interface ParsedLead {
  name: string | null;
  phone: string;
  email: string | null;
  project: string | null; // stored in contacts.company_name
  budget: string | null;
  notes: string | null;
}

export interface ParseResult {
  leads: ParsedLead[];
  skipped: number;
  total: number;
}

const PHONE_KEYS = ["phone", "mobile", "number", "contact", "whatsapp", "tel", "ph", "msisdn"];
const NAME_KEYS = ["name", "customer", "client", "fullname", "full name", "lead", "person"];
const EMAIL_KEYS = ["email", "mail", "e-mail"];
const PROJECT_KEYS = ["project", "property", "township", "society", "company", "location", "scheme", "interest", "enquiry"];
const BUDGET_KEYS = ["budget", "amount", "value", "price", "investment"];
const NOTE_KEYS = ["note", "notes", "remark", "remarks", "comment", "requirement", "message", "source"];

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

  let phoneCol = -1, nameCol = -1, emailCol = -1, projectCol = -1, budgetCol = -1, noteCol = -1;
  let dataRows: string[][];

  if (hasHeader) {
    const h = first;
    phoneCol = findCol(h, PHONE_KEYS);
    nameCol = findCol(h, NAME_KEYS);
    emailCol = findCol(h, EMAIL_KEYS);
    projectCol = findCol(h, PROJECT_KEYS);
    budgetCol = findCol(h, BUDGET_KEYS);
    noteCol = findCol(h, NOTE_KEYS);
    dataRows = clean.slice(1);
  } else {
    dataRows = clean;
  }

  // No phone column found → pick the column with the most phone-like cells.
  if (phoneCol < 0) {
    const cols = Math.max(...dataRows.map((r) => r.length), 0);
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
    const phone = cleanPhone(phoneCol >= 0 ? r[phoneCol] ?? "" : "");
    if (digitsLen(phone) < 7) { skipped++; continue; }
    if (seen.has(phone)) { skipped++; continue; }
    seen.add(phone);
    const val = (i: number) => (i >= 0 ? (r[i] ?? "").toString().trim() : "");
    leads.push({
      phone,
      name: val(nameCol) || null,
      email: val(emailCol) || null,
      project: val(projectCol) || null,
      budget: val(budgetCol) || null,
      notes: val(noteCol) || null,
    });
  }
  return { leads, skipped, total: dataRows.length };
}

/** Parse pasted text (TSV from Excel, or CSV). */
export function parsePasted(text: string): ParseResult {
  const rows = text
    .split(/\r?\n/)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")));
  return parseRows(rows);
}
