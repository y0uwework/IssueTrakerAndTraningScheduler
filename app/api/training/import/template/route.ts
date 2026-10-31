import ExcelJS from "exceljs";
import { handleError } from "@/lib/api";

// GET /api/training/import/template  -> sample old-training sheet (.xlsx) in the layout the import reads
export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Training Done", { views: [{ state: "frozen", ySplit: 1 }] });

    // Headers are matched by text on import (see lib/trainingImport.ts), so these must stay readable by it.
    sheet.columns = [
      { header: "User Name", key: "name", width: 24 },
      { header: "User Email", key: "email", width: 30 },
      { header: "Reporting Manager", key: "reportingTo", width: 22 },
      { header: "Designation", key: "designation", width: 20 },
      { header: "Official Mobile", key: "official", width: 15 },
      { header: "Personal Mobile", key: "personal", width: 15 },
      { header: "Location", key: "location", width: 24 },
      { header: "Training Date", key: "date", width: 14, style: { numFmt: "dd.mm.yyyy" } },
      { header: "Training Time", key: "time", width: 16 },
      { header: "Apps", key: "apps", width: 14 },
      { header: "Mode of Training", key: "mode", width: 16 },
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    header.height = 28;

    // Example rows: replace them with real data. Excel dates are read as written (no time-zone shift).
    const examples = [
      { name: "Example Person One", email: "person.one@example.com", reportingTo: "Manager Name", designation: "Executive", official: "9876543210", personal: "", location: "Noida, Uttar Pradesh", date: new Date(Date.UTC(2026, 6, 15)), time: "3:00 - 4:00", apps: "CRM, HRMS", mode: "Online" },
      { name: "Example Person Two", email: "person.two@example.com", reportingTo: "Manager Name", designation: "Senior Executive", official: "9876543211", personal: "9876543212", location: "Haridwar, Uttarakhand", date: new Date(Date.UTC(2026, 6, 15)), time: "11:00 - 11:45", apps: "HRMS", mode: "F2F" },
      { name: "Example Missing Data", email: "", reportingTo: "", designation: "", official: "", personal: "", location: "", date: null, time: "", apps: "CRM", mode: "" },
    ];
    for (const e of examples) sheet.addRow(e).font = { color: { argb: "FF64748B" }, italic: true };

    const lastRow = 500;
    const list = (key: string, values: string[]) => {
      const col = sheet.getColumn(key).number;
      for (let r = 2; r <= lastRow; r++) {
        sheet.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`], showErrorMessage: false };
      }
    };
    list("apps", ["CRM", "HRMS", "CRM, HRMS"]);
    list("mode", ["Online", "F2F"]);

    const help = workbook.addWorksheet("How to fill");
    help.getColumn(1).width = 110;
    [
      "How to fill the Training Done sheet",
      "",
      "• One row per person trained. Delete the grey example rows before importing.",
      "• User Name is required. Everything else may be left empty — missing data is saved as empty.",
      "• User Email is used to match people already in New Joiners (existing employees are not changed).",
      "• Training Date: a date cell, or text like 15.07.2026 / 15-07-2026 (day first). Empty = date not recorded.",
      "• Training Time: start - end, e.g. 3:00 - 4:00 or 14:30 - 15:15. Without AM/PM, 1:00–7:59 is read as afternoon.",
      "• Apps: CRM, HRMS or both (\"CRM, HRMS\"). Empty = only the employee is saved, no training record.",
      "• Mode of Training: Online or F2F (offline). Empty = F2F.",
      "• Rows with the same date, time and mode become one training session. You can review and fix every row before saving.",
    ].forEach((line, i) => {
      const row = help.addRow([line]);
      if (i === 0) row.font = { bold: true, size: 13 };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="training_done_sample.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "create the sample sheet");
  }
}
