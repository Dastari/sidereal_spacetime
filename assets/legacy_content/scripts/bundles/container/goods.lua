-- Script-spawnable loot container (WS4 demo bundle).
--
-- A minimal static (non-physics) world entity carrying a cargo payload. It exists
-- to exercise the runtime `spawn_entity` intent end-to-end: a script (e.g. an
-- asteroid `destroyed` hook) emits `spawn_entity("container.goods", ...)`, the
-- entity hydrates through the one birth path, replicates, persists, and is
-- selectable/scannable — its `cargo_mass_kg` / `inventory` are revealed by the
-- scanner-tier cargo disclosure (target_intel contract).
--
-- Spawnable bundles are default-deny; `container.goods` is in the built-in
-- script-spawnable allowlist (see `ScriptSpawnableBundles`).
local GoodsContainer = {}

local function component(entity_id, kind, properties)
  return {
    component_id = entity_id .. ":" .. kind,
    component_kind = kind,
    properties = properties,
  }
end

function GoodsContainer.build_graph_records(ctx)
  local entity_id = ctx.entity_id or error("container.goods requires entity_id")
  local owner_id = ctx.owner_id or "world:system"
  local display_name = ctx.display_name or "Cargo Container"
  local spawn_position = ctx.spawn_position or { 0.0, 0.0 }
  local pos_x = spawn_position[1] or spawn_position.x or 0.0
  local pos_y = spawn_position[2] or spawn_position.y or 0.0
  local spawn_rotation_rad = ctx.spawn_rotation or ctx.spawn_rotation_rad or 0.0

  -- Loot payload. A scanner-tier cargo scan discloses these (cargo_summary =
  -- total mass; cargo_manifest = itemized entries).
  local cargo_mass_kg = ctx.cargo_mass_kg or 1200.0
  local inventory_entries = ctx.inventory_entries or {
    {
      item_entity_id = "11111111-1111-4111-8111-111111111111",
      quantity = 12,
      unit_mass_kg = 100.0,
    },
  }

  local components = {
    component(entity_id, "display_name", display_name),
    component(entity_id, "entity_labels", { "Container" }),
    component(entity_id, "owner_id", owner_id),
    component(entity_id, "size_m", { length = 6.0, width = 6.0, height = 6.0 }),
    component(entity_id, "map_icon", { asset_id = ctx.map_icon_asset_id or "map_icon_ship_svg" }),
    component(entity_id, "world_position", { pos_x, pos_y }),
    component(entity_id, "world_rotation", spawn_rotation_rad),
    component(entity_id, "cargo_mass_kg", cargo_mass_kg),
    component(entity_id, "inventory", { entries = inventory_entries }),
    component(entity_id, "health_pool", { current = 50.0, maximum = 50.0 }),
    component(entity_id, "destructible", {
      destruction_profile_id = "explosion_burst",
      destroy_delay_s = 0.1,
    }),
  }

  return {
    {
      entity_id = entity_id,
      labels = { "Entity", "Container" },
      properties = {},
      components = components,
    },
  }
end

return GoodsContainer
