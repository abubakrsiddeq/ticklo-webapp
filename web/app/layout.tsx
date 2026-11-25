import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { SITE_NAME, TAGLINE } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: `${SITE_NAME} – university event tickets`, template: `%s · ${SITE_NAME}` },
  description: `Book tickets for university society events across Pakistan. ${TAGLINE}`,
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  openGraph: { siteName: SITE_NAME, type: "website", locale: "en_PK" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{isSupabaseConfigured ? children : <SetupNotice />}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold text-navy">TickLO needs its Supabase settings</h1>
      <p className="mt-3 text-muted-foreground">
        Copy <code>web/.env.example</code> to <code>web/.env.local</code> and fill in <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>, then restart the server. See README.md.
      </p>
    </main>
  );
}
