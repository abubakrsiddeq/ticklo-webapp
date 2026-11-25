"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** PAY-03: "Copy" next to every account detail. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Old browsers: fall back to a temporary textarea
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success("Copied");
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`${label}: ${value}`}>
      {copied ? <Check className="text-brand-strong" /> : <Copy />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
