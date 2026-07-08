import { prisma } from "@/lib/db/prisma";

export type DareLevelKey =
  | "beginner"
  | "adventurous"
  | "daring"
  | "bold"
  | "risque"
  | "exhibitionist"
  | "daredevil"
  | "thrill_seeker"
  | "legendary"
  | "extreme"
  | "mythical"
  | "ultimate"
  | "legendary_challenges";

export type DareTemplate = {
  slug: string;
  name: string;
  emoji: string;
  level: DareLevelKey;
  levelOrder: number;
  order: number;
  keywords: string[];
  requirements: string[];
};

export type DareTrackerResponse = {
  generatedAt: string;
  account: { id: string; username: string } | null;
  summary: {
    detected: number;
    pending: number;
    verified: number;
    rejected: number;
    playbook: number;
    community: number;
    completionPercent: number;
  };
  levels: Array<{ level: DareLevelKey; label: string; total: number; verified: number; pending: number; completionPercent: number }>;
  catalogue: Array<DareTemplate & { status: "PENDING" | "VERIFIED" | "REJECTED" | "NOT_STARTED"; completionId: string | null; postPermalink: string | null }>;
  pending: DareCompletionRow[];
  recent: DareCompletionRow[];
};

export type DareCompletionRow = {
  id: string;
  type: string;
  status: string;
  username: string;
  dareSlug: string | null;
  dareName: string | null;
  dareLevel: string | null;
  darerUsername: string | null;
  confidence: number;
  detectedAt: string;
  post: {
    title: string;
    subreddit: string;
    permalink: string;
    score: number;
    comments: number;
  };
};

const LEVEL_LABELS: Record<DareLevelKey, string> = {
  beginner: "Beginner",
  adventurous: "Adventurous",
  daring: "Daring",
  bold: "Bold",
  risque: "Risqué",
  exhibitionist: "Exhibitionist",
  daredevil: "Daredevil",
  thrill_seeker: "Thrill-Seeker",
  legendary: "Legendary",
  extreme: "Extreme",
  mythical: "Mythical",
  ultimate: "Ultimate",
  legendary_challenges: "Legendary Challenges",
};

