"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCurrentUser } from "@/lib/api/endpoints";

export const currentUserQueryKey = ["auth", "me"] as const;

/**
 * Telegram identifier of the guest account created by the backend when the
 * request carries no valid `initData`.
 */
export const GUEST_TELEGRAM_ID = 0;

/**
 * Return the authenticated Telegram user.
 *
 * The backend answers with the guest account (`telegram_id === 0`) when the
 * application runs outside Telegram, so the query also succeeds there.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: ({ signal }) => fetchCurrentUser({ signal }),
    retry: 1,
    staleTime: 5 * 60_000,
  });
}
