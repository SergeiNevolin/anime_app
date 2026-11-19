import type { Metadata, Viewport } from "next";

import { DEFAULT_RUNTIME_CONFIG } from "@/lib/runtime-config";
import { QueryProvider } from "@/providers/query-provider";
import { TelegramProvider } from "@/providers/telegram-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Anime Watch",
  description: "Поиск, каталогизация и просмотр аниме в Telegram",
  applicationName: "Anime Watch",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#131314" },
  ],
};

// The public configuration is rendered from the container environment, so every
// request has to be rendered on the server: a prerendered shell would freeze
// the values that were present at build time.
export const dynamic = "force-dynamic";

/** Build the inline script that hands the environment to the browser. */
function runtimeConfigScript(): string {
  const apiBaseUrl =
    process.env.API_URL?.trim() || DEFAULT_RUNTIME_CONFIG.apiBaseUrl;
  const config = {
    apiBaseUrl,
    devAuthEnabled: process.env.DEV_AUTH_ENABLED === "true",
  };
  // `</script>` inside the JSON would close the tag, so `<` is escaped.
  return `window.__ANIME_WATCH_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")};`;
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          id="runtime-config"
          dangerouslySetInnerHTML={{ __html: runtimeConfigScript() }}
        />
      </head>
      <body className="bg-bg text-text antialiased">
        <TelegramProvider>
          <QueryProvider>{children}</QueryProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
