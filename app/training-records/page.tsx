"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle2, FileSpreadsheet, GraduationCap, Hourglass, Layers, Loader2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import TrainingForm from "@/components/training/TrainingForm";
import TrainingImport from "@/components/training/TrainingImport";
import TrainingDetails from "@/components/training/TrainingDetails";
import { EmptyTraining, PendingTable, RecordsTable, SessionsTable } from "@/components/training/TrainingTables";
import ConfirmDialog from "@/components/ConfirmDialog";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { downloadFile, readJson } from "@/lib/http";
import { APPS, TRAINERS, TRAINING_STATUSES, type TrainingListResponse, type TrainingSessionDetail, type TrainingSessionListItem } from "@/lib/types";

type View = "sessions" | "records" | "pending";
// `state` applies to the pending view only; status, trainer and the dates to sessions/records only.
type Filters = { search: string; app: string; status: string; trainer: string; from: string; to: string; state: string; sort: "newest" | "oldest" };
const EMPTY_FILTERS: Filters = { search: "", app: "", status: "", trainer: "", from: "", to: "", state: "", sort: "newest" };

// <input type="date"> gives a local calendar day; the API filters on UTC instants.
function dayStart(day: string, addDays = 0) {
  const d = new Date(`${day}T00:00`);
  d.setDate(d.getDate() + addDays);
  return d.toISOString();
}

