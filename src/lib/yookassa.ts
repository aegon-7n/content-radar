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

// ── Tier & top-up pricing ────────────────────────────────────────────────────

export type BillingTier = "starter" | "growth" | "brand";

export const TIER_CONFIG: Record<
  BillingTier,
  { priceKopecks: number; tuLimit: number; label: string }
> = {
  starter: { priceKopecks: 590_000, tuLimit: 300, label: "Starter" },
  growth: { priceKopecks: 1_990_000, tuLimit: 1_200, label: "Growth" },
  brand: { priceKopecks: 4_990_000, tuLimit: 3_000, label: "Brand" },
};

export const TOPUP_CONFIG: Record<
  BillingTier,
  { priceKopecks: number; tuAmount: number }
> = {
  starter: { priceKopecks: 59_000, tuAmount: 30 },
  growth: { priceKopecks: 199_000, tuAmount: 120 },
  brand: { priceKopecks: 499_000, tuAmount: 300 },
};

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
