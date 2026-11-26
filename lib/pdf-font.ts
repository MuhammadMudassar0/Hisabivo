import type { jsPDF, TextOptionsLight } from "jspdf";

export const PDF_FONT_FAMILY = "NotoNaskhArabic";
export type PdfFontData = { regular: string; bold: string };
let fontRequest: Promise<PdfFontData> | undefined;

export function containsUrduText(value: unknown): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(String(value ?? ""));
}

/** Synchronous embedding keeps document-building helpers and their tests synchronous. */
export function embedFont(doc: jsPDF, regularBase64: string, boldBase64 = regularBase64) {
  const styles = doc.getFontList()[PDF_FONT_FAMILY] || [];
  if (!styles.includes("normal")) {
    doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", regularBase64);
    doc.addFont("NotoNaskhArabic-Regular.ttf", PDF_FONT_FAMILY, "normal");
  }
  if (!styles.includes("bold")) {
    doc.addFileToVFS("NotoNaskhArabic-Bold.ttf", boldBase64);
    doc.addFont("NotoNaskhArabic-Bold.ttf", PDF_FONT_FAMILY, "bold");
  }
  doc.setFont(PDF_FONT_FAMILY, "normal");
}

async function fontBase64(path: string) {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error("The Urdu PDF font could not be loaded. Check your connection and try again.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 10000 || bytes.length > 2_000_000 || bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) throw new Error("The Urdu PDF font file is invalid.");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export async function fetchPdfFont(): Promise<PdfFontData> {
  if (!fontRequest) fontRequest = Promise.all([fontBase64("/fonts/NotoNaskhArabic-Regular.ttf"), fontBase64("/fonts/NotoNaskhArabic-Bold.ttf")]).then(([regular, bold]) => ({ regular, bold })).catch(error => { fontRequest = undefined; throw error; });
  return fontRequest;
}
export async function fetchFontBase64() { return (await fetchPdfFont()).regular; }
export async function loadPdfFont(doc: jsPDF, hasUrduText: boolean): Promise<void> {
  if (!hasUrduText) return;
  const fonts = await fetchPdfFont(); embedFont(doc, fonts.regular, fonts.bold);
}

/** jsPDF's Arabic preprocessor shapes joining forms; its bidi engine orders each text run. */
export function shapePdfText(doc: jsPDF, value: string): string {
  return containsUrduText(value) ? doc.processArabic(value) : value;
}
export function pdfTextOptions(value: string): TextOptionsLight {
  return containsUrduText(value) ? { isInputRtl: true, isOutputRtl: false, isInputVisual: false, isOutputVisual: true } : { isInputRtl: false, isOutputRtl: false };
}
