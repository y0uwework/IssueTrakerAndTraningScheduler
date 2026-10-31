"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PageInfo } from "@/lib/types";

type Props = PageInfo & {
  // Singular and plural label, e.g. ["issue", "issues"].
  noun: [string, string];
  onPageChange: (page: number) => void;
};

// Page numbers to show: always the first and last, the current one ±1, and "…" for gaps.
function pageList(page: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  // Show the page instead of a gap when only one page would be hidden.
  if (pages.has(3) && !pages.has(2) && last >= 3) pages.add(2);
  if (pages.has(last - 2) && !pages.has(last - 1)) pages.add(last - 1);
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["gap", p] as const) : [p]));
}

export default function Pagination({ page, pageSize, totalCount, noun, onPageChange }: Props) {
  if (totalCount === 0) return null;
  const last = Math.max(1, Math.ceil(totalCount / pageSize));
  const first = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {first}–{end} of {totalCount} {totalCount === 1 ? noun[0] : noun[1]}
      </span>
      {last > 1 && (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
          <button type="button" className={`${btn} text-slate-600 hover:bg-slate-100`} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          {pageList(page, last).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`${btn} ${p === page ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={`${btn} text-slate-600 hover:bg-slate-100`} onClick={() => onPageChange(page + 1)} disabled={page >= last} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
