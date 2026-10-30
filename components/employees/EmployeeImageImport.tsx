"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import Modal from "../Modal";
import { readJson, sendForm } from "@/lib/http";
import {
  ACCEPTED_IMAGE_TYPES,
  EMPLOYEE_FIELDS,
  EMPLOYEE_STATUSES,
  MAX_IMAGE_BYTES,
  type EmployeeExtractResponse,
  type EmployeeFieldKey,
  type EmployeeImportResult,
} from "@/lib/types";

interface EmployeeImageImportProps {
  onClose: () => void;
  onImported: () => void;
}

const MAX_IMAGES = 5;

type RowStatus = { kind: "insert" | "update" | "error" | "unchecked"; message?: string };

interface ReviewRow {
  id: number;
  source: string;
  include: boolean;
  values: Record<EmployeeFieldKey, string>;
  status: RowStatus;
}

interface PickedImage {
  key: string;
  file: File;
  previewUrl: string;
}

const WIDTHS: Partial<Record<EmployeeFieldKey, string>> = {
  DisplayName: "min-w-40",
  Email: "min-w-52",
  BaseLocation: "min-w-36",
  Department: "min-w-36",
  Designation: "min-w-32",
  ReportingTo: "min-w-32",
  CorrespondenceAddress: "min-w-56",
  SystemRequirement: "min-w-28",
};

