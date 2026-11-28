/**
 * D-086: one "Event day" entry point with two clearly different jobs.
 * Gate = let people in (green). Desk = sell paper tickets (amber).
 * Shared by the hub, both camera screens, the organizer card and the printed guide.
 */

export type EventDayMode = "gate" | "desk";

export const EVENT_DAY_LAST_KEY = "ticklo-event-day-last";

export const MODE_TEXT: Record<EventDayMode, { place: string; job: string; strip: string; stripSub: string }> = {
  gate: {
    place: "At the gate",
    job: "Let people in. Scan each person's ticket. A ticket works once.",
    strip: "Entry",
    stripSub: "People go in when the screen turns green",
  },
  desk: {
    place: "At the desk",
    job: "Sell paper tickets. Scan the paper ticket, take the money. Nobody goes in from here.",
    strip: "Selling",
    stripSub: "You are selling tickets. Nobody goes in from this screen",
  },
};

export const GUIDE_STEPS: Record<EventDayMode, { title: string; body: string }[]> = {
  gate: [
    { title: "Start the camera", body: "Tap “Start entry scanning” and allow the camera." },
    { title: "Hold the QR in the square", body: "The ticket can be on a phone or on paper." },
    { title: "Green = let them in. Red = stop", body: "On red, read the reason on the screen. “Check student card” means ask for the card first." },
  ],
  desk: [
    { title: "Choose how they pay", body: "Cash, JazzCash, EasyPaisa, Bank, or Free pass." },
    { title: "Scan the paper ticket, tap Sold", body: "Buyer name and phone are optional." },
    { title: "Give them the ticket", body: "They go in at the gate, where the ticket is scanned again. Hand the money to the organizer at the end." },
  ],
};

export const GUIDE_TIPS: Record<EventDayMode, string[]> = {
  gate: [
    "QR not working (cracked screen, faded print)? Tap “QR not working? Find by name”.",
    "“Already used” means the ticket came in before. Do not let a second person in on it.",
    "“Not sold” means a paper ticket nobody paid for. Send the guest to the ticket desk.",
  ],
  desk: [
    "Paper ticket damaged? Use “Sell by serial number” below the camera.",
    "“To hand over” shows how much money you should give the organizer.",
    "This screen never lets anyone in. Entry is only at the gate.",
  ],
};

/** wa.me link with a ready-made Roman Urdu message for a gate volunteer or a desk seller. */
export function eventDayWhatsAppLink(mode: EventDayMode, eventName: string, url: string): string {
  const text =
    mode === "gate"
      ? `Assalam o Alaikum! ${eventName} par aap GATE par hain (logon ko andar bhejna). Ye link kholein aur TickLO par login karein: ${url}\n\n1. "Start entry scanning" dabayein\n2. Ticket ka QR camera ke samne rakhein\n3. Hara = andar jane dein, Laal = rok dein aur wajah parhein`
      : `Assalam o Alaikum! ${eventName} par aap DESK par hain (paper tickets bechna). Ye link kholein aur TickLO par login karein: ${url}\n\n1. Payment chunein: Cash / JazzCash / EasyPaisa\n2. Paper ticket ka QR scan karein, "Sold" dabayein\n3. Ticket de dein, banda gate se andar jayega`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
