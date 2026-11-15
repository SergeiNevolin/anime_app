"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/", label: "Главная", icon: "⌂" },
  { href: "/library", label: "Библиотека", icon: "▤" },
] as const;

/**
 * The compact navigation of the application.
 *
 * The layout follows the classic mobile application pattern: a fixed bar at
 * the bottom of the viewport and a scrollable content area.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-3xl border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px]",
                  active ? "text-accent" : "text-text-muted",
                )}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
