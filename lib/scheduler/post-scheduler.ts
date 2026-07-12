import { randomUUID } from "node:crypto";

import type { PlannedPost } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { ScheduledDraftSummary, SchedulerResponse } from "@/lib/types";

const DEFAULT_PROFILE_COMMUNITY = "u/MrMrsHK";
const MAX_TITLE_LENGTH = 300;
const MAX_BODY_LENGTH = 10_000;
const MAX_URL_LENGTH = 2_000;
const MAX_NOTES_LENGTH = 5_000;

export type CreateScheduledDraftInput = {
  community: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  flairId?: string | null;
  flairText?: string | null;
  plannedFor?: string | null;
  notes?: string | null;
};

type ActiveAccount = {
  id: string;
  username: string;
} | null;

function clean(value: string | null | undefined, maxLength: number): string | null {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanBody(value: string | null | undefined): string | null {
  const cleaned = String(value || "").trim();
  return cleaned ? cleaned.slice(0, MAX_BODY_LENGTH) : null;
}

function normaliseCommunity(value: string): string {
  const cleaned = value.trim().replace(/^https?:\/\/(www\.)?reddit\.com\//i, "").split(/[?#]/)[0].replace(/\/$/, "");
  const profile = cleaned.match(/^(?:user\/|u\/)([A-Za-z0-9_-]{3,20})$/i);
  if (profile?.[1]) return `u/${profile[1]}`;
  const subreddit = cleaned.match(/^(?:r\/)?([A-Za-z0-9_][A-Za-z0-9_-]{1,30})$/i);
  if (subreddit?.[1]) return subreddit[1];
  return "";
}

function isProfileCommunity(community: string): boolean {
  return /^u\/[A-Za-z0-9_-]{3,20}$/i.test(community);
}

function communitySortKey(value: string): string {
  return `${isProfileCommunity(value) ? "0" : "1"}:${value.toLowerCase()}`;
}

function cleanUrl(value: string | null | undefined, label: string): string | null {
  const cleaned = clean(value, MAX_URL_LENGTH);
  if (!cleaned) return null;
  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${label} must use http or https.`);
  return url.toString();
}

function draftFormat(input: Pick<CreateScheduledDraftInput, "imageUrl" | "videoUrl" | "body">): string {
  if (input.videoUrl) return "redgifs";
  if (input.imageUrl) return "image";
  if (input.body) return "text";
  return "link";
}

async function activeAccount(ownerUserId: string): Promise<ActiveAccount> {
  const setting = await prisma.workspaceSetting.findUnique({ where: { ownerUserId }, select: { activeAccountId: true } }).catch(() => null);
  return prisma.redditAccount.findFirst({
    where: {
      ownerUserId,
      ...(setting?.activeAccountId ? { id: setting.activeAccountId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, username: true },
  });
}

function toSummary(row: PlannedPost): ScheduledDraftSummary {
  return {
    id: row.id,
    community: row.subreddit,
    title: row.title,
    body: row.body,
    format: row.format,
    imageUrl: row.imageUrl,
    videoUrl: row.videoUrl,
    flairId: row.flairId,
    flairText: row.flairText,
    plannedFor: row.plannedFor?.toISOString() ?? null,
    status: row.status,
    notes: row.notes,
    draftSavedAt: row.draftSavedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getScheduler(ownerUserId: string): Promise<SchedulerResponse> {
  const account = await activeAccount(ownerUserId);
  const profileCommunity = account?.username ? `u/${account.username}` : DEFAULT_PROFILE_COMMUNITY;
  const [drafts, plannedCommunities, trackedCommunities, snapshotCommunities, postCommunities] = await Promise.all([
    prisma.plannedPost.findMany({ where: { ownerUserId }, orderBy: [{ plannedFor: "asc" }, { createdAt: "desc" }], take: 80 }),
    prisma.plannedPost.findMany({ where: { ownerUserId }, distinct: ["subreddit"], select: { subreddit: true }, take: 80 }),
    prisma.trackedSubreddit.findMany({ where: { ownerUserId }, orderBy: { subreddit: "asc" }, select: { subreddit: true }, take: 80 }).catch(() => []),
    account ? prisma.subredditSnapshot.findMany({ where: { accountId: account.id }, distinct: ["subreddit"], orderBy: { totalScore: "desc" }, select: { subreddit: true }, take: 80 }) : [],
    account ? prisma.postSnapshot.findMany({ where: { accountId: account.id }, distinct: ["subreddit"], orderBy: { score: "desc" }, select: { subreddit: true }, take: 80 }) : [],
  ]);
  const communities = [...new Set([
    profileCommunity,
    ...trackedCommunities.map((row) => row.subreddit),
    ...snapshotCommunities.map((row) => row.subreddit),
    ...postCommunities.map((row) => row.subreddit),
    ...plannedCommunities.map((row) => row.subreddit),
  ].map((value) => normaliseCommunity(value)).filter(Boolean))].sort((a, b) => communitySortKey(a).localeCompare(communitySortKey(b)));

  return {
    generatedAt: new Date().toISOString(),
    defaultCommunity: profileCommunity,
    communities,
    drafts: drafts.map(toSummary),
  };
}

export async function createScheduledDraft(ownerUserId: string, input: CreateScheduledDraftInput): Promise<ScheduledDraftSummary> {
  const account = await activeAccount(ownerUserId);
  const community = normaliseCommunity(input.community);
  if (!community) throw new Error("Choose a valid r/subreddit or u/profile community.");
  const title = clean(input.title, MAX_TITLE_LENGTH);
  if (!title) throw new Error("Draft title is required.");
  const body = cleanBody(input.body);
  const imageUrl = cleanUrl(input.imageUrl, "Image URL");
  const videoUrl = cleanUrl(input.videoUrl, "Video URL");
  if (imageUrl && videoUrl) throw new Error("Use either an image URL or a Redgifs/video link, not both.");
  if (videoUrl && !/redgifs\.com$/i.test(new URL(videoUrl).hostname.replace(/^www\./i, ""))) {
    throw new Error("Video link must be a Redgifs URL for this scheduler version.");
  }
  const plannedFor = clean(input.plannedFor, 80);
  const plannedDate = plannedFor ? new Date(plannedFor) : null;
  if (plannedFor && (!plannedDate || Number.isNaN(plannedDate.getTime()))) throw new Error("Scheduled time must be a valid date/time.");

  const row = await prisma.plannedPost.create({
    data: {
      id: randomUUID(),
      ownerUserId,
      accountId: account?.id ?? null,
      subreddit: community,
      title,
      body,
      imageUrl,
      videoUrl,
      flairId: isProfileCommunity(community) ? null : clean(input.flairId, 200),
      flairText: isProfileCommunity(community) ? null : clean(input.flairText, 500),
      format: draftFormat({ imageUrl, videoUrl, body }),
      plannedFor: plannedDate,
      status: "DRAFT",
      notes: cleanBody(input.notes)?.slice(0, MAX_NOTES_LENGTH) ?? null,
      draftSavedAt: new Date(),
    },
  });

  return toSummary(row);
}
