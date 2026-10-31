"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import Modal from "../Modal";
import { downloadFile, readJson, sendForm } from "@/lib/http";
import { APPS, TRAINING_MODES, TRAINING_MODE_LABELS, type App, type LegacyTrainingImportResult, type LegacyTrainingRow, type TrainingMode } from "@/lib/types";

interface TrainingImportProps {
  onClose: () => void;
  onImported: (message: string) => void;
}

type ReviewRow = LegacyTrainingRow & { include: boolean };

/** What must be fixed before a row can be saved. */
function problemsOf(r: ReviewRow) {
  const problems: string[] = [];
  if (!r.name) problems.push("Name is missing.");
  if (r.date && r.start && r.end && r.end < r.start) problems.push("End is before the start.");
  return problems;
}

/** Missing data that is saved as missing. */
function gapsOf(r: ReviewRow) {
  const gaps: string[] = [];
  if (!r.date) gaps.push("No date — saved with the date left empty.");
  else if (!r.start) gaps.push("No time — saved with the date only.");
  if (r.apps.length === 0) gaps.push("No app — only the employee is saved, no training record.");
  return gaps;
}

const cell = "px-2 py-1.5 align-top";
const small = "field w-auto! px-2! py-1! text-xs!";

/**
 * Imports the old, hand-kept training sheet: the file is read on the server, the rows are reviewed
 * (and fixed) here, then saved as completed sessions. The existing training flow is untouched.
 */
