export type Platform = "tiktok" | "youtube" | "instagram" | "likee" | "pinterest";

export interface DailyMetric {
  date: string;
  views: number;
}

export interface PlatformMetric {
  platform: Platform;
  views: number;
  videos: number;
}

export interface TopVideo {
  id: string;
  platform: Platform;
  url: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  creatorName: string;
  productName: string;
  publishedAt: string;
}

export interface DashboardData {
  totalViews: number;
  totalVideos: number;
  avgViewsPerVideo: number;
  activePlatforms: number;
  viewsChange: number;
  videosChange: number;
  dailyViews: DailyMetric[];
  byPlatform: PlatformMetric[];
  topVideos: TopVideo[];
}

export interface Creator {
  id: string;
  name: string;
  totalViews: number;
  totalVideos: number;
  avgViewsPerVideo: number;
  viewsChange: number;
  byPlatform: PlatformMetric[];
}

export interface CreatorDetail extends Creator {
  dailyViews: DailyMetric[];
  byProduct: { productName: string; wbArticle: string; views: number; videos: number }[];
  topVideos: TopVideo[];
}

export interface Product {
  id: string;
  name: string;
  wbArticle: string;
  totalViews: number;
  totalVideos: number;
  byPlatform: PlatformMetric[];
}

export interface ProductDetail extends Product {
  byCreator: { creatorName: string; views: number; videos: number }[];
  videos: TopVideo[];
}

export interface Video {
  id: string;
  platform: Platform;
  url: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  creatorName: string;
  productName: string;
  wbArticle: string;
  publishedAt: string;
}

// ---- Mock generators ----

function generateDailyViews(days: number, base: number): DailyMetric[] {
  const result: DailyMetric[] = [];
  const now = new Date("2026-04-02");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const noise = 0.6 + Math.random() * 0.8;
    result.push({
      date: d.toISOString().split("T")[0],
      views: Math.round(base * noise),
    });
  }
  return result;
}

export const MOCK_DASHBOARD: DashboardData = {
  totalViews: 5_922_153,
  totalVideos: 115,
  avgViewsPerVideo: 51_497,
  activePlatforms: 5,
  viewsChange: 65.99,
  videosChange: 12.4,
  dailyViews: generateDailyViews(30, 197_405),
  byPlatform: [
    { platform: "tiktok", views: 1_400_000, videos: 23 },
    { platform: "instagram", views: 254_647, videos: 23 },
    { platform: "pinterest", views: 287_000, videos: 23 },
    { platform: "youtube", views: 182_232, videos: 23 },
    { platform: "likee", views: 163_800, videos: 23 },
  ],
  topVideos: [
    {
      id: "v1",
      platform: "tiktok",
      url: "https://www.tiktok.com/@polina/video/7341234567890",
      views: 420_000,
      likes: 0, comments: 0, shares: 0, saves: 0,
      creatorName: "Полина",
      productName: "Кошка 248332917",
      publishedAt: "2026-03-28T10:00:00Z",
    },
    {
      id: "v2",
      platform: "tiktok",
      url: "https://www.tiktok.com/@katya_ezh/video/7349876543210",
      views: 380_000,
      likes: 0, comments: 0, shares: 0, saves: 0,
      creatorName: "Катя Ежикова",
      productName: "Стич 596897327",
      publishedAt: "2026-03-27T14:30:00Z",
    },
    {
      id: "v3",
      platform: "instagram",
      url: "https://www.instagram.com/reel/C4xAbcDeFgH/",
      views: 254_647,
      likes: 0, comments: 0, shares: 0, saves: 0,
      creatorName: "Полина",
      productName: "Снег 368387486",
      publishedAt: "2026-03-26T09:00:00Z",
    },
    {
      id: "v4",
      platform: "youtube",
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      views: 182_232,
      likes: 0, comments: 0, shares: 0, saves: 0,
      creatorName: "Катя ДДД",
      productName: "Капибара 367665209",
      publishedAt: "2026-03-25T16:00:00Z",
    },
    {
      id: "v5",
      platform: "pinterest",
      url: "https://www.pinterest.ru/pin/12345678901234/",
      views: 287_000,
      likes: 0, comments: 0, shares: 0, saves: 0,
      creatorName: "Катя Ежикова",
      productName: "Выдра 215440193",
      publishedAt: "2026-03-24T11:00:00Z",
    },
  ],
};

