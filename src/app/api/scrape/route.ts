import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";

function getScrapeSecret(): string {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) {
    throw new Error("SCRAPE_SECRET env variable is required");
  }
  return secret;
}

const VALID_PLATFORMS = new Set([
  "all",
  "tiktok",
  "youtube",
  "instagram",
  "likee",
  "pinterest",
]);

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${getScrapeSecret()}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const platform: string = body.platform ?? "all";

  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `Invalid platform. Must be one of: ${[...VALID_PLATFORMS].join(", ")}` },
      { status: 400 }
    );
  }

  const scraperDir = path.join(process.cwd(), "scraper");
  const python = path.join(scraperDir, "venv", "bin", "python");
  const args = ["-m", "scraper.main"];
  if (platform !== "all") {
    args.push("--platform", platform);
  }

  return new Promise<NextResponse>((resolve) => {
    const child = execFile(python, args, { cwd: scraperDir, timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
      const output = stdout + (stderr ? `\n${stderr}` : "");
      if (error) {
        resolve(
          NextResponse.json({ ok: false, error: error.message, output }, { status: 500 })
        );
      } else {
        resolve(NextResponse.json({ ok: true, output }));
      }
    });

    if (body.async) {
      child.unref();
      resolve(NextResponse.json({ ok: true, message: "Scraping started in background" }, { status: 202 }));
    }
  });
}
