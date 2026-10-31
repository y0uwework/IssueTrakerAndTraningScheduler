import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { handleError } from "@/lib/api";
import { EMPLOYEE_SELECT, buildEmployeeFilter, withTraining } from "@/lib/employees";
import { writeEmployeeWorkbook } from "@/lib/employeeExcel";
import type { EmployeeListItem } from "@/lib/types";

// GET /api/employees/export?<same filters as /api/employees>  -> .xlsx of the matching employees
// GET /api/employees/export?template=1                       -> empty sheet to fill in and import
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const template = params.get("template") === "1";

    let employees: EmployeeListItem[] | null = null;
    if (!template) {
      const { sql, pool } = await getDb();
      const req = pool.request();
      const { whereSql, orderSql } = buildEmployeeFilter(sql, req, params);
      employees = (await req.query(`${EMPLOYEE_SELECT} ${whereSql} ${orderSql}`)).recordset.map(withTraining) as unknown as EmployeeListItem[];
    }

    const buffer = await writeEmployeeWorkbook(employees);
    const name = template ? "new_joiners_template.xlsx" : `new_joiners_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "export employees");
  }
}
