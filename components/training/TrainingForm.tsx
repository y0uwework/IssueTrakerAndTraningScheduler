"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Search, Trash2, UserPlus, Video, X } from "lucide-react";
import Modal from "../Modal";
import ScreenshotPicker, { type PendingFile } from "../ScreenshotPicker";
import { AppBadge, AppTrainingBadge } from "../StatusBadge";
import { readJson, sendForm } from "@/lib/http";
import { randomId } from "@/lib/client-id";
import {
  APPS,
  TRAINERS,
  MAX_ATTENDEES,
  MAX_TRAINERS,
  TRAINING_MODES,
  TRAINING_MODE_LABELS,
  TRAINING_STATUSES,
  formatDate,
  isMeetingLink,
  toLocalInput,
  trainingImageUrl,
  type App,
  type EmployeeListItem,
  type EmployeeListResponse,
  type TrainingMode,
  type TrainingSessionDetail,
} from "@/lib/types";

interface TrainingFormProps {
  session: TrainingSessionDetail | null; // null = create
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface Row {
  key: string;
  employeeId: number;
  displayName: string;
  subtitle: string;
  app: App;
  trainers: string[];
}

type AppChoice = App | "All";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const subtitleOf = (e: { Designation: string | null; Department: string | null; Unit: string | null }) =>
  [e.Designation, e.Department, e.Unit].filter(Boolean).join(" · ");
const trainingState = (e: EmployeeListItem, app: App) => e.Training[app];
const emptyByApp = <T,>(make: () => T) => Object.fromEntries(APPS.map((a) => [a, make()])) as Record<App, T>;

export default function TrainingForm({ session, onClose, onSaved }: TrainingFormProps) {
  const [title, setTitle] = useState(session?.Title ?? "");
  const [status, setStatus] = useState<string>(session?.Status ?? "Scheduled");
  const [startAt, setStartAt] = useState(toLocalInput(session?.StartAt ?? null));
  const [endAt, setEndAt] = useState(toLocalInput(session?.EndAt ?? null));
  const [mode, setMode] = useState<TrainingMode>(session?.Mode ?? "F2F");
  const [location, setLocation] = useState(session?.Location ?? "");
  const [meetingLink, setMeetingLink] = useState(session?.MeetingLink ?? "");
  const [notes, setNotes] = useState(session?.Notes ?? "");

  // Trainers are assigned per app.
  const [trainers, setTrainers] = useState<Record<App, string[]>>(() => {
    const byApp = emptyByApp<string[]>(() => []);
    session?.trainers.forEach((t) => byApp[t.App]?.push(t.TrainerName));
    return byApp;
  });

  const [rows, setRows] = useState<Row[]>(
    () =>
      session?.attendees.map((a) => ({
        key: randomId(),
        employeeId: a.EmployeeId,
        displayName: a.DisplayName,
        subtitle: subtitleOf(a),
        app: a.App,
        trainers: a.Trainers,
      })) ?? [],
  );

  // New-joiner picker
  const [employees, setEmployees] = useState<EmployeeListItem[] | null>(null);
  const [employeesError, setEmployeesError] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [addApp, setAddApp] = useState<AppChoice>("All");
  const [addNote, setAddNote] = useState("");

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/employees?status=Active&sort=newest&all=1", { signal: controller.signal, cache: "no-store" })
      .then((res) => readJson<EmployeeListResponse>(res))
      .then((data) => setEmployees(data.employees))
      .catch((err) => {
        if (err.name !== "AbortError") setEmployeesError(err.message);
      });
    return () => controller.abort();
  }, []);

  const pickerApps: App[] = addApp === "All" ? [...APPS] : [addApp];
  const inSession = new Set(rows.map((r) => `${r.employeeId}|${r.app}`));
  const query = pickerSearch.trim().toLowerCase();
  const shown = (employees ?? []).filter((e) => {
    // Hide people already added for every chosen app.
    if (pickerApps.every((app) => inSession.has(`${e.Id}|${app}`))) return false;
    if (pendingOnly && pickerApps.every((app) => trainingState(e, app) === "Trained")) return false;
    if (!query) return true;
    return [e.DisplayName, e.Email, e.Designation, e.Department, e.Unit, e.BaseLocation].some((v) => v?.toLowerCase().includes(query));
  });
  const shownIds = shown.map((e) => e.Id);
  const selectedShown = selected.filter((id) => shownIds.includes(id));
  const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;

  function toggleSelected(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAllShown() {
    setSelected((prev) => (allShownSelected ? prev.filter((id) => !shownIds.includes(id)) : [...new Set([...prev, ...shownIds])]));
  }

  function addSelected() {
    const people = (employees ?? []).filter((e) => selectedShown.includes(e.Id));
    if (people.length === 0) return setAddNote("Tick the new joiners to add.");
    const added: Row[] = [];
    for (const e of people) {
      for (const app of pickerApps) {
        if (inSession.has(`${e.Id}|${app}`)) continue;
        added.push({ key: randomId(), employeeId: e.Id, displayName: e.DisplayName, subtitle: subtitleOf(e), app, trainers: [...trainers[app]] });
      }
    }
    if (rows.length + added.length > MAX_ATTENDEES) return setAddNote(`A session can have at most ${MAX_ATTENDEES} employee/app rows.`);
    setRows((prev) => [...prev, ...added]);
    setSelected((prev) => prev.filter((id) => !selectedShown.includes(id)));
    setAddNote("");
  }

  // `name` comes from the trainer dropdown (the master config list).
  function addTrainer(app: App, name: string) {
    if (!name) return;
    if (APPS.reduce((n, a) => n + trainers[a].length, 0) >= MAX_TRAINERS) return setError(`A session can have at most ${MAX_TRAINERS} trainers.`);
    if (!trainers[app].some((t) => same(t, name))) {
      setTrainers((prev) => ({ ...prev, [app]: [...prev[app], name] }));
      // Employees of this app with nobody selected yet are assumed to be trained by the new trainer.
      setRows((prev) => prev.map((r) => (r.app === app && r.trainers.length === 0 ? { ...r, trainers: [name] } : r)));
    }
  }

  function removeTrainer(app: App, name: string) {
    setTrainers((prev) => ({ ...prev, [app]: prev[app].filter((t) => t !== name) }));
    setRows((prev) => prev.map((r) => (r.app === app ? { ...r, trainers: r.trainers.filter((t) => t !== name) } : r)));
  }

  function toggleRowTrainer(key: string, name: string) {
    setRows((prev) =>
      prev.map((r) => (r.key !== key ? r : { ...r, trainers: r.trainers.includes(name) ? r.trainers.filter((t) => t !== name) : [...r.trainers, name] })),
    );
  }

  function validate(): string {
    if (!title.trim()) return "Title is required.";
    if (!startAt) return "Start date and time is required.";
    if (endAt && new Date(endAt) < new Date(startAt)) return "End must be after the start.";
    if (mode === "Online" && !meetingLink.trim()) return "Meeting link is required for online training.";
    if (mode === "Online" && !isMeetingLink(meetingLink.trim())) return "Meeting link must be a full web address starting with https://.";
    if (APPS.every((app) => trainers[app].length === 0)) return "Assign at least one trainer.";
    for (const app of APPS) {
      if (rows.some((r) => r.app === app) && trainers[app].length === 0) return `Assign a ${app} trainer, or remove the ${app} employees.`;
    }
    const missing = rows.find((r) => r.trainers.length === 0);
    if (missing) return `Choose who trained ${missing.displayName} on ${missing.app}.`;
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
    body.set("trainers", JSON.stringify(APPS.flatMap((app) => trainers[app].map((name) => ({ app, name })))));
    body.set("attendees", JSON.stringify(rows.map(({ employeeId, app, trainers }) => ({ employeeId, app, trainers }))));
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

  const employeeCount = new Set(rows.map((r) => r.employeeId)).size;
  // Rows grouped by app so each app's trainers sit next to the people they trained.
  const rowsByApp = APPS.map((app) => ({ app, rows: rows.filter((r) => r.app === app) })).filter((g) => g.rows.length > 0);

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
            <input id="t-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. New joiner induction – August batch" required autoFocus />
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
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-300 bg-surface text-sm font-medium" role="radiogroup" aria-label="Training mode">
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

        {/* Trainers per app */}
        <div>
          <span className="label">
            Trainers <span className="text-red-600">*</span> <span className="font-normal text-slate-400">· assign trainers for each app covered in this session</span>
          </span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {APPS.map((app) => (
              <div key={app} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <AppBadge app={app} /> trainers
                </div>
                {/* Trainers come from the master config (configs/master-config.ts). */}
                <select
                  className="field"
                  value=""
                  onChange={(e) => addTrainer(app, e.target.value)}
                  disabled={TRAINERS.every((t) => trainers[app].some((x) => same(x, t)))}
                  aria-label={`Add ${app} trainer`}
                >
                  <option value="">Add {app} trainer…</option>
                  {TRAINERS.filter((t) => !trainers[app].some((x) => same(x, t))).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {trainers[app].length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {trainers[app].map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20 ring-inset">
                        {t}
                        <button type="button" onClick={() => removeTrainer(app, t)} className="rounded-full p-0.5 hover:bg-indigo-100" aria-label={`Remove ${app} trainer ${t}`}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">No {app} trainer yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* New joiners */}
        <div>
          <span className="label">
            New joiners in this session {rows.length > 0 && <span className="font-normal text-slate-400">· {employeeCount} employee{employeeCount === 1 ? "" : "s"}, {rows.length} app record{rows.length === 1 ? "" : "s"}</span>}
          </span>

          <div className="rounded-md border border-slate-200">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-2 sm:flex-row">
              <div className="relative flex-1">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
                <input className="field py-1.5 pl-8" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search name, email, department, unit..." aria-label="Search new joiners" />
              </div>
              <select className="field py-1.5 sm:w-48" value={pendingOnly ? "pending" : "all"} onChange={(e) => setPendingOnly(e.target.value === "pending")} aria-label="Which new joiners to show">
                <option value="pending">Not yet trained</option>
                <option value="all">All active</option>
              </select>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {employeesError ? (
                <p className="p-3 text-sm text-red-600">{employeesError}</p>
              ) : !employees ? (
                <p className="flex items-center gap-2 p-3 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" /> Loading new joiners...
                </p>
              ) : employees.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  No active employees yet.{" "}
                  <Link href="/employees" className="font-medium text-blue-600 hover:underline">
                    Add or import new joiners
                  </Link>{" "}
                  first.
                </p>
              ) : shown.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Nobody matches. Try &ldquo;All active&rdquo; or a different search.</p>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} className="h-4 w-4 accent-blue-600" />
                    Select all shown ({shown.length})
                  </label>
                  {shown.map((e) => (
                    <label key={e.Id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50">
                      <input type="checkbox" checked={selected.includes(e.Id)} onChange={() => toggleSelected(e.Id)} className="h-4 w-4 shrink-0 accent-blue-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{e.DisplayName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[subtitleOf(e), e.DateOfJoining && `Joined ${formatDate(e.DateOfJoining)}`].filter(Boolean).join(" · ") || e.Email}
                        </span>
                      </span>
                      <span className="hidden shrink-0 gap-1 sm:flex">
                        {APPS.map((app) => (
                          <AppTrainingBadge key={app} app={app} state={trainingState(e, app)} />
                        ))}
                      </span>
                    </label>
                  ))}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 p-2">
              <span className="text-xs text-slate-500">Train on</span>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-surface text-xs font-medium" role="group" aria-label="App">
                {([...APPS, "All"] as AppChoice[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAddApp(a)}
                    className={`px-3 py-1.5 ${addApp === a ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                    aria-pressed={addApp === a}
                  >
                    {a === "All" ? "All apps" : a}
                  </button>
                ))}
              </div>
              {addNote && <span className="text-xs text-amber-700">{addNote}</span>}
              <button type="button" className="btn-primary ml-auto py-1.5" onClick={addSelected} disabled={selectedShown.length === 0}>
                <UserPlus size={15} /> Add selected{selectedShown.length > 0 && ` (${selectedShown.length})`}
              </button>
            </div>
          </div>

          {rowsByApp.map(({ app, rows: appRows }) => (
            <div key={app} className="mt-3 overflow-x-auto rounded-md border border-slate-200">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <AppBadge app={app} /> {appRows.length} employee{appRows.length === 1 ? "" : "s"}
                {trainers[app].length === 0 && <span className="text-red-600">· assign a {app} trainer above</span>}
              </div>
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Employee</th>
                    <th className="px-3 py-1.5 font-medium">Trained by</th>
                    <th className="w-10 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                  {appRows.map((r) => (
                    <tr key={r.key} className="align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{r.displayName}</p>
                        {r.subtitle && <p className="text-xs text-slate-500">{r.subtitle}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {trainers[app].map((t) => {
                            const on = r.trainers.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => toggleRowTrainer(r.key, t)}
                                aria-pressed={on}
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                  on ? "bg-indigo-600 text-white ring-indigo-600" : "bg-surface text-slate-500 ring-slate-300 hover:ring-indigo-400"
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                        {trainers[app].length > 0 && r.trainers.length === 0 && <p className="mt-0.5 text-[11px] text-red-600">Pick at least one</p>}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="icon-btn hover:bg-red-50 hover:text-red-600"
                          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                          aria-label={`Remove ${r.displayName} from ${app}`}
                          title="Remove"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
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
