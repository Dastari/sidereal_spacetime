import { grid, type Rect } from "./layout";
/** Logical-pixel workspace bounds; the kit applies scale/DPR exactly once. */
export function systemsDesignLayout(
  width: number,
  height: number,
  noticeRows = 0,
) {
  const w = Math.max(200, width),
    h = Math.max(240, height);
  const frame: Rect = { x: 8, y: 8, w: w - 16, h: h - 16 };
  const narrow = w < 850 && h >= 560;
  const toolbar: Rect = {
    x: 20,
    y: 60,
    w: w - 40,
    h: 64 + Math.ceil(5 / (w < 340 ? 2 : w < 600 ? 3 : 5)) * 34,
  };
  const footer: Rect = { x: 20, y: h - 62, w: w - 40, h: 42 };
  const body: Rect = {
    x: 20,
    y: toolbar.y + toolbar.h + 8,
    w: w - 40,
    h: Math.max(40, footer.y - noticeRows * 17 - toolbar.y - toolbar.h - 16),
  };
  const left = narrow
    ? Math.min(160, Math.max(86, body.w * 0.38))
    : Math.min(230, body.w * 0.22);
  const inspectorHeight = narrow ? Math.min(190, body.h * 0.38) : body.h;
  const right = narrow ? 0 : Math.min(270, body.w * 0.25);
  const equipment: Rect = {
    ...body,
    w: left,
    h: narrow ? body.h - inspectorHeight - 8 : body.h,
  };
  const viewport: Rect = {
    x: body.x + left + 8,
    y: body.y,
    w: body.w - left - right - (narrow ? 8 : 16),
    h: equipment.h,
  };
  const inspector: Rect = narrow
    ? { x: body.x, y: body.y + equipment.h + 8, w: body.w, h: inspectorHeight }
    : { x: viewport.x + viewport.w + 8, y: body.y, w: right, h: body.h };
  const deckButtons = grid(
    { x: toolbar.x, y: toolbar.y + 24, w: Math.min(360, toolbar.w), h: 28 },
    3,
    3,
    6,
  );
  const channelColumns = w < 340 ? 2 : w < 600 ? 3 : 5;
  const channelButtons = grid(
    {
      x: toolbar.x,
      y: toolbar.y + 58,
      w: toolbar.w,
      h: Math.ceil(5 / channelColumns) * 34 - 6,
    },
    channelColumns,
    5,
    6,
  );
  return {
    frame,
    toolbar,
    deckButtons,
    channelButtons,
    equipment,
    viewport,
    inspector,
    footer,
    narrow,
  };
}
