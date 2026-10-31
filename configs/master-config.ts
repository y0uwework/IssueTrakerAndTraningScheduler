// Master lists: the single source of truth for every app and trainer dropdown, filter and
// validation in the app (client and server). Change them here only.
//
// - App names are stored in the database as text (max 20 characters). Renaming an app that is
//   already in use needs a migration that updates the existing rows.
// - Trainer names are matched case-insensitively and saved exactly as written here.
export const MASTER_CONFIG = {
  apps: ["HRMS", "CRM", "Prod CRM"],
  trainers: ["Vibhas Panday", "Yuvraj Singh"],
} as const;

export const APPS = MASTER_CONFIG.apps;
export const TRAINERS = MASTER_CONFIG.trainers;

export type App = (typeof APPS)[number];
export type Trainer = (typeof TRAINERS)[number];

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

// The configured spelling of a trainer name, or undefined when it isn't in the list.
export function findTrainer(name: string): Trainer | undefined {
  const key = normalize(name);
  return TRAINERS.find((t) => normalize(t) === key);
}

export const isApp = (value: unknown): value is App => typeof value === "string" && (APPS as readonly string[]).includes(value);
