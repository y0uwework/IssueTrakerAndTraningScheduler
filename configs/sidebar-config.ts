import type { Metadata } from "next";
import { Bug, GraduationCap, LayoutGrid, Users, type LucideIcon } from "lucide-react";
import { APPS } from "./master-config";

// "HRMS, CRM and Prod CRM" from the master config.
const appList = APPS.length > 1 ? `${APPS.slice(0, -1).join(", ")} and ${APPS.at(-1)}` : APPS.join("");

export interface SidebarItem {
  href: string;
  // Text in the sidebar link. 
  label: string;
  icon: LucideIcon;
  // Page heading and browser tab title. 
  title: string;
  // Subtitle under the page heading, and the page's meta description.
  description: string;
}


// Single source for the app's navigation: the sidebar (components/AppNav.tsx),
// each page's heading (components/PageHeader.tsx) and each route's <title>/description.
// Add a page here and it appears everywhere.
 
export const SIDEBAR_CONFIG = {
  appName: "Issue Tracker",
  appIcon: LayoutGrid as LucideIcon,
  items: [
    {
      href: "/",
      label: "Issues",
      icon: Bug,
      title: "Issue Tracker",
      description: "Track, manage, and resolve reported issues.",
    },
    {
      href: "/employees",
      label: "New Joiners",
      icon: Users,
      title: "New Joiners",
      description: `Employee details from the HR joining sheet, with their ${appList} training status.`,
    },
    {
      href: "/training-records",
      label: "Training Records",
      icon: GraduationCap,
      title: "Training Records",
      description: `Schedule ${appList} training and record who was trained, by whom.`,
    },
  ] satisfies SidebarItem[],
};

export type SidebarHref = (typeof SIDEBAR_CONFIG.items)[number]["href"];

export function sidebarItem(href: SidebarHref): SidebarItem {
  return SIDEBAR_CONFIG.items.find((item) => item.href === href)!;
}

// Whether a sidebar link should be highlighted for the current path. 
export function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Route metadata (<title> and description) from the sidebar entry. 
export function pageMetadata(href: SidebarHref): Metadata {
  const { title, description } = sidebarItem(href);
  return { title, description };
}
