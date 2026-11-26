import { normalizeEntry, parseAmount, validateEntry, type EntryInput, type Transaction } from "./ledger";

const headers = ["type", "amount_pkr", "description", "category", "date", "payment_method", "notes", "expense_status", "paid_date", "payment_tracking", "amount_kind"];
export type CsvPreviewRow = { line: number; input?: EntryInput; errors: string[]; duplicate: boolean };
export type CsvPreview = { rows: CsvPreviewRow[]; entries: EntryInput[]; errorCount: number; duplicateCount: number };

/** Comma-separated RFC 4180 records, including quoted commas, quotes and newlines. */
export function parseCsv(source: string): string[][] {
  if (source.length > 2_000_000) throw new Error("Choose a CSV smaller than 2 MB.");
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  function endField() { row.push(field); field = ""; closed = false; }
  function endRow() { endField(); if (row.some(value => value !== "")) rows.push(row); row = []; if (rows.length > 1001) throw new Error("Import at most 1,000 records at a time."); }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ",") endField();
    else if (char === "\r" || char === "\n") { if (char === "\r" && text[i + 1] === "\n") i++; endRow(); }
    else if (char === '"') { if (field || closed) throw new Error("A quote must begin a CSV field, or be doubled inside a quoted field."); quoted = true; }
    else { if (closed) throw new Error("Only a comma or newline can follow a closing CSV quote."); field += char; }
  }
  if (quoted) throw new Error("A quoted CSV field was not closed.");
  if (field || row.length || closed) endRow();
  return rows;
}
export function safeSpreadsheetCell(value: string) { return /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value; }
function csvCell(value: string) { return `"${safeSpreadsheetCell(value).replace(/"/g, '""')}"`; }
function restoredCell(value: string) { return value.startsWith("'") && safeSpreadsheetCell(value.slice(1)) === value ? value.slice(1) : value; }
export function exportSourceCsv(entries: Transaction[]) {
  const rows = entries.map(entry => [entry.type, (entry.amount_paisa / 100).toFixed(2), entry.description, entry.category, entry.date, entry.payment_method, entry.notes, entry.expense_status || "paid", entry.paid_date || "", entry.payment_tracking || entry.expense_status === "partial" || Boolean(entry.payments?.length) ? "true" : "false", entry.type === "income" ? "income_received" : "original_expense_total"]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}
export function entryFingerprint(entry: EntryInput) {
  return JSON.stringify([entry.date, entry.type, entry.amount_paisa, entry.category.trim(), entry.description.trim(), entry.payment_method]);
}
export function previewCsvImport(source: string, existing: Transaction[] = []): CsvPreview {
  const records = parseCsv(source);
  if (records.length < 2) throw new Error("Include a header row and at least one transaction.");
  const columns = records[0].map(value => value.trim().toLowerCase());
  if (new Set(columns).size !== columns.length) throw new Error("CSV column names must be unique.");
  for (const name of headers.slice(0, 6)) if (!columns.includes(name)) throw new Error(`Missing column: ${name}. Download the source CSV or example to see the format.`);
  const seen = new Set(existing.map(entryFingerprint));
  const rows = records.slice(1).map((record, index): CsvPreviewRow => {
    const errors: string[] = []; let input: EntryInput | undefined; let duplicate = false;
    try {
      if (record.length !== columns.length) throw new Error(`Expected ${columns.length} columns, found ${record.length}.`);
      const values = Object.fromEntries(columns.map((column, columnIndex) => [column, restoredCell(record[columnIndex])]));
      if (values.expense_status === "partial" || /^(true|1|yes)$/i.test(values.payment_tracking || "")) throw new Error("This row has installment history. Importing an original bill as a paid amount would change cash totals; use a full backup for tracked expenses.");
      if (values.expense_status && !["paid", "expected"].includes(values.expense_status)) throw new Error("Expense status must be paid or expected.");
      input = normalizeEntry({ type: values.type.trim().toLowerCase() as EntryInput["type"], amount_paisa: parseAmount(values.amount_pkr), description: values.description.trim(), category: values.category.trim(), date: values.date.trim(), payment_method: values.payment_method.trim() as EntryInput["payment_method"], notes: values.notes || "", expense_status: (values.expense_status || "paid") as "paid" | "expected", paid_date: values.paid_date?.trim() || null });
      validateEntry(input);
      const fingerprint = entryFingerprint(input); duplicate = seen.has(fingerprint); seen.add(fingerprint);
    } catch (error) { errors.push(error instanceof Error ? error.message : "Check this row’s fields."); }
    return { line: index + 2, input, errors, duplicate };
  });
  return { rows, entries: rows.filter(row => !row.errors.length && !row.duplicate && row.input).map(row => row.input!), errorCount: rows.filter(row => row.errors.length).length, duplicateCount: rows.filter(row => row.duplicate).length };
}
