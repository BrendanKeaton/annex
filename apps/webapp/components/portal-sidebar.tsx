"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Profile", href: "/portal/profile" },
  { label: "Organization", href: "/portal/organization" },
  { label: "Subscription", href: "/portal/subscription" },
];

export function PortalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 border-r border-white/8 flex flex-col py-10 px-4 min-h-screen sticky top-0 h-screen">
      <p className="text-xs font-mono text-annex-dark-gray uppercase tracking-wider px-3 mb-3">
        Settings
      </p>
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded-md text-sm font-mono transition-colors ${
                active
                  ? "bg-white/6 text-white"
                  : "text-annex-dark-gray hover:text-white hover:bg-white/4"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
