# Likee — research findings & roadmap

_Last updated: 2026-04-15_

Short version: **Likee auto-discovery is intentionally disabled**. Creators
can still record `likee_username` for display, and the seller can add Likee
video URLs manually via the Videos tab — metrics then flow through the paid
Apify actor just like any other platform. Full auto-discovery would require
an unstable reverse-engineered API path that we decided not to ship.

This file exists so we don't re-research the same dead ends next time the
topic comes up.

---

## What works (2026-04)

### 1. Apify actor `sashaebashu/likee-scraper` — metrics only

- Input: **one video URL** (`https://likee.video/v/XXX`) per item
- Returns: `views / likes / comments / shares / authorUsername` etc.
- Cost: ~$0.01 per video per run
- Integration: `scraper/scrapers/likee.py` uses this via `run-sync-get-dataset-items` with fallback to yt-dlp
- **Does NOT accept profile URLs** — tested live with `https://likee.video/@svetodiod_store9`, returns empty array
- Description on the store literally says _"The only Likee scraper on Apify"_

### 2. Public mobile-API endpoints (discovered, NOT used)

```
POST https://api.like-video.com/likee-activity-flow-micro/videoApi/getUserVideo
POST https://api.like-video.com/likee-activity-flow-micro/userApi/getUserPostNum
```

- No auth, no cookies, no signing. Tested live on `uid=30007` (official
  Likee_USA account) and received 30 real videos with `postId`, `msgText`,
  `playCount`, `likeCount`, `commentCount`, `shareCount`, `postTime`,
  `posterUid`.
- Body shape: `{"uid":"30007","lastPostId":"","count":30,"tabType":0}`
- Headers: `Content-Type: application/json`, `Origin: https://likee.video`,
  `Referer: https://likee.video/`, any browser UA.
