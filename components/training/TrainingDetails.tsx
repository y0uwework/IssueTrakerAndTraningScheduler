"use client";

import { useState } from "react";
import { MapPin, Pencil, Video } from "lucide-react";
import Modal from "../Modal";
import Lightbox, { ScreenshotGallery } from "../Lightbox";
import { AppBadge, TrainingStatusBadge } from "../StatusBadge";
import { TRAINING_MODE_LABELS, formatDateTime, trainingImageUrl, type TrainingMode, type TrainingSessionDetail } from "@/lib/types";

export function ModeLabel({ mode }: { mode: TrainingMode }) {
  const Icon = mode === "Online" ? Video : MapPin;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon size={14} className="text-slate-400" /> {TRAINING_MODE_LABELS[mode]}
    </span>
  );
}

interface TrainingDetailsProps {
  session: TrainingSessionDetail;
  onClose: () => void;
  onEdit: () => void;
}

export function formatDuration(startAt: string, endAt: string | null) {
  if (!endAt) return null;
  const minutes = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
  if (minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

const heading = "text-xs font-semibold tracking-wide text-slate-500 uppercase";

export default function TrainingDetails({ session, onClose, onEdit }: TrainingDetailsProps) {
  const [viewing, setViewing] = useState<number | null>(null);
  const duration = formatDuration(session.StartAt, session.EndAt);

  const meta: [string, React.ReactNode][] = [
    ["Status", <TrainingStatusBadge key="s" status={session.Status} />],
    ["Start", formatDateTime(session.StartAt)],
    ["End", session.EndAt ? `${formatDateTime(session.EndAt)}${duration ? ` (${duration})` : ""}` : "—"],
    ["Training Mode", <ModeLabel key="m" mode={session.Mode} />],
    session.Mode === "Online"
      ? [
          "Meeting Link",
          session.MeetingLink ? (
            <a key="l" href={session.MeetingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" title={session.MeetingLink}>
              {session.MeetingLink}
            </a>
          ) : (
            "—"
          ),
        ]
      : ["Venue", session.Location || "—"],
    ["Created", formatDateTime(session.CreatedAt)],
    ["Last Updated", formatDateTime(session.UpdatedAt)],
  ];

  // Who trained whom: each trainer with the employees they trained, per app.
  const byTrainer = session.trainers.map((trainer) => ({
    trainer,
    trained: session.attendees.filter((a) => a.Trainers.includes(trainer)),
  }));

  return (
    <>
      <Modal
        size="xl"
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-500">#{session.Id}</span>
            <span>Training Session</span>
          </span>
        }
        onClose={viewing === null ? onClose : () => {}}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary" onClick={onEdit}>
              <Pencil size={15} /> Edit
            </button>
          </>
        }
      >
        <h3 className="text-lg font-semibold break-words text-slate-900">{session.Title}</h3>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          {meta.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-0.5 truncate text-sm text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <h4 className={heading}>Trainers ({session.trainers.length})</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {byTrainer.map(({ trainer, trained }) => (
              <div key={trainer} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-sm font-medium text-slate-900">{trainer}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {trained.length === 0
                    ? "No employees assigned"
                    : trained.map((a, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          {a.EmployeeName} <span className="text-slate-400">({a.App})</span>
                        </span>
                      ))}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <h4 className={heading}>Employees trained ({session.attendees.length})</h4>
          {session.attendees.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-400 italic">No employees added yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">App</th>
                    <th className="px-3 py-2 font-medium">Trained by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {session.attendees.map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-800">{a.EmployeeName}</td>
                      <td className="px-3 py-2 text-slate-600">{a.EmployeeCode || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-600">{a.Department || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2">
                        <AppBadge app={a.App} />
                      </td>
                      <td className="px-3 py-2 text-slate-600">{a.Trainers.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5">
          <h4 className={heading}>Notes</h4>
          <p className="mt-1.5 text-sm whitespace-pre-wrap break-words text-slate-700">{session.Notes || <span className="text-slate-400 italic">No notes.</span>}</p>
        </div>

        <div className="mt-5">
          <h4 className={heading}>Screenshots ({session.images.length})</h4>
          <ScreenshotGallery images={session.images} srcFor={trainingImageUrl} onOpen={setViewing} />
        </div>
      </Modal>

      {viewing !== null && <Lightbox images={session.images} srcFor={trainingImageUrl} index={viewing} onChange={setViewing} onClose={() => setViewing(null)} />}
    </>
  );
}
