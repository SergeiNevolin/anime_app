"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCurrentUser } from "@/lib/api/endpoints";

export const currentUserQueryKey = ["auth", "me"] as const;

/**
 * Return the authenticated Telegram user.
 *
 * The user is created on the first request, so the query is retried once when
 * the very first call fails.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: ({ signal }) => fetchCurrentUser({ signal }),
    retry: 1,
    staleTime: 5 * 60_000,
  });
}
