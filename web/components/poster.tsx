import Image from "next/image";
import { cn } from "@/lib/utils";

/** Event poster with a branded placeholder when none was uploaded (lazy-loaded, NFR-02). */
export function Poster({
  src,
  name,
  className,
  priority,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  src: string | null;
  name: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-navy via-navy-soft to-brand-strong",
          className,
        )}
        aria-hidden
      >
        <span className="px-4 text-center font-heading text-2xl font-bold text-white/90">{name}</span>
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-slate-200", className)}>
      <Image src={src} alt={`${name} poster`} fill sizes={sizes} className="object-cover" priority={priority} />
    </div>
  );
}
