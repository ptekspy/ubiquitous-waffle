import { queryOptions } from "@tanstack/react-query";

import { fetchCurrentUser, fetchWorkspace } from "./client";

export const queryKeys = {
  currentUser: ["auth", "current-user"] as const,
  workspace: ["workspace"] as const,
};

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.currentUser,
    queryFn: async () => {
      const result = await fetchCurrentUser();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 30_000,
  });
}

export function workspaceQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.workspace,
    queryFn: async () => {
      const result = await fetchWorkspace();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 15_000,
  });
}
