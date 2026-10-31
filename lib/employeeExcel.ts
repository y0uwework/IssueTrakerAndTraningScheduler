import "server-only";
import ExcelJS from "exceljs";
import { EMPLOYEE_FIELDS, EMPLOYEE_STATUSES, SUGGESTED_SYSTEM_REQUIREMENTS, type EmployeeFieldKey, type EmployeeListItem } from "./types";

export const MAX_IMPORT_ROWS = 2000;
const DATE_FORMAT = "dd.mm.yyyy";

const normalize = (header: string) => header.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// Header text (normalized) -> column. Each field's own label plus common variations.
const HEADER_MAP = new Map<string, EmployeeFieldKey>();
for (const f of EMPLOYEE_FIELDS) HEADER_MAP.set(normalize(f.label), f.key);
const ALIASES: Record<string, EmployeeFieldKey> = {
  "CREATION DATE": "CreationDate",
  NAME: "DisplayName",
  "EMPLOYEE NAME": "DisplayName",
  "FULL NAME": "DisplayName",
  "EMPLOYEE LEVEL": "EmployeeLevel",
  EMAIL: "Email",
  "EMAIL ID": "Email",
  "USER EMAIL": "Email",
  "OFFICIAL EMAIL": "Email",
  DOJ: "DateOfJoining",
  "JOINING DATE": "DateOfJoining",
  LOCATION: "BaseLocation",
  "REPORTING MANAGER": "ReportingTo",
  "PERSONAL MOBILE": "MobilePersonal",
  "MOBILE NO PERSONAL": "MobilePersonal",
  "OFFICIAL MOBILE": "MobileOfficial",
  "MOBILE NO OFFICIAL": "MobileOfficial",
  ADDRESS: "CorrespondenceAddress",
};
for (const [header, key] of Object.entries(ALIASES)) HEADER_MAP.set(header, key);

/** Plain value of a cell: hyperlinks, rich text and formulas are reduced to their text/result. */
export function cellValue(value: ExcelJS.CellValue): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "number") return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("hyperlink" in value) return cellValue(value.text as ExcelJS.CellValue);
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("error" in value) return null;
  }
  return String(value);
}

export interface SheetRow {
  rowNumber: number;
  input: Record<string, unknown>;
}

/**
 * Reads employee rows from the first sheet that has a "Display Name" header (within its first 15 rows).
 * Columns are matched by header text, so their order doesn't matter and extra columns (S.No) are ignored.
 */
export async function readEmployeeSheet(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  for (const sheet of workbook.worksheets) {
    for (let headerRow = 1; headerRow <= Math.min(15, sheet.rowCount); headerRow++) {
      const columns = new Map<number, EmployeeFieldKey>();
      sheet.getRow(headerRow).eachCell((cell, col) => {
        const key = HEADER_MAP.get(normalize(String(cellValue(cell.value) ?? "")));
        if (key && ![...columns.values()].includes(key)) columns.set(col, key);
      });
      if (![...columns.values()].includes("DisplayName")) continue;

      const rows: SheetRow[] = [];
      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const input: Record<string, unknown> = {};
        let hasValue = false;
        for (const [col, key] of columns) {
          let value = cellValue(row.getCell(col).value);
          if (typeof value === "string") value = value.trim() || null;
          // Numbers in text columns (mobiles) are kept as digits; dates in date columns stay dates.
          if (typeof value === "number" && !key.includes("Date")) value = String(value);
          if (value !== null) hasValue = true;
          input[key] = value;
        }
        if (hasValue) rows.push({ rowNumber: r, input });
      }
      return rows;
    }
  }
  throw new Error('No sheet with a "Display Name" column header was found.');
}

const toExcelDate = (value: string | null) => (value ? new Date(value) : null);

/** Builds the new-joiner workbook: an empty template, or an export of `employees` with training status. */
export async function writeEmployeeWorkbook(employees: EmployeeListItem[] | null) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("New Joiners", { views: [{ state: "frozen", ySplit: 1 }] });

  const widths: Partial<Record<EmployeeFieldKey, number>> = { DisplayName: 22, Email: 30, CorrespondenceAddress: 36, BaseLocation: 20, Department: 20 };
  sheet.columns = [
    { header: "S.No", key: "SNo", width: 6 },
    ...EMPLOYEE_FIELDS.map((f) => ({
      header: f.label.toUpperCase(),
      key: f.key,
      width: widths[f.key] ?? 16,
      style: "type" in f && f.type === "date" ? { numFmt: DATE_FORMAT } : undefined,
    })),
    ...(employees ? [{ header: "HRMS TRAINING", key: "HrmsTraining", width: 14 }, { header: "CRM TRAINING", key: "CrmTraining", width: 14 }] : []),
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 32;

  (employees ?? []).forEach((e, i) => {
    const row = sheet.addRow({
      ...e,
      SNo: i + 1,
      CreationDate: toExcelDate(e.CreationDate),
      DateOfJoining: toExcelDate(e.DateOfJoining),
    });
    row.alignment = { vertical: "middle", wrapText: true };
    if (e.Email) row.getCell("Email").value = { text: e.Email, hyperlink: `mailto:${e.Email}` };
  });

  // Drop-down lists for the template (and any rows added to an export).
  // Set per cell; the writer merges identical cells into one range.
  const lastRow = Math.max(300, sheet.rowCount + 100);
  const list = (key: string, values: readonly string[], strict: boolean) => {
    const col = sheet.getColumn(key).number;
    for (let r = 2; r <= lastRow; r++) {
      sheet.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`], showErrorMessage: strict };
    }
  };
  list("Status", EMPLOYEE_STATUSES, true);
  list("SystemRequirement", SUGGESTED_SYSTEM_REQUIREMENTS, false);

  return workbook.xlsx.writeBuffer();
}
