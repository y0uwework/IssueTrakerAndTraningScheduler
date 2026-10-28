"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import ScreenshotPicker, { type PendingFile } from "./ScreenshotPicker";
import { sendForm } from "@/lib/http";
import { APPS, DEFAULT_CATEGORIES, PRIORITIES, STATUSES, imageUrl, type IssueWithImages } from "@/lib/types";

interface IssueFormProps {
  issue: IssueWithImages | null; // null = create
  categories: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function IssueForm({ issue, categories, onClose, onSaved }: IssueFormProps) {
  const [title, setTitle] = useState(issue?.Title ?? "");
  const [app, setApp] = useState<string>(issue?.App ?? "");
  const [description, setDescription] = useState(issue?.Description ?? "");
  const [category, setCategory] = useState(issue?.Category ?? "");
  const [priority, setPriority] = useState<string>(issue?.Priority ?? "Medium");
  const [status, setStatus] = useState<string>(issue?.Status ?? "Open");
  const [raisedBy, setRaisedBy] = useState(issue?.RaisedBy ?? "");
  const [assignedTo, setAssignedTo] = useState(issue?.AssignedTo ?? "");

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const categoryOptions = [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!app) {
      setError("Please select the app this issue is in.");
      return;
    }
    setError("");
    setSaving(true);
    setProgress(0);

    const body = new FormData();
    body.set("title", title);
    body.set("app", app);
    body.set("description", description);
    body.set("category", category);
    body.set("priority", priority);
    body.set("status", status);
    body.set("raisedBy", raisedBy);
    body.set("assignedTo", assignedTo);
    pending.forEach((p) => body.append("images", p.file, p.file.name));
    removedIds.forEach((id) => body.append("removeImageIds", String(id)));

    try {
      const res = await sendForm(issue ? "PUT" : "POST", issue ? `/api/issues/${issue.Id}` : "/api/issues", body, setProgress);
      if (!res.ok) throw new Error(res.data.error || "Could not save the issue.");
      onSaved(issue ? `Issue #${issue.Id} updated.` : "Issue created.");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={issue ? `Edit Issue #${issue.Id}` : "New Issue"}
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="issue-form" className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? (pending.length > 0 && progress < 100 ? `Uploading ${progress}%` : "Saving...") : issue ? "Save Changes" : "Create Issue"}
          </button>
        </>
      }
    >
      <form id="issue-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="label">
              Title <span className="text-red-600">*</span>
            </label>
            <input id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus />
          </div>
          <div>
            <label htmlFor="app" className="label">
              App <span className="text-red-600">*</span>
            </label>
            <select id="app" className="field" value={app} onChange={(e) => setApp(e.target.value)} required>
              <option value="" disabled>
                Select app
              </option>
              {APPS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="description" className="label">Description</label>
          <textarea id="description" className="field min-h-24" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={20000} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="category" className="label">Category</label>
            <input id="category" className="field" list="category-options" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} placeholder="e.g. Bug" />
            <datalist id="category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="priority" className="label">Priority</label>
            <select id="priority" className="field" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="raisedBy" className="label">Raised By</label>
            <input id="raisedBy" className="field" value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label htmlFor="assignedTo" className="label">Assigned To</label>
            <input id="assignedTo" className="field" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} maxLength={100} />
          </div>
        </div>

        <ScreenshotPicker
          existing={issue?.images ?? []}
          srcFor={imageUrl}
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
