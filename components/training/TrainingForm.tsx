"use client";

import { useState } from "react";
import { Loader2, MapPin, Plus, Trash2, UserPlus, Users, Video, X } from "lucide-react";
import Modal from "../Modal";
import ScreenshotPicker, { type PendingFile } from "../ScreenshotPicker";
import { sendForm } from "@/lib/http";
import {
  APPS,
  MAX_ATTENDEES,
  MAX_TRAINERS,
  TRAINING_MODES,
  TRAINING_MODE_LABELS,
  TRAINING_STATUSES,
  isMeetingLink,
  toLocalInput,
  trainingImageUrl,
  type App,
  type KnownEmployee,
  type TrainingMode,
  type TrainingSessionDetail,
} from "@/lib/types";

interface TrainingFormProps {
  session: TrainingSessionDetail | null; // null = create
  knownTrainers: string[];
  knownEmployees: KnownEmployee[];
  departments: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface Row {
  key: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  app: App;
  trainers: string[];
}

type AppChoice = App | "Both";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rowKey = (r: Pick<Row, "employeeName" | "employeeCode" | "app">) => `${r.employeeName.trim()}|${r.employeeCode.trim()}|${r.app}`.toLowerCase();

export default function TrainingForm({ session, knownTrainers, knownEmployees, departments, onClose, onSaved }: TrainingFormProps) {
  const [title, setTitle] = useState(session?.Title ?? "");
  const [status, setStatus] = useState<string>(session?.Status ?? "Scheduled");
  const [startAt, setStartAt] = useState(toLocalInput(session?.StartAt ?? null));
  const [endAt, setEndAt] = useState(toLocalInput(session?.EndAt ?? null));
  const [mode, setMode] = useState<TrainingMode>(session?.Mode ?? "F2F");
  const [location, setLocation] = useState(session?.Location ?? "");
  const [meetingLink, setMeetingLink] = useState(session?.MeetingLink ?? "");
  const [notes, setNotes] = useState(session?.Notes ?? "");

  const [trainers, setTrainers] = useState<string[]>(session?.trainers ?? []);
  const [trainerDraft, setTrainerDraft] = useState("");
  const [rows, setRows] = useState<Row[]>(
    () =>
      session?.attendees.map((a) => ({
        key: crypto.randomUUID(),
        employeeName: a.EmployeeName,
        employeeCode: a.EmployeeCode ?? "",
        department: a.Department ?? "",
        app: a.App,
        trainers: a.Trainers,
      })) ?? [],
  );

  // "Add employees" panel
  const [bulk, setBulk] = useState(false);
  const [draft, setDraft] = useState({ employeeName: "", employeeCode: "", department: "" });
  const [bulkText, setBulkText] = useState("");
  const [addApp, setAddApp] = useState<AppChoice>("HRMS");
  const [addNote, setAddNote] = useState("");

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  function addTrainer() {
    const name = trainerDraft.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (trainers.length >= MAX_TRAINERS) return setError(`A session can have at most ${MAX_TRAINERS} trainers.`);
    if (!trainers.some((t) => same(t, name))) {
      setTrainers((prev) => [...prev, name]);
      // Employees with nobody selected yet are assumed to be trained by the new trainer.
      setRows((prev) => prev.map((r) => (r.trainers.length === 0 ? { ...r, trainers: [name] } : r)));
    }
    setTrainerDraft("");
  }

  function removeTrainer(name: string) {
    setTrainers((prev) => prev.filter((t) => t !== name));
    setRows((prev) => prev.map((r) => ({ ...r, trainers: r.trainers.filter((t) => t !== name) })));
  }

  function toggleRowTrainer(key: string, name: string) {
    setRows((prev) =>
      prev.map((r) => (r.key !== key ? r : { ...r, trainers: r.trainers.includes(name) ? r.trainers.filter((t) => t !== name) : [...r.trainers, name] })),
    );
  }

  // Header toggle: give a trainer to every employee, or take them off everyone if all already have them.
  function toggleTrainerForAll(name: string) {
    setRows((prev) => {
      const everyone = prev.every((r) => r.trainers.includes(name));
      return prev.map((r) => ({ ...r, trainers: everyone ? r.trainers.filter((t) => t !== name) : r.trainers.includes(name) ? r.trainers : [...r.trainers, name] }));
    });
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function lookupEmployee(name: string) {
    return knownEmployees.find((e) => same(e.EmployeeName, name));
  }

  function addPeople(people: { employeeName: string; employeeCode: string; department: string }[]) {
    const apps: App[] = addApp === "Both" ? [...APPS] : [addApp];
    const existing = new Set(rows.map(rowKey));
    const added: Row[] = [];
    let skipped = 0;
    for (const p of people) {
      for (const app of apps) {
        const row: Row = { key: crypto.randomUUID(), ...p, app, trainers: [...trainers] };
        if (existing.has(rowKey(row))) {
          skipped++;
          continue;
        }
        existing.add(rowKey(row));
        added.push(row);
      }
    }
    if (rows.length + added.length > MAX_ATTENDEES) {
      setAddNote(`A session can have at most ${MAX_ATTENDEES} attendee rows.`);
      return false;
    }
    setRows((prev) => [...prev, ...added]);
    setAddNote(skipped ? `${skipped} already in the list, skipped.` : "");
    return true;
  }

  function handleAddSingle() {
    const employeeName = draft.employeeName.trim().replace(/\s+/g, " ");
    if (!employeeName) return setAddNote("Enter the employee's name.");
    if (addPeople([{ employeeName, employeeCode: draft.employeeCode.trim(), department: draft.department.trim() }])) {
      setDraft({ employeeName: "", employeeCode: "", department: "" });
    }
  }

  // One employee per line: "Name", "Name, Code" or "Name, Code, Department" (commas or tabs, e.g. pasted from Excel).
  function handleAddBulk() {
    const people = bulkText
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,/).map((part) => part.trim()))
      .filter(([name]) => name)
      .map(([name, code = "", department = ""]) => {
        const known = lookupEmployee(name);
        return {
          employeeName: name.replace(/\s+/g, " "),
          employeeCode: code || known?.EmployeeCode || "",
          department: department || known?.Department || "",
        };
      });
    if (people.length === 0) return setAddNote("Paste at least one name.");
    if (addPeople(people)) setBulkText("");
  }

