import { useQuery } from "@tanstack/react-query";

import { getCurrentUserQueryFn } from "@/lib/api";
import { ApiError } from "@/lib/axios-client";
import { queryKeys } from "@/lib/query-client";

/**
 * One source of truth for "who is signed in".
 *
 * The token lives in an HTTP-only cookie the browser sends automatically, so
 * there is nothing to read locally: /auth/me is what proves a session. A 401 is
 * a definitive answer, not a transient failure, so it is never retried.
 *
 * A transport failure is the opposite: it is not an answer at all. It used to
 * be read as one — the query failed, `user` was undefined, and the guard
 * concluded "signed out" and redirected to the login form, where the password
 * was correct and the sign-in failed too, because the service was asleep. Those
 * failures are reported as `isUnreachable` instead, and the guard shows the
 * waking screen.
 */

/** A failure that says nothing about the session: asleep, restarting, no database. */
const isTransport = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 0 || error.status === 503);

export const useSession = () => {
  const query = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: getCurrentUserQueryFn,
    // Two quick retries for a dropped packet; a 401 or any other answer stands.
    retry: (failureCount, error) => isTransport(error) && failureCount < 2,
    select: (response) => response.data.user,
  });

  const user = query.data;

  return {
    isResolving: query.isLoading,
    /** The API never answered. Not the same as having no session. */
    isUnreachable: query.isError && isTransport(query.error),
    isSignedIn: Boolean(user),
    // The backoffice is admin-only; any other role is treated as no access.
    isAdmin: user?.role === "admin",
    user,
  };
};
