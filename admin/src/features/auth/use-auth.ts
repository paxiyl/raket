import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import {
  getAuthProvidersQueryFn,
  googleSignInMutationFn,
  loginMutationFn,
  logoutMutationFn,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-client";

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginMutationFn,
    // Seed the session cache so the guard does not refetch before redirecting.
    onSuccess: (response) =>
      queryClient.setQueryData(queryKeys.currentUser, { data: { user: response.data.user } }),
  });
};

/** Whether the server has Google configured at all, so a dead button is never shown. */
export const useAuthProviders = () =>
  useQuery({
    queryKey: ["authProviders"],
    queryFn: getAuthProvidersQueryFn,
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  });

export const useGoogleSignIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: googleSignInMutationFn,
    onSuccess: (response) =>
      queryClient.setQueryData(queryKeys.currentUser, { data: { user: response.data.user } }),
  });
};

/**
 * Discards a session that authenticated but does not belong in the backoffice.
 *
 * Deliberately not `useLogout`: that one navigates to /login, and this runs ON
 * /login, where a redirect to the page you are already looking at would clear
 * the toast explaining why. It only drops the cookie and the cached user.
 */
export const useSignOutWrongRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutMutationFn,
    onSettled: () => queryClient.removeQueries({ queryKey: queryKeys.currentUser }),
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutMutationFn,
    // Signing out locally must happen even when the network call fails.
    onSettled: () => {
      queryClient.clear();
      void navigate("/login", { replace: true });
    },
  });
};