export const MOCK_CREATORS: Creator[] = [
  {
    id: "1",
    name: "Полина",
    totalViews: 2_287_879,
    totalVideos: 46,
    avgViewsPerVideo: 49_736,
    viewsChange: 65.99,
    byPlatform: [
      { platform: "tiktok", views: 1_400_000, videos: 23 },
      { platform: "youtube", views: 182_232, videos: 23 },
      { platform: "likee", views: 163_800, videos: 23 },
      { platform: "pinterest", views: 287_000, videos: 23 },
      { platform: "instagram", views: 254_647, videos: 23 },
    ],
  },
  {
    id: "2",
    name: "Катя Ежикова",
    totalViews: 3_530_000,
    totalVideos: 48,
    avgViewsPerVideo: 73_542,
    viewsChange: 34.5,
    byPlatform: [
      { platform: "tiktok", views: 2_855_000, videos: 24 },
      { platform: "youtube", views: 280_000, videos: 12 },
      { platform: "instagram", views: 395_000, videos: 12 },
    ],
  },
  {
    id: "3",
    name: "Катя ДДД",
    totalViews: 1_104_274,
    totalVideos: 21,
    avgViewsPerVideo: 52_584,
    viewsChange: -8.2,
    byPlatform: [
      { platform: "tiktok", views: 620_000, videos: 9 },
      { platform: "youtube", views: 184_274, videos: 6 },
      { platform: "likee", views: 300_000, videos: 6 },
    ],
  },
];

export const MOCK_CREATOR_DETAIL: Record<string, CreatorDetail> = {
  "1": {
    ...MOCK_CREATORS[0],
    dailyViews: generateDailyViews(30, 76_262),
    byProduct: [
      { productName: "Кошка", wbArticle: "248332917", views: 420_000, videos: 8 },
      { productName: "Снег", wbArticle: "368387486", views: 890_000, videos: 7 },
      { productName: "Стич", wbArticle: "596897327", views: 380_000, videos: 6 },
      { productName: "Капибара", wbArticle: "367665209", views: 75_000, videos: 5 },
      { productName: "Выдра", wbArticle: "215440193", views: 372_000, videos: 4 },
      { productName: "Куб", wbArticle: "237105180", views: 150_879, videos: 3 },
    ],
    topVideos: MOCK_DASHBOARD.topVideos.filter((v) => v.creatorName === "Полина"),
  },
  "2": {
    ...MOCK_CREATORS[1],
    dailyViews: generateDailyViews(30, 117_667),
    byProduct: [
      { productName: "Кошка", wbArticle: "248332917", views: 1_580_000, videos: 10 },
      { productName: "Снег", wbArticle: "368387486", views: 890_000, videos: 9 },
      { productName: "Выдра", wbArticle: "215440193", views: 372_000, videos: 8 },
      { productName: "Стич", wbArticle: "596897327", views: 613_000, videos: 7 },
      { productName: "Капибара", wbArticle: "367665209", views: 75_000, videos: 5 },
    ],
    topVideos: MOCK_DASHBOARD.topVideos.filter((v) => v.creatorName === "Катя Ежикова"),
  },
  "3": {
    ...MOCK_CREATORS[2],
    dailyViews: generateDailyViews(30, 36_809),
    byProduct: [
      { productName: "Капибара", wbArticle: "367665209", views: 480_000, videos: 8 },
      { productName: "Заяц", wbArticle: "595648937", views: 374_274, videos: 7 },
      { productName: "Коала", wbArticle: "293857227", views: 250_000, videos: 6 },
    ],
    topVideos: MOCK_DASHBOARD.topVideos.filter((v) => v.creatorName === "Катя ДДД"),
  },
};

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Снег",
    wbArticle: "368387486",
    totalViews: 1_780_000,
    totalVideos: 16,
    byPlatform: [
      { platform: "tiktok", views: 890_000, videos: 8 },
      { platform: "instagram", views: 450_000, videos: 4 },
      { platform: "youtube", views: 440_000, videos: 4 },
    ],
  },
  {
    id: "p2",
    name: "Кошка",
    wbArticle: "248332917",
    totalViews: 2_000_000,
    totalVideos: 18,
    byPlatform: [
      { platform: "tiktok", views: 1_580_000, videos: 9 },
      { platform: "likee", views: 210_000, videos: 5 },
      { platform: "youtube", views: 210_000, videos: 4 },
    ],
  },
  {
    id: "p3",
    name: "Капибара",
    wbArticle: "367665209",
    totalViews: 630_000,
    totalVideos: 10,
    byPlatform: [
      { platform: "tiktok", views: 375_000, videos: 5 },
      { platform: "youtube", views: 180_000, videos: 3 },
      { platform: "instagram", views: 75_000, videos: 2 },
    ],
  },
  {
    id: "p4",
    name: "Выдра",
    wbArticle: "215440193",
    totalViews: 744_000,
    totalVideos: 12,
    byPlatform: [
      { platform: "tiktok", views: 372_000, videos: 6 },
      { platform: "pinterest", views: 232_000, videos: 4 },
      { platform: "likee", views: 140_000, videos: 2 },
    ],
  },
  {
    id: "p5",
    name: "Стич",
    wbArticle: "596897327",
    totalViews: 993_000,
    totalVideos: 13,
    byPlatform: [
      { platform: "tiktok", views: 613_000, videos: 7 },
      { platform: "instagram", views: 280_000, videos: 4 },
      { platform: "youtube", views: 100_000, videos: 2 },
    ],
  },
  {
    id: "p6",
    name: "Заяц",
    wbArticle: "595648937",
    totalViews: 374_274,
    totalVideos: 7,
    byPlatform: [
      { platform: "tiktok", views: 200_000, videos: 4 },
      { platform: "youtube", views: 174_274, videos: 3 },
    ],
  },
  {
    id: "p7",
    name: "Коала",
    wbArticle: "293857227",
    totalViews: 250_000,
    totalVideos: 6,
    byPlatform: [
      { platform: "tiktok", views: 150_000, videos: 3 },
      { platform: "likee", views: 100_000, videos: 3 },
    ],
  },
  {
    id: "p8",
    name: "Куб",
    wbArticle: "237105180",
    totalViews: 150_879,
    totalVideos: 3,
    byPlatform: [
      { platform: "tiktok", views: 150_879, videos: 3 },
    ],
  },
];

