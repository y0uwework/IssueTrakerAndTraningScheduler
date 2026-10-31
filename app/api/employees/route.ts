import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, paging, readPageInfo } from "@/lib/api";
import { EMPLOYEE_SELECT, INSERT_EMPLOYEE_SQL, addEmployeeInputs, buildEmployeeFilter, isDuplicateKey, parseEmployee, trainingColumn, withTraining } from "@/lib/employees";
import { APPS, type App } from "@/lib/types";
import type { EmployeeListResponse } from "@/lib/types";

const OPTION_COLUMNS = ["Unit", "Department", "Designation", "EmployeeLevel", "ReportingTo", "SystemRequirement", "BaseLocation"] as const;

// GET /api/employees?search=&unit=&department=&status=&training=&from=&to=&sort=newest|oldest|name&page=1
export async function GET(request: NextRequest) {
  try {
    const { sql, pool } = await getDb();
    const req = pool.request();
    const params = request.nextUrl.searchParams;
    const { whereSql, orderSql } = buildEmployeeFilter(sql, req, params);
    // The training filters use the OUTER APPLY in EMPLOYEE_SELECT, so count over the full select.
    const { prelude, pageSql, pageInfoSql } = paging(sql, req, params, `SELECT COUNT(*) FROM (${EMPLOYEE_SELECT} ${whereSql}) f`);

    const result = await req.query(`
      ${prelude}

      ${EMPLOYEE_SELECT}
      ${whereSql}
      ${orderSql}
      ${pageSql};

      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN x.Status = N'Active' THEN 1 ELSE 0 END), 0) AS active,
             ${APPS.map((_, i) => `COALESCE(SUM(CASE WHEN x.${trainingColumn(i)} = N'Trained' THEN 1 ELSE 0 END), 0) AS trained_${i}`).join(", ")}
      FROM (${EMPLOYEE_SELECT}) x;

      -- Distinct values for filters and form suggestions.
      ${OPTION_COLUMNS.map((c) => `SELECT N'${c}' AS Field, ${c} AS Value FROM dbo.Employees WHERE ${c} IS NOT NULL`).join("\nUNION\n")}
      ORDER BY Field, Value;

      ${pageInfoSql}
    `);

    const [employees, stats, optionRows, pageInfo] = result.recordsets as Record<string, unknown>[][];
    const options = Object.fromEntries(OPTION_COLUMNS.map((c) => [c, [] as string[]])) as EmployeeListResponse["options"];
    for (const row of optionRows) options[row.Field as keyof typeof options].push(row.Value as string);

    const body: EmployeeListResponse = {
      ...readPageInfo(pageInfo[0]),
      employees: employees.map(withTraining) as unknown as EmployeeListResponse["employees"],
      stats: {
        total: stats[0].total as number,
        active: stats[0].active as number,
        trained: Object.fromEntries(APPS.map((app, i) => [app, stats[0][`trained_${i}`] as number])) as Record<App, number>,
      },
      options,
    };
    return NextResponse.json(body);
  } catch (err) {
    return handleError(err, "load employees");
  }
}

// POST /api/employees  (JSON: employee columns)
export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object") return errorResponse("Request body must be JSON.", 400);
    const fields = parseEmployee(input);

    const { sql, pool } = await getDb();
    const inserted = await addEmployeeInputs(sql, pool.request(), fields).query(INSERT_EMPLOYEE_SQL);
    return NextResponse.json({ id: inserted.recordset[0].Id }, { status: 201 });
  } catch (err) {
    if (isDuplicateKey(err)) return errorResponse("Another employee already has this email address.", 409);
    return handleError(err, "create employee");
  }
}
