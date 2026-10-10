import type { Scene } from "@babylonjs/core/scene";
import type {
  SystemsDesign,
  DesignChannel,
} from "@sidereal/sim/ship-systems-design";
import { DESIGN_CHANNELS } from "@sidereal/sim/ship-systems-design";
import { SHIP_COMPONENT_CHANNEL_UNITS } from "@sidereal/content/ship-components";
import { CanvasUI, palette } from "./toolkit";
import { contains, type Rect } from "./layout";
import { systemsDesignLayout } from "./systems-design-layout";
const NAMES: Record<DesignChannel, string> = {
  power: "Power",
  data: "Data",
  coolant: "Coolant",
  fuel: "Fuel",
  ventilation: "Ventilation",
};
export type SystemsInspectionActions = {
  close: () => void;
  select: (id: string | undefined) => void;
  channels: (channels: readonly DesignChannel[]) => void;
  belowOnly: (below: boolean) => void;
  deck: (mode: "hidden" | "lifted") => void;
  fit: () => void;
  focus: (id: string) => void;
  viewport: (r: Rect, width: number, height: number) => void;
};
/** The real in-game painter and control/input contract over the inspection scene. */
export function createSystemsInspectionUI(
  canvas: HTMLCanvasElement,
  scene: Scene,
  model: SystemsDesign,
  name: string,
  actions: SystemsInspectionActions,
) {
  const ui = new CanvasUI(canvas, scene, {
    label:
      "Sidereal systems design. Drag to orbit, right drag to pan, scroll to zoom. F6 focuses controls. Escape closes inspection.",
  });
  let selected: string | undefined =
    model.components.find((c) => c.id === "mount:reactor")?.id ??
    model.components[0]?.id;
  let below = true,
    deck: "hidden" | "lifted" = "hidden";
  let channels: DesignChannel[] = ["power"],
    status = "Loading machinery…",
    error = "";
  let equipmentScroll = 0,
    inspectorScroll = 0;
  let layout = systemsDesignLayout(1280, 800);
  ui.focus = "systems-close";
  ui.keyboard = true;
  const change = () => ui.invalidate();
  const select = (id: string | undefined) => {
    selected = id;
    inspectorScroll = 0;
    actions.select(id);
    change();
  };
  ui.escape = actions.close;
  ui.scroll = (delta, x, y) => {
    const inspector =
      x === undefined
        ? ui.focus.startsWith("inspector")
        : contains(layout.inspector, x, y ?? 0);
    if (inspector) inspectorScroll = Math.max(0, inspectorScroll + delta);
    else if (x === undefined || contains(layout.equipment, x, y ?? 0))
      equipmentScroll = Math.max(0, equipmentScroll + delta);
    change();
  };
  ui.draw = () => {
    layout = systemsDesignLayout(
      ui.width,
      ui.height,
      (model.unconnected.length ? 1 : 0) +
        (model.unsupportedChannels.length ? 1 : 0),
    );
    const { frame, toolbar, equipment, viewport, inspector, footer } = layout;
    ui.viewportWindow(
      "systems",
      "Systems design",
      frame,
      viewport,
      actions.close,
    );
    actions.viewport(viewport, ui.width, ui.height);
    ui.text(
      `${name} · Read-only inspection`,
      toolbar.x,
      toolbar.y,
      14,
      palette.muted,
      toolbar.w,
    );
    let index = 0;
    for (const [id, label, active, run] of [
      [
        "reveal",
        "Reveal machinery",
        deck === "hidden",
        () => {
          deck = "hidden";
          actions.deck(deck);
          change();
        },
      ],
      [
        "lift",
        "Lift deck",
        deck === "lifted",
        () => {
          deck = "lifted";
          actions.deck(deck);
          change();
        },
      ],
      ["fit", "Fit ship", false, actions.fit],
    ] as const) {
      ui.button(id, label, layout.deckButtons[index++], run, {
        selected: active,
      });
    }
    index = 0;
    for (const ch of DESIGN_CHANNELS) {
      ui.button(
        `channel-${ch}`,
        `${NAMES[ch]} ${model.routes.filter((r) => r.channel === ch).length}`,
        layout.channelButtons[index++],
        () => {
          channels = channels.includes(ch)
            ? channels.filter((c) => c !== ch)
            : [...channels, ch];
          actions.channels(channels);
          change();
        },
        { selected: channels.includes(ch) },
      );
    }
    ui.panel(equipment);
    ui.panel(inspector);
    ui.text(
      `Equipment (${model.components.length})`,
      equipment.x + 8,
      equipment.y + 8,
      18,
      palette.text,
      equipment.w - 16,
    );
    ui.toggle(
      "under-floor",
      "Under-floor only",
      below,
      { x: equipment.x + 6, y: equipment.y + 34, w: equipment.w - 12, h: 32 },
      (next) => {
        below = next;
        equipmentScroll = 0;
        actions.belowOnly(next);
        if (next && !model.components.find((c) => c.id === selected)?.belowDeck)
          select(model.components.find((c) => c.belowDeck)?.id);
        change();
      },
    );
    const visible = model.components.filter((c) => !below || c.belowDeck);
    const list: Rect = {
      x: equipment.x + 6,
      y: equipment.y + 72,
      w: equipment.w - 12,
      h: Math.max(0, equipment.h - 78),
    };
    equipmentScroll = Math.min(
      equipmentScroll,
      Math.max(0, visible.length * 62 - list.h),
    );
    ui.scrollRegion(list, () =>
      visible.forEach((c, i) => {
        const r = {
          x: list.x,
          y: list.y + i * 62 - equipmentScroll,
          w: list.w,
          h: 56,
        };
        ui.listButton(
          `equipment-${c.id}`,
          c.name,
          `${c.placement.position[2].toFixed(2)} m · ${c.id.replace("mount:", "")}`,
          r,
          () => select(c.id),
          selected === c.id,
        );
      }),
    );
    if (!visible.length)
      ui.paragraph(
        "No under-floor equipment. Disable the filter to inspect all installations.",
        list,
        13,
      );
    const component = model.components.find((c) => c.id === selected);
    ui.text(
      component?.name ?? "Connections",
      inspector.x + 8,
      inspector.y + 8,
      20,
      palette.text,
      inspector.w - 16,
    );
    if (component)
      ui.button(
        "inspector-focus",
        "Focus",
        {
          x: inspector.x + 8,
          y: inspector.y + 36,
          w: Math.min(86, inspector.w - 16),
          h: 28,
        },
        () => actions.focus(component.id),
      );
    const detail: Rect = {
      x: inspector.x + 8,
      y: inspector.y + 72,
      w: inspector.w - 16,
      h: Math.max(0, inspector.h - 78),
    };
    const routes = model.routes.filter(
      (r) =>
        r.from.startsWith(`${selected}/`) || r.to.startsWith(`${selected}/`),
    );
    const lines: { text: string; heading?: boolean }[] = component
      ? [
          {
            text: `${component.definition.sizeClass} · ${Math.round(component.definition.massKg).toLocaleString()} kg`,
          },
          { text: component.belowDeck ? "Under floor" : "Above floor" },
          { text: `Elevation ${component.placement.position[2].toFixed(2)} m` },
          {
            text: `${component.ports.length} ports · ${routes.length} connections`,
          },
          { text: "Service ports", heading: true },
          ...component.ports.flatMap((p) => [
            {
              text: `${NAMES[p.channel as DesignChannel]} · ${p.direction === "in" ? "Input" : p.direction === "out" ? "Output" : "Bidirectional"}`,
            },
            {
              text: `${p.id} · rated ${p.capacity.toLocaleString()} ${SHIP_COMPONENT_CHANNEL_UNITS[p.channel]}`,
            },
          ]),
          { text: "Proposed connections", heading: true },
          ...routes.flatMap((r) => {
            const other = model.components.find((c) =>
              (r.from.startsWith(`${selected}/`) ? r.to : r.from).startsWith(
                `${c.id}/`,
              ),
            );
            return [
              {
                text: `${NAMES[r.channel]} · ${r.from.startsWith(`${selected}/`) ? "To" : "From"} ${other?.name ?? "equipment"}`,
              },
              { text: other?.id.replace("mount:", "") ?? r.id },
            ];
          }),
        ]
      : [{ text: "Select equipment to inspect ports." }];
    inspectorScroll = Math.min(
      inspectorScroll,
      Math.max(0, lines.length * 25 - detail.h),
    );
    ui.scrollRegion(detail, () =>
      lines.forEach((line, i) =>
        ui.text(
          line.text,
          detail.x,
          detail.y + i * 25 - inspectorScroll,
          line.heading ? 17 : 13,
          line.heading ? palette.text : palette.muted,
          detail.w,
        ),
      ),
    );
    ui.text(
      deck === "lifted" ? "Deck lifted 4 m" : "Deck hidden",
      viewport.x + 8,
      viewport.y + viewport.h - 26,
      13,
      palette.muted,
      viewport.w - 16,
    );
    if (model.unconnected.length)
      ui.text(
        `${model.unconnected.length} inputs have no compatible source`,
        footer.x,
        footer.y - 17,
        12,
        palette.gold,
        footer.w,
      );
    if (model.unsupportedChannels.length)
      ui.text(
        `Other service channels not shown: ${model.unsupportedChannels.join(", ")}`,
        footer.x,
        footer.y - 34,
        12,
        palette.gold,
        footer.w,
      );
    ui.text(
      error
        ? "Inspection: " + error
        : status || "Drag to orbit · right drag to pan · wheel to zoom",
      footer.x,
      footer.y,
      13,
      error ? palette.red : palette.muted,
      footer.w,
    );
    ui.paragraph(
      "Routing preview · Proposed pipe and cable paths over shared service networks.",
      { ...footer, y: footer.y + 21, h: 24 },
      13,
    );
    canvas.setAttribute(
      "aria-description",
      `Systems design. Read-only ${name}. ${visible.length} equipment installations. ${channels.join(", ")} routes. ${component?.name ?? "Select equipment"}. ${error || status}`,
    );
  };
  return {
    select,
    status(value: string) {
      status = value;
      change();
    },
    error(value: string) {
      error = value;
      change();
    },
    snapshot: () => ({
      selected,
      belowOnly: below,
      deck,
      channels: [...channels],
      layout,
      controls: ui.hits.map(({ id, label, rect, disabled }) => ({
        id,
        label,
        rect,
        disabled,
      })),
      status,
      error,
    }),
    dispose: () => ui.dispose(),
  };
}
