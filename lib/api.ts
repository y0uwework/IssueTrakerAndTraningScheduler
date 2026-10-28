import "server-only";
import { NextResponse } from "next/server";
import type * as MSSQL from "mssql";
import { APPS, PRIORITIES, STATUSES, type App, type Priority, type Status } from "./types";
import { UploadError, type SavedImage } from "./uploads";

type Sql = typeof MSSQL;

export class ValidationError extends Error {}

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Converts thrown errors into JSON responses with sensible status codes. */
export function handleError(err: unknown, action: string) {
  if (err instanceof ValidationError || err instanceof UploadError) {
    return errorResponse(err.message, 400);
  }
  console.error(`Failed to ${action}:`, err);
  const code = (err as { code?: string })?.code;
  if (code === "ELOGIN" || code === "ESOCKET" || code === "ETIMEOUT" || code === "EINSTLOOKUP") {
    return errorResponse("Cannot connect to SQL Server. Check your .env.local settings and that SQL Server is running.", 503);
  }
  if (err instanceof Error && err.message.startsWith("Missing environment variable")) {
    return errorResponse(err.message, 500);
  }
  return errorResponse(`Failed to ${action}. See the server console for details.`, 500);
}

/** Parses a positive integer route ID; returns null when invalid. */
export function parseId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 && id <= 2147483647 ? id : null;
}

export interface IssueFields {
  title: string;
  app: App;
  description: string | null;
  category: string | null;
  priority: Priority;
  status: Status;
  raisedBy: string | null;
  assignedTo: string | null;
}

/** Reads a trimmed text field: undefined when not sent, null when empty. */
export function text(form: FormData, name: string, max: number, label: string): string | null | undefined {
  const value = form.get(name);
  if (value === null) return undefined; // field not sent
  if (typeof value !== "string") throw new ValidationError(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label} must be ${max} characters or fewer.`);
  return trimmed || null;
}

/**
 * Validates issue fields from a form. Fields that are not present keep the value from `existing`
 * (used when editing) or fall back to defaults (when creating).
 */
export function parseIssueFields(form: FormData, existing?: IssueFields): IssueFields {
  const title = text(form, "title", 200, "Title");
  const app = text(form, "app", 20, "App");
  const description = text(form, "description", 20000, "Description");
  const category = text(form, "category", 100, "Category");
  const raisedBy = text(form, "raisedBy", 100, "Raised By");
  const assignedTo = text(form, "assignedTo", 100, "Assigned To");
  const priority = text(form, "priority", 20, "Priority");
  const status = text(form, "status", 20, "Status");

  const fields: IssueFields = {
    title: title === undefined ? (existing?.title ?? "") : (title ?? ""),
    app: (app === undefined ? existing?.app : app) as App,
    description: description === undefined ? (existing?.description ?? null) : description,
    category: category === undefined ? (existing?.category ?? null) : category,
    raisedBy: raisedBy === undefined ? (existing?.raisedBy ?? null) : raisedBy,
    assignedTo: assignedTo === undefined ? (existing?.assignedTo ?? null) : assignedTo,
    priority: (priority ?? existing?.priority ?? "Medium") as Priority,
    status: (status ?? existing?.status ?? "Open") as Status,
  };

  if (!fields.title) throw new ValidationError("Title is required.");
  if (!APPS.includes(fields.app)) throw new ValidationError(`App is required and must be one of: ${APPS.join(", ")}.`);
  if (!PRIORITIES.includes(fields.priority)) throw new ValidationError(`Priority must be one of: ${PRIORITIES.join(", ")}.`);
  if (!STATUSES.includes(fields.status)) throw new ValidationError(`Status must be one of: ${STATUSES.join(", ")}.`);
  return fields;
}

/** A "contains" LIKE pattern with wildcards escaped so the search is literal. */
export function likePattern(search: string) {
  return `%${search.replace(/[[%_]/g, (c) => `[${c}]`)}%`;
}

/**
 * Builds the WHERE/ORDER BY for the issue list from URL filters
 * (search, app, status, priority, category, sort), adding parameters to `req`.
 * Issues are aliased as `i` in the query.
 */
export function buildIssueFilter(sql: Sql, req: MSSQL.Request, params: URLSearchParams) {
  const where: string[] = [];

  const search = params.get("search")?.trim().slice(0, 200);
  if (search) {
    req.input("Search", sql.NVarChar(210), likePattern(search));
    const idMatch = search.replace(/^#/, "");
    if (/^\d{1,9}$/.test(idMatch)) {
      req.input("SearchId", sql.Int, Number(idMatch));
      where.push("(i.Id = @SearchId OR i.Title LIKE @Search)");
    } else {
      where.push("i.Title LIKE @Search");
    }
  }

  const app = params.get("app");
  if (app && (APPS as readonly string[]).includes(app)) {
    req.input("App", sql.NVarChar(20), app);
    where.push("i.App = @App");
  }

  const status = params.get("status");
  if (status && (STATUSES as readonly string[]).includes(status)) {
    req.input("Status", sql.NVarChar(20), status);
    where.push("i.Status = @Status");
  }

  const priority = params.get("priority");
  if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
    req.input("Priority", sql.NVarChar(20), priority);
    where.push("i.Priority = @Priority");
  }

  const category = params.get("category")?.trim();
  if (category) {
    req.input("Category", sql.NVarChar(100), category.slice(0, 100));
    where.push("i.Category = @Category");
  }

  const order = params.get("sort") === "oldest" ? "ASC" : "DESC";
  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    orderSql: `ORDER BY i.RaisedAt ${order}, i.Id ${order}`,
  };
}

/** Adds the shared issue field parameters to a request. */
export function addIssueInputs(sql: Sql, request: MSSQL.Request, f: IssueFields) {
  return request
    .input("Title", sql.NVarChar(200), f.title)
    .input("App", sql.NVarChar(20), f.app)
    .input("Description", sql.NVarChar(sql.MAX), f.description)
    .input("Category", sql.NVarChar(100), f.category)
    .input("Priority", sql.NVarChar(20), f.priority)
    .input("Status", sql.NVarChar(20), f.status)
    .input("RaisedBy", sql.NVarChar(100), f.raisedBy)
    .input("AssignedTo", sql.NVarChar(100), f.assignedTo);
}

/** Inserts IssueImages rows for files that were already written to disk. */
export async function insertImageRows(sql: Sql, tx: MSSQL.Transaction, issueId: number, saved: SavedImage[]) {
  for (const img of saved) {
    await new sql.Request(tx)
      .input("IssueId", sql.Int, issueId)
      .input("ImagePath", sql.NVarChar(500), img.relativePath)
      .input("OriginalFileName", sql.NVarChar(255), img.originalName)
      .query("INSERT INTO dbo.IssueImages (IssueId, ImagePath, OriginalFileName) VALUES (@IssueId, @ImagePath, @OriginalFileName)");
  }
}
