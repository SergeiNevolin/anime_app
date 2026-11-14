import type { Metadata, Viewport } from "next";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="bg-bg text-text antialiased">
        <TelegramProvider>
          <QueryProvider>{children}</QueryProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
