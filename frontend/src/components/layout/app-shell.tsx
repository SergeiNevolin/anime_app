"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { BottomNav } from "@/components/layout/bottom-nav";
import { getTelegram } from "@/lib/telegram/webapp";

/**
 * The frame of the application: a sticky header, the content and the
 * navigation.
 *
 * The height of the viewport follows the Mini App viewport, so the layout
 * stays correct when the Telegram keyboard opens or the header is hidden.
 */
export function AppShell({
  title,
  subtitle,
  back = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const webApp = getTelegram();
    if (!back) {
      webApp.BackButton.hide();
      return;
    }
    const handler = () => router.back();
    webApp.BackButton.onClick(handler);
    webApp.BackButton.show();
    return () => {
      webApp.BackButton.offClick(handler);
      webApp.BackButton.hide();
    };
  }, [back, router]);

  return (
    <div className={`flex min-h-dvh flex-col bg-bg ${className ?? ""}`}>
      <header className="sticky top-0 z-20 border-b border-border bg-header">
        <div className="mx-auto flex min-h-12 max-w-3xl items-center gap-2 px-4 py-2">
          {back ? (
            <button
              type="button"
              aria-label="Назад"
              onClick={() => router.back()}
              className="-ml-1 flex h-8 w-8 items-center justify-center rounded-control text-lg text-text-muted hover:bg-surface-muted"
            >
              ‹
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight text-text">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[12px] leading-tight text-text-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-3">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
