"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import Modal from "./Modal";
import Lightbox, { ScreenshotGallery } from "./Lightbox";
import StatusBadge, { AppBadge, PriorityBadge } from "./StatusBadge";
import { formatDateTime, imageUrl, type IssueWithImages } from "@/lib/types";

interface IssueDetailsProps {
  issue: IssueWithImages;
  onClose: () => void;
  onEdit: () => void;
}

export default function IssueDetails({ issue, onClose, onEdit }: IssueDetailsProps) {
  const [viewing, setViewing] = useState<number | null>(null);

  const meta: [string, React.ReactNode][] = [
    ["App", <AppBadge key="a" app={issue.App} />],
    ["Category", issue.Category || "—"],
    ["Priority", <PriorityBadge key="p" priority={issue.Priority} />],
    ["Status", <StatusBadge key="s" status={issue.Status} />],
    ["Raised By", issue.RaisedBy || "—"],
    ["Assigned To", issue.AssignedTo || "—"],
    ["Raised", formatDateTime(issue.RaisedAt)],
    ["Last Updated", formatDateTime(issue.UpdatedAt)],
  ];
  if (issue.ResolvedAt) meta.push([issue.Status === "Closed" ? "Closed" : "Resolved", formatDateTime(issue.ResolvedAt)]);

  return (
    <>
      <Modal
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-500">#{issue.Id}</span>
            <span>Issue Details</span>
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
        <h3 className="text-lg font-semibold break-words text-slate-900">{issue.Title}</h3>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          {meta.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-0.5 truncate text-sm text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Description</h4>
          <p className="mt-1.5 text-sm whitespace-pre-wrap break-words text-slate-700">
            {issue.Description || <span className="text-slate-400 italic">No description provided.</span>}
          </p>
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Screenshots ({issue.images.length})</h4>
          <ScreenshotGallery images={issue.images} srcFor={imageUrl} onOpen={setViewing} />
        </div>
      </Modal>

      {viewing !== null && <Lightbox images={issue.images} srcFor={imageUrl} index={viewing} onChange={setViewing} onClose={() => setViewing(null)} />}
    </>
  );
}
