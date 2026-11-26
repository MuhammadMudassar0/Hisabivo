import test from "node:test";
import assert from "node:assert/strict";
import { validateBackup, validateBackupAttachments, restoreWorkspaceBackup, type WorkspaceBackup } from "../lib/recovery";
const owner = "a1111111-1111-4111-a111-111111111111", workspace = "b2222222-2222-4222-b222-222222222222", entry = "c3333333-3333-4333-a333-333333333333";
function backup(bytes = Buffer.from("%PDF-1.7\nreceipt"), mime = "application/pdf"): WorkspaceBackup {
  const id = "d4444444-4444-4444-a444-444444444444", path = `${owner}/${workspace}/${entry}/${id}.pdf`;
  return { format: "hisabivo-workspace-v1", owner_id: owner, workspace_id: workspace, created_at: new Date().toISOString(), tables: { ledger_receipts: [{ id, user_id: owner, workspace_id: workspace, entry_id: entry, object_path: path, file_name: "receipt.pdf", mime_type: mime, size_bytes: bytes.length }] }, attachments: [{ path, mime, base64: bytes.toString("base64") }] };
}
test("backup receipts validate decoded byte count, metadata, MIME and magic before restore", async () => {
  assert.equal((await validateBackupAttachments(backup()))[0].bytes.length, 16);
  const wrongSize = backup(); wrongSize.tables.ledger_receipts[0].size_bytes = 999;
  assert.throws(() => validateBackup(wrongSize, owner, workspace), /decoded size/);
  const missing = backup(); missing.tables.ledger_receipts = [];
  assert.throws(() => validateBackup(missing, owner, workspace), /match its backup metadata/);
  const differentMime = backup(); differentMime.attachments![0].mime = "image/png";
  assert.throws(() => validateBackup(differentMime, owner, workspace), /match its backup metadata/);
  await assert.rejects(() => validateBackupAttachments(backup(Buffer.from("not a PDF receipt"))), /contents/);
  // This fails before a Supabase client/RPC is reached, even without backend credentials.
  await assert.rejects(() => restoreWorkspaceBackup(backup(Buffer.from("not a PDF receipt")), "e5555555-5555-4555-a555-555555555555"), /contents/);
});
test("backup rejects duplicate attachment identities and cumulative decoded bytes above 25 MB", () => {
  const duplicate = backup(); duplicate.attachments!.push(duplicate.attachments![0]);
  assert.throws(() => validateBackup(duplicate, owner, workspace), /duplicate receipt/);
  const large = backup(Buffer.alloc(5_000_001));
  const original = large.tables.ledger_receipts[0], file = large.attachments![0];
  large.tables.ledger_receipts = []; large.attachments = [];
  for (let i = 0; i < 6; i++) {
    const id = `d4444444-4444-4444-a444-${String(i).padStart(12, "0")}`, path = `${owner}/${workspace}/${entry}/${id}.pdf`;
    large.tables.ledger_receipts.push({ ...original, id, object_path: path }); large.attachments.push({ ...file, path });
  }
  assert.throws(() => validateBackup(large, owner, workspace), /25 MB/);
});