  function handleDraftName(value: string) {
    const known = lookupEmployee(value);
    setDraft((d) => ({
      employeeName: value,
      employeeCode: known && !d.employeeCode ? (known.EmployeeCode ?? "") : d.employeeCode,
      department: known && !d.department ? (known.Department ?? "") : d.department,
    }));
  }

  function validate(): string {
    if (!title.trim()) return "Title is required.";
    if (!startAt) return "Start date and time is required.";
    if (endAt && new Date(endAt) < new Date(startAt)) return "End must be after the start.";
    if (mode === "Online" && !meetingLink.trim()) return "Meeting link is required for online training.";
    if (mode === "Online" && !isMeetingLink(meetingLink.trim())) return "Meeting link must be a full web address starting with https://.";
    if (trainers.length === 0) return "Add at least one trainer.";
    const seen = new Set<string>();
    for (const [i, r] of rows.entries()) {
      const label = r.employeeName.trim() ? `"${r.employeeName.trim()}"` : `Attendee row ${i + 1}`;
      if (!r.employeeName.trim()) return `${label}: employee name is required.`;
      if (seen.has(rowKey(r))) return `${label} is listed twice for ${r.app}.`;
      seen.add(rowKey(r));
      if (r.trainers.length === 0) return `${label}: choose who trained this employee on ${r.app}.`;
    }
    return "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    setProgress(0);

    const body = new FormData();
    body.set("title", title);
    body.set("status", status);
    // datetime-local values are local time; the server stores UTC.
    body.set("startAt", new Date(startAt).toISOString());
    body.set("endAt", endAt ? new Date(endAt).toISOString() : "");
    body.set("mode", mode);
    body.set("location", location);
    body.set("meetingLink", meetingLink);
    body.set("notes", notes);
    body.set("trainers", JSON.stringify(trainers));
    body.set(
      "attendees",
      JSON.stringify(rows.map(({ employeeName, employeeCode, department, app, trainers }) => ({ employeeName, employeeCode, department, app, trainers }))),
    );
    pending.forEach((p) => body.append("images", p.file, p.file.name));
    removedIds.forEach((id) => body.append("removeImageIds", String(id)));

    try {
      const res = await sendForm(session ? "PUT" : "POST", session ? `/api/training/${session.Id}` : "/api/training", body, setProgress);
      if (!res.ok) throw new Error(res.data.error || "Could not save the training session.");
      onSaved(session ? `Training session #${session.Id} updated.` : "Training session created.");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const trainerOptions = knownTrainers.filter((t) => !trainers.some((x) => same(x, t)));
  const employeeCount = new Set(rows.map((r) => `${r.employeeName.trim()}|${r.employeeCode.trim()}`.toLowerCase())).size;

  return (
    <Modal
      size="xl"
      title={session ? `Edit Training Session #${session.Id}` : "New Training Session"}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="training-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? (pending.length > 0 && progress < 100 ? `Uploading ${progress}%` : "Saving...") : session ? "Save Changes" : "Create Session"}
          </button>
        </>
      }
    >
      <form id="training-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="t-title" className="label">
              Title <span className="text-red-600">*</span>
            </label>
            <input id="t-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. HRMS & CRM induction – October batch" required autoFocus />
          </div>
          <div>
            <label htmlFor="t-status" className="label">Status</label>
            <select id="t-status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              {TRAINING_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="t-start" className="label">
              Start <span className="text-red-600">*</span>
            </label>
            <input id="t-start" type="datetime-local" className="field" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="t-end" className="label">End</label>
            <input id="t-end" type="datetime-local" className="field" value={endAt} min={startAt || undefined} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <div>
            <span className="label">
              Training mode <span className="text-red-600">*</span>
            </span>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 bg-white text-sm font-medium" role="radiogroup" aria-label="Training mode">
              {TRAINING_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 ${mode === m ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {m === "Online" ? <Video size={15} /> : <MapPin size={15} />} {TRAINING_MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === "Online" ? (
          <div>
            <label htmlFor="t-link" className="label">
              Meeting link <span className="text-red-600">*</span>
            </label>
            <input
              id="t-link"
              type="url"
              className="field"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              maxLength={500}
              placeholder="https://teams.microsoft.com/... or https://meet.google.com/..."
              required
            />
          </div>
        ) : (
          <div>
            <label htmlFor="t-location" className="label">Venue</label>
            <input id="t-location" className="field" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Conference room, 2nd floor" />
          </div>
        )}

        {/* Trainers */}
        <div>
          <label htmlFor="t-trainer" className="label">
            Trainers <span className="text-red-600">*</span>
          </label>
          <div className="flex gap-2">
            <input
              id="t-trainer"
              className="field"
              list="trainer-options"
              value={trainerDraft}
              onChange={(e) => setTrainerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTrainer();
                }
              }}
              maxLength={100}
              placeholder="Type a trainer's name and press Enter"
            />
            <datalist id="trainer-options">
              {trainerOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button type="button" className="btn-secondary whitespace-nowrap" onClick={addTrainer} disabled={!trainerDraft.trim()}>
              <Plus size={15} /> Add
            </button>
          </div>
          {trainers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trainers.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20 ring-inset">
                  {t}
                  <button type="button" onClick={() => removeTrainer(t)} className="rounded-full p-0.5 hover:bg-indigo-100" aria-label={`Remove trainer ${t}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Attendees */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">
              Employees trained {rows.length > 0 && <span className="text-slate-400">· {employeeCount} employee{employeeCount === 1 ? "" : "s"}, {rows.length} app record{rows.length === 1 ? "" : "s"}</span>}
            </span>
            <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={() => setBulk((b) => !b)}>
              {bulk ? "Add one at a time" : "Paste a list"}
            </button>
          </div>

          <div
            className="rounded-md border border-slate-200 bg-slate-50 p-3"
            onKeyDown={(e) => {
              // Enter in the add-employee inputs adds the employee instead of submitting the form.
              if (e.key === "Enter" && !bulk && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                handleAddSingle();
              }
            }}
          >
            {bulk ? (
              <textarea
                className="field min-h-20 font-mono text-xs"
                rows={4}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"One employee per line: Name, Code, Department\nRavi Kumar, E1023, Sales\nPriya Shah, E1024, HR"}
                aria-label="Employees to add, one per line"
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className="field"
                  list="employee-options"
                  value={draft.employeeName}
                  onChange={(e) => handleDraftName(e.target.value)}
                  maxLength={100}
                  placeholder="Employee name"
                  aria-label="Employee name"
                />
                <input className="field" value={draft.employeeCode} onChange={(e) => setDraft((d) => ({ ...d, employeeCode: e.target.value }))} maxLength={50} placeholder="Employee code (optional)" aria-label="Employee code" />
                <input className="field" list="department-options" value={draft.department} onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))} maxLength={100} placeholder="Department (optional)" aria-label="Department" />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Trained on</span>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-xs font-medium" role="group" aria-label="App">
                {([...APPS, "Both"] as AppChoice[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAddApp(a)}
                    className={`px-3 py-1.5 ${addApp === a ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                    aria-pressed={addApp === a}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-primary ml-auto py-1.5" onClick={bulk ? handleAddBulk : handleAddSingle}>
                {bulk ? <Users size={15} /> : <UserPlus size={15} />} {bulk ? "Add all" : "Add employee"}
              </button>
            </div>
            {addNote && <p className="mt-1.5 text-xs text-amber-700">{addNote}</p>}
            {trainers.length === 0 && <p className="mt-1.5 text-xs text-slate-500">Tip: add trainers first; new employees are marked as trained by all of them.</p>}
          </div>

          <datalist id="employee-options">
            {knownEmployees.map((e) => (
              <option key={e.EmployeeName} value={e.EmployeeName} label={[e.EmployeeCode, e.Department].filter(Boolean).join(" · ") || undefined} />
            ))}
          </datalist>
          <datalist id="department-options">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          {rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-medium">Employee</th>
                    <th className="w-28 px-2 py-2 font-medium">Code</th>
                    <th className="w-36 px-2 py-2 font-medium">Department</th>
                    <th className="w-24 px-2 py-2 font-medium">App</th>
                    <th className="px-2 py-2 font-medium">
                      Trained by
                      {trainers.length > 1 && (
                        <span className="mt-1 flex flex-wrap gap-1 font-normal">
                          {trainers.map((t) => (
                            <button key={t} type="button" onClick={() => toggleTrainerForAll(t)} className="rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-600 hover:border-indigo-400" title={`Tick or untick ${t} for everyone`}>
                              {t}: all
                            </button>
                          ))}
                        </span>
                      )}
                    </th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.key} className="align-top">
                      <td className="px-2 py-1.5">
                        <input className="field px-2 py-1" list="employee-options" value={r.employeeName} onChange={(e) => updateRow(r.key, { employeeName: e.target.value })} maxLength={100} aria-label="Employee name" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className="field px-2 py-1" value={r.employeeCode} onChange={(e) => updateRow(r.key, { employeeCode: e.target.value })} maxLength={50} aria-label="Employee code" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input className="field px-2 py-1" list="department-options" value={r.department} onChange={(e) => updateRow(r.key, { department: e.target.value })} maxLength={100} aria-label="Department" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select className="field px-2 py-1" value={r.app} onChange={(e) => updateRow(r.key, { app: e.target.value as App })} aria-label="App">
                          {APPS.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        {trainers.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Add trainers above</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {trainers.map((t) => {
                              const on = r.trainers.includes(t);
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => toggleRowTrainer(r.key, t)}
                                  aria-pressed={on}
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                    on ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-500 ring-slate-300 hover:ring-indigo-400"
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {trainers.length > 0 && r.trainers.length === 0 && <p className="mt-0.5 text-[11px] text-red-600">Pick at least one</p>}
                      </td>
                      <td className="px-2 py-1.5">
                        <button type="button" className="icon-btn hover:bg-red-50 hover:text-red-600" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.employeeName}`} title="Remove">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="t-notes" className="label">Notes</label>
          <textarea id="t-notes" className="field min-h-20" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={20000} placeholder="Topics covered, follow-ups, etc." />
        </div>

        <ScreenshotPicker
          existing={session?.images ?? []}
          srcFor={trainingImageUrl}
          pending={pending}
          setPending={setPending}
          removedIds={removedIds}
          setRemovedIds={setRemovedIds}
          saving={saving}
          progress={progress}
        />
      </form>
    </Modal>
  );
}