export default function TrainingImport({ onClose, onImported }: TrainingImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [trainers, setTrainers] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LegacyTrainingImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleRead() {
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file, file.name);
    try {
      const res = await sendForm("POST", "/api/training/import/preview", body, setProgress);
      if (!res.ok) throw new Error(res.data.error || "The sheet could not be read.");
      const data = res.data as unknown as { rows: LegacyTrainingRow[] };
      setRows(data.rows.map((r) => ({ ...r, include: true })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSample() {
    try {
      await downloadFile("/api/training/import/template", "training_done_sample.xlsx");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const update = (index: number, patch: Partial<ReviewRow>) => setRows((list) => list!.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const included = rows?.filter((r) => r.include) ?? [];
  const ready = included.filter((r) => problemsOf(r).length === 0);
  const incomplete = included.length - ready.length;
  const trainerNames = trainers
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function handleSave() {
    if (!rows || ready.length === 0) return;
    if (trainerNames.length === 0) {
      setError("Enter the trainer name — the old sheet does not record who gave the training.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = ready.map((r) => ({
        row: r.row,
        name: r.name,
        email: r.email,
        reportingTo: r.reportingTo,
        designation: r.designation,
        mobileOfficial: r.mobileOfficial,
        mobilePersonal: r.mobilePersonal,
        location: r.location,
        // The browser's local time zone, like the session form. Without a time, the date is kept at midnight.
        startAt: r.date ? new Date(`${r.date}T${r.start ?? "00:00"}`).toISOString() : null,
        endAt: r.date && r.start && r.end ? new Date(`${r.date}T${r.end}`).toISOString() : null,
        timeRecorded: Boolean(r.start),
        mode: r.mode,
        apps: r.apps,
      }));
      const data = await readJson<LegacyTrainingImportResult>(
        await fetch("/api/training/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trainers: trainerNames, rows: payload }) }),
      );
      setResult(data);
      if (data.records) onImported(`${data.records} training record${data.records === 1 ? "" : "s"} imported.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const footer = result ? (
    <button type="button" className="btn-primary" onClick={onClose}>
      Done
    </button>
  ) : (
    <>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      {rows ? (
        <button type="button" className="btn-primary" onClick={handleSave} disabled={busy || ready.length === 0}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Saving..." : `Save ${ready.length} row${ready.length === 1 ? "" : "s"}`}
        </button>
      ) : (
        <button type="button" className="btn-primary" onClick={handleRead} disabled={!file || busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? (progress < 100 ? `Uploading ${progress}%` : "Reading...") : "Read sheet"}
        </button>
      )}
    </>
  );

  return (
    <Modal title="Import Old Training Sheet" onClose={busy ? () => {} : onClose} size={rows ? "full" : "lg"} footer={footer}>
      <div className="space-y-4 text-sm text-slate-600">
        {!rows && (
          <>
            <p>
              Upload the training sheet kept before this app (.xlsx). Columns are matched by their header: <span className="text-slate-800">User name</span>, User Email,
              reporting manager, designation, official, personal, location, <span className="text-slate-800">info get on</span> (date),{" "}
              <span className="text-slate-800">traning time</span>, <span className="text-slate-800">traning status</span> (HRMS / CRM) and MODE OF TRAINING.
            </p>
            <p>You can check and correct every row before anything is saved. Rows with missing date, time or app are still saved, with that data left empty.</p>
            <button type="button" className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline" onClick={handleSample}>
              <Download size={15} /> Download sample sheet
            </button>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 hover:border-blue-400 hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none"
            >
              <FileSpreadsheet size={20} className="text-green-700" />
              {file ? <span className="font-medium text-slate-800">{file.name}</span> : <span>Choose an Excel file</span>}
            </button>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
                e.target.value = "";
              }}
            />
          </>
        )}

        {rows && !result && (
          <>
            <p>
              Rows with the same date, time and mode are saved as one <span className="text-slate-800">Completed</span> session. Employees are matched by email (or name);
              people not yet in New Joiners are added there, and existing employees are not changed. Records that were already imported are skipped, so importing again is
              safe.
            </p>
            <label className="block max-w-xl">
              <span className="mb-1 block font-medium text-slate-700">Trainer(s) *</span>
              <input
                className="field"
                value={trainers}
                onChange={(e) => setTrainers(e.target.value)}
                placeholder="e.g. Yuvraj Singh — separate several names with commas"
                maxLength={500}
              />
              <span className="mt-1 block text-xs text-slate-500">The old sheet does not say who trained each person, so these trainers are recorded for every imported row.</span>
            </label>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>
                {rows.length} rows read · <span className="font-medium text-green-700">{ready.length} ready</span>
              </span>
              {incomplete > 0 && <span className="font-medium text-red-700">{incomplete} need fixing (they will be skipped)</span>}
              {ready.some((r) => gapsOf(r).length) && (
                <span className="text-amber-700">{ready.filter((r) => gapsOf(r).length).length} have missing data and will be saved as they are</span>
              )}
              <span>{rows.filter((r) => r.include && !r.employee).length} new employees</span>
            </div>

            <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                  <tr>
                    <th className={cell}>
                      <input
                        type="checkbox"
                        aria-label="Include all rows"
                        checked={rows.every((r) => r.include)}
                        onChange={(e) => setRows(rows.map((r) => ({ ...r, include: e.target.checked })))}
                      />
                    </th>
                    <th className={cell}>Row</th>
                    <th className={cell}>Employee</th>
                    <th className={cell}>Date</th>
                    <th className={cell}>Start</th>
                    <th className={cell}>End</th>
                    <th className={cell}>Mode</th>
                    <th className={cell}>Apps</th>
                    <th className={cell}>Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const problems = problemsOf(r);
                    const gaps = gapsOf(r);
                    return (
                      <tr key={r.row} className={!r.include ? "opacity-50" : problems.length ? "bg-red-50/60" : gaps.length ? "bg-amber-50/60" : ""}>
                        <td className={cell}>
                          <input type="checkbox" aria-label={`Include row ${r.row}`} checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} />
                        </td>
                        <td className={`${cell} text-slate-500`}>{r.row}</td>
                        <td className={`${cell} min-w-48`}>
                          <div className="font-medium text-slate-800">{r.name}</div>
                          <div className="text-slate-500">{r.email ?? "no email"}</div>
                          {r.employee ? (
                            <span className="text-green-700">Existing employee #{r.employee.id}</span>
                          ) : (
                            <span className="text-blue-700">Will be added to New Joiners</span>
                          )}
                        </td>
                        <td className={cell}>
                          <input type="date" className={small} value={r.date ?? ""} onChange={(e) => update(i, { date: e.target.value || null })} aria-label={`Date, row ${r.row}`} />
                        </td>
                        <td className={cell}>
                          <input type="time" className={small} value={r.start ?? ""} onChange={(e) => update(i, { start: e.target.value || null })} aria-label={`Start, row ${r.row}`} />
                        </td>
                        <td className={cell}>
                          <input type="time" className={small} value={r.end ?? ""} onChange={(e) => update(i, { end: e.target.value || null })} aria-label={`End, row ${r.row}`} />
                        </td>
                        <td className={cell}>
                          <select className={small} value={r.mode} onChange={(e) => update(i, { mode: e.target.value as TrainingMode })} aria-label={`Mode, row ${r.row}`}>
                            {TRAINING_MODES.map((m) => (
                              <option key={m} value={m}>
                                {TRAINING_MODE_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={cell}>
                          <div className="flex flex-col gap-0.5">
                            {APPS.map((app: App) => (
                              <label key={app} className="inline-flex items-center gap-1 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={r.apps.includes(app)}
                                  onChange={(e) => update(i, { apps: APPS.filter((a) => (a === app ? e.target.checked : r.apps.includes(a))) })}
                                />
                                {app}
                              </label>
                            ))}
                          </div>
                        </td>
                        <td className={`${cell} min-w-52`}>
                          {r.include && problems.map((p) => <div key={p} className="text-red-700">{p}</div>)}
                          {r.include &&
                            gaps.map((g) => (
                              <div key={g} className="text-amber-700">
                                {g}
                              </div>
                            ))}
                          {r.warnings.map((w) => (
                            <div key={w} className="text-slate-500">
                              {w}
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}

        {result && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              <CheckCircle2 size={16} /> {result.records} training record{result.records === 1 ? "" : "s"} saved in {result.sessions} session{result.sessions === 1 ? "" : "s"}
              {result.employeesCreated > 0 && `; ${result.employeesCreated} employee${result.employeesCreated === 1 ? "" : "s"} added to New Joiners`}.
              {result.employeesOnly > 0 && ` ${result.employeesOnly} row${result.employeesOnly === 1 ? "" : "s"} without an app saved as employee only.`}
              {result.duplicates > 0 && ` ${result.duplicates} already saved before (skipped).`}
            </p>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle size={16} /> {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped:
                </p>
                <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-6 text-xs">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
