import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { COMPANY, CONTACT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What TickLO collects, why, who can see it, how long we keep it and the choices you have.",
};

// NFR-07. Retention promise (90 days after the event) needs PROOF_RETENTION_DAYS=90 on the server.
const SUMMARY = [
  "We collect only what is needed to book, verify and scan tickets.",
  "We never sell your data and we show no ads.",
  "TickLO never receives your money. You pay the society directly.",
  "Organizers see your details only for events you book with them.",
  "Payment screenshots and student card photos are private and deleted 90 days after the event.",
  "You can edit your profile any time and ask us to delete your account.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          TickLO is a ticketing platform for university society events in Pakistan. It is built and run by{" "}
          <strong>{COMPANY.legalName}</strong> (&quot;TickLO&quot;, &quot;we&quot;, &quot;us&quot;), a company registered with the
          Securities and Exchange Commission of Pakistan (CUIN {COMPANY.secpCuin}), based in Islamabad.
        </p>
        <p>
          This policy explains what personal information we collect when you use ticklo.bkrtechsolutions.com and the TickLO
          app, why we collect it, who can see it and the choices you have. It applies to students, society members, gate
          volunteers, ambassadors and anyone else who uses TickLO.
        </p>
      </>
    ),
  },
  {
    id: "societies",
    title: "TickLO and the societies",
    body: (
      <>
        <p>
          Every event on TickLO is organised by an independent university society, not by TickLO. When you book a ticket, the
          society uses your details to verify your payment, let you in and run its event. TickLO provides the tools and keeps
          the data safe.
        </p>
        <p>
          Societies must use attendee details only for their own event and must follow this policy and our{" "}
          <Link href="/terms">Terms of use</Link>. If you have a question about how a particular society used your details,
          you can contact the society directly or write to us and we will help.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: (
      <>
        <h3>Information you give us</h3>
        <ul>
          <li>
            <strong>Account:</strong> your name, email address, phone number and password (stored only as a secure hash). You
            can also add your university and a profile photo.
          </li>
          <li>
            <strong>Bookings:</strong> the tickets you choose, the names of ticket holders, answers to any registration
            questions a society asks, and team details for competitions.
          </li>
          <li>
            <strong>Payment proof:</strong> the screenshot of your transfer, transaction ID, sender name and the account you paid
            into, so the society can match your payment.
          </li>
          <li>
            <strong>Student card photo:</strong> only when a ticket type is for students and the society asks for one.
          </li>
          <li>
            <strong>Societies:</strong> when you register a society we collect its name, university, links, logo, the details
            of the society head and the payment accounts the society wants buyers to pay into.
          </li>
          <li>
            <strong>Ambassador applications</strong> and anything you write to us through the contact form or by email.
          </li>
        </ul>
        <h3>Information created when you use TickLO</h3>
        <ul>
          <li>
            <strong>Check-in records:</strong> when your ticket was scanned, at which entry or session, and by which gate
            volunteer.
          </li>
          <li>
            <strong>Order history and decisions:</strong> approvals, rejections and the reasons given, so everyone can see what
            happened to an order.
          </li>
          <li>
            <strong>Technical data:</strong> IP address, browser and device type and the time of requests. We use this to keep
            accounts secure, stop abuse and limit repeated attempts.
          </li>
        </ul>
        <h3>Information from others</h3>
        <ul>
          <li>
            <strong>Google or Apple sign in:</strong> if you choose it, we receive your name and email address. With Apple you
            can hide your email and we receive a private relay address instead.
          </li>
          <li>
            <strong>Societies:</strong> organizers may record a manual check-in for you or the buyer of a printed ticket.
          </li>
          <li>
            <strong>Ambassador links and promo codes:</strong> when you open an ambassador&apos;s link we note which link
            brought you, so the society can credit the ambassador.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use your information",
    body: (
      <>
        <ul>
          <li>To create your account, sign you in and keep it secure.</li>
          <li>To hold your tickets, show your payment details and let the society verify your payment.</li>
          <li>
            To detect fraud, for example when the same payment screenshot or transaction ID is uploaded for two different
            orders.
          </li>
          <li>To issue your tickets and QR codes and check them at the gate.</li>
          <li>
            To send service emails: account confirmation, payment instructions, ticket confirmation, event reminders, waitlist
            offers, cancellations and replies to your messages.
          </li>
          <li>To help societies run their events with attendee lists, live check-in numbers and reports.</li>
          <li>To answer support requests, settle disputes and improve TickLO.</li>
          <li>To follow the law and respond to lawful requests from authorities.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your personal information, share it for advertising or send marketing emails
          without your permission.
        </p>
      </>
    ),
  },
  {
    id: "who-can-see",
    title: "Who can see your information",
    body: (
      <>
        <ul>
          <li>
            <strong>Organizers</strong> of an event you book see your name, phone number, email, ticket holder names, your
            answers to their questions and your payment proof for that event only.
          </li>
          <li>
            <strong>Gate volunteers</strong> see only the ticket holder&apos;s name, ticket type and ticket code when they scan.
          </li>
          <li>
            <strong>Ambassadors</strong> see how many tickets were counted for their link or code, not your contact details.
          </li>
          <li>
            <strong>The public</strong> sees society pages and event pages. If you take part in a competition and the society
            publishes results, your team name may be shown.
          </li>
          <li>
            <strong>TickLO admins</strong> can see account and order details to approve societies, handle disputes and prevent
            fraud. Every admin decision is recorded.
          </li>
        </ul>
        <p>
          Payment screenshots and student card photos are stored privately. They can only be opened by that event&apos;s
          organizers and TickLO admins, through links that expire after a short time.
        </p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Service providers and where data is stored",
    body: (
      <>
        <p>We use a small number of trusted providers to run TickLO. They process data only on our instructions:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> database, sign in and file storage. Our data is hosted in their Mumbai, India region.
          </li>
          <li>
            <strong>Hostinger:</strong> hosting of the website and sending of TickLO emails.
          </li>
          <li>
            <strong>Cloudflare:</strong> domain name service and protection against attacks.
          </li>
          <li>
            <strong>Google and Apple:</strong> only if you choose to sign in with them.
          </li>
          <li>
            <strong>Google Maps:</strong> the map on our Contact page is loaded from Google.
          </li>
        </ul>
        <p>
          This means your information may be stored and processed outside Pakistan. We choose providers that use strong
          security and we share only what each one needs.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>
          <strong>Payment screenshots and student card photos:</strong> deleted automatically 90 days after the event ends.
        </li>
        <li>
          <strong>Account details:</strong> kept while your account is open.
        </li>
        <li>
          <strong>Orders, tickets and check-in records:</strong> kept so societies have a record of their events and disputes
          can be settled. Records that a society or the law needs for payments may be kept after you delete your account.
        </li>
        <li>
          <strong>Technical logs and email logs:</strong> kept only as long as needed for security and troubleshooting.
        </li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <>
        <ul>
          <li>All traffic to TickLO is encrypted with HTTPS.</li>
          <li>Database rules make sure each person can only reach their own data and organizers only their own events.</li>
          <li>Private files are never public and open only through short lived links.</li>
          <li>Every ticket QR is signed, so a fake or edited QR is rejected at the gate.</li>
          <li>Repeated attempts are limited to stop password guessing and spam.</li>
        </ul>
        <p>
          No system is perfectly secure. If we learn of a breach that affects your information, we will tell you and the
          affected societies without delay.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    body: (
      <>
        <ul>
          <li>
            <strong>See and correct:</strong> view and edit your profile at any time from{" "}
            <Link href="/me/profile">your profile</Link>. Your orders and decisions are in My tickets and My history.
          </li>
          <li>
            <strong>Delete:</strong> use &quot;Request account deletion&quot; on your profile page. We remove your profile;
            tickets for upcoming events stop working.
          </li>
          <li>
            <strong>Get a copy or object:</strong> write to us to ask for a copy of your data or to object to a particular use.
          </li>
          <li>
            <strong>Emails:</strong> service emails about your bookings are part of using TickLO. We never add you to
            marketing lists without asking.
          </li>
        </ul>
        <p>
          Send requests to <a href={`mailto:${CONTACT.supportEmail}`}>{CONTACT.supportEmail}</a> from the email on your
          account. We reply within 30 days, usually much sooner.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <>
        <p>We use only what TickLO needs to work:</p>
        <ul>
          <li>
            <strong>Sign in cookies</strong> keep you logged in. Without them you cannot use your account.
          </li>
          <li>
            <strong>A referral cookie</strong> remembers an ambassador&apos;s link for 7 days so the right person is credited.
          </li>
          <li>
            <strong>Local storage</strong> on your device remembers small choices, such as hiding the install tip or the
            first time guide on Event day.
          </li>
        </ul>
        <p>We use no advertising or tracking cookies. Google may set its own cookies when the map on the Contact page loads.</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        TickLO is made for university students and the societies that serve them. It is not meant for children under 13 and
        we do not knowingly collect their information. If you believe a child has given us data, contact us and we will
        delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as TickLO grows. The date at the top always shows the latest version. If a change matters
        for how we use your information, we will tell you by email or with a notice on the site before it takes effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <>
        <p>For privacy questions or requests:</p>
        <ul>
          <li>
            Email: <a href={`mailto:${CONTACT.supportEmail}`}>{CONTACT.supportEmail}</a> or{" "}
            <a href={`mailto:${CONTACT.businessEmail}`}>{CONTACT.businessEmail}</a>
          </li>
          <li>
            Phone / WhatsApp: <a href={CONTACT.phoneHref}>{CONTACT.phoneDisplay}</a>
          </li>
          <li>
            Address: {COMPANY.legalName}, {CONTACT.address}
          </li>
        </ul>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      icon={ShieldCheck}
      title="Privacy policy"
      intro="Your trust matters more than any ticket. Here is exactly what TickLO collects, why we need it, who can see it and how you stay in control."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
