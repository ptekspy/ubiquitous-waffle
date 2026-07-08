"use client";

import { useEffect, useRef } from "react";

import { importBrowserPayload } from "@/lib/api/client";
import { sendExtensionMessage } from "@/lib/extension/client";
import type { ExtensionScanResponse, ExtensionState } from "@/lib/extension/types";
import type { AnalyzeResponse } from "@/lib/types";
import { isValidRedditUsername } from "@/utils/is-valid-reddit-username";
import { normaliseRedditUsername } from "@/utils/normalise-reddit-username";

type BrowserProfileSchedulerProps = {
  username: string;
  extensionState: ExtensionState;
  onImported: (data: AnalyzeResponse) => void;
  onStatus: (message: string) => void;
};

const STORAGE_PREFIX = "paidpolitely-browser-profile-scan-at";
const CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_PROFILE_SCAN_INTERVAL_MS = 15 * 60 * 1000;

function profileScanIntervalMs(): number {
  const parsed = Number.parseInt(process.env.NEXT_PUBLIC_PROFILE_SCAN_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROFILE_SCAN_INTERVAL_MS;
}

function lastScanKey(username: string): string {
  return `${STORAGE_PREFIX}:${username.toLowerCase()}`;
}

function readLastScan(username: string): number {
  const raw = window.localStorage.getItem(lastScanKey(username));
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeLastScan(username: string, value: number): void {
  window.localStorage.setItem(lastScanKey(username), String(value));
}

export function BrowserProfileScheduler({ username, extensionState, onImported, onStatus }: BrowserProfileSchedulerProps) {
  const runningRef = useRef(false);

  useEffect(() => {
    const normalisedUsername = normaliseRedditUsername(username);
    if (extensionState !== "installed" || !isValidRedditUsername(normalisedUsername)) return;

    async function runIfDue() {
      if (runningRef.current) return;

      const now = Date.now();
      const lastScan = readLastScan(normalisedUsername);
      if (now - lastScan < profileScanIntervalMs()) return;

      runningRef.current = true;
      writeLastScan(normalisedUsername, now);
      onStatus(`Running scheduled browser profile scan for u/${normalisedUsername}.`);

      try {
        const response = await sendExtensionMessage<ExtensionScanResponse>({
          type: "PAIDPOLITELY_SCAN_REDDIT_PROFILE",
          username: normalisedUsername,
          preferHeadless: true,
          openInBackground: true,
        });

        if (!response.ok) {
          onStatus(`Scheduled browser profile scan failed: ${response.error}`);
          return;
        }

        const imported = await importBrowserPayload(JSON.stringify(response.payload));
        if (!imported.ok) {
          onStatus(`Scheduled browser profile scan captured data, but import failed: ${imported.error}`);
          return;
        }

        onImported(imported.data);
        onStatus(`Scheduled browser profile scan saved for u/${imported.data.profile.username}.`);
      } catch (error) {
        onStatus(error instanceof Error ? `Scheduled browser profile scan failed: ${error.message}` : "Scheduled browser profile scan failed.");
      } finally {
        runningRef.current = false;
      }
    }

    void runIfDue();
    const timer = window.setInterval(() => {
      void runIfDue();
    }, CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [extensionState, onImported, onStatus, username]);

  return null;
}
