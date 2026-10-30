"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, GraduationCap, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "Issues", icon: Bug },
  { href: "/employees", label: "New Joiners", icon: Users },
  { href: "/training-records", label: "Training Records", icon: GraduationCap },
];

export default function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center border-b border-slate-200 bg-surface px-2">
      {/* Spacer matching the toggle so the links stay centered */}
      <div className="w-8 shrink-0" aria-hidden />
      <div className="mx-auto flex min-w-0 flex-1 justify-center overflow-y-hidden gap-1 overflow-x-auto">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap ${
                active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={16} /> {label}
            </Link>
          );
        })}
      </div>
      <div className="shrink-0">
        <ThemeToggle />
      </div>
    </nav>
  );
}
