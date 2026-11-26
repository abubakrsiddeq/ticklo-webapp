import Image from "next/image";
import Link from "next/link";
import { BRAND_ASSETS } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

// Official TickLO artwork from /brand (see brand/README.md).
// Brand rule: never smaller than 120 px wide on screen; don't stretch or recolour.

type Variant = "light" | "dark";

/** Full logo (ticket mark + wordmark). `light` for white/light backgrounds, `dark` for navy/photos. */
export function Logo({
  className,
  href = "/",
  variant = "light",
  height = 32,
  priority = true,
}: {
  className?: string;
  href?: string | null;
  variant?: Variant;
  /** Rendered height in px (width follows the logo's aspect ratio). */
  height?: number;
  priority?: boolean;
}) {
  const asset = variant === "dark" ? BRAND_ASSETS.logoOnDark : BRAND_ASSETS.logo;
  const width = Math.max(120, Math.round((asset.width / asset.height) * height));
  const img = (
    <Image
      src={asset.src}
      alt="TickLO"
      width={width}
      height={Math.round((width * asset.height) / asset.width)}
      priority={priority}
      className="h-auto select-none"
      style={{ width, maxWidth: "100%" }}
    />
  );
  if (!href) return <span className={cn("inline-flex items-center", className)}>{img}</span>;
  return (
    <Link href={href} className={cn("inline-flex shrink-0 items-center", className)} aria-label="TickLO home">
      {img}
    </Link>
  );
}

/** The ticket mark on its own (for compact spots). */
export function LogoMark({ className, variant = "light", size = 32 }: { className?: string; variant?: Variant; size?: number }) {
  const asset = variant === "dark" ? BRAND_ASSETS.markOnDark : BRAND_ASSETS.mark;
  const height = Math.round((size * asset.height) / asset.width);
  return <Image src={asset.src} alt="" aria-hidden width={size} height={height} className={cn("h-auto select-none", className)} style={{ width: size }} />;
}

/** The green app icon (profile picture style). */
export function AppIcon({ className, size = 48 }: { className?: string; size?: number }) {
  return (
    <Image
      src={BRAND_ASSETS.appIcon.src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("rounded-[22%] select-none", className)}
    />
  );
}
