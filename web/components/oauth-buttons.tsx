"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Provider = "google" | "apple";

const NAMES: Record<Provider, string> = { google: "Google", apple: "Apple" };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="currentColor"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </svg>
  );
}

/**
 * AUTH-02 Google / Apple login. The first login creates the account (no separate
 * signup), and the person returns to `next` afterwards (AUTH-07). See D-053.
 */
export function OAuthButton({ provider, next, label }: { provider: Provider; next: string; label?: string }) {
  const [pending, setPending] = useState(false);
  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setPending(false);
      toast.error(`${NAMES[provider]} login is not available right now.`);
    }
  }
  return (
    <Button type="button" variant="outline" className="w-full" onClick={signIn} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : provider === "google" ? <GoogleIcon /> : <AppleIcon />}
      {label ?? `Continue with ${NAMES[provider]}`}
    </Button>
  );
}

/** Google + Apple buttons, stacked; `verb` is "Continue" on login and "Sign up" on signup. */
export function OAuthButtons({ next, verb = "Continue" }: { next: string; verb?: "Continue" | "Sign up" }) {
  return (
    <div className="grid gap-2">
      <OAuthButton provider="google" next={next} label={`${verb} with Google`} />
      <OAuthButton provider="apple" next={next} label={`${verb} with Apple`} />
    </div>
  );
}
