"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, FileSpreadsheet, GraduationCap, Loader2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, UserCheck, Users, X } from "lucide-react";
import EmployeeForm from "@/components/employees/EmployeeForm";
import EmployeeDetails from "@/components/employees/EmployeeDetails";
import EmployeeImport from "@/components/employees/EmployeeImport";
import EmployeeImageImport from "@/components/employees/EmployeeImageImport";
import ConfirmDialog from "@/components/ConfirmDialog";
import { AppTrainingBadge } from "@/components/StatusBadge";
import { downloadFile, readJson } from "@/lib/http";
import { APPS, EMPLOYEE_STATUSES, formatDate, type EmployeeDetail, type EmployeeListItem, type EmployeeListResponse } from "@/lib/types";

type Filters = { search: string; unit: string; department: string; status: string; training: string; from: string; to: string; sort: "newest" | "oldest" | "name" };
const EMPTY_FILTERS: Filters = { search: "", unit: "", department: "", status: "", training: "", from: "", to: "", sort: "newest" };

const TRAINING_FILTERS = [
  { value: "any-pending", label: "Training pending" },
  { value: "hrms-pending", label: "HRMS not trained" },
  { value: "crm-pending", label: "CRM not trained" },
  { value: "fully-trained", label: "Fully trained" },
];

const dash = <span className="text-slate-300">—</span>;
const th = "px-4 py-2.5 font-medium";

