import { prisma } from "@/lib/db/prisma";

export type DareLevelKey = "beginner" | "adventurous" | "daring" | "bold" | "risque" | "exhibitionist" | "daredevil" | "thrill_seeker" | "legendary" | "extreme" | "mythical" | "ultimate" | "legendary_challenges";
export type DareStatus = "PENDING" | "VERIFIED" | "REJECTED" | "NOT_STARTED";

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
  post: { title: string; subreddit: string; permalink: string; score: number; comments: number };
};

export type DareTrackerResponse = {
  generatedAt: string;
  account: { id: string; username: string } | null;
  summary: { detected: number; pending: number; verified: number; rejected: number; playbook: number; community: number; completionPercent: number };
  levels: Array<{ level: DareLevelKey; label: string; total: number; verified: number; pending: number; completionPercent: number }>;
  catalogue: Array<DareTemplate & { status: DareStatus; completionId: string | null; postPermalink: string | null }>;
  pending: DareCompletionRow[];
  recent: DareCompletionRow[];
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

function dare(slug: string, name: string, emoji: string, level: DareLevelKey, levelOrder: number, order: number, keywords: string[], requirements: string[] = []): DareTemplate {
  return { slug, name, emoji, level, levelOrder, order, keywords, requirements };
}

export const DARE_TEMPLATES: DareTemplate[] = [
  dare("hands-bra", "Hands Bra", "👐", "beginner", 1, 1, ["hands bra", "hand bra"], ["Camera/photo"]),
  dare("one-finger-challenge", "One Finger Challenge", "👆", "beginner", 1, 2, ["one finger challenge", "1 finger challenge"], ["Camera/photo"]),
  dare("heartboob", "Heartboob", "❤️", "beginner", 1, 3, ["heartboob", "heart boob"], ["Camera/photo"]),
  dare("on-off", "On/Off", "🔄", "beginner", 1, 4, ["on off", "on/off"], ["Matching poses"]),
  dare("the-arsenal", "The Arsenal", "🧰", "beginner", 1, 5, ["the arsenal", "arsenal"], ["Props/items"]),
  dare("the-music-video", "The Music Video", "🎵", "beginner", 1, 6, ["music video", "lip sync", "lipsync"], ["Video/audio"]),
  dare("the-thunder-tease", "The Thunder Tease", "🌧️", "adventurous", 2, 1, ["thunder tease", "thunderstorm", "lightning"], ["Weather/season"]),
  dare("human-canvas", "Human Canvas", "✍️", "adventurous", 2, 2, ["human canvas", "body writing"], ["Props/items"]),
  dare("the-confessional", "The Confessional", "📖", "adventurous", 2, 3, ["the confessional", "confessional"], ["Online/platform"]),
  dare("wilson", "Wilson!", "🏐", "adventurous", 2, 4, ["wilson", "handprints", "hand prints"], ["Camera/photo"]),
  dare("ice-queen", "Ice Queen", "❄️", "adventurous", 2, 5, ["ice queen", "ice cubes", "ice cube"], ["Weather/season", "Safety plan"]),
  dare("the-classic-flash", "The Classic Flash", "👗", "adventurous", 2, 6, ["classic flash", "changing room", "fitting room"], ["Changing room"]),
  dare("the-peek-a-boo", "The Peek-a-Boo", "🔍", "adventurous", 2, 7, ["peek a boo", "peek-a-boo", "keyhole", "blinds"], ["Camera/photo"]),
  dare("morning-brew-and-boobs", "Morning Brew", "☕", "daring", 3, 1, ["morning brew", "coffee", "tea"], ["Props/items"]),
  dare("gym-slut", "Gym Dare", "💪", "daring", 3, 2, ["gym dare", "gym", "workout"], ["Exercise setting"]),
  dare("naked-chief", "Kitchen Dare", "👩‍🍳", "daring", 3, 3, ["naked chief", "naked chef", "kitchen dare", "cooking"], ["Kitchen"]),
  dare("winnie-the-pooh", "Winnie the Pooh", "🐻", "bold", 4, 1, ["winnie the pooh", "pooh"], ["Outfit"]),
  dare("the-mall-commando", "Mall Commando", "👗", "bold", 4, 2, ["mall commando", "mall"], ["Mall/store"]),
  dare("the-self-admirer", "The Self-Admirer", "📱", "bold", 4, 3, ["self admirer", "phone wallpaper", "wallpaper"], ["Duration/timing"]),
  dare("the-strip-queen", "The Strip Queen", "💃", "bold", 4, 4, ["strip queen", "striptease"], ["Video/audio"]),
  dare("the-librarian", "The Librarian", "📚", "risque", 5, 1, ["librarian", "bookstore"], ["Bookstore"]),
  dare("the-garden-of-eden", "The Garden of Eden", "🍎", "risque", 5, 2, ["garden of eden", "eden"], ["Props/items"]),
  dare("the-melting-moment", "The Melting Moment", "🍦", "risque", 5, 3, ["melting moment", "ice cream", "popsicle"], ["Weather/season"]),
  dare("the-pinup-girl", "The Pinup Girl", "📷", "risque", 5, 4, ["pinup", "pin-up", "pinup girl"], ["Camera/photo"]),
  dare("the-door-dare", "The Door Dare", "🚪", "risque", 5, 5, ["door dare", "front door"], ["Door/window"]),
  dare("the-wild-flasher", "The Wild Flasher", "🌲", "exhibitionist", 6, 1, ["wild flasher", "outdoors", "outdoor"], ["Outdoor/nature"]),
  dare("the-anything-but-clothes", "Anything But Clothes", "🎭", "exhibitionist", 6, 2, ["anything but clothes", "abc challenge"], ["Props/items"]),
  dare("the-sun-worshipper", "The Sun Worshipper", "☀️", "daredevil", 7, 1, ["sun worshipper", "sun worshiper", "tanning"], ["Weather/season"]),
  dare("the-rope-bunny", "The Rope Bunny", "🪢", "daredevil", 7, 2, ["rope bunny", "rope"], ["Safety plan"]),
  dare("the-dice-slut", "Dice Dare", "🎲", "daredevil", 7, 3, ["dice dare", "dice"], ["Duration/timing"]),
  dare("the-road-flasher", "Road Dare", "🚗", "daredevil", 7, 4, ["road dare", "road flash", "car road"], ["Vehicle/transport"]),
  dare("the-webcam-hunt", "The Webcam Hunt", "📹", "thrill_seeker", 8, 1, ["webcam hunt", "webcam"], ["Online/platform"]),
  dare("the-bar-flasher", "The Bar Flasher", "🍸", "thrill_seeker", 8, 2, ["bar flasher", "bar dare"], ["Bar/restaurant"]),
  dare("the-thrill-ride", "The Thrill Ride", "🎢", "thrill_seeker", 8, 3, ["thrill ride", "roller coaster"], ["Ride"]),
  dare("the-wine-tasting", "The Wine Tasting", "🍷", "legendary", 9, 1, ["wine tasting", "wine"], ["Props/items"]),
  dare("the-marilyn-moment", "The Marilyn Moment", "🌬️", "legendary", 9, 2, ["marilyn moment", "marilyn"], ["Weather/season"]),
  dare("the-water-nymph", "The Water Nymph", "🌊", "legendary", 9, 3, ["water nymph", "water"], ["Water"]),
  dare("the-hotel-exhibitionist", "Hotel Dare", "🏨", "mythical", 11, 1, ["hotel dare", "hotel"], ["Hotel"]),
  dare("laundry-day", "Laundry Day", "🧺", "ultimate", 12, 1, ["laundry day", "laundromat"], ["Laundromat"]),
  dare("the-elevator-stripper", "Elevator Dare", "🛗", "legendary_challenges", 13, 1, ["elevator dare", "elevator"], ["Elevator/stairwell"]),
  dare("the-stairway-to-heaven", "Stairway Dare", "🪜", "legendary_challenges", 13, 2, ["stairway to heaven", "stairway", "stairwell"], ["Elevator/stairwell"]),
  dare("the-snowblower", "Snowblower", "❄️", "legendary_challenges", 13, 3, ["snowblower", "snow blower"], ["Weather/season"]),
];

const DARE_BY_SLUG = new Map(DARE_TEMPLATES.map((item) => [item.slug, item]));

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@_/ -]+/g, " ").replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

