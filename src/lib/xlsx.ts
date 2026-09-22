/**
 * A very small .xlsx writer - just enough for the financial report's
 * "download as a spreadsheet" button.
 *
 * **Why hand-rolled and not a library.** An .xlsx is a zip of XML parts, and
 * the only thing this app needs to put in one is a few sheets of text,
 * numbers and rupee amounts. SheetJS and ExcelJS are both several hundred KB
 * in the bundle, and the UI rules make adding a dependency something to ask
 * about; this is ~150 lines and ships nothing to a visitor who never opens
 * the report, because the only caller imports it lazily.
 *
 * **Why a real .xlsx and not CSV or the old SpreadsheetML.** A committee
 * treasurer opens this on a phone or in Excel. CSV loses the three sheets,
 * the column widths and the rupee formatting, and an XML file named .xls
 * makes Excel warn that the format and the extension disagree every single
 * time. A genuine .xlsx just opens.
 *
 * The zip is written **stored, not deflated** - no compression - so there is
 * no need for a deflate implementation. A ledger of a few hundred rows is a
 * handful of KB either way.
 */

export type XlsxStyle =
  | "title"
  | "heading"
  | "header"
  | "bold"
  | "money"
  | "moneyTotal"
  | "total"
  | "muted";

export type XlsxCell = string | number | null | { value: string | number | null; style?: XlsxStyle };

export type XlsxSheet = {
  name: string;
  /** Column widths, in Excel's "characters" unit. */
  columns?: number[];
  rows: XlsxCell[][];
};

/** Style name -> index into `cellXfs` below. 0 is the default cell. */
const styleIndex: Record<XlsxStyle, number> = {
  bold: 1,
  title: 2,
  heading: 3,
  header: 4,
  money: 5,
  moneyTotal: 6,
  total: 7,
  muted: 8,
};

/**
 * Excel refuses to open a workbook containing a raw control character, and a
 * note pasted out of another app can carry one. Tab, newline and carriage
 * return are legal in XML 1.0 and are what a multi-line note is made of, so
 * they stay.
 */
function stripControlChars(value: string) {
  let kept = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    kept += character;
  }
  return kept;
}

function escapeXml(value: string) {
  return stripControlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index: number) {
  let name = "";
  let remaining = index;
  while (remaining >= 0) {
    name = String.fromCharCode(65 + (remaining % 26)) + name;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return name;
}

function cellXml(cell: XlsxCell, ref: string) {
  const { value, style } = typeof cell === "object" && cell !== null ? cell : { value: cell, style: undefined };
  const s = style ? ` s="${styleIndex[style]}"` : "";
  if (value === null || value === "") return "";
  if (typeof value === "number") {
    // NaN/Infinity would produce a cell Excel refuses to open.
    const safe = Number.isFinite(value) ? value : 0;
    return `<c r="${ref}"${s}><v>${safe}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet) {
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row.map((cell, cellIndex) => cellXml(cell, `${columnName(cellIndex)}${rowIndex + 1}`)).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Fonts, the rupee number format, the header fill, and the cells that use them. */
const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1D5B5E"/><name val="Calibri"/></font>
<font><b/><sz val="13"/><color rgb="FF1D5B5E"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7EFEF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function workbookXml(sheets: XlsxSheet[]) {
  const entries = sheets
    .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${entries}</sheets></workbook>`;
}

function contentTypesXml(sheets: XlsxSheet[]) {
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
}

function workbookRelsXml(sheets: XlsxSheet[]) {
  const sheetRels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

/* ------------------------------ the zip ------------------------------ */

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date and time, which is what a zip entry stores. */
function dosDateTime(when: Date) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (Math.floor(when.getSeconds() / 2) & 0x1f);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  return { time: time & 0xffff, date: date & 0xffff };
}

type ZipEntry = { path: string; body: string };

function zip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = encoder.encode(entry.body);
    const crc = crc32(body);

    const local = new Uint8Array(30 + name.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 names
    localView.setUint16(8, 0, true); // stored
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, body.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, body.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return [...locals, ...centrals, end];
}

/** The workbook as bytes - separated from the download so it can be tested. */
export function buildXlsx(sheets: XlsxSheet[]) {
  const parts: ZipEntry[] = [
    { path: "[Content_Types].xml", body: contentTypesXml(sheets) },
    { path: "_rels/.rels", body: rootRelsXml },
    { path: "xl/workbook.xml", body: workbookXml(sheets) },
    { path: "xl/_rels/workbook.xml.rels", body: workbookRelsXml(sheets) },
    { path: "xl/styles.xml", body: stylesXml },
    ...sheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, body: sheetXml(sheet) })),
  ];
  return zip(parts);
}

export function xlsxBlob(sheets: XlsxSheet[]) {
  return new Blob(buildXlsx(sheets) as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Hands the browser the workbook as a download. */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const url = URL.createObjectURL(xlsxBlob(sheets));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the URL to outlive the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
