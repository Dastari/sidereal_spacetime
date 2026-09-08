-- WS4 worked example (unified content authoring plan §4: the Lua<->Rust authority line).
--
-- "Spawn a goods container instead of just vaporizing the wreck" is the canonical
-- exceptional-per-entity behavior: a `destroyed` event hook that emits a validated
-- `spawn_entity` intent. Rust still owns the default destruction/fracture path; Lua
-- only emits intent.
--
-- To use it, opt an entity in via its ScriptState (per-entity event hooks):
--   script_state.data.event_hooks = { destroyed = "loot_on_destroyed" }
-- The spawned `container.goods` is in the default script-spawnable allowlist and is
-- system-owned (a script may not assign a player owner); its cargo is revealed by a
-- scanner-tier cargo scan.
local LootOnDestroyed = {}

LootOnDestroyed.handler_name = "loot_on_destroyed"
-- Required by the loader even for event-only scripts; unused without on_tick.
LootOnDestroyed.tick_interval_seconds = 5.0

function LootOnDestroyed.on_destroyed(ctx, event)
  -- Drop the loot where the entity died. The dying entity may still resolve during
  -- the `destroyed` hook; fall back to a position carried on the event.
  local pos = nil
  local dying = ctx.world:find_entity(event.entity_id)
  if dying ~= nil then
    pos = dying:position()
  elseif event.position ~= nil then
    pos = event.position
  end
  if pos == nil then
    return
  end

  ctx:emit_intent("spawn_entity", {
    bundle_id = "container.goods",
    position = { x = pos.x, y = pos.y },
    -- owner omitted -> system owner (loot is not player-owned)
  })
end

return LootOnDestroyed
