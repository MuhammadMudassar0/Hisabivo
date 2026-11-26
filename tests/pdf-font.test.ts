import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { containsUrduText, embedFont, pdfTextOptions, shapePdfText, PDF_FONT_FAMILY } from "../lib/pdf-font";

test("static report fonts cover Urdu joining glyphs and Latin currency labels", () => {
  const regular = readFileSync(new URL("../public/fonts/NotoNaskhArabic-Regular.ttf", import.meta.url)).toString("base64");
  const bold = readFileSync(new URL("../public/fonts/NotoNaskhArabic-Bold.ttf", import.meta.url)).toString("base64");
  const doc = new jsPDF(); embedFont(doc, regular, bold);
  for (const style of ["normal", "bold"]) {
    doc.setFont(PDF_FONT_FAMILY, style);
    const metadata = doc.getFont().metadata as { characterToGlyph: (code: number) => number; directory: { tables: Record<string, unknown> } };
    for (const character of "Hisabivo Rs 123 آمدنی خرچ پڑیں ٹیکس") if (character !== " ") assert.ok(metadata.characterToGlyph(character.charCodeAt(0)) > 0, `Missing ${character} in ${style}`);
    assert.ok(!("fvar" in metadata.directory.tables), "The embedded font must be a static TTF");
  }
  const text = "آمدنی اور خرچ";
  assert.notEqual(shapePdfText(doc, text), text);
  doc.text(shapePdfText(doc, text), 190, 20, { ...pdfTextOptions(text), align: "right" });
  doc.text("Rs 1,500.00", 16, 32, pdfTextOptions("Rs 1,500.00"));
  assert.ok(doc.output("arraybuffer").byteLength > 10000);
  assert.equal(containsUrduText("آمدنی"), true);
  assert.equal(containsUrduText("Rs 1,500"), false);
});
