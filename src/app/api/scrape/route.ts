import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

// Simple token check — set SCRAPE_SECRET in .env.local
const SCRAPE_SECRET = process.env.SCRAPE_SECRET ?? "dev-secret";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${SCRAPE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const platform: string = body.platform ?? "all";

  const scraperDir = path.join(process.cwd(), "scraper");
  const python = path.join(scraperDir, "venv", "bin", "python");
  const platformFlag = platform === "all" ? "" : `--platform ${platform}`;
  const cmd = `cd "${scraperDir}" && "${python}" -m scraper.main ${platformFlag} 2>&1`;

  return new Promise<NextResponse>((resolve) => {
    const child = exec(cmd, { timeout: 10 * 60 * 1000 }, (error, stdout) => {
      if (error) {
        resolve(
          NextResponse.json({ ok: false, error: error.message, output: stdout }, { status: 500 })
        );
      } else {
        resolve(NextResponse.json({ ok: true, output: stdout }));
      }
    });

    // Respond immediately with 202, scraping runs in background
    if (body.async) {
      child.unref();
      resolve(NextResponse.json({ ok: true, message: "Scraping started in background" }, { status: 202 }));
    }
  });
}
