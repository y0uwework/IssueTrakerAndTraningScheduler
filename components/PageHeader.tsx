import type { ReactNode } from "react";
import { sidebarItem, type SidebarHref } from "@/lib/sidebar-config";

// Page heading + subtitle taken from the sidebar config, with optional action buttons on the right. 
export default function PageHeader({ href, children }: { href: SidebarHref; children?: ReactNode }) {
  const { title, description } = sidebarItem(href);
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </header>
  );
}
