import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-navy text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <Link href="/scan" className="flex items-center gap-2 font-heading text-lg font-bold">
          <LogoMark className="size-7" /> TickLO Scanner
        </Link>
        <Link href="/" className="text-sm text-slate-300 hover:text-white">
          Exit
        </Link>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
