"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, FileDown, FileImage, FileText, LoaderCircle, Paperclip, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { clientRequestId } from "@/lib/client-request-id";
import { deleteReceipt, downloadReceipt, listReceipts, uploadReceipt, validateReceiptFile, type Receipt } from "@/lib/receipts";
import { useLocale } from "./locale-provider";
import "@/app/productivity.css";

type Props = { entryId: string; ownerId: string; workspaceId?: string; demo: boolean; readOnly?: boolean };
export default function ReceiptAttachments({ entryId, ownerId, workspaceId, demo, readOnly = false }: Props) {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const files = useRef(new Map<string, File>());
  const fileInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setRows([]); files.current.clear();
    if (demo) { setLoading(false); return () => { active = false; }; }
    if (!workspaceId) { setError("Choose a workspace to view this record’s private receipts."); setLoading(false); return; }
    listReceipts(ownerId, workspaceId, entryId).then(data => { if (active) setRows(data); }).catch(err => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entryId, ownerId, workspaceId, demo, attempt]);
  function message(err: unknown) { return err && typeof err === "object" && "message" in err ? String(err.message) : "This receipt could not be opened. Please try again."; }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || lock.current || readOnly) return;
    lock.current = true; setBusyId("upload"); setError("");
    try {
      const validated = await validateReceiptFile(file);
      if (!demo && !workspaceId) throw new Error("Choose a workspace before attaching a receipt.");
      let row: Receipt;
      if (demo) { const id = clientRequestId(); files.current.set(id, file); row = { id, user_id: ownerId, workspace_id: workspaceId || "demo", entry_id: entryId, object_path: "demo", file_name: validated.fileName, mime_type: file.type, size_bytes: file.size, created_at: new Date().toISOString() }; }
      else row = await uploadReceipt(ownerId, workspaceId!, entryId, file);
      setRows(previous => [...previous, row]);
    } catch (err) { setError(message(err)); }
    finally { event.target.value = ""; lock.current = false; setBusyId(""); }
  }
  async function download(row: Receipt) {
    if (lock.current) return; lock.current = true; setBusyId(row.id); setError("");
    try {
      if (demo) { const file = files.current.get(row.id); if (!file) throw new Error("This demo receipt is no longer available."); const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = row.file_name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      else await downloadReceipt(row);
    } catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusyId(""); }
  }
  async function remove(row: Receipt) {
    if (lock.current || readOnly) return; lock.current = true; setBusyId(row.id); setError("");
    try { if (!demo) await deleteReceipt(row); files.current.delete(row.id); setRows(previous => previous.filter(receipt => receipt.id !== row.id)); setDeleting(null); }
    catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusyId(""); }
  }
  const missingSetup = /ledger_receipts|Bucket not found|bucket.*not.*found|schema cache|PGRST205/i.test(error);
  return <section className="prod-receipts" lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} aria-label="Private receipt attachments"><div className="prod-section-heading"><div><h3><Paperclip size={18} />{t("Receipts & attachments", "رسیدیں اور منسلک فائلیں")}</h3><p>{t("Keep the proof with the record. Images or PDF, up to 5 MB each.", "ثبوت ریکارڈ کے ساتھ رکھیں۔ تصویر یا PDF، ہر فائل پانچ MB تک۔")}</p></div>{!readOnly && <Button variant="outline" size="sm" disabled={loading || Boolean(busyId) || (!demo && !workspaceId)} onClick={() => fileInput.current?.click()}><Plus />{t("Attach receipt", "رسید منسلک کریں")}</Button>}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={upload} /></div>{demo && <p className="prod-hint">Demo receipts stay in memory for this visit and are never uploaded.</p>}{loading ? <p className="prod-hint" role="status"><LoaderCircle size={16} className="animate-spin" />Loading receipts…</p> : <ul className="prod-receipt-list">{rows.map(row => <li key={row.id}><div className="prod-receipt-main"><span>{row.mime_type === "application/pdf" ? <FileText size={21} /> : <FileImage size={21} />}</span><div><strong>{row.file_name}</strong><small>{Math.ceil(row.size_bytes / 1024)} KB · {row.mime_type === "application/pdf" ? "PDF" : "Image"}</small></div><Button size="icon" variant="ghost" aria-label={`Download ${row.file_name}`} disabled={Boolean(busyId)} onClick={() => download(row)}>{busyId === row.id ? <LoaderCircle className="animate-spin" /> : <Download size={17} />}</Button>{!readOnly && <Button size="icon" variant="ghost" aria-label={`Delete receipt ${row.file_name}`} disabled={Boolean(busyId)} onClick={() => setDeleting(row.id)}><Trash2 size={16} /></Button>}</div>{deleting === row.id && <div className="prod-inline-confirm"><p>Delete this receipt file? The transaction itself stays in place.</p><div><Button size="sm" variant="outline" disabled={Boolean(busyId)} onClick={() => setDeleting(null)}>Keep receipt</Button><Button size="sm" variant="destructive" disabled={Boolean(busyId)} onClick={() => remove(row)}>Delete receipt</Button></div></div>}</li>)}</ul>}{!loading && !rows.length && !error && <p className="prod-receipts-empty">{t("No receipts attached yet.", "ابھی کوئی رسید منسلک نہیں۔")}</p>}{busyId === "upload" && <p role="status" className="prod-hint"><LoaderCircle size={16} className="animate-spin" />Uploading your private receipt…</p>}{error && <div role="alert" className="error-message"><p>{error}</p>{missingSetup && <a href="/setup-productivity.sql" download><FileDown size={15} />Download receipt setup</a>}<Button variant="outline" size="sm" disabled={Boolean(busyId)} onClick={() => setAttempt(value => value + 1)}>Retry</Button></div>}<div className="prod-receipt-privacy"><ShieldCheck size={14} /><span>{t("Private files. Downloads use a short-lived signed link.", "نجی فائلیں۔ ڈاؤن لوڈ کا لنک مختصر مدت کے لیے ہوتا ہے۔")}</span></div></section>;
}
