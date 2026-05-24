const UC_ID_RE = /^UC[A-Za-z0-9_-]{20,30}$/;
const CHANNEL_URL_RE = /\/channel\/(UC[A-Za-z0-9_-]{20,30})/;
const HANDLE_OR_LEGACY_RE = /youtube\.com\/(@[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i;
const CANONICAL_RE =
  /<link\s+rel="canonical"\s+href="https?:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,30})"/;
const META_IDENTIFIER_RE =
  /<meta\s+itemprop="identifier"\s+content="(UC[A-Za-z0-9_-]{20,30})"/;

export class YouTubeResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeResolveError";
  }
}

export async function resolveYouTubeChannelId(input: string): Promise<string> {
  const raw = input.trim();
  if (!raw) {
    throw new YouTubeResolveError("YouTube канал не указан");
  }

  if (UC_ID_RE.test(raw)) return raw;

  const fromChannelUrl = raw.match(CHANNEL_URL_RE);
  if (fromChannelUrl) return fromChannelUrl[1]!;

  let pageUrl: string;
  if (raw.startsWith("@")) {
    pageUrl = `https://www.youtube.com/${raw}`;
  } else {
    const handleMatch = raw.match(HANDLE_OR_LEGACY_RE);
    if (handleMatch) {
      pageUrl = `https://www.youtube.com/${handleMatch[1]}`;
    } else if (/^https?:\/\//i.test(raw)) {
      pageUrl = raw;
    } else if (/^[a-zA-Z0-9._-]+$/.test(raw)) {
      pageUrl = `https://www.youtube.com/@${raw}`;
    } else {
      throw new YouTubeResolveError(
        "Не удалось понять формат YouTube. Принимаются: @handle, ссылка на канал, или Channel ID (UC...)",
      );
    }
  }

  let res: Response;
  try {
    res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new YouTubeResolveError(
      `Не удалось получить страницу YouTube (${(err as Error).message})`,
    );
  }

  if (!res.ok) {
    throw new YouTubeResolveError(
      `YouTube вернул ${res.status} для ${pageUrl}`,
    );
  }

  const html = await res.text();

  const canonical = html.match(CANONICAL_RE);
  if (canonical) return canonical[1]!;

  const identifier = html.match(META_IDENTIFIER_RE);
  if (identifier) return identifier[1]!;

  throw new YouTubeResolveError(
    "YouTube канал не найден по этой ссылке — проверь, что канал существует и открыт",
  );
}
