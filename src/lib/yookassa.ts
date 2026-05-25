import { randomUUID } from "node:crypto";

const API_URL = "https://api.yookassa.ru/v3";

function getCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const apiKey = process.env.YOOKASSA_API_KEY;
  if (!shopId || !apiKey) {
    throw new Error("YOOKASSA_SHOP_ID and YOOKASSA_API_KEY must be set");
  }
  return { shopId, apiKey };
}

function authHeader(): string {
  const { shopId, apiKey } = getCredentials();
  return "Basic " + Buffer.from(`${shopId}:${apiKey}`).toString("base64");
}

// ── Tier pricing (creator-cap model, CEO-approved 2026-05, TRU-17 canonical) ─
// Internal slugs (solo/pro/studio) preserved for DB backwards-compat;
// user-visible labels are Starter/Growth/Brand per TRU-17.

export type BillingTier = "solo" | "pro" | "studio";

export const TIER_CONFIG: Record<
  BillingTier,
  { priceKopecks: number; creatorLimit: number; tuPool: number; label: string; trialDays: number }
> = {
  solo: { priceKopecks: 490_000, creatorLimit: 5, tuPool: 1_000, label: "Starter", trialDays: 14 },
  pro: { priceKopecks: 990_000, creatorLimit: 10, tuPool: 4_000, label: "Growth", trialDays: 14 },
  studio: { priceKopecks: 1_590_000, creatorLimit: 20, tuPool: 15_000, label: "Brand", trialDays: 14 },
};

export function getTuPool(tier: string | null | undefined): number {
  if (!tier) return 1_000;
  return (TIER_CONFIG[tier as BillingTier]?.tuPool) ?? 1_000;
}

// ── ЮKassa API types ─────────────────────────────────────────────────────────

export interface YookassaPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata: Record<string, string>;
  paid: boolean;
  created_at: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

interface CreatePaymentParams {
  amountKopecks: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}

export async function createPayment(
  params: CreatePaymentParams,
): Promise<YookassaPayment> {
  const amountRubles = (params.amountKopecks / 100).toFixed(2);

  const res = await fetch(`${API_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: amountRubles, currency: "RUB" },
      confirmation: { type: "redirect", return_url: params.returnUrl },
      description: params.description,
      metadata: params.metadata,
      capture: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YooKassa createPayment failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<YookassaPayment>;
}

export async function getPayment(
  paymentId: string,
): Promise<YookassaPayment> {
  const res = await fetch(`${API_URL}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YooKassa getPayment failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<YookassaPayment>;
}