export const DARE_TEMPLATES: DareTemplate[] = [
  { slug: "hands-bra", name: "Hands Bra", emoji: "👐", level: "beginner", levelOrder: 1, order: 1, keywords: ["hands bra", "hand bra"], requirements: ["Camera/photo", "Private setting"] },
  { slug: "one-finger-challenge", name: "One Finger Challenge", emoji: "👆", level: "beginner", levelOrder: 1, order: 2, keywords: ["one finger challenge", "1 finger challenge"], requirements: ["Camera/photo", "Private setting"] },
  { slug: "heartboob", name: "Heartboob", emoji: "❤️", level: "beginner", levelOrder: 1, order: 3, keywords: ["heartboob", "heart boob"], requirements: ["Camera/photo"] },
  { slug: "on-off", name: "On/Off", emoji: "🔄", level: "beginner", levelOrder: 1, order: 4, keywords: ["on off", "on/off"], requirements: ["Camera/photo", "Matching poses"] },
  { slug: "the-arsenal", name: "The Arsenal", emoji: "🧰", level: "beginner", levelOrder: 1, order: 5, keywords: ["the arsenal", "arsenal"], requirements: ["Props/items"] },
  { slug: "the-music-video", name: "The Music Video", emoji: "🎵", level: "beginner", levelOrder: 1, order: 6, keywords: ["music video", "lip sync", "lipsync"], requirements: ["Video/audio"] },
  { slug: "the-thunder-tease", name: "The Thunder Tease", emoji: "🌧️", level: "adventurous", levelOrder: 2, order: 1, keywords: ["thunder tease", "thunderstorm", "lightning"], requirements: ["Weather/season", "Window"] },
  { slug: "human-canvas", name: "Human Canvas", emoji: "✍️", level: "adventurous", levelOrder: 2, order: 2, keywords: ["human canvas", "body writing"], requirements: ["Props/items"] },
  { slug: "the-confessional", name: "The Confessional", emoji: "📖", level: "adventurous", levelOrder: 2, order: 3, keywords: ["the confessional", "confessional"], requirements: ["Online/platform"] },
  { slug: "wilson", name: "Wilson!", emoji: "🏐", level: "adventurous", levelOrder: 2, order: 4, keywords: ["wilson", "handprints", "hand prints"], requirements: ["Camera/photo"] },
  { slug: "ice-queen", name: "Ice Queen", emoji: "❄️", level: "adventurous", levelOrder: 2, order: 5, keywords: ["ice queen", "ice cubes", "ice cube"], requirements: ["Weather/season", "Safety plan"] },
  { slug: "the-classic-flash", name: "The Classic Flash", emoji: "👗", level: "adventurous", levelOrder: 2, order: 6, keywords: ["classic flash", "changing room", "fitting room"], requirements: ["Public/semi-public", "Changing room"] },
  { slug: "the-peek-a-boo", name: "The Peek-a-Boo", emoji: "🔍", level: "adventurous", levelOrder: 2, order: 7, keywords: ["peek a boo", "peek-a-boo", "keyhole", "blinds"], requirements: ["Camera/photo"] },
  { slug: "morning-brew-and-boobs", name: "Morning Brew", emoji: "☕", level: "daring", levelOrder: 3, order: 1, keywords: ["morning brew", "coffee", "tea"], requirements: ["Props/items"] },
  { slug: "gym-slut", name: "Gym Dare", emoji: "💪", level: "daring", levelOrder: 3, order: 2, keywords: ["gym dare", "gym", "workout"], requirements: ["Exercise setting"] },
  { slug: "naked-chief", name: "Kitchen Dare", emoji: "👩‍🍳", level: "daring", levelOrder: 3, order: 3, keywords: ["naked chief", "naked chef", "kitchen dare", "cooking"], requirements: ["Kitchen", "Safety plan"] },
  { slug: "winnie-the-pooh", name: "Winnie the Pooh", emoji: "🐻", level: "bold", levelOrder: 4, order: 1, keywords: ["winnie the pooh", "pooh"], requirements: ["Outfit", "Outdoor"] },
  { slug: "the-mall-commando", name: "Mall Commando", emoji: "👗", level: "bold", levelOrder: 4, order: 2, keywords: ["mall commando", "mall"], requirements: ["Mall/store", "Outfit"] },
  { slug: "the-self-admirer", name: "The Self-Admirer", emoji: "📱", level: "bold", levelOrder: 4, order: 3, keywords: ["self admirer", "phone wallpaper", "wallpaper"], requirements: ["Duration/timing", "Phone"] },
  { slug: "the-strip-queen", name: "The Strip Queen", emoji: "💃", level: "bold", levelOrder: 4, order: 4, keywords: ["strip queen", "striptease"], requirements: ["Video/audio"] },
  { slug: "the-librarian", name: "The Librarian", emoji: "📚", level: "risque", levelOrder: 5, order: 1, keywords: ["librarian", "bookstore"], requirements: ["Bookstore"] },
  { slug: "the-garden-of-eden", name: "The Garden of Eden", emoji: "🍎", level: "risque", levelOrder: 5, order: 2, keywords: ["garden of eden", "eden"], requirements: ["Props/items", "Outdoor"] },
  { slug: "the-melting-moment", name: "The Melting Moment", emoji: "🍦", level: "risque", levelOrder: 5, order: 3, keywords: ["melting moment", "ice cream", "popsicle"], requirements: ["Weather/season", "Props/items"] },
  { slug: "the-pinup-girl", name: "The Pinup Girl", emoji: "📷", level: "risque", levelOrder: 5, order: 4, keywords: ["pinup", "pin-up", "pinup girl"], requirements: ["Camera/photo"] },
  { slug: "the-door-dare", name: "The Door Dare", emoji: "🚪", level: "risque", levelOrder: 5, order: 5, keywords: ["door dare", "front door"], requirements: ["Door/window"] },
  { slug: "the-wild-flasher", name: "The Wild Flasher", emoji: "🌲", level: "exhibitionist", levelOrder: 6, order: 1, keywords: ["wild flasher", "outdoors", "outdoor"], requirements: ["Outdoor/nature"] },
  { slug: "the-anything-but-clothes", name: "Anything But Clothes", emoji: "🎭", level: "exhibitionist", levelOrder: 6, order: 2, keywords: ["anything but clothes", "abc challenge"], requirements: ["Outfit", "Props/items"] },
  { slug: "the-sun-worshipper", name: "The Sun Worshipper", emoji: "☀️", level: "daredevil", levelOrder: 7, order: 1, keywords: ["sun worshipper", "sun worshiper", "tanning"], requirements: ["Weather/season"] },
  { slug: "the-rope-bunny", name: "The Rope Bunny", emoji: "🪢", level: "daredevil", levelOrder: 7, order: 2, keywords: ["rope bunny", "rope"], requirements: ["Props/items", "Safety plan"] },
  { slug: "the-dice-slut", name: "Dice Dare", emoji: "🎲", level: "daredevil", levelOrder: 7, order: 3, keywords: ["dice dare", "dice"], requirements: ["Props/items", "Duration/timing"] },
  { slug: "the-road-flasher", name: "Road Dare", emoji: "🚗", level: "daredevil", levelOrder: 7, order: 4, keywords: ["road dare", "road flash", "car road"], requirements: ["Vehicle/transport"] },
  { slug: "the-webcam-hunt", name: "The Webcam Hunt", emoji: "📹", level: "thrill_seeker", levelOrder: 8, order: 1, keywords: ["webcam hunt", "webcam"], requirements: ["Online/platform", "Video/audio"] },
  { slug: "the-bar-flasher", name: "The Bar Flasher", emoji: "🍸", level: "thrill_seeker", levelOrder: 8, order: 2, keywords: ["bar flasher", "bar dare"], requirements: ["Bar/restaurant"] },
  { slug: "the-thrill-ride", name: "The Thrill Ride", emoji: "🎢", level: "thrill_seeker", levelOrder: 8, order: 3, keywords: ["thrill ride", "roller coaster"], requirements: ["Ride", "Public/semi-public"] },
  { slug: "the-wine-tasting", name: "The Wine Tasting", emoji: "🍷", level: "legendary", levelOrder: 9, order: 1, keywords: ["wine tasting", "wine"], requirements: ["Props/items"] },
  { slug: "the-marilyn-moment", name: "The Marilyn Moment", emoji: "🌬️", level: "legendary", levelOrder: 9, order: 2, keywords: ["marilyn moment", "marilyn"], requirements: ["Weather/season", "Outfit"] },
  { slug: "the-water-nymph", name: "The Water Nymph", emoji: "🌊", level: "legendary", levelOrder: 9, order: 3, keywords: ["water nymph", "water"], requirements: ["Water", "Safety plan"] },
  { slug: "the-hotel-exhibitionist", name: "Hotel Dare", emoji: "🏨", level: "mythical", levelOrder: 11, order: 1, keywords: ["hotel dare", "hotel"], requirements: ["Hotel"] },
  { slug: "laundry-day", name: "Laundry Day", emoji: "🧺", level: "ultimate", levelOrder: 12, order: 1, keywords: ["laundry day", "laundromat"], requirements: ["Laundromat"] },
  { slug: "the-elevator-stripper", name: "Elevator Dare", emoji: "🛗", level: "legendary_challenges", levelOrder: 13, order: 1, keywords: ["elevator dare", "elevator"], requirements: ["Elevator/stairwell", "Timing"] },
  { slug: "the-stairway-to-heaven", name: "Stairway Dare", emoji: "🪜", level: "legendary_challenges", levelOrder: 13, order: 2, keywords: ["stairway to heaven", "stairway", "stairwell"], requirements: ["Elevator/stairwell"] },
  { slug: "the-snowblower", name: "Snowblower", emoji: "❄️", level: "legendary_challenges", levelOrder: 13, order: 3, keywords: ["snowblower", "snow blower"], requirements: ["Weather/season", "Safety plan"] },
];

