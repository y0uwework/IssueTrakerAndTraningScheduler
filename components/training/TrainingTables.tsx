"use client";

import { ExternalLink, Eye, GraduationCap, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { AppBadge, TrainingStatusBadge } from "../StatusBadge";
import { ModeLabel } from "./TrainingDetails";
import { formatDate, formatDateTime, type App, type TrainingRecordRow, type TrainingSessionListItem } from "@/lib/types";

const dash = <span className="text-slate-300">—</span>;
const th = "px-4 py-2.5 font-medium";

function AppList({ apps }: { apps: string | null }) {
  if (!apps) return dash;
  return (
    <span className="flex gap-1">
      {apps.split(", ").map((a) => (
        <AppBadge key={a} app={a as App} />
      ))}
    </span>
  );
}

export function EmptyTraining({ hasFilters, onCreate, onClearFilters }: { hasFilters: boolean; onCreate: () => void; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <GraduationCap size={22} />
      </div>
      {hasFilters ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-slate-800">No matching training records</h3>
          <p className="mt-1 text-sm text-slate-500">Try a different search or clear the filters.</p>
          <button type="button" className="btn-secondary mt-4" onClick={onClearFilters}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          <h3 className="mt-3 text-sm font-semibold text-slate-800">No training sessions yet</h3>
          <p className="mt-1 text-sm text-slate-500">Schedule a session to start recording who was trained.</p>
          <button type="button" className="btn-primary mt-4" onClick={onCreate}>
            <Plus size={16} /> New Session
          </button>
        </>
      )}
    </div>
  );
}

interface SessionsTableProps {
  sessions: TrainingSessionListItem[];
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (session: TrainingSessionListItem) => void;
}

export function SessionsTable({ sessions, onView, onEdit, onDelete }: SessionsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className={th}>ID</th>
            <th className={th}>Title</th>
            <th className={th}>Date &amp; Time</th>
            <th className={th}>Apps</th>
            <th className={th}>Trainers</th>
            <th className={th}>Employees</th>
            <th className={th}>Status</th>
            <th className={th}>Images</th>
            <th className={`${th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <tr key={s.Id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs text-slate-500">#{s.Id}</td>
              <td className="max-w-xs px-4 py-3">
                <button type="button" onClick={() => onView(s.Id)} className="block max-w-full truncate text-left font-medium text-slate-900 hover:text-blue-600" title={s.Title}>
                  {s.Title}
                </button>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                  <ModeLabel mode={s.Mode} />
                  {s.Mode === "Online" && s.MeetingLink ? (
                    <a href={s.MeetingLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                      · Join <ExternalLink size={11} />
                    </a>
                  ) : (
                    s.Location && <span className="truncate">· {s.Location}</span>
                  )}
                </p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(s.StartAt)}</td>
              <td className="px-4 py-3">
                <AppList apps={s.Apps} />
              </td>
              <td className="max-w-[14rem] truncate px-4 py-3 text-slate-600" title={s.Trainers ?? undefined}>
                {s.Trainers || dash}
              </td>
              <td className="px-4 py-3 text-slate-600">{s.EmployeeCount || dash}</td>
              <td className="px-4 py-3">
                <TrainingStatusBadge status={s.Status} />
              </td>
              <td className="px-4 py-3">
                {s.ImageCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-slate-600" title={`${s.ImageCount} image(s)`}>
                    <ImageIcon size={15} /> {s.ImageCount}
                  </span>
                ) : (
                  dash
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-0.5">
                  <button type="button" className="icon-btn" onClick={() => onView(s.Id)} aria-label={`View session ${s.Id}`} title="View">
                    <Eye size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => onEdit(s.Id)} aria-label={`Edit session ${s.Id}`} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="icon-btn hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(s)} aria-label={`Delete session ${s.Id}`} title="Delete">
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

export function RecordsTable({ records, onView }: { records: TrainingRecordRow[]; onView: (sessionId: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className={th}>Employee</th>
            <th className={th}>Designation / Department</th>
            <th className={th}>Joined</th>
            <th className={th}>App</th>
            <th className={th}>Trained By</th>
            <th className={th}>Date &amp; Time</th>
            <th className={th}>Session</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r) => (
            <tr key={r.AttendeeId} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{r.DisplayName}</p>
                {r.Email && <p className="text-xs text-slate-500">{r.Email}</p>}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {r.Designation || r.Department ? (
                  <>
                    <p>{r.Designation || dash}</p>
                    <p className="text-xs text-slate-500">{[r.Department, r.Unit].filter(Boolean).join(" · ")}</p>
                  </>
                ) : (
                  dash
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.DateOfJoining)}</td>
              <td className="px-4 py-3">
                <AppBadge app={r.App} />
              </td>
              <td className="px-4 py-3 text-slate-600">{r.Trainers || dash}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(r.StartAt)}</td>
              <td className="max-w-xs px-4 py-3">
                <button type="button" onClick={() => onView(r.SessionId)} className="block max-w-full truncate text-left text-slate-700 hover:text-blue-600" title={r.Title}>
                  <span className="font-mono text-xs text-slate-400">#{r.SessionId}</span> {r.Title}
                </button>
              </td>
              <td className="px-4 py-3">
                <TrainingStatusBadge status={r.Status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
