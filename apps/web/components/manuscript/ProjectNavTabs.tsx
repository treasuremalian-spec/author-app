"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function ProjectNavTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: `/projects/${projectId}`, label: "Write" },
    { href: `/projects/${projectId}/overview`, label: "Overview" },
    { href: `/projects/${projectId}/story-bible`, label: "Story Bible" },
    { href: `/projects/${projectId}/format`, label: "Format & Export" },
  ];

  return (
    <nav className="ml-2 flex h-8 items-center gap-5">
      {tabs.map((tab) => {
        const active =
          tab.label === "Write" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex h-full items-center border-b-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors",
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