const DARE_BY_SLUG = new Map(DARE_TEMPLATES.map((dare) => [dare.slug, dare]));

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@_/ -]+/g, " ").replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function normaliseUsername(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/^u\//i, "").replace(/^@/, "");
}

function titleMatchesDare(title: string, dare: DareTemplate): boolean {
  const normalized = normaliseText(title);
  const slugPhrase = dare.slug.replace(/-/g, " ");
  if (normalized.includes(slugPhrase)) return true;
  if (normalized.includes(normaliseText(dare.name))) return true;
  return dare.keywords.some((keyword) => normalized.includes(normaliseText(keyword)));
}

function communityDarerFromTitle(title: string): string | null {
  const patterns = [
    /(?:dared by|dare from|from|for)\s+u\/([A-Za-z0-9_-]{3,20})/i,
    /u\/([A-Za-z0-9_-]{3,20}).{0,28}\b(?:dare|dared)\b/i,
    /\b(?:dare|dared)\b.{0,28}u\/([A-Za-z0-9_-]{3,20})/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern)?.[1];
    if (match) return normaliseUsername(match);
  }

  return null;
}

function isDaresGoneWild(subreddit: string): boolean {
  return subreddit.trim().toLowerCase() === "daresgonewild";
}

function completionDedupeKey(args: { postSnapshotId: string; completionType: string; dareSlug?: string | null; darerUsername?: string | null }): string {
  return [args.postSnapshotId, args.completionType, args.dareSlug ?? "community", args.darerUsername ?? "unknown"].join(":");
}

