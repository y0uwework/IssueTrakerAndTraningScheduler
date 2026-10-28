import type { App, Priority, Status, TrainingStatus } from "@/lib/types";

const APP_STYLES: Record<App, string> = {
  HRMS: "bg-violet-50 text-violet-700 ring-violet-600/20",
  CRM: "bg-teal-50 text-teal-700 ring-teal-600/20",
};

export function AppBadge({ app }: { app: App }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${APP_STYLES[app] ?? "bg-slate-100 text-slate-600 ring-slate-500/20"}`}>
      {app}
    </span>
  );
}

const STATUS_STYLES: Record<Status, string> = {
  Open: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-600/20",
  Resolved: "bg-green-50 text-green-700 ring-green-600/20",
  Closed: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const PRIORITY_DOTS: Record<Priority, string> = {
  Low: "bg-slate-400",
  Medium: "bg-blue-500",
  High: "bg-orange-500",
  Critical: "bg-red-600",
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const critical = priority === "Critical";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${
        critical ? "rounded-full bg-red-50 px-2 py-0.5 text-red-700 ring-1 ring-inset ring-red-600/20" : "text-slate-700"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${PRIORITY_DOTS[priority]}`} />
      {priority}
    </span>
  );
}

const TRAINING_STATUS_STYLES: Record<TrainingStatus, string> = {
  Scheduled: "bg-blue-50 text-blue-700 ring-blue-600/20",
  Completed: "bg-green-50 text-green-700 ring-green-600/20",
  Cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function TrainingStatusBadge({ status }: { status: TrainingStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TRAINING_STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}
