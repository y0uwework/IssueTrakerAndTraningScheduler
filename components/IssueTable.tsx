"use client";

import { Eye, Image as ImageIcon, Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import StatusBadge, { AppBadge, PriorityBadge } from "./StatusBadge";
import { formatDateTime, type IssueListItem } from "@/lib/types";

interface IssueTableProps {
  issues: IssueListItem[];
  hasFilters: boolean;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (issue: IssueListItem) => void;
  onCreate: () => void;
  onClearFilters: () => void;
}

export default function IssueTable({ issues, hasFilters, onView, onEdit, onDelete, onCreate, onClearFilters }: IssueTableProps) {
  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Inbox size={22} />
        </div>
        {hasFilters ? (
          <>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No matching issues</h3>
            <p className="mt-1 text-sm text-slate-500">Try a different search or clear the filters.</p>
            <button type="button" className="btn-secondary mt-4" onClick={onClearFilters}>
              Clear filters
            </button>
          </>
        ) : (
          <>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No issues yet</h3>
            <p className="mt-1 text-sm text-slate-500">Create your first issue to start tracking.</p>
            <button type="button" className="btn-primary mt-4" onClick={onCreate}>
              <Plus size={16} /> New Issue
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-230 text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">ID</th>
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">App</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Raised</th>
            <th className="px-4 py-2.5 font-medium">Assigned To</th>
            <th className="px-4 py-2.5 font-medium">Images</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue) => (
            <tr key={issue.Id} className={`hover:bg-slate-50 ${issue.Priority === "Critical" ? "border-l-2 border-l-red-500" : ""}`}>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">#{issue.Id}</td>
              <td className="max-w-xs px-4 py-3">
                <button type="button" onClick={() => onView(issue.Id)} className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-blue-600" title={issue.Title}>
                  {issue.Title}
                </button>
              </td>
              <td className="px-4 py-3">
                <AppBadge app={issue.App} />
              </td>
              <td className="px-4 py-3 text-slate-600">{issue.Category || <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3">
                <PriorityBadge priority={issue.Priority} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={issue.Status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(issue.RaisedAt)}</td>
              <td className="px-4 py-3 text-slate-600">{issue.AssignedTo || <span className="text-slate-400">Unassigned</span>}</td>
              <td className="px-4 py-3">
                {issue.ImageCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-slate-600" title={`${issue.ImageCount} image(s)`}>
                    <ImageIcon size={15} /> {issue.ImageCount}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-0.5">
                  <button type="button" className="icon-btn" onClick={() => onView(issue.Id)} aria-label={`View issue ${issue.Id}`} title="View">
                    <Eye size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => onEdit(issue.Id)} aria-label={`Edit issue ${issue.Id}`} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="icon-btn hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(issue)} aria-label={`Delete issue ${issue.Id}`} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
