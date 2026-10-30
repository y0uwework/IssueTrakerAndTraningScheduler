"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { IssueImage } from "@/lib/types";

interface LightboxProps {
  images: IssueImage[];
  srcFor: (imageId: number) => string;
  index: number;
  onChange: (i: number) => void;
  onClose: () => void;
}

export default function Lightbox({ images, srcFor, index, onChange, onClose }: LightboxProps) {
  const img = images[index];
  const multiple = images.length > 1;
  const prev = () => onChange((index - 1 + images.length) % images.length);
  const next = () => onChange((index + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && multiple) onChange((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && multiple) onChange((index + 1) % images.length);
      else return;
      e.stopImmediatePropagation();
    };
    // Capture phase so Escape closes only the lightbox, not the details modal underneath.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, images.length, multiple, onChange, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/85">
        <span className="truncate">
          {img.OriginalFileName} {multiple && <span className="text-white/55">· {index + 1} / {images.length}</span>}
        </span>
        <div className="flex items-center gap-1">
          <a href={srcFor(img.ImageId)} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-white/75 hover:bg-white/10 hover:text-white">
            Open original
          </a>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {multiple && (
          <button type="button" onClick={prev} className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Previous image">
            <ChevronLeft size={22} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={srcFor(img.ImageId)} alt={img.OriginalFileName ?? "Screenshot"} className="max-h-full max-w-full rounded object-contain shadow-2xl" />
        {multiple && (
          <button type="button" onClick={next} className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Next image">
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Thumbnail grid that opens the lightbox on click. */
export function ScreenshotGallery({ images, srcFor, onOpen }: { images: IssueImage[]; srcFor: (imageId: number) => string; onOpen: (i: number) => void }) {
  if (images.length === 0) return <p className="mt-1.5 text-sm text-white/55 italic">No screenshots attached.</p>;
  return (
    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
      {images.map((img, i) => (
        <button
          key={img.ImageId}
          type="button"
          onClick={() => onOpen(i)}
          className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none"
          title={img.OriginalFileName ?? undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={srcFor(img.ImageId)} alt={img.OriginalFileName ?? "Screenshot"} className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
