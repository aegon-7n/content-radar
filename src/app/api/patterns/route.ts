import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithTenant } from "@/lib/tenant";

// Stub implementation — real pattern analysis pending (see child issue TRU-321)
export async function GET(request: NextRequest) {
  const auth = await requireAuthWithTenant(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    state: "loaded",
    patterns: [
      {
        distinguishing_signal: "Ролики с распаковкой в первые 3 секунды набирают в 2.4× больше просмотров",
        evidence: "8 из 12 роликов топа недели начинаются с распаковки товара",
        actionable: "Начинай ролики с момента вскрытия упаковки",
        confidence: "sharp",
      },
      {
        distinguishing_signal: "Вертикальный формат с субтитрами обгоняет горизонтальный",
        evidence: "Средние просмотры: 45К (вертикаль + субтитры) против 18К (без субтитров)",
        actionable: "Добавляй авто-субтитры через CapCut или Descript перед публикацией",
        confidence: "medium",
      },
    ],
    period_label: "26 мая – 1 июня",
    updated_at: new Date().toISOString(),
    videos_analyzed: 12,
    next_update: "Завтра в 00:10",
  });
}