export default function TrainingRecords() {
  const [view, setView] = useState<View>("sessions");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<TrainingListResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [formSession, setFormSession] = useState<TrainingSessionDetail | null | undefined>(undefined); // undefined = closed, null = new
  const [viewSession, setViewSession] = useState<TrainingSessionDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingSessionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const pendingView = view === "pending";
  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filters.app) params.set("app", filters.app);
  if (pendingView) {
    if (filters.state) params.set("state", filters.state);
  } else {
    if (filters.status) params.set("status", filters.status);
    if (filters.trainer) params.set("trainer", filters.trainer);
    if (filters.from) params.set("from", dayStart(filters.from));
    if (filters.to) params.set("to", dayStart(filters.to, 1));
  }
  params.set("sort", filters.sort);
  // The page resets to 1 whenever the filters (or view) change.
  const filterKey = `view=${view}&${params}`;
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });
  // The request key changes whenever the filters or page change, or a reload is requested.
  const requestKey = `${filterKey}&page=${page}#${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/training?${requestKey.split("#")[0]}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => readJson<TrainingListResponse>(res))
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

  const loadSession = useCallback(async (id: number) => {
    setOpeningId(id);
    try {
      return await readJson<TrainingSessionDetail>(await fetch(`/api/training/${id}`, { cache: "no-store" }));
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setOpeningId(null);
    }
  }, []);

  async function handleView(id: number) {
    const session = await loadSession(id);
    if (session) setViewSession(session);
  }

  // Links from an employee's training history open a session directly: /training-records?session=12
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("session"));
    if (!Number.isInteger(id) || id <= 0) return;
    fetch(`/api/training/${id}`, { cache: "no-store" })
      .then((res) => readJson<TrainingSessionDetail>(res))
      .then((session) => {
        setViewSession(session);
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function handleEdit(id: number) {
    const session = await loadSession(id);
    if (session) {
      setViewSession(null);
      setFormSession(session);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJson(await fetch(`/api/training/${deleteTarget.Id}`, { method: "DELETE" }));
      setToast(`Training session #${deleteTarget.Id} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(`/api/training/export?${params}`, "training_records.xlsx");
      setToast("Excel sheet downloaded.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Boolean(
    filters.search ||
      filters.app ||
      filters.sort !== "newest" ||
      (pendingView ? filters.state : filters.status || filters.trainer || filters.from || filters.to),
  );
  const stats = data?.stats;
  // Results from the previous view are kept while the new view loads.
  const rows = view === "sessions" ? data?.sessions : view === "records" ? data?.records : data?.pending;

  const cards = [
    { label: "Total Sessions", value: stats?.total, icon: Layers, color: "text-slate-600 bg-slate-100" },
    { label: "Upcoming", value: stats?.upcoming, icon: CalendarClock, color: "text-blue-600 bg-blue-50" },
    { label: "Completed", value: stats?.completed, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "Employees Trained", value: stats?.employeesTrained, icon: GraduationCap, color: "text-indigo-600 bg-indigo-50" },
    { label: "Pending Training", value: stats?.pendingTraining, icon: Hourglass, color: "text-amber-600 bg-amber-50", view: "pending" as View },
  ];

  const tabs: { id: View; label: string; icon: typeof Layers; count?: number }[] = [
    { id: "sessions", label: "Sessions", icon: CalendarClock },
    { id: "records", label: "Employee Records", icon: Users },
    { id: "pending", label: "Pending Training", icon: Hourglass, count: stats?.pendingTraining },
  ];

  return (
    <main className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader href="/training-records">
        <div className="flex gap-2 self-start sm:self-auto">
          {/* <button type="button" className="btn-secondary" onClick={() => setImporting(true)} title="Import the training sheet kept before this app">
            <Upload size={16} /> Import Old Sheet
          </button> */}
          <button type="button" className="btn-primary" onClick={() => setFormSession(null)}>
            <Plus size={16} /> New Session
          </button>
        </div>
      </PageHeader>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, color, view: target }) => {
          const content = (
            <>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${color}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500">{label}</p>
                <p className="text-xl font-semibold text-slate-900">{value ?? "–"}</p>
              </div>
            </>
          );
          const box = "flex items-center gap-3 rounded-lg border border-slate-200 bg-surface p-4 shadow-xs";
          // The pending card opens the Pending Training tab.
          return target ? (
            <button key={label} type="button" onClick={() => setView(target)} className={`${box} text-left hover:border-amber-300`} title="Show pending training">
              {content}
            </button>
          ) : (
            <div key={label} className={box}>
              {content}
            </div>
          );
        })}
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
        <div className="flex gap-1 border-b border-slate-200 px-3 pt-2" role="tablist">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                view === id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={15} /> {label}
              {count ? <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">{count}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-200 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                className="field pl-9"
                placeholder={pendingView ? "Search by employee, email, department or reporting manager..." : "Search by session, employee, email, department or trainer..."}
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                aria-label="Search training records"
              />
            </div>
            <div className="flex gap-2">
              {hasFilters && (
                <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setFilters(EMPTY_FILTERS)}>
                  <X size={15} /> Clear
                </button>
              )}
              {!pendingView && (
                <button
                  type="button"
                  className="btn-secondary whitespace-nowrap"
                  onClick={handleExport}
                  disabled={exporting || !rows || rows.length === 0}
                  title="Download the training records matching these filters as an Excel sheet"
                >
                  {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-green-700" />}
                  Export Excel
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <select className="field" value={filters.app} onChange={(e) => setFilter("app", e.target.value)} aria-label="Filter by app">
              <option value="">All apps</option>
              {APPS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            {pendingView ? (
              <select className="field" value={filters.state} onChange={(e) => setFilter("state", e.target.value)} aria-label="Filter by scheduling">
                <option value="">Scheduled or not</option>
                <option value="unscheduled">Not scheduled yet</option>
                <option value="scheduled">In a scheduled session</option>
              </select>
            ) : (
              <>
                <select className="field" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {TRAINING_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select className="field" value={filters.trainer} onChange={(e) => setFilter("trainer", e.target.value)} aria-label="Filter by trainer">
                  <option value="">All trainers</option>
                  {TRAINERS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input type="date" className="field" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter("from", e.target.value)} aria-label="From date" title="From date" />
                <input type="date" className="field" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter("to", e.target.value)} aria-label="To date" title="To date" />
              </>
            )}
            <select className="field" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])} aria-label="Sort order">
              <option value="newest">{pendingView ? "Joined most recently" : "Newest first"}</option>
              <option value="oldest">{pendingView ? "Joined longest ago" : "Oldest first"}</option>
            </select>
          </div>
        </div>

        {loading && !rows ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading training records...
          </div>
        ) : rows ? (
          <div className={loading || openingId !== null ? "opacity-60 transition-opacity" : ""}>
            {rows.length === 0 && pendingView && !hasFilters ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                  <CheckCircle2 size={22} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">No pending training</h3>
                <p className="mt-1 text-sm text-slate-500">Every new joiner has been trained on the apps chosen for them.</p>
              </div>
            ) : rows.length === 0 ? (
              <EmptyTraining hasFilters={hasFilters} onCreate={() => setFormSession(null)} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
            ) : view === "pending" ? (
              <PendingTable rows={data!.pending!} onView={handleView} />
            ) : view === "sessions" ? (
              <SessionsTable sessions={data!.sessions!} onView={handleView} onEdit={handleEdit} onDelete={setDeleteTarget} />
            ) : (
              <RecordsTable
                records={data!.records!}
                onView={handleView}
                onTrainerSaved={(attendeeId, trainers) => {
                  // Update the row in place; the list isn't reloaded so the page and edit mode stay put.
                  setData((d) => (d?.records ? { ...d, records: d.records.map((r) => (r.AttendeeId === attendeeId ? { ...r, Trainers: trainers } : r)) } : d));
                  setToast(`Trainer set to ${trainers}.`);
                }}
              />
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-slate-500">Training records could not be loaded.</div>
        )}

        {rows && data && (
          <Pagination page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} noun={view === "sessions" ? ["session", "sessions"] : view === "records" ? ["training record", "training records"] : ["pending training", "pending trainings"]} onPageChange={setPage} />
        )}
      </section>

      {formSession !== undefined && (
        <TrainingForm
          session={formSession}
          onClose={() => setFormSession(undefined)}
          onSaved={(message) => {
            setFormSession(undefined);
            setToast(message);
            reload();
          }}
        />
      )}

      {importing && (
        <TrainingImport
          onClose={() => setImporting(false)}
          onImported={(message) => {
            setToast(message);
            reload();
          }}
        />
      )}

      {viewSession && <TrainingDetails session={viewSession} onClose={() => setViewSession(null)} onEdit={() => handleEdit(viewSession.Id)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete training session?"
          message={
            <>
              Session <span className="font-medium text-slate-800">#{deleteTarget.Id} &ldquo;{deleteTarget.Title}&rdquo;</span>, its {deleteTarget.AttendeeCount} training record
              {deleteTarget.AttendeeCount === 1 ? "" : "s"}
              {deleteTarget.ImageCount > 0 && ` and ${deleteTarget.ImageCount} screenshot${deleteTarget.ImageCount === 1 ? "" : "s"}`} will be permanently deleted. The employees
              themselves stay in New Joiners.
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
