import Link from "next/link";
import { Logo } from "@/components/logo";

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-navy text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Logo variant="dark" href="/scan" height={26} />
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-brand-light uppercase">
            Scanner
          </span>
        </div>
        <Link href="/" className="text-sm text-slate-300 hover:text-white">
          Exit
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
