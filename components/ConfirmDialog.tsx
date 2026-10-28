"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import Modal from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel = "Delete", busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      size="sm"
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy} autoFocus>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle size={18} />
        </div>
        <div className="text-sm text-slate-600">{message}</div>
      </div>
    </Modal>
  );
}
