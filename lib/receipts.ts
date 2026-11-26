import { supabase } from "./supabase";
import { clientRequestId } from "./client-request-id";

export const receiptBucket = "ledger-receipts";
export const receiptMaxBytes = 5 * 1024 * 1024;
export type Receipt = { id: string; user_id: string; workspace_id: string; entry_id: string; object_path: string; file_name: string; mime_type: string; size_bytes: number; created_at: string };
const fileTypes: Record<string, { extension: string; signature: (bytes: Uint8Array) => boolean }> = {
  "image/jpeg": { extension: "jpg", signature: bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 },
  "image/png": { extension: "png", signature: bytes => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte) },
  "image/webp": { extension: "webp", signature: bytes => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
  "application/pdf": { extension: "pdf", signature: bytes => String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" },
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function sanitizeReceiptName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f\/\\<>:"|?*]/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || "receipt";
}
export async function validateReceiptFile(file: File) {
  if (!file.size || file.size > receiptMaxBytes) throw new Error("Choose a non-empty receipt no larger than 5 MB.");
  const type = fileTypes[file.type];
  if (!type) throw new Error("Choose a JPEG, PNG, WebP image, or PDF receipt.");
  const allowedExtensions = file.type === "image/jpeg" ? /\.jpe?g$/i : new RegExp(`\\.${type.extension}$`, "i");
  if (!allowedExtensions.test(file.name)) throw new Error("The filename extension must match its image or PDF format.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!type.signature(bytes)) throw new Error("This file’s contents don’t match its stated format. Choose an original image or PDF.");
  return { extension: type.extension, fileName: sanitizeReceiptName(file.name) };
}
function validateScope(ownerId: string, workspaceId: string, entryId: string) {
  if (![ownerId, workspaceId, entryId].every(value => uuid.test(value))) throw new Error("Choose a saved transaction in the current workspace first.");
}
export async function listReceipts(ownerId: string, workspaceId: string, entryId: string): Promise<Receipt[]> {
  validateScope(ownerId, workspaceId, entryId);
  const { data, error } = await supabase().from("ledger_receipts").select("*").eq("user_id", ownerId).eq("workspace_id", workspaceId).eq("entry_id", entryId).order("created_at");
  if (error) throw error;
  return data as Receipt[];
}
export async function uploadReceipt(ownerId: string, workspaceId: string, entryId: string, file: File): Promise<Receipt> {
  validateScope(ownerId, workspaceId, entryId);
  const validated = await validateReceiptFile(file);
  const id = clientRequestId();
  const path = `${ownerId}/${workspaceId}/${entryId}/${id}.${validated.extension}`;
  const { error: uploadError } = await supabase().storage.from(receiptBucket).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase().from("ledger_receipts").insert({ id, user_id: ownerId, workspace_id: workspaceId, entry_id: entryId, object_path: path, file_name: validated.fileName, mime_type: file.type, size_bytes: file.size }).select().single();
  if (error) {
    const cleanup = await supabase().storage.from(receiptBucket).remove([path]);
    if (cleanup.error) throw new Error("The upload could not finish and its private file needs cleanup. Retry after checking your connection.");
    throw error;
  }
  return data as Receipt;
}
function checkReceiptPath(receipt: Receipt) {
  const expected = `${receipt.user_id}/${receipt.workspace_id}/${receipt.entry_id}/`;
  if (!receipt.object_path.startsWith(expected) || receipt.object_path.slice(expected.length).includes("/")) throw new Error("The receipt path does not match this workspace and record.");
}
export async function downloadReceipt(receipt: Receipt) {
  checkReceiptPath(receipt);
  const { data, error } = await supabase().storage.from(receiptBucket).createSignedUrl(receipt.object_path, 60, { download: receipt.file_name });
  if (error) throw error;
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error("The private receipt could not be downloaded. Try again.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = receipt.file_name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function deleteReceipt(receipt: Receipt) {
  checkReceiptPath(receipt);
  // Remove bytes first. If metadata deletion fails, the visible row can be retried.
  const { error: storageError } = await supabase().storage.from(receiptBucket).remove([receipt.object_path]);
  if (storageError) throw storageError;
  const { data, error } = await supabase().from("ledger_receipts").delete().eq("id", receipt.id).eq("user_id", receipt.user_id).eq("workspace_id", receipt.workspace_id).eq("entry_id", receipt.entry_id).select("id").single();
  if (error || !data) throw error || new Error("The receipt metadata could not be removed. Please retry.");
}
