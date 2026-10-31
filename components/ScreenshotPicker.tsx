"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Undo2, X } from "lucide-react";
import { randomId } from "@/lib/client-id";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, type IssueImage } from "@/lib/types";

export interface PendingFile {
  key: string;
  file: File;
  previewUrl: string;
}

interface ScreenshotPickerProps {
  existing: IssueImage[];
  srcFor: (imageId: number) => string;
  pending: PendingFile[];
  setPending: React.Dispatch<React.SetStateAction<PendingFile[]>>;
  removedIds: number[];
  setRemovedIds: React.Dispatch<React.SetStateAction<number[]>>;
  saving: boolean;
  progress: number;
}

/** Screenshot upload area: new files with previews, plus existing images that can be marked for removal. */
export default function ScreenshotPicker({ existing, srcFor, pending, setPending, removedIds, setRemovedIds, saving, progress }: ScreenshotPickerProps) {
  const [fileError, setFileError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Release preview object URLs when the form closes.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const errors: string[] = [];
    const accepted: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) errors.push(`${file.name}: only JPEG, PNG, or WebP images are allowed.`);
      else if (file.size > MAX_IMAGE_BYTES) errors.push(`${file.name}: larger than 5 MB.`);
      else accepted.push({ key: randomId(), file, previewUrl: URL.createObjectURL(file) });
    }
    setPending((prev) => [...prev, ...accepted]);
    setFileError(errors.join(" "));
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePending(key: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.key === key);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  function toggleExisting(imageId: number) {
    setRemovedIds((prev) => (prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]));
  }

  return (
    <div>
      <span className="label">Screenshots</span>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={saving}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 hover:border-blue-400 hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none"
      >
        <ImagePlus size={20} className="text-slate-400" />
        <span>
          <span className="font-medium text-blue-600">Choose images</span> to attach
        </span>
        <span className="text-xs text-slate-400">JPEG, PNG, or WebP · max 5 MB each</span>
      </button>
      <input ref={fileInput} type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} multiple hidden onChange={(e) => addFiles(e.target.files)} />
      {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}

      {(existing.length > 0 || pending.length > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {existing.map((img) => {
            const removed = removedIds.includes(img.ImageId);
            return (
              <div key={img.ImageId} className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={srcFor(img.ImageId)} alt={img.OriginalFileName ?? "Screenshot"} className={`h-full w-full object-cover ${removed ? "opacity-30 grayscale" : ""}`} />
                {removed && <span className="absolute inset-x-0 bottom-0 bg-red-600/90 py-0.5 text-center text-[10px] font-medium text-white">Will be removed</span>}
                <button
                  type="button"
                  onClick={() => toggleExisting(img.ImageId)}
                  disabled={saving}
                  className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-slate-700 shadow-sm hover:bg-surface hover:text-red-600"
                  aria-label={removed ? "Keep image" : "Remove image"}
                  title={removed ? "Keep image" : "Remove image"}
                >
                  {removed ? <Undo2 size={14} /> : <X size={14} />}
                </button>
              </div>
            );
          })}
          {pending.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-md border border-blue-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-blue-600/90 px-1 py-0.5 text-center text-[10px] font-medium text-white">New</span>
              <button
                type="button"
                onClick={() => removePending(p.key)}
                disabled={saving}
                className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-slate-700 shadow-sm hover:bg-surface hover:text-red-600"
                aria-label="Remove image"
                title="Remove image"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {saving && pending.length > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
