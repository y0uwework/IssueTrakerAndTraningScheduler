import "server-only";
import { getDb } from "./db";
import { ValidationError } from "./api";
import { INSERT_EMPLOYEE_SQL, UPDATE_EMPLOYEE_SQL, addEmployeeInputs, parseEmployee, parseTrainingApps, saveTrainingApps, type EmployeeFields } from "./employees";
import type { App, EmployeeImportResult } from "./types";

export interface ImportRow {
  rowNumber: number; // shown back to the user in errors (sheet row, or review-table row)
  input: Record<string, unknown>;
}

/**
 * Validates and saves employee rows from an Excel sheet or an image extraction.
 * Rows are matched to existing employees by email (or by name + date of joining when there is no email):
 * matches are updated, others inserted. Invalid rows are skipped and reported.
 * With `dryRun`, nothing is written: the result only says what would happen to each row.
 */
export async function importEmployeeRows(rows: ImportRow[], { dryRun = false } = {}): Promise<EmployeeImportResult> {
  const result: EmployeeImportResult = { inserted: 0, updated: 0, errors: [], actions: [] };
  // apps: undefined when the sheet has no training-apps column (an update then keeps the saved apps).
  const valid: { rowNumber: number; fields: EmployeeFields; apps: App[] | undefined }[] = [];
  const seenEmails = new Map<string, number>();
  for (const { rowNumber, input } of rows) {
    try {
      const fields = parseEmployee(input);
      const apps = parseTrainingApps(input.TrainingApps);
      if (fields.Email) {
        const first = seenEmails.get(fields.Email);
        if (first) throw new ValidationError(`Email ${fields.Email} is also used on row ${first}.`);
        seenEmails.set(fields.Email, rowNumber);
      }
      valid.push({ rowNumber, fields, apps });
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      result.errors.push({ row: rowNumber, message: err.message });
    }
  }
  if (valid.length === 0) return result;

  const { sql, pool } = await getDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const { rowNumber, fields, apps } of valid) {
      const match = await new sql.Request(tx)
        .input("Email", sql.NVarChar(200), fields.Email)
        .input("DisplayName", sql.NVarChar(100), fields.DisplayName)
        .input("DateOfJoining", sql.Date, fields.DateOfJoining ? new Date(fields.DateOfJoining) : null)
        .query(`
          SELECT TOP 1 Id FROM dbo.Employees WITH (UPDLOCK)
          WHERE (@Email IS NOT NULL AND Email = @Email)
             OR (@Email IS NULL AND Email IS NULL AND DisplayName = @DisplayName
                 AND (DateOfJoining = @DateOfJoining OR (DateOfJoining IS NULL AND @DateOfJoining IS NULL)))
        `);
      const existingId = match.recordset[0]?.Id as number | undefined;
      if (existingId) {
        if (!dryRun) {
          await addEmployeeInputs(sql, new sql.Request(tx).input("Id", sql.Int, existingId), fields).query(UPDATE_EMPLOYEE_SQL);
          if (apps) await saveTrainingApps(sql, new sql.Request(tx), existingId, apps);
        }
        result.updated++;
        result.actions.push({ row: rowNumber, action: "update" });
      } else {
        if (!dryRun) {
          const inserted = await addEmployeeInputs(sql, new sql.Request(tx), fields).query(INSERT_EMPLOYEE_SQL);
          await saveTrainingApps(sql, new sql.Request(tx), inserted.recordset[0].Id as number, apps ?? []);
        }
        result.inserted++;
        result.actions.push({ row: rowNumber, action: "insert" });
      }
    }
    if (dryRun) await tx.rollback();
    else await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
  return result;
}