- Used by: [`lucasintel/likee.cr`](https://github.com/lucasintel/likee.cr),
  [`lucasintel/likee`](https://github.com/lucasintel/likee) (Ruby),
  [`yt-dlp` Likee extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/likee.py#L123).

**Why we're not using it** — see below.

---

## What does NOT work

### Web profile pages

Every web URL redirects to the landing page regardless of UA:

```
likee.video/@username        → 302 → /
likee.video/v/VIDEO_ID       → 302 → /  (even the direct video URL!)
likee.video/@username/video/X → 302 → /
www.likee.video/@username    → 302 → /
m.likee.video/*              → DNS does not exist
l.likee.video/*              → 302 → /
likee.video/en/@X            → 404
likee.video/user/X           → 404
```

Tried User-Agents: `Googlebot/2.1`, `yt-dlp/2024.01.01`, `bingbot`,
`Twitterbot`, `facebookexternalhit`, Android mobile, iPhone Safari —
**all redirect to `/`**.

Tried via headless Chrome (Playwright) — same result, redirect happens at
the server level before JS ever runs.

This blocks the historical approach used by `lucasintel/likee.find_creator` and
yt-dlp's `LikeeUserIE`, both of which relied on scraping `window.data = {...}`
or `"userinfo":{...}` from the profile HTML.

### Username → uid lookup

None of the API paths that older libraries used accept a username:

```
POST /userApi/getUserInfoByNickName   → 404
POST /userApi/searchUserByKeyword     → 404
POST /userApi/queryUserInfo           → 404
POST /userApi/getUserInfo {likeeId}   → 404 "uid:must not be null"
POST /videoApi/getUserVideo {uid:username} → 50003 "system error"
POST /videoApi/getVideoInfo {postId|postIds} → 404 / 50003 / 52010
POST /videoApi/getPostDetail          → 404
POST /videoApi/getVideoSharePage      → 404
POST /videoApi/batchGetVideo          → 404
```

Only `getUserVideo` (by uid) and `getUserPostNum` (by uid) stayed alive.

### Third-party services checked

| Service | Likee support? |
|---|---|
| PhantomBuster | No — 50+ Phantoms, none for Likee |
| ScrapeCreators | No — 10+ platforms, Likee not on the list |
| Bright Data Web Unlocker | No specific Likee handling |
| Oxylabs SERP/Web Scraper | No specific Likee handling |
| Modash / HypeAuditor / SocialInsider | Not verified — likely $$$/mo enterprise if any |
| yt-dlp `LikeeUserIE` | Broken because it relies on the blocked HTML profile page |

---

## Why we decided NOT to ship the direct API path

Four reasons discussed on 2026-04-15:

1. **UX disaster for a WB seller.** The only way to get a numeric uid is
   mitmproxy / HTTPToolkit / BlueStacks proxy on the client's phone —
   not a "type in your username" flow. Not a thing a non-technical
   customer will ever complete.
2. **No stability guarantee.** `api.like-video.com` is an internal
   endpoint of the mobile app. It works today because Likee simply did
   not lock it down. If they add a signing header / IP allowlist /
   deprecate the path (exactly what happened to `getUserInfoByNickName`
   in 2025), we silently break and find out via audit or not at all.
3. **Architectural mismatch.** The rest of the stack is on official or
   paid-with-SLA sources (YouTube Data API, TikAPI, HikerAPI, Pinterest
   RSS). One reverse-engineered grey-area path is the weakest link and
   the hardest to monitor.
4. **No demand.** Zero Likee videos in the DB as of 2026-04-15. The
   client never added any. It is not worth an hour of risky engineering
   to support a platform that is not in use.

---

## Current workflow (what we ship)

- **Creator profile form** keeps `likee_username` as a display-only
  field and the help text explicitly says:
  _"Для Likee авто-обнаружения сейчас нет. Ссылки на ролики добавляйте
  вручную через вкладку «Ролики»."_
- **Settings → Videos → Add** accepts a Likee URL. URL → platform
  detection already maps `likee.video` / `like.video` to `likee`, and
  creator/product selection is manual.
- **Metrics scraper** (`run_daily`) → calls the Apify actor for every
  Likee video in the DB. Cost is ~$0.01 per video per run; with 3
  creators and a few videos each, this is a couple cents per night.
- **Auto-discover** skips Likee entirely. `get_creators` returns rows
  only if at least one of `tiktok/youtube/instagram/pinterest` username
  is set, so an orphan creator with only `likee_username` still appears
  in the UI but does not trigger API calls.

---

## If/when Likee becomes a priority

Paths we considered, ranked by how much risk they put on us:

1. **Pay the Apify actor author (`sashaebashu`) for a feature.** He
   already reverse-engineered the mobile API for metrics; adding
   `getUserVideo` discovery is arguably an afternoon of his time.
   Suggested offer: $100–200 for "accept profile URL, return list of
   video URLs". Upside: unified vendor, zero code on our side, the
   risk of Likee changing their API lives on his side.
2. **Enterprise influencer-analytics (Modash / HypeAuditor / Creator.co
   / Upfluence).** Expensive ($200–800/mo), but official and covered
   by contractual uptime. Check whether any of them actually cover
   Likee before paying — many focus on TikTok/IG only.
3. **Likee Creator Marketing API**. There is a "Likee Partner" /
   "Likee Creator Marketing" program for official brand integrations.
   Worth checking if our client qualifies; likely free if so.
4. **Our own Apify actor** with residential proxies. We'd wrap
   `getUserVideo` + uid-discovery-via-mitmproxy-emulator in our own
   actor. Gives us full control; costs operational time. Most work,
   highest maintenance burden.

Direct `requests.post` to `api.like-video.com` from our cron is the
option we explicitly rejected above — do not bring it back without
revisiting reasons 1–4.

---

## Quick reference: live-tested endpoints (keep these cached)

```bash
# List videos for uid=30007 (Likee official account)
curl -X POST https://api.like-video.com/likee-activity-flow-micro/videoApi/getUserVideo \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://likee.video' \
  -H 'Referer: https://likee.video/' \
  -H 'User-Agent: Mozilla/5.0' \
  -d '{"uid":"30007","lastPostId":"","count":30,"tabType":0}'

# Totals for uid=30007
curl -X POST https://api.like-video.com/likee-activity-flow-micro/userApi/getUserPostNum \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://likee.video' \
  -H 'Referer: https://likee.video/' \
  -H 'User-Agent: Mozilla/5.0' \
  -d '{"uid":"30007"}'
```

Both worked on 2026-04-15. Confirm before relying on them next time.
