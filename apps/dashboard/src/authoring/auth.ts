import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
let manager: UserManager | undefined;
export function authoringAuth() {
  return (manager ??= new UserManager({
    authority: import.meta.env.VITE_AUTH_ISSUER,
    client_id: import.meta.env.VITE_AUTHORING_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_AUTH_ORIGIN + "/shipyard/auth/callback",
    post_logout_redirect_uri: import.meta.env.VITE_AUTH_ORIGIN + "/",
    response_type: "code",
    scope: "openid profile email",
    userStore: new WebStorageStateStore({ store: sessionStorage }),
    stateStore: new WebStorageStateStore({ store: sessionStorage }),
    automaticSilentRenew: true,
    loadUserInfo: false,
  }));
}
let callback: Promise<User> | undefined;
export async function loadAuthoringAccount() {
  if (location.pathname === "/shipyard/auth/callback") {
    callback ??= authoringAuth().signinRedirectCallback();
    const user = await callback;
    const target = (user.state as { returnTo?: string } | undefined)?.returnTo;
    if (target === "/map") {
      location.replace("/map");
    } else history.replaceState(null, "", "/shipyard");
    return user;
  }
  // Panels can unmount while the account renews. Read current storage, not a cached old User.
  return authoringAuth().getUser();
}
