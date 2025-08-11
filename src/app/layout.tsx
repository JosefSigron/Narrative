import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SumViz",
  description: "AI-powered data storytelling and visualization.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <div className="min-h-screen flex flex-col">
          <div className="top-accent absolute inset-x-0 top-0 h-48 pointer-events-none -z-10" aria-hidden />
          <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-marian_blue-500/30 bg-marian_blue-500/10 border-b border-pacific_cyan-500/20">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-foreground">SumViz</span>
                <span className="text-xs opacity-80 text-foreground">Data Storyteller</span>
              </a>
              <nav className="text-sm flex items-center gap-2">
                <a href="/dashboard" className="px-3 py-1.5 rounded border border-pacific_cyan-500/20 hover:bg-pacific_cyan-500/10 text-foreground">Dashboard</a>
                <a href="/report" className="px-3 py-1.5 rounded border border-pacific_cyan-500/20 hover:bg-pacific_cyan-500/10 text-foreground">Reports</a>
              </nav>
            </div>
          </header>
          <TooltipProvider>
            <main className="flex-1 bg-background">
              {children}
            </main>
            <footer className="border-t border-pacific_cyan-500/20">
              <div className="max-w-6xl mx-auto px-6 py-5 text-sm opacity-80">
                © {new Date().getFullYear()} SumViz.
              </div>
            </footer>
            <Toaster richColors closeButton />
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}
