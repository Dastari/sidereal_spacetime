local WorldInit = {}

WorldInit.context = {}

WorldInit.world_defaults = {
  additional_required_asset_ids = {},
  render_layer_definitions = {
    {
      display_name = "MainWorld",
      layer_id = "main_world",
      phase = "world",
      material_domain = "world_sprite",
      shader_asset_id = "",
      order = 0,
      parallax_factor = 1.0,
      screen_scale_factor = 1.0,
      depth_bias_z = 0.0,
      labels = { "Entity", "RenderLayerDefinition", "WorldLayer" },
    },
    {
      display_name = "MidgroundPlanets",
      layer_id = "midground_planets",
      phase = "world",
      material_domain = "world_polygon",
      shader_asset_id = "planet_visual_wgsl",
      order = -100,
      parallax_factor = 0.18,
      screen_scale_factor = 1.0,
      depth_bias_z = -100.0,
      labels = { "Entity", "RenderLayerDefinition", "WorldLayer" },
    },
  },
  render_layer_rules = {
    {
      display_name = "PlanetsToMidground",
      rule_id = "planets_to_midground",
      target_layer_id = "midground_planets",
      priority = 100,
      labels_any = { "Planet" },
      labels_all = {},
      archetypes_any = {},
      components_all = {},
      components_any = { "planet_body_shader_settings" },
    },
  },
  tactical_presentation_defaults = {
    display_name = "Tactical Presentation Defaults",
    entity_labels = { "TacticalPresentationDefaults", "PresentationDefaults", "TacticalPresentation" },
    default_map_icon_asset_id = "map_icon_ship_svg",
    icon_bindings_by_kind = {
      { kind = "ship", asset_id = "map_icon_ship_svg" },
      { kind = "planet", asset_id = "map_icon_planet_svg" },
      { kind = "star", asset_id = "map_icon_star_svg" },
      { kind = "asteroid", asset_id = "map_icon_asteroid_svg" },
    },
  },
  pirate_patrol_bundle_id = "ship.corvette",
  pirate_patrol_enabled = true,
  environment_lighting_bundle_id = "environment.lighting",
  environment_lighting = {
    display_name = "System Lighting",
    owner_id = "world:system:starter",
    primary_direction_xy = { 0.76, 0.58 },
    primary_elevation = 0.36,
    primary_color_rgb = { 1.0, 0.92, 0.78 },
    primary_intensity = 1.15,
    ambient_color_rgb = { 0.16, 0.20, 0.27 },
    ambient_intensity = 0.12,
    backlight_color_rgb = { 0.28, 0.42, 0.62 },
    backlight_intensity = 0.08,
    event_flash_color_rgb = { 1.0, 0.95, 0.88 },
    event_flash_intensity = 0.0,
  },
}

local function component(entity_id, kind, properties)
  return {
    component_id = entity_id .. ":" .. kind,
    component_kind = kind,
    properties = properties,
  }
end

