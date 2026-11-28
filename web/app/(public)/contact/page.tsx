import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ChevronDown, Clock, ExternalLink, LifeBuoy, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { COMPANY, CONTACT } from "@/lib/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get help with a booking, your society or a partnership. Email, call or WhatsApp the TickLO team in Islamabad.",
};

const FAQ = [
  {
    q: "I paid but my ticket is not showing yet",
    a: (
      <>
        The society checks every payment by hand before your tickets appear. You can follow the status in{" "}
        <Link href="/me/tickets">My tickets</Link>. If it was rejected, open the order and upload a clearer screenshot.
      </>
    ),
  },
  {
    q: "Where do I find my ticket on the day?",
    a: (
      <>
        Log in and open <Link href="/me/tickets">My tickets</Link>. Each ticket has its own QR. Keep the screen bright at the
        gate and never share the QR with anyone.
      </>
    ),
  },
  {
    q: "The event was cancelled. How do I get a refund?",
    a: (
      <>
        Your money went straight to the society, so refunds come from them. Contact the society first; if you cannot reach
        them, send us a message with your reference code and we will help.
      </>
    ),
  },
  {
    q: "How do I register my society?",
    a: (
      <>
        Open <Link href="/org/new">Register a society</Link>, fill in the details and the society head. TickLO checks and
        approves it. It is completely free.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Go to <Link href="/me/profile">your profile</Link> and press &quot;Request account deletion&quot;. See our{" "}
        <Link href="/privacy">Privacy policy</Link> for what we keep and why.
      </>
    ),
  },
];

function ChannelCard({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0 gap-1">
        <h3 className="font-heading font-semibold text-navy">{title}</h3>
        <p className="text-sm text-slate-500">{text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </li>
  );
}

/** Lets a long email wrap after the @ instead of mid-word on small phones. */
function EmailText({ email }: { email: string }) {
  const [user, domain] = email.split("@");
  return (
    <>
      {user}@<wbr />
      {domain}
    </>
  );
}

const linkCls = "font-medium text-brand-strong underline decoration-brand/30 underline-offset-2 hover:decoration-brand";

export default async function ContactPage() {
  const user = await getCurrentUser().catch(() => null);
  const defaults = {
    name: user?.profile.full_name ?? "",
    email: user?.email ?? "",
    phone: formatPhone(user?.profile.phone),
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-16 px-4 pt-8 pb-16 sm:pt-12">
      <header className="relative overflow-hidden rounded-3xl bg-white px-6 py-10 shadow-card ring-1 ring-navy/[0.06] sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand-soft blur-2xl" aria-hidden />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold tracking-widest text-brand-strong uppercase">
            <MessageCircle className="size-3.5" aria-hidden /> Contact us
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-navy sm:text-5xl">We&apos;re here to help.</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            A question about a booking, help setting up your society or an idea for a partnership: write to us, call or drop a
            WhatsApp. A real person from the TickLO team will get back to you.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
            <Clock className="size-4 text-brand-strong" aria-hidden /> We usually reply within one working day
          </p>
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1fr_1.35fr]" aria-label="Ways to reach us">
        <ul className="grid content-start gap-4">
          <ChannelCard icon={LifeBuoy} title="TickLO support" text="Bookings, tickets, payments and your account.">
            <a href={`mailto:${CONTACT.supportEmail}`} className={linkCls}>
              <EmailText email={CONTACT.supportEmail} />
            </a>
          </ChannelCard>
          <ChannelCard icon={Briefcase} title="Business and partnerships" text={`Universities, sponsors and ${COMPANY.name}.`}>
            <a href={`mailto:${CONTACT.businessEmail}`} className={linkCls}>
              <EmailText email={CONTACT.businessEmail} />
            </a>
          </ChannelCard>
          <ChannelCard icon={Phone} title="Call or WhatsApp" text={CONTACT.phoneOwner}>
            <a href={CONTACT.phoneHref} className={`${linkCls} mr-1`}>
              {CONTACT.phoneDisplay}
            </a>
            <Button asChild size="sm" variant="brand" className="rounded-full">
              <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </ChannelCard>
          <ChannelCard icon={MapPin} title="Visit us" text={CONTACT.address}>
            <a href={CONTACT.mapUrl} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
              Open in Google Maps <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </ChannelCard>
        </ul>

        <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06] sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-brand-light">
              <Mail className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-xl font-semibold text-navy">Send us a message</h2>
              <p className="text-sm text-slate-500">It goes straight to our support inbox.</p>
            </div>
          </div>
          <ContactForm defaults={defaults} />
        </div>
      </section>

      <section aria-labelledby="find-us" className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/[0.06]">
        <div className="grid lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col justify-center gap-3 p-6 sm:p-10">
            <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Find us</p>
            <h2 id="find-us" className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
              Bahria University, H‑11 Campus
            </h2>
            <p className="text-slate-600">Islamabad, Pakistan</p>
            <Button asChild variant="outline" className="mt-2 w-fit rounded-full">
              <a href={CONTACT.mapUrl} target="_blank" rel="noopener noreferrer">
                <MapPin /> Get directions
              </a>
            </Button>
          </div>
          <iframe
            title="Map: Bahria University H-11 Campus, Islamabad"
            src={CONTACT.mapEmbed}
            className="h-72 w-full border-0 sm:h-96"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section aria-labelledby="faq" className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Quick answers</p>
          <h2 id="faq" className="mt-2 text-3xl font-bold tracking-tight text-navy">Before you write</h2>
          <p className="mt-3 text-slate-600">Most questions are answered here in a few seconds.</p>
        </div>
        <ul className="grid gap-3">
          {FAQ.map((f) => (
            <li key={f.q}>
              <details className="group rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] open:ring-brand/30">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium text-navy [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-brand-strong [&_a]:underline [&_a]:underline-offset-2">
                  {f.a}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
