/**
 * CSV, written the way a spreadsheet will actually read it.
 *
 * Two things matter beyond commas and quotes:
 *
 *  - **Formula injection.** A name or a payment reference is typed by a
 *    resident, and a cell beginning `=`, `+`, `-` or `@` is run as a formula
 *    when the file is opened in Excel or Sheets. `=HYPERLINK(...)` in a "name"
 *    would then be live on the treasurer's machine. Text cells that start that
 *    way get a leading apostrophe, which makes them text. Numbers are passed as
 *    numbers and never touched.
 *  - **Encoding.** A byte-order mark up front, because Excel otherwise opens a
 *    UTF-8 file as Windows-1252 and turns every Devanagari name into noise.
 *
 * Pure and import-free, so it is checked on its own (tests/registrations.test.mjs).
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
