import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rekomendasi Saham IDX80",
  description: "Sistem rekomendasi saham otomatis untuk pasar Indonesia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="layout">
          <nav className="navbar">
            <span className="navbar-brand">📈 Saham IDX80</span>
            <a href="/" className="navbar-link">
              Dashboard
            </a>
            <a href="/logs" className="navbar-link">
              Log Cron
            </a>
            <a href="/debug" className="navbar-link">
              Debug Skor
            </a>
          </nav>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
