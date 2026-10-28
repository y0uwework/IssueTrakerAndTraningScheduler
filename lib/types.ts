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

/** A trainer assigned to one app in a session. */
export interface TrainerAssignment {
  App: App;
  TrainerName: string;
}

export interface TrainingAttendee {
  EmployeeId: number;
  DisplayName: string;
  Email: string | null;
  Designation: string | null;
  Department: string | null;
  Unit: string | null;
  App: App;
  Trainers: string[];
}

export interface TrainingSessionDetail extends TrainingSession {
  trainers: TrainerAssignment[];
  attendees: TrainingAttendee[];
  images: IssueImage[];
}

/** One new joiner trained on one app in one session. */
export interface TrainingRecordRow {
  AttendeeId: number;
  SessionId: number;
  Title: string;
  StartAt: string;
  Status: TrainingStatus;
  EmployeeId: number;
  DisplayName: string;
  Email: string | null;
  Unit: string | null;
  Designation: string | null;
  Department: string | null;
  DateOfJoining: string | null;
  App: App;
  Trainers: string | null; // comma-separated
}

export interface TrainingStats {
  total: number;
  upcoming: number;
  completed: number;
  employeesTrained: number;
}

export interface TrainingListResponse {
  sessions?: TrainingSessionListItem[];
  records?: TrainingRecordRow[];
  stats: TrainingStats;
  trainers: string[];
}

export function trainingImageUrl(imageId: number) {
  return `/api/training/images/${imageId}`;
}

/* ---------------- New Joiners (employees) ---------------- */

export const EMPLOYEE_STATUSES = ["Active", "Inactive"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** Per-app training progress: Trained = in a Completed session, Scheduled = in a Scheduled one. */
export const APP_TRAINING_STATES = ["Pending", "Scheduled", "Trained"] as const;
export type AppTrainingState = (typeof APP_TRAINING_STATES)[number];

// Suggestions offered in the form; any other value can still be typed.
export const SUGGESTED_UNITS = ["SALES", "PLANT"];
export const SUGGESTED_LEVELS = ["Junior", "Senior"];
export const SUGGESTED_SYSTEM_REQUIREMENTS = ["Laptop", "Desktop", "Not Required"];

export interface Employee {
  Id: number;
  CreationDate: string | null; // DATE, serialized as midnight UTC
  Unit: string | null;
  DisplayName: string;
  EmployeeLevel: string | null;
  Email: string | null;
  DateOfJoining: string | null;
  Designation: string | null;
  BaseLocation: string | null;
  Department: string | null;
  ReportingTo: string | null;
  MobilePersonal: string | null;
  MobileOfficial: string | null;
  SystemRequirement: string | null;
  CorrespondenceAddress: string | null;
  Status: EmployeeStatus;
  CreatedAt: string;
  UpdatedAt: string;
}

/** Editable employee columns, in the same order as the HR new-joiner sheet. */
export const EMPLOYEE_FIELDS = [
  { key: "CreationDate", label: "Date of Creation", type: "date" },
  { key: "Unit", label: "Unit", max: 50 },
  { key: "DisplayName", label: "Display Name", max: 100, required: true },
  { key: "EmployeeLevel", label: "Level", max: 30 },
  { key: "Email", label: "User Email ID", max: 200, type: "email" },
  { key: "DateOfJoining", label: "Date of Joining", type: "date" },
  { key: "Designation", label: "Designation", max: 100 },
  { key: "BaseLocation", label: "Base Location", max: 200 },
  { key: "Department", label: "Department", max: 100 },
  { key: "ReportingTo", label: "Reporting To", max: 100 },
  { key: "MobilePersonal", label: "Mobile Personal", max: 20, type: "phone" },
  { key: "MobileOfficial", label: "Mobile Official", max: 20, type: "phone" },
  { key: "SystemRequirement", label: "System Requirement", max: 100 },
  { key: "CorrespondenceAddress", label: "Correspondence Address", max: 500 },
  { key: "Status", label: "Status", type: "status" },
] as const satisfies readonly { key: keyof Employee; label: string; max?: number; type?: string; required?: boolean }[];

export type EmployeeFieldKey = (typeof EMPLOYEE_FIELDS)[number]["key"];
export type EmployeeInput = Partial<Record<EmployeeFieldKey, string | null>>;

export interface EmployeeListItem extends Employee {
  HrmsTraining: AppTrainingState;
  CrmTraining: AppTrainingState;
}

export interface EmployeeStats {
  total: number;
  active: number;
  hrmsTrained: number;
  crmTrained: number;
}

export interface EmployeeListResponse {
  employees: EmployeeListItem[];
  stats: EmployeeStats;
  options: Record<"Unit" | "Department" | "Designation" | "EmployeeLevel" | "ReportingTo" | "SystemRequirement" | "BaseLocation", string[]>;
}

export interface EmployeeTrainingHistory {
  SessionId: number;
  Title: string;
  StartAt: string;
  Status: TrainingStatus;
  App: App;
  Trainers: string | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  training: EmployeeTrainingHistory[];
}

export interface EmployeeImportResult {
  inserted: number;
  updated: number;
  errors: { row: number; message: string }[];
  actions: { row: number; action: "insert" | "update" }[];
}

/** Rows read from images by the AI, before review. */
export interface EmployeeExtractResponse {
  provider: string;
  model: string;
  rows: { source: string; values: EmployeeInput }[];
}

/** Formats a DATE column (stored as midnight UTC) without shifting it into the previous day. */
export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

/** "YYYY-MM-DD" for <input type="date"> from a DATE column. */
export function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}