export default function NewJoiners() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<EmployeeListResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [formEmployee, setFormEmployee] = useState<EmployeeDetail | null | undefined>(undefined); // undefined = closed, null = new
  const [viewEmployee, setViewEmployee] = useState<EmployeeDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingImage, setImportingImage] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filters.unit) params.set("unit", filters.unit);
  if (filters.department) params.set("department", filters.department);
  if (filters.status) params.set("status", filters.status);
  if (filters.training) params.set("training", filters.training);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("sort", filters.sort);
  // The request key changes whenever filters change or a reload is requested.
  const requestKey = `${params}#${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/employees?${requestKey.split("#")[0]}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => readJson<EmployeeListResponse>(res))
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [requestKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = () => setReloadKey((k) => k + 1);

  const loadEmployee = useCallback(async (id: number) => {
    setOpeningId(id);
    try {
      return await readJson<EmployeeDetail>(await fetch(`/api/employees/${id}`, { cache: "no-store" }));
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setOpeningId(null);
    }
  }, []);

  async function handleView(id: number) {
    const employee = await loadEmployee(id);
    if (employee) setViewEmployee(employee);
  }

  async function handleEdit(id: number) {
    const employee = await loadEmployee(id);
    if (employee) {
      setViewEmployee(null);
      setFormEmployee(employee);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJson(await fetch(`/api/employees/${deleteTarget.Id}`, { method: "DELETE" }));
      setToast(`${deleteTarget.DisplayName} deleted.`);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleteTarget(null);
      setDeleting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(`/api/employees/export?${params}`, "new_joiners.xlsx");
      setToast("Excel sheet downloaded.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Object.entries(filters).some(([k, v]) => v !== EMPTY_FILTERS[k as keyof Filters]);
  const stats = data?.stats;

  const cards = [
    { label: "New Joiners", value: stats?.total, icon: Users, color: "text-slate-600 bg-slate-100" },
    { label: "Active", value: stats?.active, icon: UserCheck, color: "text-blue-600 bg-blue-50" },
    { label: "HRMS Trained", value: stats?.hrmsTrained, icon: GraduationCap, color: "text-violet-600 bg-violet-50" },
    { label: "CRM Trained", value: stats?.crmTrained, icon: GraduationCap, color: "text-teal-600 bg-teal-50" },
  ];

  return (
    <main className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">New Joiners</h1>
          <p className="text-sm text-slate-500">Employee details from the HR joining sheet, with their HRMS and CRM training status.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button type="button" className="btn-secondary" onClick={() => setImportingImage(true)} title="Read new joiners from a screenshot or photo of the sheet using AI">
            <Sparkles size={16} className="text-violet-600" /> Import from Image
          </button>
          <button type="button" className="btn-secondary" onClick={() => setImporting(true)}>
            <Upload size={16} /> Import Excel
          </button>
          <button type="button" className="btn-primary" onClick={() => setFormEmployee(null)}>
            <Plus size={16} /> Add New Joiner
          </button>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-surface p-4 shadow-xs">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${color}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-500">{label}</p>
              <p className="text-xl font-semibold text-slate-900">{value ?? "–"}</p>
            </div>
          </div>
        ))}
      </section>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={reload} className="inline-flex items-center gap-1 font-medium hover:underline">
            <RefreshCw size={14} /> Retry
          </button>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss" className="hover:text-red-900">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="mt-4 rounded-lg border border-slate-200 bg-surface shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="field pl-9"
                placeholder="Search by name, email, designation, department, reporting to or mobile..."
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                aria-label="Search new joiners"
              />
            </div>
            <div className="flex gap-2">
              {hasFilters && (
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <X size={15} /> Clear
                </button>
              )}
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                onClick={handleExport}
                disabled={exporting || !data || data.employees.length === 0}
                title="Download the employees shown below as an Excel sheet"
              >
                {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-green-700" />}
                Export Excel
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <select className="field" value={filters.unit} onChange={(e) => setFilter("unit", e.target.value)} aria-label="Filter by unit">
              <option value="">All units</option>
              {data?.options.Unit.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <select className="field" value={filters.department} onChange={(e) => setFilter("department", e.target.value)} aria-label="Filter by department">
              <option value="">All departments</option>
              {data?.options.Department.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select className="field" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {EMPLOYEE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="field" value={filters.training} onChange={(e) => setFilter("training", e.target.value)} aria-label="Filter by training">
              <option value="">Any training status</option>
              {TRAINING_FILTERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input type="date" className="field" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter("from", e.target.value)} aria-label="Joined from" title="Joined from" />
            <input type="date" className="field" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} aria-label="Joined until" title="Joined until" />
            <select className="field" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])} aria-label="Sort order">
              <option value="newest">Latest joiners first</option>
              <option value="oldest">Earliest joiners first</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading new joiners...
          </div>
        ) : data ? (
          <div className={loading || openingId !== null ? "opacity-60 transition-opacity" : ""}>
            {data.employees.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Users size={22} />
                </div>
                {hasFilters ? (
                  <>
                    <h3 className="mt-3 text-sm font-semibold text-slate-800">No matching employees</h3>
                    <button type="button" className="btn-secondary mt-4" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="mt-3 text-sm font-semibold text-slate-800">No new joiners yet</h3>
                    <p className="mt-1 text-sm text-slate-500">Import the HR joining sheet or add employees one by one.</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" className="btn-secondary" onClick={() => setImporting(true)}>
                        <Upload size={16} /> Import Excel
                      </button>
                      <button type="button" className="btn-primary" onClick={() => setFormEmployee(null)}>
                        <Plus size={16} /> Add New Joiner
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-275 text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th className={th}>Employee</th>
                      <th className={th}>Unit / Level</th>
                      <th className={th}>Designation / Department</th>
                      <th className={th}>Joined</th>
                      <th className={th}>Base Location</th>
                      <th className={th}>Reporting To</th>
                      <th className={th}>Training</th>
                      <th className={th}>Status</th>
                      <th className={`${th} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.employees.map((e) => (
                      <tr key={e.Id} className="hover:bg-slate-50">
                        <td className="max-w-[16rem] px-4 py-3">
                          <button type="button" onClick={() => handleView(e.Id)} className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-blue-600" title={e.DisplayName}>
                            {e.DisplayName}
                          </button>
                          {e.Email && <p className="truncate text-xs text-slate-500">{e.Email}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>{e.Unit || dash}</p>
                          {e.EmployeeLevel && <p className="text-xs text-slate-500">{e.EmployeeLevel}</p>}
                        </td>
                        <td className="max-w-56 px-4 py-3 text-slate-600">
                          <p className="truncate">{e.Designation || dash}</p>
                          {e.Department && <p className="truncate text-xs text-slate-500">{e.Department}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(e.DateOfJoining)}</td>
                        <td className="max-w-40 truncate px-4 py-3 text-slate-600" title={e.BaseLocation ?? undefined}>
                          {e.BaseLocation || dash}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.ReportingTo || dash}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            {APPS.map((app) => (
                              <AppTrainingBadge key={app} app={app} state={app === "HRMS" ? e.HrmsTraining : e.CrmTraining} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              e.Status === "Active" ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
                            }`}
                          >
                            {e.Status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-0.5">
                            <button type="button" className="icon-btn" onClick={() => handleView(e.Id)} aria-label={`View ${e.DisplayName}`} title="View">
                              <Eye size={16} />
                            </button>
                            <button type="button" className="icon-btn" onClick={() => handleEdit(e.Id)} aria-label={`Edit ${e.DisplayName}`} title="Edit">
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="icon-btn hover:bg-red-50 hover:text-red-600" onClick={() => setDeleteTarget(e)} aria-label={`Delete ${e.DisplayName}`} title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-slate-500">New joiners could not be loaded.</div>
        )}

        {data && data.employees.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
            Showing {data.employees.length} of {data.stats.total} employee{data.stats.total === 1 ? "" : "s"}
          </div>
        )}
      </section>

      {formEmployee !== undefined && (
        <EmployeeForm
          employee={formEmployee}
          options={data?.options}
          onClose={() => setFormEmployee(undefined)}
          onSaved={(message) => {
            setFormEmployee(undefined);
            setToast(message);
            reload();
          }}
        />
      )}

      {viewEmployee && (
        <EmployeeDetails
          employee={viewEmployee}
          onClose={() => setViewEmployee(null)}
          onEdit={() => handleEdit(viewEmployee.Id)}
          onOpenSession={(sessionId) => router.push(`/training-records?session=${sessionId}`)}
        />
      )}

      {importing && <EmployeeImport onClose={() => setImporting(false)} onImported={reload} />}
      {importingImage && <EmployeeImageImport onClose={() => setImportingImage(false)} onImported={reload} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete employee?"
          message={
            <>
              <span className="font-medium text-slate-800">{deleteTarget.DisplayName}</span> will be permanently deleted. Employees who are already in training sessions can&apos;t be
              deleted; set them to Inactive instead.
            </>
          }
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg">
          <CheckCircle2 size={16} className="text-green-400" /> {toast}
        </div>
      )}
    </main>
  );
}
