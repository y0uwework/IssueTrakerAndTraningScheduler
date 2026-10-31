"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDot, FileSpreadsheet, Layers, Loader2, Plus, RefreshCw, Search, Timer, X } from "lucide-react";
import IssueTable from "@/components/IssueTable";
import IssueForm from "@/components/IssueForm";
import IssueDetails from "@/components/IssueDetails";
import ConfirmDialog from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import { downloadFile, readJson } from "@/lib/http";
import { APPS, PRIORITIES, STATUSES, type IssueListItem, type IssueListResponse, type IssueWithImages } from "@/lib/types";

type Filters = { search: string; app: string; status: string; priority: string; category: string; sort: "newest" | "oldest" };
const EMPTY_FILTERS: Filters = { search: "", app: "", status: "", priority: "", category: "", sort: "newest" };

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<IssueListResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [formIssue, setFormIssue] = useState<IssueWithImages | null | undefined>(undefined); // undefined = closed, null = new
  const [viewIssue, setViewIssue] = useState<IssueWithImages | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssueListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filters.app) params.set("app", filters.app);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.category) params.set("category", filters.category);
  params.set("sort", filters.sort);
  // The page resets to 1 whenever the filters (or view) change.
  const filterKey = `${params}`;
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });
  // The request key changes whenever the filters or page change, or a reload is requested.
  const requestKey = `${filterKey}&page=${page}#${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/issues?${requestKey.split("#")[0]}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => readJson<IssueListResponse>(res))
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

  const loadIssue = useCallback(async (id: number) => {
    setOpeningId(id);
    try {
      return await readJson<IssueWithImages>(await fetch(`/api/issues/${id}`, { cache: "no-store" }));
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setOpeningId(null);
    }
  }, []);

  async function handleView(id: number) {
    const issue = await loadIssue(id);
    if (issue) setViewIssue(issue);
  }

  async function handleEdit(id: number) {
    const issue = await loadIssue(id);
    if (issue) {
      setViewIssue(null);
      setFormIssue(issue);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await readJson(await fetch(`/api/issues/${deleteTarget.Id}`, { method: "DELETE" }));
      setToast(`Issue #${deleteTarget.Id} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  // Downloads the issues matching the current filters as .xlsx (screenshots embedded in the last column).
  async function handleExport() {
    setExporting(true);
    try {
      await downloadFile(`/api/issues/export?${params}`, "issues.xlsx");
      setToast("Excel sheet downloaded.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Boolean(filters.search || filters.app || filters.status || filters.priority || filters.category || filters.sort !== "newest");
  const stats = data?.stats;

  const cards = [
    { label: "Total Issues", value: stats?.total, icon: Layers, color: "text-slate-600 bg-slate-100" },
    { label: "Open Issues", value: stats?.open, icon: CircleDot, color: "text-amber-600 bg-amber-50" },
    { label: "In Progress", value: stats?.inProgress, icon: Timer, color: "text-blue-600 bg-blue-50" },
    { label: "Resolved Issues", value: stats?.resolved, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  ];

  return (
    <main className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Issue Tracker</h1>
          <p className="text-sm text-slate-500">Track, manage, and resolve reported issues.</p>
        </div>
        <button type="button" className="btn-primary self-start sm:self-auto" onClick={() => setFormIssue(null)}>
          <Plus size={16} /> New Issue
        </button>
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
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="field pl-9"
              placeholder="Search by ID or title..."
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              aria-label="Search issues"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex">
            <select className="field lg:w-32" value={filters.app} onChange={(e) => setFilter("app", e.target.value)} aria-label="Filter by app">
              <option value="">All apps</option>
              {APPS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select className="field lg:w-36" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="field lg:w-36" value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)} aria-label="Filter by priority">
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select className="field lg:w-40" value={filters.category} onChange={(e) => setFilter("category", e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {data?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="field lg:w-36" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])} aria-label="Sort order">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          {hasFilters && (
            <button type="button" className="btn-secondary whitespace-nowrap" onClick={() => setFilters(EMPTY_FILTERS)}>
              <X size={15} /> Clear
            </button>
          )}
          <button
            type="button"
            className="btn-secondary whitespace-nowrap"
            onClick={handleExport}
            disabled={exporting || !data || data.issues.length === 0}
            title="Download the issues shown below as an Excel sheet"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-green-700" />}
            Export Excel
          </button>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Loading issues...
          </div>
        ) : data ? (
          <div className={loading || openingId !== null ? "opacity-60 transition-opacity" : ""}>
            <IssueTable
              issues={data.issues}
              hasFilters={hasFilters}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
              onCreate={() => setFormIssue(null)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-slate-500">Issues could not be loaded.</div>
        )}

        {data && (
          <Pagination page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} noun={["issue", "issues"]} onPageChange={setPage} />
        )}
      </section>

      {formIssue !== undefined && (
        <IssueForm
          issue={formIssue}
          categories={data?.categories ?? []}
          onClose={() => setFormIssue(undefined)}
          onSaved={(message) => {
            setFormIssue(undefined);
            setToast(message);
            reload();
          }}
        />
      )}

      {viewIssue && <IssueDetails issue={viewIssue} onClose={() => setViewIssue(null)} onEdit={() => handleEdit(viewIssue.Id)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete issue?"
          message={
            <>
              Issue <span className="font-medium text-slate-800">#{deleteTarget.Id} &ldquo;{deleteTarget.Title}&rdquo;</span>
              {deleteTarget.ImageCount > 0 && ` and its ${deleteTarget.ImageCount} screenshot${deleteTarget.ImageCount === 1 ? "" : "s"}`} will be permanently deleted.
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
