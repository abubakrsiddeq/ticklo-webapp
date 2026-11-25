import "server-only";
import { manualPaymentProvider } from "./manual";
import type { PaymentProvider } from "./types";

// v1: manual transfers only. A gateway provider would be selected here.
export function getPaymentProvider(): PaymentProvider {
  return manualPaymentProvider;
}

export type { PaymentProvider, ProofResult } from "./types";
