/** Parse PKR input without losing paisa or guessing ambiguous decimal separators. */
export function parsePkrAmount(value: string, { allowZero = false, allowEmpty = false } = {}) {
  const text = value
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)))
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, ",")
    .trim();
  if (!text) {
    if (allowEmpty) return 0;
    throw new Error("Enter an amount.");
  }

  // Both 1,326,500 and 13,26,500 are valid grouping styles in Pakistan.
  // A comma is never interpreted as a decimal separator (1,32 is rejected).
  const plain = /^\d+(?:\.\d{1,2})?$/.test(text);
  const international = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text);
  const southAsian = /^\d{1,2}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(text);
  const normalized = text.replace(/,/g, "");
  if (!(plain || international || southAsian) || !/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter an amount such as 1326500 or 1,326,500, with up to 2 decimal places (maximum Rs 999,999,999.99).");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!allowZero && paisa === 0) throw new Error("Amount must be greater than zero.");
  return paisa;
}
