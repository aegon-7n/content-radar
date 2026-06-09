import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithTenant } from "@/lib/tenant";
import { getDefaultCreatorInsights } from "@/lib/creator-insights-data";

// Hardcoded insights only exist for the initial tenant.
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;

  if (auth.tenantId !== DEFAULT_TENANT_ID) {
    return NextResponse.json({ state: "unavailable" });
  }

  const data = getDefaultCreatorInsights();
  return NextResponse.json(data);
}