export const MOCK_PRODUCT_DETAIL: Record<string, ProductDetail> = {
  p1: {
    ...MOCK_PRODUCTS[0],
    byCreator: [
      { creatorName: "Полина", views: 890_000, videos: 8 },
      { creatorName: "Катя Ежикова", views: 890_000, videos: 8 },
    ],
    videos: MOCK_DASHBOARD.topVideos.filter((v) => v.productName.startsWith("Снег")),
  },
  p2: {
    ...MOCK_PRODUCTS[1],
    byCreator: [
      { creatorName: "Катя Ежикова", views: 1_580_000, videos: 10 },
      { creatorName: "Полина", views: 420_000, videos: 8 },
    ],
    videos: MOCK_DASHBOARD.topVideos.filter((v) => v.productName.startsWith("Кошка")),
  },
  p3: {
    ...MOCK_PRODUCTS[2],
    byCreator: [
      { creatorName: "Катя ДДД", views: 480_000, videos: 8 },
      { creatorName: "Полина", views: 75_000, videos: 2 },
      { creatorName: "Катя Ежикова", views: 75_000, videos: 2 },
    ],
    videos: MOCK_DASHBOARD.topVideos.filter((v) => v.productName.startsWith("Капибара")),
  },
};

// Fill missing product details with stub data
for (const product of MOCK_PRODUCTS) {
  if (!MOCK_PRODUCT_DETAIL[product.id]) {
    MOCK_PRODUCT_DETAIL[product.id] = {
      ...product,
      byCreator: [
        { creatorName: "Полина", views: Math.round(product.totalViews * 0.5), videos: Math.round(product.totalVideos * 0.5) },
        { creatorName: "Катя Ежикова", views: Math.round(product.totalViews * 0.3), videos: Math.round(product.totalVideos * 0.3) },
        { creatorName: "Катя ДДД", views: Math.round(product.totalViews * 0.2), videos: Math.round(product.totalVideos * 0.2) },
      ],
      videos: [],
    };
  }
}

