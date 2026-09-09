/** Bind a live socket to the original provider credential through a host-verified
 * HTTP reducer. Browser WS tickets have a separate 60s handshake lifetime. */
export async function bindGameSessionProof({
  origin,
  database,
  connectionId,
  token,
  signal,
  fetcher = fetch,
}: {
  origin: string;
  database: string;
  connectionId: string;
  token: string;
  signal: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<void> {
  if (!/^[0-9a-f]{32}$/i.test(connectionId) || !database || !token)
    throw Error("Invalid game session proof request");
  const base = new URL(origin);
  base.protocol =
    base.protocol === "wss:"
      ? "https:"
      : base.protocol === "ws:"
        ? "http:"
        : base.protocol;
  if (!["https:", "http:"].includes(base.protocol))
    throw Error("Invalid game origin");
  const url = new URL(
    `/v1/database/${encodeURIComponent(database)}/call/bind_game_session`,
    base,
  );
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([connectionId]),
      signal,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok)
      throw Error(`Game session verification rejected (${response.status})`);
  } catch (error) {
    if (signal.aborted) throw Error("Game session verification cancelled");
    // Never echo a transport response body, URL or provider token into the HUD.
    if (
      error instanceof Error &&
      /^Game session verification rejected \(\d+\)$/.test(error.message)
    )
      throw error;
    throw Error("Game session verification failed");
  }
}