function normaliseUsername(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/^u\//i, "").replace(/^@/, "");
}

function titleMatchesDare(title: string, item: DareTemplate): boolean {
  const normalized = normaliseText(title);
  if (normalized.includes(item.slug.replace(/-/g, " "))) return true;
  if (normalized.includes(normaliseText(item.name))) return true;
  return item.keywords.some((keyword) => normalized.includes(normaliseText(keyword)));
}

function communityDarerFromTitle(title: string): string | null {
  const patterns = [/(?:dared by|dare from|from|for)\s+u\/([A-Za-z0-9_-]{3,20})/i, /u\/([A-Za-z0-9_-]{3,20}).{0,28}\b(?:dare|dared)\b/i, /\b(?:dare|dared)\b.{0,28}u\/([A-Za-z0-9_-]{3,20})/i];
  for (const pattern of patterns) {
    const match = title.match(pattern)?.[1];
    if (match) return normaliseUsername(match);
  }
  return null;
}

function isDaresGoneWild(subreddit: string): boolean {
  return subreddit.trim().toLowerCase() === "daresgonewild";
}

function completionDedupeKey(input: { postSnapshotId: string; completionType: string; dareSlug?: string | null; darerUsername?: string | null }): string {
  return [input.postSnapshotId, input.completionType, input.dareSlug ?? "community", input.darerUsername ?? "unknown"].join(":");
}

