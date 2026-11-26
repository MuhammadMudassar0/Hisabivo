import test from "node:test";
import assert from "node:assert/strict";
import { exportSourceCsv, parseCsv, previewCsvImport } from "../lib/csv";
import { parseQuickEntry, starterTemplates, templateDraft } from "../lib/quick-entry";
import { sanitizeReceiptName, validateReceiptFile } from "../lib/receipts";
import { clientRequestId } from "../lib/client-request-id";
import type { Transaction } from "../lib/ledger";

const record: Transaction = { id: "one", type: "expense", description: "Fuel", amount_paisa: 150000, category: "Fuel", date: "2026-11-27", payment_method: "Cash", notes: "Line one\nLine two, with a \"quote\"", created_at: "2026-11-27T12:00:00Z", expense_status: "paid", paid_date: "2026-11-27" };

test("CSV supports BOM, commas, escaped quotes, and newlines without splitting records", () => {
  const source = exportSourceCsv([record]);
  const parsed = parseCsv(source);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1][6], record.notes);
  const preview = previewCsvImport(source);
  assert.equal(preview.errorCount, 0);
  assert.equal(preview.entries[0].amount_paisa, 150000);
  assert.equal(preview.entries[0].notes, record.notes);
  assert.throws(() => parseCsv('a,b\n"unclosed,record'));
  assert.throws(() => parseCsv('a,b\n"closed"junk,value'));
});
test("CSV detects duplicates in the file and current ledger", () => {
  const preview = previewCsvImport(exportSourceCsv([record, { ...record, id: "two" }]));
  assert.equal(preview.entries.length, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(previewCsvImport(exportSourceCsv([record]), [record]).entries.length, 0);
});
test("CSV formula protection is quoted and reversible for source export", () => {
  const unsafe = { ...record, description: '=HYPERLINK("https://invalid.example","x")' };
  const csv = exportSourceCsv([unsafe]);
  assert.ok(parseCsv(csv)[1][2].startsWith("'="));
  assert.equal(previewCsvImport(csv).entries[0].description, unsafe.description);
});
test("CSV refuses tracked bill totals as a replacement for installment cash history", () => {
  const preview = previewCsvImport(exportSourceCsv([{ ...record, expense_status: "partial", payment_tracking: true }]));
  assert.equal(preview.errorCount, 1);
  assert.equal(preview.entries.length, 0);
  assert.match(preview.rows[0].errors[0], /installment history/);
});
test("ambiguous Roman Urdu advances never become an automatic expense", () => {
  const preview = parseQuickEntry("Ali ko 5 hazar advance");
  assert.equal(preview.intent.kind, "ambiguous");
  assert.equal(preview.intent.person, "Ali");
  assert.equal(preview.draft.type, undefined);
  assert.equal(preview.draft.amount_paisa, 500000);
  assert.equal(preview.intent.requiresConfirmation, true);
  const fuel = parseQuickEntry("Petrol ۱۵۰۰");
  assert.equal(fuel.draft.type, "expense");
  assert.equal(fuel.draft.category, "Fuel");
  assert.equal(fuel.draft.amount_paisa, 150000);
  assert.equal(templateDraft(starterTemplates[0]).intent.requiresConfirmation, true);
});
test("receipt validation checks bytes, mime, extension and size", async () => {
  const pdf = new File(["%PDF-1.7\nreceipt"], "receipt.pdf", { type: "application/pdf" });
  assert.equal((await validateReceiptFile(pdf)).extension, "pdf");
  await assert.rejects(validateReceiptFile(new File(["not a PDF"], "receipt.pdf", { type: "application/pdf" })), /contents/);
  await assert.rejects(validateReceiptFile(new File(["%PDF-1.7"], "receipt.jpg", { type: "application/pdf" })), /extension/);
  await assert.rejects(validateReceiptFile(new File([new Uint8Array(5242881)], "large.pdf", { type: "application/pdf" })), /5 MB/);
  assert.ok(!sanitizeReceiptName("../folder\\receipt\u0000.pdf").includes("/"));
  assert.match(clientRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