const STATUS_STYLES: Record<RowStatus["kind"], string> = {
  insert: "bg-green-50 text-green-700 ring-green-600/20",
  update: "bg-blue-50 text-blue-700 ring-blue-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  unchecked: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
const STATUS_LABELS: Record<RowStatus["kind"], string> = { insert: "New", update: "Update", error: "Fix", unchecked: "Edited" };

const emptyValues = () => Object.fromEntries(EMPLOYEE_FIELDS.map((f) => [f.key, ""])) as Record<EmployeeFieldKey, string>;

export default function EmployeeImageImport({ onClose, onImported }: EmployeeImageImportProps) {
  const [images, setImages] = useState<PickedImage[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null); // null = still picking images
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(null);
  const [busy, setBusy] = useState<"" | "extract" | "check" | "save">("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState({ inserted: 0, updated: 0 });
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  // Release preview object URLs when the dialog closes.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  function addImages(list: FileList | null) {
    if (!list) return;
    const problems: string[] = [];
    const accepted: PickedImage[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) problems.push(`${file.name}: only JPEG, PNG, or WebP images are allowed.`);
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`${file.name}: larger than 5 MB.`);
      else accepted.push({ key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) });
    }
    setImages((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_IMAGES) problems.push(`At most ${MAX_IMAGES} images at a time.`);
      next.slice(MAX_IMAGES).forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return next.slice(0, MAX_IMAGES);
    });
    setError(problems.join(" "));
    if (input.current) input.current.value = "";
  }

  function removeImage(key: string) {
    setImages((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }

  const payload = (list: ReviewRow[]) => list.map((r) => ({ row: r.id, values: r.values }));

  /** Applies a dry-run or save result to the rows it was about. */
  function applyResult(list: ReviewRow[], result: EmployeeImportResult): ReviewRow[] {
    const byRow = new Map<number, RowStatus>();
    result.actions.forEach((a) => byRow.set(a.row, { kind: a.action }));
    result.errors.forEach((e) => byRow.set(e.row, { kind: "error", message: e.message }));
    return list.map((r) => (byRow.has(r.id) ? { ...r, status: byRow.get(r.id)! } : r));
  }

  async function check(list: ReviewRow[]) {
    const included = list.filter((r) => r.include);
    if (included.length === 0) return list;
    setBusy("check");
    try {
      const result = await readJson<EmployeeImportResult>(
        await fetch("/api/employees/import-rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload(included), dryRun: true }),
        }),
      );
      const next = applyResult(list, result);
      setRows(next);
      return next;
    } catch (err) {
      setError((err as Error).message);
      return list;
    } finally {
      setBusy("");
    }
  }

  async function handleExtract() {
    if (images.length === 0) return;
    setBusy("extract");
    setProgress(0);
    setError("");
    const body = new FormData();
    images.forEach((i) => body.append("images", i.file, i.file.name));
    try {
      const res = await sendForm("POST", "/api/employees/extract", body, setProgress);
      if (!res.ok) throw new Error(res.data.error || "The images could not be read.");
      const data = res.data as unknown as EmployeeExtractResponse;
      setMeta({ provider: data.provider, model: data.model });
      const list: ReviewRow[] = data.rows.map((r) => ({
        id: nextId.current++,
        source: r.source,
        include: true,
        values: { ...emptyValues(), ...Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v ?? ""])) },
        status: { kind: "unchecked" },
      }));
      setRows(list);
      setBusy("");
      if (list.length === 0) setError("No employee rows were found in the image(s). Check that the table is clear and not cut off.");
      else await check(list);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  async function handleSave() {
    if (!rows) return;
    const included = rows.filter((r) => r.include);
    if (included.length === 0) return setError("Tick at least one row to save.");
    setBusy("save");
    setError("");
    try {
      const result = await readJson<EmployeeImportResult>(
        await fetch("/api/employees/import-rows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: payload(included) }),
        }),
      );
      // Saved rows leave the table; rows with problems stay so they can be fixed.
      const savedIds = new Set(result.actions.map((a) => a.row));
      setRows(applyResult(rows, result).filter((r) => !savedIds.has(r.id)));
      setSaved((s) => ({ inserted: s.inserted + result.inserted, updated: s.updated + result.updated }));
      if (result.inserted || result.updated) onImported();
      if (result.errors.length) setError(`${result.errors.length} row${result.errors.length === 1 ? "" : "s"} still need fixing.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  function updateValue(id: number, key: EmployeeFieldKey, value: string) {
    setRows((prev) => prev && prev.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value }, status: { kind: "unchecked" } } : r)));
  }

  function toggleInclude(id: number) {
    setRows((prev) => prev && prev.map((r) => (r.id === id ? { ...r, include: !r.include } : r)));
  }

  function addRow() {
    setRows((prev) => [...(prev ?? []), { id: nextId.current++, source: "Added by hand", include: true, values: { ...emptyValues(), Status: "Active" }, status: { kind: "unchecked" } }]);
  }

  const included = rows?.filter((r) => r.include) ?? [];
  const needsCheck = included.some((r) => r.status.kind === "unchecked");
  const savedAny = saved.inserted + saved.updated > 0;

  return (
    <Modal
      size={rows ? "full" : "lg"}
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={17} className="text-violet-600" /> Import New Joiners from Image
        </span>
      }
      onClose={busy ? () => {} : onClose}
      footer={
        rows === null ? (
          <>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={!!busy}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleExtract} disabled={images.length === 0 || !!busy}>
              {busy === "extract" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy === "extract" ? (progress < 100 ? `Uploading ${progress}%` : "Reading images...") : "Read images"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary mr-auto" onClick={onClose} disabled={!!busy}>
              {savedAny && rows.length === 0 ? "Done" : "Close"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => check(rows)} disabled={!!busy || included.length === 0}>
              {busy === "check" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Check again
            </button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={!!busy || included.length === 0}>
              {busy === "save" && <Loader2 size={16} className="animate-spin" />}
              Save {included.length} row{included.length === 1 ? "" : "s"}
            </button>
          </>
        )
      }
    >
      {rows === null ? (
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Upload screenshots or photos of the HR joining sheet. The AI reads every row into the same fields as the Excel import. You then <span className="text-slate-800">review and
            correct</span> the rows before anything is saved.
          </p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            The images are sent to the AI service set up in <span className="font-mono">.env.local</span> (OpenAI or Gemini) to read the text. They are not stored in this app.
          </p>

          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!!busy || images.length >= MAX_IMAGES}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 hover:border-blue-400 hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none disabled:opacity-60"
          >
            <ImagePlus size={20} className="text-slate-400" />
            <span>
              <span className="font-medium text-blue-600">Choose images</span> of the sheet
            </span>
            <span className="text-xs text-slate-400">JPEG, PNG, or WebP · max 5 MB each · up to {MAX_IMAGES} images</span>
          </button>
          <input ref={input} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} multiple hidden onChange={(e) => addImages(e.target.files)} />

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((i) => (
                <div key={i.key} className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.previewUrl} alt={i.file.name} className="h-28 w-full object-contain" />
                  <p className="truncate border-t border-slate-200 bg-surface px-2 py-1 text-xs">{i.file.name}</p>
                  <button
                    type="button"
                    onClick={() => removeImage(i.key)}
                    disabled={!!busy}
                    className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-slate-700 shadow-sm hover:text-red-600"
                    aria-label={`Remove ${i.file.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {busy === "extract" && progress >= 100 && (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 size={15} className="animate-spin" /> The AI is reading the table. This usually takes 10–60 seconds.
            </p>
          )}
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
            {meta && (
              <span className="text-xs text-slate-400">
                Read by {meta.provider === "openai" ? "OpenAI" : "Gemini"} · {meta.model}
              </span>
            )}
            <span className="text-xs">
              <span className="font-medium text-amber-700">Check every row against the image</span>, especially emails and mobile numbers. Edit any cell, then click Check
              again.
            </span>
          </div>

          {savedAny && (
            <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              <CheckCircle2 size={16} /> Saved: {saved.inserted} added, {saved.updated} updated.
              {rows.length === 0 && " All rows are done."}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              <AlertTriangle size={16} /> {error}
            </p>
          )}
          {needsCheck && !busy && <p className="text-xs text-slate-500">Some rows were edited: click Check again to see whether they will be added or updated.</p>}

          {rows.length > 0 && (
            <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
              <table className="text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-[0_1px_0_0_var(--color-slate-200)]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Save</th>
                    <th className="px-2 py-2 font-medium">Result</th>
                    {EMPLOYEE_FIELDS.map((f) => (
                      <th key={f.key} className="px-2 py-2 font-medium whitespace-nowrap">
                        {f.label}
                        {"required" in f && f.required && <span className="text-red-600"> *</span>}
                      </th>
                    ))}
                    <th className="px-2 py-2 font-medium">Image</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className={`align-top ${r.include ? "" : "opacity-50"}`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.include} onChange={() => toggleInclude(r.id)} className="mt-1.5 h-4 w-4 accent-blue-600" aria-label={`Save row ${r.id}`} />
                      </td>
                      <td className="w-44 min-w-44 px-2 py-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${STATUS_STYLES[r.status.kind]}`}>{STATUS_LABELS[r.status.kind]}</span>
                        {r.status.message && <p className="mt-1 text-[11px] leading-snug text-red-600">{r.status.message}</p>}
                      </td>
                      {EMPLOYEE_FIELDS.map((f) => (
                        <td key={f.key} className={`px-1 py-1.5 ${WIDTHS[f.key] ?? "min-w-28"}`}>
                          {"type" in f && f.type === "status" ? (
                            <select className="field px-1.5 py-1 text-xs" value={r.values[f.key] || "Active"} onChange={(e) => updateValue(r.id, f.key, e.target.value)} aria-label={`${f.label}, row ${r.id}`}>
                              {EMPLOYEE_STATUSES.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="field px-1.5 py-1 text-xs"
                              value={r.values[f.key]}
                              onChange={(e) => updateValue(r.id, f.key, e.target.value)}
                              maxLength={"max" in f ? f.max : 20}
                              placeholder={"type" in f && f.type === "date" ? "DD.MM.YYYY" : undefined}
                              aria-label={`${f.label}, row ${r.id}`}
                            />
                          )}
                        </td>
                      ))}
                      <td className="max-w-32 truncate px-2 py-2 text-slate-400" title={r.source}>
                        {r.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline" onClick={addRow} disabled={!!busy}>
            <Plus size={14} /> Add a row the AI missed
          </button>
        </div>
      )}
    </Modal>
  );
}