-- Convert an ordered list of { name, value } authored parameters into the
-- `ShaderParameterSet.values` array (DR-0041). `value` may be a number, a
-- boolean (packed as 1.0/0.0), or a sequence table (e.g. an RGB color).
local function append_records(out, records)
  for i = 1, #records do
    out[#out + 1] = records[i]
  end
end

local function build_environment_lighting_records(ctx)
  if ctx == nil or ctx.spawn_bundle_graph_records == nil then
    return {}
  end
  local defaults = WorldInit.world_defaults
  local bundle_id = defaults.environment_lighting_bundle_id or "environment.lighting"
  local lighting = defaults.environment_lighting
  if lighting == nil then
    return {}
  end
  -- Fixed entity: GUID is derived deterministically from a stable logical key.
  lighting.entity_id = ctx.entity_guid("environment_lighting.system")
  return ctx.spawn_bundle_graph_records(bundle_id, lighting)
end

local function build_tactical_presentation_defaults_records(ctx)
  local defaults = WorldInit.world_defaults.tactical_presentation_defaults
  if defaults == nil or ctx == nil or ctx.entity_guid == nil then
    return {}
  end
  -- Fixed entity: GUID is derived deterministically from a stable logical key.
  local entity_id = ctx.entity_guid("tactical_presentation_defaults")

  return {
    {
      entity_id = entity_id,
      labels = { "Entity", "TacticalPresentationDefaults" },
      properties = {},
      components = {
        component(entity_id, "display_name", defaults.display_name or "Tactical Presentation Defaults"),
        component(entity_id, "entity_labels", defaults.entity_labels or { "TacticalPresentationDefaults", "PresentationDefaults" }),
        component(entity_id, "owner_id", "world:system"),
        component(entity_id, "tactical_presentation_defaults", {
          default_map_icon_asset_id = defaults.default_map_icon_asset_id,
          icon_bindings_by_kind = defaults.icon_bindings_by_kind or {},
        }),
        component(entity_id, "public_visibility", {}),
      },
    },
  }
end

function WorldInit.build_graph_records(ctx)
  local records = {}
  for _, layer in ipairs(WorldInit.world_defaults.render_layer_definitions or {}) do
    local record = ctx.render:define_layer({
      -- Fixed entity: GUID is derived deterministically from the stable layer_id.
      entity_id = ctx.entity_guid("render_layer." .. layer.layer_id),
      display_name = layer.display_name,
      layer_id = layer.layer_id,
      phase = layer.phase,
      material_domain = layer.material_domain,
      shader_asset_id = layer.shader_asset_id,
      order = layer.order,
      parallax_factor = layer.parallax_factor,
      screen_scale_factor = layer.screen_scale_factor,
      depth_bias_z = layer.depth_bias_z,
      enabled = layer.enabled ~= false,
    })
    if layer.labels ~= nil then
      record.labels = layer.labels
    end
    if layer.entity_labels ~= nil then
      record.components[#record.components + 1] =
        component(record.entity_id, "entity_labels", layer.entity_labels)
    end
    records[#records + 1] = record
  end

  for _, rule in ipairs(WorldInit.world_defaults.render_layer_rules or {}) do
    local record = ctx.render:define_rule({
      -- Fixed entity: GUID is derived deterministically from the stable rule_id.
      entity_id = ctx.entity_guid("render_rule." .. rule.rule_id),
      display_name = rule.display_name,
      rule_id = rule.rule_id,
      target_layer_id = rule.target_layer_id,
      priority = rule.priority,
      labels_any = rule.labels_any,
      labels_all = rule.labels_all,
      archetypes_any = rule.archetypes_any,
      components_all = rule.components_all,
      components_any = rule.components_any,
      enabled = rule.enabled ~= false,
    })
    records[#records + 1] = record
  end

  if ctx ~= nil and ctx.spawn_bundle_graph_records ~= nil and WorldInit.world_defaults.pirate_patrol_enabled ~= false then
    local pirate_bundle_id = WorldInit.world_defaults.pirate_patrol_bundle_id or "ship.corvette"
    local pirate_records = ctx.spawn_bundle_graph_records(pirate_bundle_id, {
      display_name = "Pirate Patrol",
      owner_id = "npc:pirate_patrol_1",
      ship_entity_labels = { "Ship", "Corvette", "Pirate", "Npc" },
      spawn_position = { -2400.0, -1400.0 },
      scanner_base_range_m = 300.0,
      script_state_data = {
        on_tick_handler = "pirate_patrol",
        tick_interval_s = 2.0,
        event_hooks = {},
        patrol_index = 1,
        patrol_points = {
          { x = -2400, y = -1400 },
          { x = -1200, y = -2400 },
          { x = -100, y = -1000 },
          { x = -1600, y = -200 },
        },
      },
    })
    append_records(records, pirate_records)
  end

  append_records(records, build_environment_lighting_records(ctx))
  append_records(records, build_tactical_presentation_defaults_records(ctx))

  return records
end

return WorldInit