export function detectDaresForPost(post: { id: string; title: string; subreddit: string }, username: string) {
  if (!isDaresGoneWild(post.subreddit)) return [];
  const detections: Array<{ completionType: "PLAYBOOK" | "COMMUNITY"; dareSlug: string | null; dareName: string | null; dareLevel: string | null; darerUsername: string | null; confidence: number }> = [];

  for (const item of DARE_TEMPLATES.filter((candidate) => titleMatchesDare(post.title, candidate)).slice(0, 3)) {
    detections.push({ completionType: "PLAYBOOK", dareSlug: item.slug, dareName: item.name, dareLevel: item.level, darerUsername: null, confidence: 0.86 });
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

  const posts = await prisma.postSnapshot.findMany({ where: { scanId, subreddit: { equals: "daresgonewild", mode: "insensitive" } }, select: { id: true, title: true, subreddit: true, createdAt: true } });
  let count = 0;

  for (const post of posts) {
    for (const detection of detectDaresForPost(post, account.username)) {
      const dedupeKey = completionDedupeKey({ postSnapshotId: post.id, completionType: detection.completionType, dareSlug: detection.dareSlug, darerUsername: detection.darerUsername });
      await prisma.dareCompletion.upsert({
        where: { dedupeKey },
        create: { dedupeKey, ownerUserId: ownerUserId ?? null, accountId, scanId, postSnapshotId: post.id, username: account.username, subreddit: post.subreddit, completionType: detection.completionType, dareSlug: detection.dareSlug, dareName: detection.dareName, dareLevel: detection.dareLevel, darerUsername: detection.darerUsername, confidence: detection.confidence, status: "PENDING", detectedAt: post.createdAt },
        update: { scanId, dareName: detection.dareName, dareLevel: detection.dareLevel, darerUsername: detection.darerUsername, confidence: detection.confidence },
      });
      count += 1;
    }
  }

  return count;
}

function toCompletionRow(row: { id: string; completionType: string; status: string; username: string; dareSlug: string | null; dareName: string | null; dareLevel: string | null; darerUsername: string | null; confidence: number; detectedAt: Date; post: { title: string; subreddit: string; permalink: string; score: number; numComments: number; refreshedScore: number | null; refreshedNumComments: number | null } }): DareCompletionRow {
  return { id: row.id, type: row.completionType, status: row.status, username: row.username, dareSlug: row.dareSlug, dareName: row.dareName, dareLevel: row.dareLevel, darerUsername: row.darerUsername, confidence: row.confidence, detectedAt: row.detectedAt.toISOString(), post: { title: row.post.title, subreddit: row.post.subreddit, permalink: row.post.permalink, score: row.post.refreshedScore ?? row.post.score, comments: row.post.refreshedNumComments ?? row.post.numComments } };
}

function completionStatus(value: string | null | undefined): DareStatus {
  return value === "PENDING" || value === "VERIFIED" || value === "REJECTED" ? value : "NOT_STARTED";
}

export async function getDareTracker(ownerUserId: string): Promise<DareTrackerResponse> {
  const account = await prisma.redditAccount.findFirst({ where: { ownerUserId }, orderBy: { updatedAt: "desc" }, select: { id: true, username: true } });
  if (!account) return { generatedAt: new Date().toISOString(), account: null, summary: { detected: 0, pending: 0, verified: 0, rejected: 0, playbook: 0, community: 0, completionPercent: 0 }, levels: [], catalogue: [], pending: [], recent: [] };

  const completions = await prisma.dareCompletion.findMany({ where: { accountId: account.id }, orderBy: { detectedAt: "desc" }, include: { post: { select: { title: true, subreddit: true, permalink: true, score: true, numComments: true, refreshedScore: true, refreshedNumComments: true } } } });
  const bySlug = new Map(completions.filter((row) => row.completionType === "PLAYBOOK" && row.dareSlug).map((row) => [row.dareSlug as string, row]));
  const verifiedSlugs = new Set(completions.filter((row) => row.status === "VERIFIED" && row.dareSlug).map((row) => row.dareSlug as string));
  const pendingSlugs = new Set(completions.filter((row) => row.status === "PENDING" && row.dareSlug).map((row) => row.dareSlug as string));
  const verified = completions.filter((row) => row.status === "VERIFIED").length;
  const pending = completions.filter((row) => row.status === "PENDING").length;
  const rejected = completions.filter((row) => row.status === "REJECTED").length;
  const playbook = completions.filter((row) => row.completionType === "PLAYBOOK").length;
  const community = completions.filter((row) => row.completionType === "COMMUNITY").length;

  const levels = Object.entries(LEVEL_LABELS).map(([level, label]) => {
    const items = DARE_TEMPLATES.filter((item) => item.level === level);
    const levelVerified = items.filter((item) => verifiedSlugs.has(item.slug)).length;
    const levelPending = items.filter((item) => pendingSlugs.has(item.slug)).length;
    return { level: level as DareLevelKey, label, total: items.length, verified: levelVerified, pending: levelPending, completionPercent: items.length === 0 ? 0 : Math.round((levelVerified / items.length) * 100) };
  }).filter((level) => level.total > 0);

  const catalogue = DARE_TEMPLATES.map((item) => {
    const completion = bySlug.get(item.slug);
    return { ...item, status: completionStatus(completion?.status), completionId: completion?.id ?? null, postPermalink: completion?.post.permalink ?? null };
  });

  return { generatedAt: new Date().toISOString(), account, summary: { detected: completions.length, pending, verified, rejected, playbook, community, completionPercent: Math.round((verifiedSlugs.size / DARE_TEMPLATES.length) * 100) }, levels, catalogue, pending: completions.filter((row) => row.status === "PENDING").slice(0, 25).map(toCompletionRow), recent: completions.slice(0, 25).map(toCompletionRow) };
}

export async function reviewDareCompletion(ownerUserId: string, input: { id: string; status: "PENDING" | "VERIFIED" | "REJECTED"; dareSlug?: string | null; completionType?: "PLAYBOOK" | "COMMUNITY"; darerUsername?: string | null; notes?: string | null }) {
  const existing = await prisma.dareCompletion.findFirst({ where: { id: input.id, ownerUserId } });
  if (!existing) throw new Error("Dare completion not found.");

  const nextType = input.completionType ?? (existing.completionType === "COMMUNITY" ? "COMMUNITY" : "PLAYBOOK");
  const nextSlug = nextType === "PLAYBOOK" ? input.dareSlug ?? existing.dareSlug : null;
  const nextDare = nextSlug ? DARE_BY_SLUG.get(nextSlug) : null;
  const now = new Date();

  return prisma.dareCompletion.update({
    where: { id: input.id },
    data: { status: input.status, completionType: nextType, dareSlug: nextSlug, dareName: nextType === "PLAYBOOK" ? nextDare?.name ?? existing.dareName : "Community dare", dareLevel: nextType === "PLAYBOOK" ? nextDare?.level ?? existing.dareLevel : null, darerUsername: nextType === "COMMUNITY" ? normaliseUsername(input.darerUsername) || existing.darerUsername : null, notes: input.notes ?? existing.notes, verifiedAt: input.status === "VERIFIED" ? now : null, rejectedAt: input.status === "REJECTED" ? now : null },
  });
}
