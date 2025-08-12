import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import "./globals.css";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { auth, signOut } from "@/auth/config";
import ThemeToggle from "@/components/ThemeToggle";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`} suppressHydrationWarning>
        <div className="min-h-screen flex flex-col">
          <div className="top-accent absolute inset-x-0 top-0 h-48 pointer-events-none -z-10" aria-hidden />
          <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-saffron-500/20 bg-saffron-500/10 border-b border-burnt_sienna-500/20">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
              <a href="/" className="flex items-center gap-3">
                <Image src="/SumViz_logo.jpg" alt="SumViz" width={28} height={28} className="rounded-sm" />
                <div className="flex flex-col leading-tight">
                  <span className="font-semibold tracking-tight text-black dark:text-foreground">SumViz</span>
                  <span className="text-xs opacity-80 text-black dark:text-foreground">Data Storyteller</span>
                </div>
              </a>
              <nav className="text-sm flex items-center gap-2">
                <a href="/dashboard" className="px-3 py-1.5 rounded border border-burnt_sienna-500/30 hover:bg-burnt_sienna-500/10 text-black dark:text-foreground">Dashboard</a>
                <a href="/report" className="px-3 py-1.5 rounded border border-burnt_sienna-500/30 hover:bg-burnt_sienna-500/10 text-black dark:text-foreground">Reports</a>
                <ThemeToggle />
                {session?.user ? (
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded border border-burnt_sienna-500/30 text-black dark:text-foreground hover:bg-burnt_sienna-500/10"
                    >
                      Logout
                    </button>
                  </form>
                ) : null}
              </nav>
            </div>
          </header>
          <TooltipProvider>
            <main className="flex-1 bg-background">
              {children}
            </main>
            <footer className="border-t border-burnt_sienna-500/20">
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
