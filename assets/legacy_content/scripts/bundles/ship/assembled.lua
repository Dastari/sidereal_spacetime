-- Enabled hull packages compile through the shared typed construction compiler.
-- This guard prevents a missing/disabled blueprint from falling back to an unrelated ship.
local Assembled = {}
function Assembled.build_graph_records(ctx)
  error("Hull blueprint is missing or disabled: " .. tostring(ctx.bundle_id))
end
return Assembled
