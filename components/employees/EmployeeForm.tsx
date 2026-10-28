"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "../Modal";
import OptionSelect from "../OptionSelect";
import { readJson } from "@/lib/http";
import {
  EMPLOYEE_FIELDS,
  EMPLOYEE_STATUSES,
  SUGGESTED_DEPARTMENTS,
  SUGGESTED_DESIGNATIONS,
  SUGGESTED_LEVELS,
  SUGGESTED_SYSTEM_REQUIREMENTS,
  SUGGESTED_UNITS,
  toDateInput,
  type Employee,
  type EmployeeFieldKey,
  type EmployeeInput,
  type EmployeeListResponse,
} from "@/lib/types";

interface EmployeeFormProps {
  employee: Employee | null; // null = create
  options: EmployeeListResponse["options"] | undefined;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Usual values first, then values already used, without case-insensitive duplicates. */
function merge(usual: string[], used: string[] = []) {
  const seen = new Set<string>();
  return [...usual, ...used.toSorted((a, b) => a.localeCompare(b))].filter((v) => {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const INPUT_TYPES: Record<string, string> = { date: "date", email: "email", phone: "tel" };
const PLACEHOLDERS: Partial<Record<EmployeeFieldKey, string>> = {
  Email: "name@company.com",
  MobilePersonal: "e.g. 99931 17108",
  MobileOfficial: "e.g. 7253000640",
};

export default function EmployeeForm({ employee, options, onClose, onSaved }: EmployeeFormProps) {
  const [values, setValues] = useState<Record<EmployeeFieldKey, string>>(() => {
    const initial = {} as Record<EmployeeFieldKey, string>;
    for (const f of EMPLOYEE_FIELDS) {
      const raw = employee?.[f.key] ?? "";
      initial[f.key] = "type" in f && f.type === "date" ? toDateInput(raw || null) : String(raw);
    }
    if (!employee) {
      initial.CreationDate = today();
      initial.Status = "Active";
    }
    return initial;
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Suggestions: values already used plus the sheet's usual ones.
  const suggestions: Partial<Record<EmployeeFieldKey, string[]>> = {
    Unit: merge(SUGGESTED_UNITS, options?.Unit),
    EmployeeLevel: merge(SUGGESTED_LEVELS, options?.EmployeeLevel),
    Designation: merge(SUGGESTED_DESIGNATIONS, options?.Designation),
    BaseLocation: merge([], options?.BaseLocation),
    Department: merge(SUGGESTED_DEPARTMENTS, options?.Department),
    ReportingTo: merge([], options?.ReportingTo),
    SystemRequirement: merge(SUGGESTED_SYSTEM_REQUIREMENTS, options?.SystemRequirement),
  };

  const set = (key: EmployeeFieldKey, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.DisplayName.trim()) {
      setError("Display Name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const body: EmployeeInput = { ...values };
      await readJson(
        await fetch(employee ? `/api/employees/${employee.Id}` : "/api/employees", {
          method: employee ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      onSaved(employee ? `${values.DisplayName.trim()} updated.` : `${values.DisplayName.trim()} added.`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      size="xl"
      title={employee ? `Edit ${employee.DisplayName}` : "Add New Joiner"}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="employee-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? "Saving..." : employee ? "Save Changes" : "Add Employee"}
          </button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          {EMPLOYEE_FIELDS.map((f) => {
            const id = `emp-${f.key}`;
            const type = "type" in f ? f.type : "text";
            const required = "required" in f && f.required;
            const wide = f.key === "CorrespondenceAddress" ? "sm:col-span-3" : f.key === "DisplayName" || f.key === "Email" ? "sm:col-span-2" : "";
            const list = suggestions[f.key];
            return (
              <div key={f.key} className={wide}>
                <label htmlFor={id} className="label">
                  {f.label} {required && <span className="text-red-600">*</span>}
                </label>
                {type === "status" ? (
                  <select id={id} className="field" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                    {EMPLOYEE_STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                ) : list ? (
                  <OptionSelect id={id} value={values[f.key]} options={list} onChange={(v) => set(f.key, v)} label={f.label} maxLength={"max" in f ? f.max : undefined} />
                ) : f.key === "CorrespondenceAddress" ? (
                  <textarea id={id} className="field" rows={2} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} maxLength={f.max} />
                ) : (
                  <input
                    id={id}
                    type={INPUT_TYPES[type] ?? "text"}
                    className="field"
                    value={values[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    maxLength={"max" in f ? f.max : undefined}
                    required={required}
                    autoFocus={f.key === "DisplayName"}
                    placeholder={PLACEHOLDERS[f.key]}
                  />
                )}
              </div>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
