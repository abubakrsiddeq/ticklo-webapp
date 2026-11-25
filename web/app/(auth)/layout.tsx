import Link from "next/link";
import { Logo } from "@/components/logo";
import { TAGLINE } from "@/lib/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-white to-secondary">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:pt-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="pb-6 text-center text-sm text-muted-foreground">
        {TAGLINE} ·{" "}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
