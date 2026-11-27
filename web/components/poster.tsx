import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Event poster with a branded placeholder when none was uploaded (lazy-loaded, NFR-02).
 *
 * `fit="contain"` shows the whole poster whatever its shape: the image is letterboxed
 * over a blurred, zoomed copy of itself, so nothing is cropped and the frame never
 * looks empty. `fit="cover"` (default) fills the frame and may crop – fine for thumbnails.
 */
export function Poster({
  src,
  name,
  className,
  imageClassName,
  priority,
  fit = "cover",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  src: string | null;
  name: string;
  className?: string;
  /** Extra classes for the visible poster image (e.g. a hover zoom). */
  imageClassName?: string;
  priority?: boolean;
  fit?: "cover" | "contain";
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
        <span className={cn("px-6 text-center font-heading text-2xl font-bold text-white/90", imageClassName)}>{name}</span>
      </div>
    );
  }
  if (fit === "contain") {
    return (
      <div className={cn("relative overflow-hidden bg-navy", className)}>
        {/* Tiny blurred backdrop – the browser fetches a small variant, so it is cheap. */}
        <Image src={src} alt="" fill sizes="96px" className="scale-125 object-cover opacity-60 blur-2xl" aria-hidden />
        <div className="absolute inset-0 bg-navy/10" aria-hidden />
        <Image
          src={src}
          alt={`${name} poster`}
          fill
          sizes={sizes}
          className={cn("object-contain drop-shadow-[0_8px_24px_rgb(0_0_0/0.25)]", imageClassName)}
          priority={priority}
        />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden bg-slate-200", className)}>
      <Image src={src} alt={`${name} poster`} fill sizes={sizes} className={cn("object-cover", imageClassName)} priority={priority} />
    </div>
  );
}
