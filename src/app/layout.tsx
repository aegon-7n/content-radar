import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import SessionProvider from "@/components/providers/SessionProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "ContentRadar",
  description: "Аналитика контента",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <SessionProvider>
            <AppShell>{children}</AppShell>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
