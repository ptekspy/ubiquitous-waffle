"use client";

import { useEffect, useRef } from "react";

import { claimBrowserCrawlerJob, importBrowserCrawlerPayload } from "@/lib/api/client";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionState } from "@/lib/extension/types";

type BrowserPostCrawlerProps = {
  scanId: string | null;
  extensionState: ExtensionState;
  onRefresh: () => Promise<void>;
  onStatus: (message: string) => void;
};

type ExtensionCrawlerResponse =
  | { ok: true; status: string; payload: unknown }
  | { ok: false; status?: string; error: string };

const BATCH_SIZE = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function BrowserPostCrawler({ scanId, extensionState, onRefresh, onStatus }: BrowserPostCrawlerProps) {
  const refreshRef = useRef(onRefresh);
  const statusRef = useRef(onStatus);

  useEffect(() => {
    refreshRef.current = onRefresh;
    statusRef.current = onStatus;
  }, [onRefresh, onStatus]);

  useEffect(() => {
    if (extensionState !== "installed" || !scanId) return;

    let cancelled = false;

    async function runBatch() {
      let completed = 0;

      for (let index = 0; index < BATCH_SIZE && !cancelled; index += 1) {
        const claim = await claimBrowserCrawlerJob();
        if (!claim.ok || !claim.job) break;

        statusRef.current(`Deep crawling r/${claim.job.subreddit}: ${claim.job.title.slice(0, 80)}`);

        const response = await sendExtensionMessage<ExtensionCrawlerResponse>({
          type: "PAIDPOLITELY_DEEP_DIVE_REDDIT_POST",
          redditId: claim.job.redditId,
        } as never);

        if (!response.ok) {
          statusRef.current(response.error);
          break;
        }

        const imported = await importBrowserCrawlerPayload(claim.job.id, response.payload);
        if (!imported.ok) {
          statusRef.current(imported.error);
          break;
        }

        completed += 1;
        await sleep(1200);
      }

      if (!cancelled && completed > 0) {
        statusRef.current(`Deep crawled ${completed} post${completed === 1 ? "" : "s"}. Refreshing dashboard data.`);
        await refreshRef.current();
      }
    }

    void runBatch();

    return () => {
      cancelled = true;
    };
  }, [extensionState, scanId]);

  return null;
}
