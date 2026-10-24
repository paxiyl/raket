import { Navigate, Outlet } from "react-router";

import { useSession } from "@/features/auth/use-session";
import { ApiWakingScreen, SessionLoading } from "./session-boundary";

/**
 * Keeps a signed-in admin off the login screen.
 *
 * And keeps everybody off a login form that cannot work: with the API
 * unreachable, submitting it would fail on the network rather than on the
 * password, which reads as "wrong credentials" to the person typing them.
 */
export function PublicOnlyRoute() {
  const { isAdmin, isResolving, isUnreachable } = useSession();

  if (isUnreachable) return <ApiWakingScreen />;
  if (isResolving) return <SessionLoading />;
  if (isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}
