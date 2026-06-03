import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithTenant } from "@/lib/tenant";
import { getDefaultCreatorInsights } from "@/lib/creator-insights-data";

export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;

  // MVP: hardcoded to Тима. Multi-creator support in a follow-up ticket.
  const data = getDefaultCreatorInsights();
  return NextResponse.json(data);
}
