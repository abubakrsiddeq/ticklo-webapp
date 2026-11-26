# TickLO brand kit

Official TickLO logo, icons and social media artwork by BKR Tech Solutions.
The full guidelines are in [`guidelines/TickLO-Brand-Logo-Sheet.pdf`](guidelines/TickLO-Brand-Logo-Sheet.pdf).

## Folder map

```
brand/
├── logo/
│   ├── ticklo-logo-primary.png          ★ main logo, transparent (3000×978) – light backgrounds
│   ├── ticklo-logo-primary-tagline.png  logo + tagline, white background (3000×1308)
│   ├── ticklo-logo-on-dark.png          white logo for navy/black/dark photos (transparent)
│   ├── ticklo-logo-square-2048.png      logo + tagline centred on a white square (posts, avatars)
│   ├── ticklo-mark.png                  ticket mark on its own (transparent)
│   └── ticklo-mark-on-dark.png          ticket mark for dark backgrounds
├── icon/
│   └── ticklo-app-icon-1024.png         ★ app icon / profile picture (green square)
├── social/
│   ├── ticklo-coming-soon-1-left.png    Instagram 3-post grid (1080×1440 each)
│   ├── ticklo-coming-soon-2-middle.png
│   ├── ticklo-coming-soon-3-right.png
│   └── ticklo-coming-soon-grid-preview.png
└── guidelines/
    ├── TickLO-Brand-Logo-Sheet.pdf      logo usage, colours, fonts
    └── TickLO-Social-Media-Content-Kit.pdf
```

★ = original master files. `ticklo-logo-on-dark.png` and the `ticklo-mark*` files are produced
from the master logo by `web/scripts/build-brand-assets.mjs` (same shapes, brand-sheet colours).

## Which file where

| Need | Use |
|---|---|
| Website header, documents, light backgrounds | `logo/ticklo-logo-primary.png` |
| Navy/dark backgrounds, email header, photos | `logo/ticklo-logo-on-dark.png` |
| Posters, flyers with tagline | `logo/ticklo-logo-primary-tagline.png` |
| Instagram / WhatsApp / Facebook profile picture, app stores | `icon/ticklo-app-icon-1024.png` |
| Very small spaces (favicon-like, stamps) | `logo/ticklo-mark.png` or the app icon |
| Launch posts | `social/` |

## Colours

| Name | Hex | Used for |
|---|---|---|
| Navy | `#0B1F3A` | text, ticket, dark backgrounds |
| Green | `#0F9D58` | "LO", tick, app icon background |
| Light green | `#3DDC97` | "LO" and accents **on dark backgrounds only** |
| White | `#FFFFFF` | backgrounds |
| Green (text/buttons on web) | `#0B7D47` | darker green so white text passes WCAG AA (see DECISIONS D-016) |

## Fonts

- **Space Grotesk Bold** – logo wordmark (already in the logo files) and web headings.
- **Inter Medium** – tagline, posters, app and website text.

## Rules (from the logo sheet)

- Keep empty space around the logo at least as wide as the green "O".
- Don't stretch, rotate, recolour or add shadows to the logo.
- Smallest logo: **30 mm wide in print, 120 px on screen.**
- Tagline is always spelled: **"TickLO se ticket lo, befikar raho!"**

## Web app assets (generated)

`cd web && npm run brand:build` regenerates everything the website uses from this folder:

| Output | Purpose |
|---|---|
| `web/public/brand/ticklo-logo.png`, `ticklo-logo-on-dark.png` | header/footer logos (trimmed, 1200 px wide) |
| `web/public/brand/ticklo-mark*.png`, `ticklo-app-icon-512.png` | compact marks |
| `web/public/brand/ticklo-og.png`, `web/app/opengraph-image.png` | link preview for WhatsApp/Instagram (1200×630) |
| `web/app/icon.png`, `apple-icon.png`, `favicon.ico` | browser tab + iPhone home screen icons |
| `web/public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` | PWA "Add to Home Screen" icons |
| `web/lib/brand-assets.ts` | image sizes used by the `<Logo>` component |

Replace a master file here, run the command, commit – the website picks up the new artwork.
