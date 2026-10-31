"use client";

import { Pencil } from "lucide-react";
import Modal from "../Modal";
import { AppBadge, AppTrainingBadge, TrainingStatusBadge } from "../StatusBadge";
import { APPS, EMPLOYEE_FIELDS, formatDate, formatDateTime, type EmployeeDetail } from "@/lib/types";

interface EmployeeDetailsProps {
  employee: EmployeeDetail;
  onClose: () => void;
  onEdit: () => void;
  onOpenSession: (sessionId: number) => void;
}

const heading = "text-xs font-semibold tracking-wide text-slate-500 uppercase";

export default function EmployeeDetails({ employee, onClose, onEdit, onOpenSession }: EmployeeDetailsProps) {
  return (
    <Modal
      size="xl"
      title={employee.DisplayName}
      onClose={onClose}
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
      <div className="flex flex-wrap gap-1.5">
        {APPS.map((app) => (
          <AppTrainingBadge key={app} app={app} state={app === "HRMS" ? employee.HrmsTraining : employee.CrmTraining} />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        {EMPLOYEE_FIELDS.filter((f) => f.key !== "DisplayName").map((f) => {
          const value = employee[f.key];
          const text = "type" in f && f.type === "date" ? formatDate(value) : value || "—";
          return (
            <div key={f.key} className={`min-w-0 ${f.key === "CorrespondenceAddress" ? "col-span-2 sm:col-span-3" : ""}`}>
              <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
              <dd className="mt-0.5 text-sm break-words text-slate-800">
                {f.key === "Email" && value ? (
                  <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
                    {value}
                  </a>
                ) : (
                  text
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-5">
        <h4 className={heading}>Training history ({employee.training.length})</h4>
        {employee.training.length === 0 ? (
          <p className="mt-1.5 text-sm text-slate-400 italic">Not added to any training session yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium">Trained by</th>
                  <th className="px-3 py-2 font-medium">Date &amp; Time</th>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employee.training.map((t) => (
                  <tr key={`${t.SessionId}|${t.App}`}>
                    <td className="px-3 py-2">
                      <AppBadge app={t.App} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{t.Trainers || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{t.StartAt ? formatDateTime(t.StartAt) : "Date not recorded"}</td>
                    <td className="max-w-[16rem] px-3 py-2">
                      <button type="button" onClick={() => onOpenSession(t.SessionId)} className="block max-w-full truncate text-left text-blue-600 hover:underline" title={t.Title}>
                        #{t.SessionId} {t.Title}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <TrainingStatusBadge status={t.Status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Added {formatDateTime(employee.CreatedAt)} · last updated {formatDateTime(employee.UpdatedAt)}
      </p>
    </Modal>
  );
}
