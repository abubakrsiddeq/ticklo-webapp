import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" fill="#0B1F3A" />
      <path
        d="M7 11.5a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v9a2 2 0 0 0-2 2H9a2 2 0 0 0-2-2z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m12.5 16 2.5 2.5 4.5-5" fill="none" stroke="#0F9D58" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-heading text-xl font-bold text-navy", className)} aria-label="TickLO home">
      <LogoMark />
      <span>
        Tick<span className="text-brand-strong">LO</span>
      </span>
    </Link>
  );
}
