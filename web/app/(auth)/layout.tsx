import Link from "next/link";
import { BadgeCheck, QrCode, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { TAGLINE } from "@/lib/site";

const POINTS = [
  { icon: QrCode, text: "Live QR tickets that change every 30 seconds" },
  { icon: Wallet, text: "Pay the society directly – TickLO charges no fees" },
  { icon: BadgeCheck, text: "Only verified university societies" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[0.95fr_1.05fr]">
      {/* Brand panel (desktop) */}
      <aside className="bg-hero relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="bg-grid-navy pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative">
          <Logo variant="dark" height={34} />
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-bold tracking-tight">
            Your campus events, <span className="text-gradient-brand">one live ticket.</span>
          </h2>
          <ul className="mt-8 grid gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-200">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-5 text-brand-light" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-10 text-sm text-slate-400">{TAGLINE}</p>
        </div>
      </aside>

      {/* Form */}
      <div className="flex flex-col">
        <header className="flex h-20 items-center justify-between px-5 sm:px-8 lg:justify-end">
          <span className="lg:hidden">
            <Logo height={30} />
          </span>
          <Link href="/events" className="text-sm font-medium text-slate-600 hover:text-navy">
            Browse events →
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-12 sm:items-center sm:pt-0">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <footer className="pb-6 text-center text-xs text-slate-500">
          © TickLO · <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
