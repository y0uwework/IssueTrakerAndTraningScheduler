"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { SIDEBAR_CONFIG, isActive } from "@/lib/sidebar-config";

// Left sidebar, built from lib/sidebar-config.ts.
// Below the md breakpoint it collapses to an icon-only rail (labels become tooltips).
export default function AppNav() {
  const pathname = usePathname();
  const { appName, appIcon: AppIcon, items } = SIDEBAR_CONFIG;

  return (
    <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col border-r border-slate-200 bg-surface md:w-56">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
          <AppIcon size={16} />
        </span>
        <span className="hidden truncate text-sm font-semibold text-slate-900 md:inline">{appName}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2" aria-label="Main">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium md:justify-start ${
                active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden truncate md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex justify-center border-t border-slate-200 p-2 md:justify-start">
        <ThemeToggle />
      </div>
    </aside>
  );
}