export function detectDaresForPost(post: { id: string; title: string; subreddit: string }, username: string) {
  if (!isDaresGoneWild(post.subreddit)) return [];

  const detections: Array<{ completionType: string; dareSlug: string | null; dareName: string | null; dareLevel: string | null; darerUsername: string | null; confidence: number }> = [];
  const matched = DARE_TEMPLATES.filter((dare) => titleMatchesDare(post.title, dare));

  for (const dare of matched.slice(0, 3)) {
    detections.push({ completionType: "PLAYBOOK", dareSlug: dare.slug, dareName: dare.name, dareLevel: dare.level, darerUsername: null, confidence: 0.86 });
  }

  const darerUsername = communityDarerFromTitle(post.title);
  if (darerUsername && darerUsername.toLowerCase() !== username.toLowerCase()) {
    detections.push({ completionType: "COMMUNITY", dareSlug: null, dareName: "Community dare", dareLevel: null, darerUsername, confidence: 0.72 });
  }

  return detections;
}

export async function syncDareCompletionsForScan(scanId: string, accountId: string, ownerUserId?: string | null): Promise<number> {
  const account = await prisma.redditAccount.findUnique({ where: { id: accountId }, select: { username: true } });
  if (!account) return 0;

  const posts = await prisma.postSnapshot.findMany({
    where: { scanId, subreddit: { equals: "daresgonewild", mode: "insensitive" } },
    select: { id: true, title: true, subreddit: true, createdAt: true },
  });

  let created = 0;

  for (const post of posts) {
    const detections = detectDaresForPost(post, account.username);

    for (const detection of detections) {
      const dedupeKey = completionDedupeKey({ postSnapshotId: post.id, completionType: detection.completionType, dareSlug: detection.dareSlug, darerUsername: detection.darerUsername });
      await prisma.dareCompletion.upsert({
        where: { dedupeKey },
        create: {
          dedupeKey,
          ownerUserId: ownerUserId ?? null,
          accountId,
          scanId,
          postSnapshotId: post.id,
          username: account.username,
          subreddit: post.subreddit,
          completionType: detection.completionType,
          dareSlug: detection.dareSlug,
          dareName: detection.dareName,
          dareLevel: detection.dareLevel,
          darerUsername: detection.darerUsername,
          confidence: detection.confidence,
          status: "PENDING",
          detectedAt: post.createdAt,
        },
        update: {
          scanId,
          dareName: detection.dareName,
          dareLevel: detection.dareLevel,
          darerUsername: detection.darerUsername,
          confidence: detection.confidence,
        },
      });
      created += 1;
    }
  }

  return created;
}

function toCompletionRow(row: {
  id: string;
  completionType: string;
  status: string;
  username: string;
  dareSlug: string | null;
  dareName: string | null;
  dareLevel: string | null;
  darerUsername: string | null;
  confidence: number;
  detectedAt: Date;
  post: { title: string; subreddit: string; permalink: string; score: number; numComments: number; refreshedScore: number | null; refreshedNumComments: number | null };
}): DareCompletionRow {
  return {
    id: row.id,
    type: row.completionType,
    status: row.status,
    username: row.username,
    dareSlug: row.dareSlug,
    dareName: row.dareName,
    dareLevel: row.dareLevel,
    darerUsername: row.darerUsername,
    confidence: row.confidence,
    detectedAt: row.detectedAt.toISOString(),
    post: {
      title: row.post.title,
      subreddit: row.post.subreddit,
      permalink: row.post.permalink,
      score: row.post.refreshedScore ?? row.post.score,
      comments: row.post.refreshedNumComments ?? row.post.numComments,
    },
  };
}

