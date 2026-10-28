// Shared types and constants. Safe to import from both client and server code.

export const APPS = ["HRMS", "CRM"] as const;
export const STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const DEFAULT_CATEGORIES = ["Bug", "Feature Request", "UI / UX", "Performance", "Hardware", "Network", "Other"];

export type App = (typeof APPS)[number];
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface Issue {
  Id: number;
  Title: string;
  App: App;
  Description: string | null;
  Category: string | null;
  Priority: Priority;
  Status: Status;
  RaisedBy: string | null;
  AssignedTo: string | null;
  RaisedAt: string;
  UpdatedAt: string;
  ResolvedAt: string | null;
}

export interface IssueListItem extends Issue {
  ImageCount: number;
}

export interface IssueImage {
  ImageId: number;
  OriginalFileName: string | null;
  UploadedAt: string;
}

export interface IssueWithImages extends Issue {
  images: IssueImage[];
}

export interface IssueStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
}

export interface IssueListResponse {
  issues: IssueListItem[];
  stats: IssueStats;
  categories: string[];
}

export function imageUrl(imageId: number) {
  return `/api/images/${imageId}`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Converts a UTC timestamp to the "YYYY-MM-DDTHH:mm" local value used by <input type="datetime-local">. */
export function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/* ---------------- Training Records ---------------- */

export const TRAINING_STATUSES = ["Scheduled", "Completed", "Cancelled"] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const TRAINING_MODES = ["F2F", "Online"] as const;
export type TrainingMode = (typeof TRAINING_MODES)[number];
export const TRAINING_MODE_LABELS: Record<TrainingMode, string> = { F2F: "Face to face", Online: "Online" };

/** True for an absolute http(s) URL, e.g. a Teams / Meet / Zoom link. */
export function isMeetingLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const MAX_TRAINERS = 20;
export const MAX_ATTENDEES = 300;

export interface TrainingSession {
  Id: number;
  Title: string;
  StartAt: string;
  EndAt: string | null;
  Mode: TrainingMode;
  Location: string | null;
  MeetingLink: string | null;
  Status: TrainingStatus;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface TrainingSessionListItem extends Omit<TrainingSession, "Notes"> {
  Trainers: string | null; // comma-separated
  Apps: string | null; // comma-separated
  AttendeeCount: number;
  EmployeeCount: number;
  ImageCount: number;
}

export interface TrainingAttendee {
  EmployeeName: string;
  EmployeeCode: string | null;
  Department: string | null;
  App: App;
  Trainers: string[];
}

export interface TrainingSessionDetail extends TrainingSession {
  trainers: string[];
  attendees: TrainingAttendee[];
  images: IssueImage[];
}

/** One employee trained on one app in one session. */
export interface TrainingRecordRow {
  AttendeeId: number;
  SessionId: number;
  Title: string;
  StartAt: string;
  Status: TrainingStatus;
  EmployeeName: string;
  EmployeeCode: string | null;
  Department: string | null;
  App: App;
  Trainers: string | null; // comma-separated
}

export interface TrainingStats {
  total: number;
  upcoming: number;
  completed: number;
  employeesTrained: number;
}

export interface KnownEmployee {
  EmployeeName: string;
  EmployeeCode: string | null;
  Department: string | null;
}

export interface TrainingListResponse {
  sessions?: TrainingSessionListItem[];
  records?: TrainingRecordRow[];
  stats: TrainingStats;
  trainers: string[];
  employees: KnownEmployee[];
  departments: string[];
}

export function trainingImageUrl(imageId: number) {
  return `/api/training/images/${imageId}`;
}
