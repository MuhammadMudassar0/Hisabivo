"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "./ui/button";
import { exportSourceCsv, previewCsvImport, type CsvPreview } from "@/lib/csv";
import { clientRequestId } from "@/lib/client-request-id";
import { money, today, type EntryInput, type Transaction } from "@/lib/ledger";
import { useLocale } from "./locale-provider";
import "@/app/productivity.css";

export default function DataTools({ entries, onImport, disabled = false }: { entries: Transaction[]; onImport: (entries: EntryInput[], requestId: string) => Promise<void>; disabled?: boolean }) {
  const { t } = useLocale();
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const request = useRef<{ body: string; id: string } | null>(null);
  function download(example = false) {
    const sample: Transaction[] = [{ id: "example", type: "expense", amount_paisa: 150000, description: "Bike fuel", category: "Fuel", date: today(), payment_method: "Cash", notes: "Example row; review before importing", created_at: new Date().toISOString(), expense_status: "paid", paid_date: today() }];
    const url = URL.createObjectURL(new Blob([exportSourceCsv(example ? sample : entries)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = example ? "hisabivo-example.csv" : `hisabivo-source-records-${today()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || pending.current) return;
    setError(""); setNotice(""); setPreview(null); setFileName(file.name); request.current = null;
    try {
      if (file.size > 2_000_000) throw new Error("Choose a CSV smaller than 2 MB.");
      if (!/\.csv$/i.test(file.name)) throw new Error("Choose a .csv file.");
      setPreview(previewCsvImport(await file.text(), entries));
    } catch (err) { setError(err instanceof Error ? err.message : "The CSV could not be opened."); }
    finally { event.target.value = ""; }
  }
  async function importRows() {
    if (!preview || preview.errorCount || !preview.entries.length || pending.current || disabled) return;
    const refreshed = preview.entries.filter(candidate => !entries.some(entry => JSON.stringify([entry.date,entry.type,entry.amount_paisa,entry.category.trim(),entry.description.trim(),entry.payment_method]) === JSON.stringify([candidate.date,candidate.type,candidate.amount_paisa,candidate.category.trim(),candidate.description.trim(),candidate.payment_method])));
    if (!refreshed.length) { setNotice("These records are already in your ledger. Nothing was imported."); return; }
    const body = JSON.stringify(refreshed);
    if (request.current?.body !== body) request.current = { body, id: clientRequestId() };
    pending.current = true; setBusy(true); setError("");
    try { await onImport(refreshed, request.current!.id); setNotice(`${refreshed.length} records imported. Duplicates were skipped.`); setPreview(null); }
    catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Import could not finish. You can retry the same batch safely."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="prod-data-tools" aria-label="CSV import and export"><div className="prod-section-heading"><div><span className="prod-modal-icon"><FileSpreadsheet size={22} /></span><h2>{t("Bring your records together", "اپنے ریکارڈ ایک جگہ رکھیں")}</h2><p>{t("Export original records, or preview up to 1,000 CSV rows before importing.", "اصل ریکارڈ برآمد کریں یا درآمد سے پہلے ایک ہزار قطاروں تک جائزہ لیں۔")}</p></div></div><div className="prod-data-actions"><Button variant="outline" onClick={() => download()} disabled={!entries.length || busy}><Download />{t("Export source CSV", "اصل CSV برآمد کریں")}</Button><Button variant="outline" onClick={() => input.current?.click()} disabled={disabled || busy}><Upload />{t("Preview CSV import", "CSV درآمد کا جائزہ")}</Button><Button variant="ghost" onClick={() => download(true)} disabled={busy}>{t("Download example", "مثال ڈاؤن لوڈ کریں")}</Button><input ref={input} type="file" accept=".csv,text/csv" hidden onChange={chooseFile} /></div><p className="prod-hint">Source CSV amounts are original record totals, not an installment cash statement. Tracked expenses cannot be imported from this CSV because payment history would be lost. Use monthly reports for paid cash movements.</p>
    {preview && <div className="prod-csv-preview"><div className="prod-section-heading"><h3>{fileName}</h3><Button size="icon" variant="ghost" aria-label="Close CSV preview" disabled={busy} onClick={() => setPreview(null)}><X size={18} /></Button></div><div className="prod-csv-counts"><span>{preview.entries.length} ready</span><span>{preview.duplicateCount} duplicates skipped</span><span>{preview.errorCount} rows to fix</span></div>{preview.errorCount > 0 && <p className="error-message">Fix the invalid rows and upload the file again. This batch hasn’t changed your ledger.</p>}<div className="prod-csv-table"><table><thead><tr><th>CSV row</th><th>Description</th><th>Type / status</th><th>Amount</th><th>Review</th></tr></thead><tbody>{preview.rows.slice(0, 50).map(row => <tr key={row.line}><td>{row.line}</td><td>{row.input?.description || "Invalid row"}</td><td>{row.input ? `${row.input.type} · ${row.input.expense_status || "paid"}` : "—"}</td><td>{row.input ? money(row.input.amount_paisa, true) : "—"}</td><td>{row.errors.join(" ") || (row.duplicate ? "Duplicate — skipped" : "Ready")}</td></tr>)}</tbody></table></div>{preview.rows.length > 50 && <p className="prod-hint">Showing the first 50 rows. All {preview.rows.length} rows have been checked.</p>}<Button onClick={importRows} disabled={disabled || busy || preview.errorCount > 0 || preview.entries.length === 0}>{busy && <LoaderCircle className="animate-spin" />}Import {preview.entries.length} records</Button></div>}
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
  </section>;
}
