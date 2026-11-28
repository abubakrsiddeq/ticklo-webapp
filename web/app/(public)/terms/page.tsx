import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { COMPANY, CONTACT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using TickLO as a student, a society or a gate volunteer.",
};

// NFR-07.
const SUMMARY = [
  "TickLO is free for students and societies. We charge no fees.",
  "Each event is organised by a society. TickLO provides the platform.",
  "You pay the society directly. Refunds are handled by the society.",
  "A ticket is valid once you see it in My tickets after the society approves your payment.",
  "Each QR lets one person in, once. Never share your QR.",
  "Fake or reused payment screenshots lead to suspension.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    body: (
      <>
        <p>
          These terms are an agreement between you and <strong>{COMPANY.legalName}</strong>, the company that builds and runs
          TickLO (&quot;TickLO&quot;, &quot;we&quot;, &quot;us&quot;). By creating an account or using TickLO you agree to
          these terms and to our <Link href="/privacy">Privacy policy</Link>.
        </p>
        <p>
          If you use TickLO on behalf of a society, you confirm that you are allowed to act for that society and that it
          accepts these terms too.
        </p>
      </>
    ),
  },
  {
    id: "what-ticklo-is",
    title: "What TickLO is",
    body: (
      <>
        <p>
          TickLO is a platform that lets verified university societies in Pakistan publish events, sell and issue tickets,
          verify payments and check people in at the gate.
        </p>
        <ul>
          <li>
            <strong>The society is the organizer.</strong> It sets the price, rules, venue and schedule, receives the money and
            is responsible for the event.
          </li>
          <li>
            <strong>TickLO is not a party to the sale.</strong> We do not receive, hold or transfer ticket money.
          </li>
          <li>
            <strong>TickLO is free.</strong> We charge no fees to students or societies.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Give your real name, a working email and a phone number you use. Keep them up to date.</li>
        <li>One account per person. Do not create accounts for other people or pretend to be someone else.</li>
        <li>Keep your password private. You are responsible for what happens in your account.</li>
        <li>Tell us straight away if you think someone else has used your account.</li>
      </ul>
    ),
  },
  {
    id: "booking",
    title: "Booking and paying for tickets",
    body: (
      <>
        <ol>
          <li>
            When you book, your tickets are held for <strong>60 minutes</strong>. If no payment proof is uploaded in that time,
            the hold ends and the tickets go back on sale.
          </li>
          <li>
            You pay the society directly, by bank transfer or mobile wallet, into one of the accounts shown, using your
            reference code where asked.
          </li>
          <li>You upload a screenshot and the transaction details. They must be true and belong to your own payment.</li>
          <li>
            The society checks your payment and approves or rejects it. Your tickets are valid only after approval, when they
            appear in My tickets. If a proof is rejected you can upload a new one.
          </li>
          <li>Free tickets are issued straight away.</li>
        </ol>
        <p>
          Prices, early bird dates, promo codes, student card requirements, waitlists and limits per order are set by the
          society and shown before you book. A society may refuse a booking that breaks its rules.
        </p>
      </>
    ),
  },
  {
    id: "tickets",
    title: "Tickets and entry",
    body: (
      <ul>
        <li>
          Each ticket has its own QR code that can be scanned <strong>only once</strong>. Whoever is scanned first gets in, so
          never share your QR or a screenshot of it.
        </li>
        <li>Printed tickets work the same way. Keep them safe; a lost printed ticket may be cancelled by the society.</li>
        <li>
          Societies may ask for your student card or ID at the gate and may refuse entry under their own rules, university
          rules or the law.
        </li>
        <li>
          Do not resell tickets for profit, copy them or change them. Tickets that are copied, changed or obtained by fraud are
          void.
        </li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Changes, cancellations and refunds",
    body: (
      <>
        <p>
          Because the money goes straight to the society, <strong>refunds are the society&apos;s responsibility</strong>. Each
          society decides its refund rules and must handle refunds fairly, especially if it cancels an event.
        </p>
        <p>
          If an event is cancelled, TickLO tells ticket holders by email and shows a notice on the event page. If you cannot
          reach a society about a refund, <Link href="/contact">contact us</Link> and we will help you get in touch.
        </p>
      </>
    ),
  },
  {
    id: "societies",
    title: "Rules for societies and organizers",
    body: (
      <>
        <p>To keep TickLO trusted, every society and its team agree to:</p>
        <ul>
          <li>Give true information about the society, its head, its events and its payment accounts.</li>
          <li>Use only payment accounts that belong to the society or that it controls and answers for.</li>
          <li>Check payment proofs honestly and in good time, and honour every ticket it approves.</li>
          <li>Handle refunds and complaints about its events.</li>
          <li>Use attendee details only to run its own events, keep them safe and never sell or misuse them.</li>
          <li>Follow university rules and the laws of Pakistan, and hold any permissions its event needs.</li>
          <li>Own or have the right to use the posters, logos and text it uploads.</li>
          <li>Give team, scanner and session manager access only to people it trusts.</li>
        </ul>
        <p>
          TickLO reviews societies and events before they go live and may refuse, pause or remove any that break these terms.
        </p>
      </>
    ),
  },
  {
    id: "ambassadors",
    title: "Ambassadors, promo codes and competitions",
    body: (
      <ul>
        <li>
          Ambassador programmes, rewards and promo codes are offered by societies. Rewards are given by the society, not by
          TickLO.
        </li>
        <li>Ambassadors must promote honestly and must not spam people or make false claims.</li>
        <li>Referrals or codes gained by fake accounts or other tricks do not count and may lead to suspension.</li>
        <li>For competitions, the society sets the rules, decides shortlisting and publishes the results.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "What is not allowed",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>Upload fake, edited or reused payment screenshots or someone else&apos;s student card. This is fraud.</li>
          <li>List fake events, events you are not allowed to run or events that are illegal.</li>
          <li>Impersonate a person, a society or TickLO.</li>
          <li>Harass, threaten or abuse anyone, or post hateful or indecent content.</li>
          <li>Try to break into accounts or systems, copy data in bulk, or disrupt TickLO in any way.</li>
          <li>Use TickLO to send spam or for anything unlawful.</li>
        </ul>
        <p>Accounts involved in fraud may be suspended and reported to the society and, where needed, to the authorities.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Content you share",
    body: (
      <p>
        You keep ownership of what you upload, such as posters, logos and photos. You allow TickLO to store, display and
        resize it as needed to run the service and show your events. The TickLO name, logo and design belong to{" "}
        {COMPANY.name} and may not be used without our permission.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and closing accounts",
    body: (
      <p>
        We may suspend or close an account, or remove an event, if it breaks these terms, puts others at risk or if the law
        requires it. Where possible we will explain why. You can stop using TickLO at any time and ask for your account to be
        deleted from your profile page.
      </p>
    ),
  },
  {
    id: "disclaimer",
    title: "Our responsibility",
    body: (
      <>
        <p>
          We work hard to keep TickLO accurate, secure and available, but it is provided &quot;as is&quot; and may sometimes be
          unavailable or contain mistakes.
        </p>
        <p>
          Events are run by societies, so TickLO is not responsible for an event itself, including its quality, safety,
          changes, cancellation or refunds, or for what a society or another user does.
        </p>
        <p>
          To the fullest extent the law allows, TickLO is not liable for indirect or unforeseeable loss arising from the use of
          the platform. Nothing in these terms limits any right you have that cannot be limited under the laws of Pakistan.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of Pakistan. We will always try to solve a problem with you first; if that is not
        possible, the courts of Islamabad will have jurisdiction.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms as TickLO grows. The date at the top shows the latest version. If a change is important, we
        will tell you by email or with a notice on the site. Using TickLO after a change means you accept the new terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
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
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      icon={FileText}
      title="Terms of use"
      intro="The simple rules that keep TickLO fair and safe for students, societies and everyone at the gate."
      summary={SUMMARY}
      sections={SECTIONS}
    />
  );
}
