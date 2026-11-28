import Link from "next/link";
import { DoorOpen, ExternalLink, MessageCircle, Printer, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { eventDayWhatsAppLink, MODE_TEXT, type EventDayMode } from "@/lib/event-day";
import { cn } from "@/lib/utils";

export interface EventDayLink {
  url: string;
  qr: string;
}

/**
 * D-086: the organizer hands out the right screen to the right people.
 * Gate team (green) and desk team (amber), each with its link, a QR code,
 * a ready WhatsApp message and a printable one-page guide.
 */
export function EventDayCard({
  eventName,
  base,
  gate,
  desk,
  canOpen,
}: {
  eventName: string;
  base: string;
  gate: EventDayLink;
  /** null when the event has no printed tickets */
  desk: EventDayLink | null;
  canOpen: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Event day</CardTitle>
        <CardDescription>
          Two jobs, two screens. Send each person only the link for their job, so nobody opens the wrong one.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Panel
          mode="gate"
          eventName={eventName}
          link={gate}
          who="Organizers and the gate volunteers you add below."
          guideHref={`${base}/guide?mode=gate`}
          canOpen={canOpen}
        />
        {desk ? (
          <Panel
            mode="desk"
            eventName={eventName}
            link={desk}
            who="Organizers and the sellers you add in Printed tickets → Sales."
            guideHref={`${base}/guide?mode=desk`}
            canOpen={canOpen}
          />
        ) : (
          <div className="flex flex-col justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-semibold text-navy">
              <Store className="size-5 text-amber-500" aria-hidden /> At the desk
            </p>
            <p>Selling paper tickets at the venue? Create them in Printed tickets. The desk link shows up here then.</p>
            <Link href={`${base}/print`} className="font-semibold text-brand-strong hover:underline">
              Printed tickets
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Panel({
  mode,
  eventName,
  link,
  who,
  guideHref,
  canOpen,
}: {
  mode: EventDayMode;
  eventName: string;
  link: EventDayLink;
  who: string;
  guideHref: string;
  canOpen: boolean;
}) {
  const gate = mode === "gate";
  const Icon = gate ? DoorOpen : Store;
  const t = MODE_TEXT[mode];
  return (
    <div className={cn("grid gap-3 rounded-2xl border-l-8 bg-secondary/50 p-4", gate ? "border-green-600" : "border-amber-400")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-heading text-lg font-bold text-navy uppercase">{t.place}</p>
          <p className="text-sm text-navy">{t.job}</p>
          <p className="mt-1 text-xs text-muted-foreground">Who can open it: {who}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
        <img src={link.qr} alt={`QR code of the ${gate ? "gate" : "desk"} link`} className="size-24 shrink-0 rounded-lg bg-white p-1" />
        <p className="text-xs text-muted-foreground">Volunteers can point their phone camera at this QR to open the link.</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs">{link.url}</code>
        <CopyButton value={link.url} label={gate ? "Gate link" : "Desk link"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={eventDayWhatsAppLink(mode, eventName, link.url)} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Send on WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={guideHref}>
            <Printer /> Print guide
          </Link>
        </Button>
        {canOpen ? (
          <Button asChild variant={gate ? "brand" : "outline"} size="sm">
            <Link href={new URL(link.url).pathname}>
              <ExternalLink /> Open
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
