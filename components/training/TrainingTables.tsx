"use client";

import { useState } from "react";
import { Check, ExternalLink, Eye, GraduationCap, Image as ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { AppBadge, TrainingStatusBadge } from "../StatusBadge";
import { ModeLabel } from "./TrainingDetails";
import { readJson } from "@/lib/http";
import { TRAINERS, findTrainer, formatDate, formatDateTime, type App, type TrainingRecordRow, type TrainingSessionListItem } from "@/lib/types";

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
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{s.StartAt ? formatDateTime(s.StartAt) : "Date not recorded"}</td>
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

// "Trained By" cell. In edit mode a click opens a trainer dropdown (master config);
// Enter (or the ✓ button) saves, Escape cancels.
function TrainedByCell({
  record,
  editing,
  active,
  onActivate,
  onDone,
  onSaved,
}: {
  record: TrainingRecordRow;
  editing: boolean;
  active: boolean;
  onActivate: () => void;
  onDone: () => void;
  onSaved: (attendeeId: number, trainers: string) => void;
}) {
  const current = record.Trainers?.split(",").map((t) => findTrainer(t)).find(Boolean) ?? "";
  const [draft, setDraft] = useState<string>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!editing) return <>{record.Trainers || dash}</>;

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(current);
          setError("");
          onActivate();
        }}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2 py-1 text-left hover:border-blue-400 hover:text-blue-700"
        title="Click to change the trainer"
      >
        <span className="truncate">{record.Trainers || <span className="text-slate-400">Set trainer</span>}</span>
        <Pencil size={12} className="shrink-0 text-slate-400 group-hover:text-blue-600" />
      </button>
    );
  }

  async function save() {
    if (!draft || saving) return;
    if (draft === record.Trainers) return onDone(); // unchanged
    setSaving(true);
    setError("");
    try {
      const res = await readJson<{ trainers: string }>(
        await fetch(`/api/training/attendees/${record.AttendeeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trainer: draft }) }),
      );
      onSaved(record.AttendeeId, res.trainers);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-44">
      <div className="flex items-center gap-1">
        <select
          autoFocus
          className="field h-8 py-0 text-sm"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onDone();
            }
          }}
          aria-label={`Trainer for ${record.DisplayName} (${record.App})`}
        >
          <option value="" disabled>
            Select trainer…
          </option>
          {TRAINERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" onClick={save} disabled={!draft || saving} aria-label="Save trainer" title="Save (Enter)">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : <p className="mt-1 text-[11px] text-slate-400">Enter to save · Esc to cancel</p>}
    </div>
  );
}

export function RecordsTable({
  records,
  onView,
  onTrainerSaved,
}: {
  records: TrainingRecordRow[];
  onView: (sessionId: number) => void;
  onTrainerSaved: (attendeeId: number, trainers: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className={th}>Employee</th>
            <th className={th}>Designation / Department</th>
            <th className={th}>Joined</th>
            <th className={th}>App</th>
            <th className={th}>
              <span className="inline-flex items-center gap-2">
                Trained By
                <button
                  type="button"
                  onClick={() => {
                    setEditing((v) => !v);
                    setActiveId(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                    editing ? "bg-blue-600 text-white hover:bg-blue-700" : "text-blue-600 hover:bg-blue-50"
                  }`}
                  aria-pressed={editing}
                  title={editing ? "Stop editing trainers" : "Edit who trained each employee"}
                >
                  {editing ? <Check size={12} /> : <Pencil size={12} />} {editing ? "Done" : "Edit"}
                </button>
              </span>
            </th>
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
              <td className="px-4 py-3 text-slate-600">
                <TrainedByCell
                  record={r}
                  editing={editing}
                  active={activeId === r.AttendeeId}
                  onActivate={() => setActiveId(r.AttendeeId)}
                  onDone={() => setActiveId(null)}
                  onSaved={onTrainerSaved}
                />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{r.StartAt ? formatDateTime(r.StartAt) : "Date not recorded"}</td>
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
