import type { User } from "oidc-client-ts";

export function usableGameSession(user: User | null): user is User {
  return Boolean(user && !user.expired && user.id_token);
}

/** Consume a provider callback once and remove its one-use code even on failure. */
export async function restoreGameSession(
  pathname: string,
  manager: Pick<
    import("oidc-client-ts").UserManager,
    "getUser" | "signinRedirectCallback"
  >,
  replacePath: (path: string) => void,
): Promise<User | null> {
  if (pathname !== "/auth/callback") return manager.getUser();
  let returnPath = "/";
  try {
    const user = await manager.signinRedirectCallback();
    const query = (user.state as { returnQuery?: unknown } | undefined)
      ?.returnQuery;
    if (typeof query === "string" && query.startsWith("?")) returnPath += query;
    return user;
  } finally {
    replacePath(returnPath);
  }
}
