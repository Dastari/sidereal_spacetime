import { describe, expect, it, vi } from "vitest";
import { User } from "oidc-client-ts";
import { restoreGameSession, usableGameSession } from "./auth-session";

function session(
  expiresAt = Math.floor(Date.now() / 1000) + 60,
  idToken = "unit-test-only",
  returnQuery = "?review=ship",
) {
  return new User({
    access_token: "unit-test-only",
    token_type: "Bearer",
    id_token: idToken,
    expires_at: expiresAt,
    profile: {
      sub: "unit-test",
      iss: "test",
      aud: "test",
      exp: expiresAt,
      iat: expiresAt - 60,
    },
    userState: { returnQuery },
  });
}

describe("game sign-in session restoration", () => {
  it("consumes a callback and restores the original local query before game entry", async () => {
    const user = session();
    const manager = {
      getUser: vi.fn(),
      signinRedirectCallback: vi.fn().mockResolvedValue(user),
    };
    const replace = vi.fn();
    expect(await restoreGameSession("/auth/callback", manager, replace)).toBe(
      user,
    );
    expect(manager.signinRedirectCallback).toHaveBeenCalledOnce();
    expect(manager.getUser).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/?review=ship");
  });
  it("removes failed callback credentials so retry does not preserve a stale code/state query", async () => {
    const manager = {
      getUser: vi.fn(),
      signinRedirectCallback: vi
        .fn()
        .mockRejectedValue(new Error("state missing")),
    };
    const replace = vi.fn();
    await expect(
      restoreGameSession("/auth/callback", manager, replace),
    ).rejects.toThrow("state missing");
    expect(replace).toHaveBeenCalledWith("/");
  });
  it("restores a stored session on reload without replaying authorization", async () => {
    const user = session();
    const manager = {
      getUser: vi.fn().mockResolvedValue(user),
      signinRedirectCallback: vi.fn(),
    };
    const replace = vi.fn();
    expect(await restoreGameSession("/", manager, replace)).toBe(user);
    expect(manager.signinRedirectCallback).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it("never navigates to an external return URL", async () => {
    const user = session(undefined, undefined, "https://elsewhere.invalid");
    const replace = vi.fn();
    await restoreGameSession(
      "/auth/callback",
      {
        getUser: vi.fn(),
        signinRedirectCallback: vi.fn().mockResolvedValue(user),
      },
      replace,
    );
    expect(replace).toHaveBeenCalledWith("/");
  });
  it("does not mount the game with a missing ID token or expired session", () => {
    expect(usableGameSession(null)).toBe(false);
    expect(usableGameSession(session(1))).toBe(false);
    expect(usableGameSession(session(undefined, ""))).toBe(false);
    expect(usableGameSession(session())).toBe(true);
  });
});
