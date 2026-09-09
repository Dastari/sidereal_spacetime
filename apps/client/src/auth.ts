import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

export const authOrigin = import.meta.env.VITE_AUTH_ORIGIN as string;
let manager: UserManager | undefined;
export function authManager() {
  return manager ??= new UserManager({
    authority: import.meta.env.VITE_AUTH_ISSUER,
    client_id: import.meta.env.VITE_AUTH_CLIENT_ID,
    redirect_uri: `${authOrigin}/auth/callback`,
    post_logout_redirect_uri: `${authOrigin}/`,
    response_type: 'code', scope: 'openid profile email',
    userStore: new WebStorageStateStore({store: window.sessionStorage}),
    stateStore: new WebStorageStateStore({store: window.sessionStorage}),
    automaticSilentRenew: true, loadUserInfo: false,
  });
}
export function gameAuthentication(user: User) {
  if (user.expired || !user.id_token) throw new Error('Your session expired. Sign in again.');
  return {kind: 'oidc' as const, token: user.id_token};
}