export const MOCK_VIDEOS: Video[] = [
  {
    id: "v1",
    platform: "tiktok",
    url: "https://www.tiktok.com/@polina/video/7341234567890",
    views: 420_000,
    likes: 18_400,
    comments: 920,
    shares: 3_400,
    creatorName: "Полина",
    productName: "Кошка",
    wbArticle: "248332917",
    publishedAt: "2026-03-28T10:00:00Z",
  },
  {
    id: "v2",
    platform: "tiktok",
    url: "https://www.tiktok.com/@katya_ezh/video/7349876543210",
    views: 380_000,
    likes: 15_600,
    comments: 780,
    shares: 2_900,
    creatorName: "Катя Ежикова",
    productName: "Стич",
    wbArticle: "596897327",
    publishedAt: "2026-03-27T14:30:00Z",
  },
  {
    id: "v3",
    platform: "instagram",
    url: "https://www.instagram.com/reel/C4xAbcDeFgH/",
    views: 254_647,
    likes: 9_200,
    comments: 340,
    shares: 1_800,
    creatorName: "Полина",
    productName: "Снег",
    wbArticle: "368387486",
    publishedAt: "2026-03-26T09:00:00Z",
  },
  {
    id: "v4",
    platform: "youtube",
    url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    views: 182_232,
    likes: 7_800,
    comments: 430,
    shares: 1_200,
    creatorName: "Катя ДДД",
    productName: "Капибара",
    wbArticle: "367665209",
    publishedAt: "2026-03-25T16:00:00Z",
  },
  {
    id: "v5",
    platform: "pinterest",
    url: "https://www.pinterest.ru/pin/12345678901234/",
    views: 287_000,
    likes: 4_300,
    comments: 120,
    shares: 890,
    creatorName: "Катя Ежикова",
    productName: "Выдра",
    wbArticle: "215440193",
    publishedAt: "2026-03-24T11:00:00Z",
  },
  {
    id: "v6",
    platform: "tiktok",
    url: "https://www.tiktok.com/@katya_ddd/video/7338765432190",
    views: 163_800,
    likes: 6_700,
    comments: 290,
    shares: 1_100,
    creatorName: "Катя ДДД",
    productName: "Заяц",
    wbArticle: "595648937",
    publishedAt: "2026-03-23T08:30:00Z",
  },
  {
    id: "v7",
    platform: "likee",
    url: "https://likee.video/@polina/video/9012345678",
    views: 163_800,
    likes: 5_400,
    comments: 210,
    shares: 780,
    creatorName: "Полина",
    productName: "Снег",
    wbArticle: "368387486",
    publishedAt: "2026-03-22T13:00:00Z",
  },
  {
    id: "v8",
    platform: "tiktok",
    url: "https://www.tiktok.com/@katya_ezh/video/7356789012345",
    views: 613_000,
    likes: 28_000,
    comments: 1_400,
    shares: 5_100,
    creatorName: "Катя Ежикова",
    productName: "Стич",
    wbArticle: "596897327",
    publishedAt: "2026-03-21T17:00:00Z",
  },
  {
    id: "v9",
    platform: "youtube",
    url: "https://www.youtube.com/shorts/xKTIJ3S9Y1c",
    views: 174_274,
    likes: 6_200,
    comments: 380,
    shares: 980,
    creatorName: "Катя ДДД",
    productName: "Заяц",
    wbArticle: "595648937",
    publishedAt: "2026-03-20T10:00:00Z",
  },
  {
    id: "v10",
    platform: "tiktok",
    url: "https://www.tiktok.com/@polina/video/7332109876543",
    views: 310_000,
    likes: 13_500,
    comments: 670,
    shares: 2_400,
    creatorName: "Полина",
    productName: "Кошка",
    wbArticle: "248332917",
    publishedAt: "2026-03-19T15:30:00Z",
  },
  {
    id: "v11",
    platform: "instagram",
    url: "https://www.instagram.com/reel/C5yBcdEfGhI/",
    views: 89_400,
    likes: 3_200,
    comments: 145,
    shares: 620,
    creatorName: "Катя Ежикова",
    productName: "Выдра",
    wbArticle: "215440193",
    publishedAt: "2026-03-18T12:00:00Z",
  },
  {
    id: "v12",
    platform: "tiktok",
    url: "https://www.tiktok.com/@katya_ddd/video/7329876543210",
    views: 456_200,
    likes: 19_800,
    comments: 950,
    shares: 3_700,
    creatorName: "Катя ДДД",
    productName: "Коала",
    wbArticle: "293857227",
    publishedAt: "2026-03-17T09:00:00Z",
  },
];
