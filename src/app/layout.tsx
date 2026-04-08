import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import SessionProvider from "@/components/providers/SessionProvider";

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
    <html lang="ru" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <SessionProvider>
          <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col ml-60">
              <Header />
              <main className="flex-1 overflow-auto mt-14 bg-[#0a0a0a]">
                {children}
              </main>
            </div>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
