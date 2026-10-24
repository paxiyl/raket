import { Navigate, Outlet, useLocation } from "react-router";

import { useSession } from "@/features/auth/use-session";
import { ApiWakingScreen, SessionLoading } from "./session-boundary";

/**
 * Guards the backoffice. Signed out sends you to login and remembers where you
 * were headed; signed in as a customer or rider is a 403, not a login prompt,
 * because logging in again would not help.
 *
 * An unreachable API is none of those three. It is checked first, because
 * "signed out" is the wrong thing to conclude from a service that never
 * answered — and the login form it sends you to cannot work either.
 */
export function ProtectedRoute() {
  const { isAdmin, isResolving, isSignedIn, isUnreachable } = useSession();
  const location = useLocation();

  if (isUnreachable) return <ApiWakingScreen />;
  if (isResolving) return <SessionLoading />;
  if (!isSignedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/no-access" replace />;

  return <Outlet />;
}
