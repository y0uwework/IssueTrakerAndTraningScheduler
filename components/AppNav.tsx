"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bug, GraduationCap, Users } from "lucide-react";

const LINKS = [
  { href: "/", label: "Issues", icon: Bug },
  { href: "/employees", label: "New Joiners", icon: Users },
  { href: "/training-records", label: "Training Records", icon: GraduationCap },
];

export default function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex justify-center overflow-y-hidden gap-1 overflow-x-auto  w-full">
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
    </nav>
  );
}
