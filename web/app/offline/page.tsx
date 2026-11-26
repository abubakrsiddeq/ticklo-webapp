import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Offline" };

// Static page cached by the service worker.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center px-4 py-16 text-center">
      <Logo href={null} className="mb-8" height={36} />
      <WifiOff className="mb-4 size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold text-navy">You&apos;re offline</h1>
      <p className="mt-2 text-muted-foreground">
        This page needs internet. Your ticket QR still works offline – open it from your confirmation email or the QR image you downloaded.
      </p>
    </main>
  );
}