export async function getDareTracker(ownerUserId: string): Promise<DareTrackerResponse> {
  const account = await prisma.redditAccount.findFirst({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true } });
  if (!account) {
    return { generatedAt: new Date().toISOString(), account: null, summary: { detected: 0, pending: 0, verified: 0, rejected: 0, playbook: 0, community: 0, completionPercent: 0 }, levels: [], catalogue: [], pending: [], recent: [] };
  }

  const completions = await prisma.dareCompletion.findMany({
    where: { accountId: account.id },
    orderBy: { detectedAt: "desc" },
    include: { post: { select: { title: true, subreddit: true, permalink: true, score: true, numComments: true, refreshedScore: true, refreshedNumComments: true } } },
  });

  const verifiedBySlug = new Map(completions.filter((row) => row.completionType === "PLAYBOOK" && row.dareSlug).map((row) => [row.dareSlug as string, row]));
  const pendingBySlug = new Map(completions.filter((row) => row.completionType === "PLAYBOOK" && row.dareSlug && row.status === "PENDING").map((row) => [row.dareSlug as string, row]));
  const verified = completions.filter((row) => row.status === "VERIFIED").length;
  const pending = completions.filter((row) => row.status === "PENDING").length;
  const rejected = completions.filter((row) => row.status === "REJECTED").length;
  const playbook = completions.filter((row) => row.completionType === "PLAYBOOK").length;
  const community = completions.filter((row) => row.completionType === "COMMUNITY").length;
  const verifiedPlaybookSlugs = new Set(completions.filter((row) => row.status === "VERIFIED" && row.dareSlug).map((row) => row.dareSlug as string));

  const levels = Object.entries(LEVEL_LABELS).map(([level, label]) => {
    const levelDares = DARE_TEMPLATES.filter((dare) => dare.level === level);
    const levelVerified = levelDares.filter((dare) => verifiedPlaybookSlugs.has(dare.slug)).length;
    const levelPending = levelDares.filter((dare) => pendingBySlug.has(dare.slug)).length;
    return { level: level as DareLevelKey, label, total: levelDares.length, verified: levelVerified, pending: levelPending, completionPercent: levelDares.length === 0 ? 0 : Math.round((levelVerified / levelDares.length) * 100) };
  }).filter((row) => row.total > 0);

  const catalogue = DARE_TEMPLATES.map((dare) => {
    const row = verifiedBySlug.get(dare.slug);
    return { ...dare, status: row?.status === "VERIFIED" || row?.status === "REJECTED" || row?.status === "PENDING" ? row.status : "NOT_STARTED" as const, completionId: row?.id ?? null, postPermalink: row?.post.permalink ?? null };
  });

  return {
    generatedAt: new Date().toISOString(),
    account,
    summary: { detected: completions.length, pending, verified, rejected, playbook, community, completionPercent: Math.round((verifiedPlaybookSlugs.size / DARE_TEMPLATES.length) * 100) },
    levels,
    catalogue,
    pending: completions.filter((row) => row.status === "PENDING").slice(0, 25).map(toCompletionRow),
    recent: completions.slice(0, 25).map(toCompletionRow),
  };
}

export async function reviewDareCompletion(ownerUserId: string, input: { id: string; status: "PENDING" | "VERIFIED" | "REJECTED"; dareSlug?: string | null; completionType?: "PLAYBOOK" | "COMMUNITY"; darerUsername?: string | null; notes?: string | null }) {
  const existing = await prisma.dareCompletion.findFirst({ where: { id: input.id, ownerUserId } });
  if (!existing) throw new Error("Dare completion not found.");

  const dare = input.dareSlug ? DARE_BY_SLUG.get(input.dareSlug) : null;
  const now = new Date();

  return prisma.dareCompletion.update({
    where: { id: input.id },
    data: {
      status: input.status,
      completionType: input.completionType ?? existing.completionType,
      dareSlug: input.completionType === "PLAYBOOK" ? input.dareSlug ?? existing.dareSlug : null,
      dareName: input.completionType === "PLAYBOOK" ? dare?.name ?? existing.dareName : "Community dare",
      dareLevel: input.completionType === "PLAYBOOK" ? dare?.level ?? existing.dareLevel : null,
      darerUsername: input.completionType === "COMMUNITY" ? normaliseUsername(input.darerUsername) || existing.darerUsername : null,
      notes: input.notes ?? existing.notes,
      verifiedAt: input.status === "VERIFIED" ? now : null,
      rejectedAt: input.status === "REJECTED" ? now : null,
    },
  });
}
