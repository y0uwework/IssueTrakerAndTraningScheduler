"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import Modal from "../Modal";
import { downloadFile, sendForm } from "@/lib/http";
import type { EmployeeImportResult } from "@/lib/types";

interface EmployeeImportProps {
  onClose: () => void;
  onImported: () => void;
}

export default function EmployeeImport({ onClose, onImported }: EmployeeImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    const body = new FormData();
    body.set("file", file, file.name);
    try {
      const res = await sendForm("POST", "/api/employees/import", body, setProgress);
      if (!res.ok) throw new Error(res.data.error || "The import failed.");
      const data = res.data as unknown as EmployeeImportResult;
      setResult(data);
      if (data.inserted || data.updated) onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTemplate() {
    try {
      await downloadFile("/api/employees/export?template=1", "new_joiners_template.xlsx");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal
      title="Import New Joiners from Excel"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {result ? "Done" : "Cancel"}
          </button>
          <button type="button" className="btn-primary" onClick={handleImport} disabled={!file || busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? (progress < 100 ? `Uploading ${progress}%` : "Importing...") : "Import"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          Upload the HR new-joiner sheet (.xlsx). Columns are matched by their header: <span className="text-slate-800">Display Name</span> is required; Date of Creation, Unit,
          Level, User Email ID, Date of Joining, Designation, Base Location, Department, Reporting To, Mobile Personal, Mobile Official, System Requirement, Correspondence
          Address and Status are read when present. Dates like <span className="font-mono">01.08.2026</span> work as they are.
        </p>
        <p>
          Employees are matched by <span className="text-slate-800">email</span>: existing ones are updated and new ones are added, so importing the same sheet again is safe.
        </p>

        <button type="button" className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline" onClick={handleTemplate}>
          <Download size={15} /> Download blank template
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
            setResult(null);
            setError("");
            e.target.value = "";
          }}
        />

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</div>}

        {result && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              <CheckCircle2 size={16} /> {result.inserted} added, {result.updated} updated.
            </p>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle size={16} /> {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped. Fix them in the sheet and import again:
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
