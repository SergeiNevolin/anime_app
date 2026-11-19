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
    <div
      className={`flex flex-col bg-bg ${className ?? ""}`}
      style={{ minHeight: "var(--app-viewport-height, 100dvh)" }}
    >
      {/* In fullscreen mode the Telegram interface floats above the page, so
          the sticky header steps aside by the sum of the device and content
          safe areas. */}
      <header
        className="sticky top-0 z-20 border-b border-border bg-header"
        style={{
          paddingTop: "var(--app-safe-area-top, env(safe-area-inset-top, 0px))",
        }}
      >
        <div
          className="mx-auto flex min-h-12 max-w-3xl items-center gap-2 px-4 py-2"
          style={{
            paddingLeft: "calc(1rem + var(--app-safe-area-left, 0px))",
            paddingRight: "calc(1rem + var(--app-safe-area-right, 0px))",
          }}
        >
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

      <main
        className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-3"
        style={{
          paddingLeft: "calc(1rem + var(--app-safe-area-left, 0px))",
          paddingRight: "calc(1rem + var(--app-safe-area-right, 0px))",
        }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
