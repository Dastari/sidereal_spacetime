import type { InventoryDefinition } from "@sidereal/content/inventory";
import { weaponMode, type WeaponDefinition } from "@sidereal/content/weapons";
import { weaponDefinitionOf } from "@sidereal/content/item-presentation";
import { itemRarity } from "./character-data";
import { drawItemFrame, ITEM_RARITY_PALETTES } from "./item-frame";
import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";

export const ITEM_CATEGORIES = [
  "All",
  "Weapons",
  "Armor",
  "Tools",
  "Supplies",
  "Storage",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
type Stat = { label: string; value: string; fraction: number };
const descriptions: Record<string, string> = {
  "compact-pistol":
    "A compact sidearm built for close quarters aboard crowded ships. A dependable companion on an uncertain deck.",
  "heavy-handgun":
    "A reinforced heavy sidearm with a substantial power chamber. Built to stop a threat before it closes the gap.",
  carbine:
    "A versatile frontier carbine with a stabilized receiver and compact stock. Balanced for patrols and boarding operations.",
  "long-rifle":
    "A precision survey rifle with an extended barrel and optical sight. Designed for deliberate fire across open terrain.",
  scanner:
    "A handheld survey instrument for inspecting unfamiliar materials and searching for useful signatures.",
  "plasma-cutter":
    "A rugged industrial cutter that concentrates energy at its working tip. A salvage crew's essential workshop tool.",
  medkit:
    "A sealed field kit containing dressings, diagnostic patches and emergency medical supplies.",
  "power-cell":
    "A replaceable energy cell with protected contacts and a durable transport shell.",
  "field-pack":
    "A practical expedition backpack with reinforced compartments for tools and supplies. Contents travel with the pack.",
  "resource-canister":
    "A pressure-rated fuel vessel with a sealed cap. Its reservoir remains attached when the canister changes hands.",
};
/** Filter tab of a handheld family (definition data, never an id list). */
const HANDHELD_TABS: Record<
  NonNullable<InventoryDefinition["category"]>,
  ItemCategory
> = {
  weapon: "Weapons",
  tool: "Tools",
  utility: "Tools",
  medical: "Supplies",
};
const HANDHELD_LABELS: Record<
  NonNullable<InventoryDefinition["category"]>,
  string
> = {
  weapon: "Weapon",
  tool: "Tool",
  utility: "Utility",
  medical: "Medical",
};
/** Provisional server stats of a weapon (content/weapons.ts; the balance table is on the wiki). */
function weaponStats(
  w: WeaponDefinition | undefined,
): [string, string, number][] | undefined {
  if (!w) return undefined;
  const mode = weaponMode(w);
  const perShot =
    mode === "pellets" ? `${w.pellets} × ${w.damage}` : `${w.damage}`;
  const rate = 1000 / Math.max(1, w.cooldownMs);
  return [
    [
      mode === "thrown" ? "Blast damage" : "Damage",
      perShot,
      Math.min(1, (w.damage * (w.pellets ?? 1)) / 80),
    ],
    [
      "Fire rate",
      `${rate >= 10 ? rate.toFixed(0) : rate.toFixed(1)} / s`,
      Math.min(1, rate / 16),
    ],
    [
      mode === "melee" ? "Reach" : mode === "thrown" ? "Throw range" : "Range",
      `${w.rangeMeters} m`,
      Math.min(1, w.rangeMeters / 90),
    ],
    ["Energy cost", `${w.shotCost} / ${w.capacity}`, w.shotCost / w.capacity],
    ...(w.reloadMs
      ? [
          [
            "Reload",
            `${(w.reloadMs / 1000).toFixed(1)} s`,
            Math.min(1, w.reloadMs / 3500),
          ] as [string, string, number],
        ]
      : []),
    ...(w.stunMs
      ? [
          [
            "Stun",
            `${(w.stunMs / 1000).toFixed(1)} s`,
            Math.min(1, w.stunMs / 3000),
          ] as [string, string, number],
        ]
      : []),
    ...(w.blastRadiusM
      ? [
          [
            "Blast radius",
            `${w.blastRadiusM} m`,
            Math.min(1, w.blastRadiusM / 5),
          ] as [string, string, number],
        ]
      : []),
  ];
}
/** `weapon` is the instance's pinned weapon revision (X-2); revision 1 when omitted. */
export function itemDetails(
  d: InventoryDefinition,
  weapon: WeaponDefinition | undefined = weaponDefinitionOf({
    definitionId: d.id,
  }),
) {
  const category: ItemCategory = d.storage
    ? "Storage"
    : d.characterComponentId || d.wardrobeId
      ? "Armor"
      : d.category
        ? HANDHELD_TABS[d.category]
        : "Supplies";
  /** Category line of the detail panel: the item's own data where it has a family. */
  const label = d.category
    ? HANDHELD_LABELS[d.category] + (d.role ? " · " + d.role : "")
    : category;
  const usable = !d.category || !!weapon;
  const seed = [...d.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const archetype = d.characterComponentId?.split("-")[0] ?? "crew";
  const description =
    descriptions[d.id] ??
    (d.category === "weapon"
      ? `${d.name} (${(d.role ?? "weapon").toLowerCase()}). Provisional server stats; every shot is resolved by the ship's authority.`
      : undefined) ??
    (d.category
      ? `${d.name} (${(d.role ?? d.category).toLowerCase()}). Held and equipped now; its use arrives in the next items batch.`
      : undefined) ??
    (d.equipSlot === "uniform"
      ? `A department crew jumpsuit (${d.name.toLowerCase()}). Worn under armour; the department colours show at the cuffs, collar and trim. Compatible with either body type.`
      : undefined) ??
    (d.wardrobeId
      ? `${d.name}. Standard-issue modular kit, independently fitted ${d.equipSlot === "back" ? "storage with secured compartments" : "protection with articulated fittings"}. Compatible with either body type.`
      : undefined) ??
    `${d.name} from the ${archetype} uniform. Independently fitted ${d.equipSlot === "back" ? "storage with secured compartments" : "protection with articulated fittings"} for a modular crew loadout. Compatible with either body type.`;
  const values = d.reservoir
    ? [
        ["Reservoir capacity", `${d.reservoir.capacityLitres} L`, 1],
        ["Contents", d.reservoir.liquidType, 1],
        ["Seal condition", "Intact", 1],
      ]
    : weaponStats(weapon)
      ? weaponStats(weapon)!
      : d.category
        ? [
            ["Use", "Not yet usable", 0],
            ["Hold", d.twoHanded ? "Two hands" : "One hand", 1],
            ["Grid", `${d.width} × ${d.height}`, 1],
          ]
        : category === "Armor"
          ? [
              ["Protection", `${12 + (seed % 65)}`, 0.6],
              ["Thermal resistance", `${5 + (seed % 30)}%`, 0.4],
              ["Durability", "100 / 100", 1],
            ]
          : category === "Storage"
            ? [
                [
                  "Grid capacity",
                  `${d.storage!.width} × ${d.storage!.height}`,
                  1,
                ],
                ["Payload", `${d.storage!.maxMassKg} kg`, 0.75],
                ["Durability", "100 / 100", 1],
              ]
            : category === "Tools"
              ? [
                  ["Efficiency", `${80 + (seed % 40)}%`, 0.8],
                  ["Operating range", `${2 + (seed % 12)} m`, 0.45],
                  ["Energy cost", `${3 + (seed % 9)}`, 0.3],
                ]
              : [
                  [
                    d.id === "medkit" ? "Restoration" : "Stored energy",
                    `${40 + (seed % 110)}`,
                    0.72,
                  ],
                  ["Quality", `${75 + (seed % 25)}%`, 0.85],
                  ["Condition", "Pristine", 1],
                ];
  return {
    category,
    label,
    usable,
    description,
    price: 100 + (seed % 490) * 10,
    stats: values.map(
      ([label, value, fraction]) => ({ label, value, fraction }) as Stat,
    ),
    rarity: itemRarity(d.id),
  };
}

/** Noninteractive hover card; it never steals a grid's hit targets. */
export function drawItemTooltip(
  ui: CanvasUI,
  d: InventoryDefinition,
  anchor: Rect,
  icon: (ui: CanvasUI, d: InventoryDefinition, r: Rect) => void,
  weapon: WeaponDefinition | undefined = weaponDefinitionOf({
    definitionId: d.id,
  }),
) {
  const data = itemDetails(d, weapon),
    color = ITEM_RARITY_PALETTES[data.rarity],
    w = Math.min(360, ui.width - 20);
  const wrappedHeight = (text: string, width: number, size: number) => {
    ui.ctx.font = `500 ${size}px Barlow, sans-serif`;
    let line = "",
      lines = 1;
    for (const word of text.split(" ")) {
      if (line && ui.ctx.measureText(line + word).width > width) {
        lines++;
        line = "";
      }
      line += word + " ";
    }
    return lines * (size + 6);
  };
  const title = d.name.toUpperCase(),
    titleWidth = w - 128;
  const titleHeight = wrappedHeight(title, titleWidth, 17);
  const descriptionY = Math.max(138, 18 + titleHeight + 43);
  const statsY =
    descriptionY + wrappedHeight(data.description, w - 32, 13) + 16;
  const h = statsY + data.stats.length * 27 + 74;
  const zoom = Math.min(1, (ui.height - 16) / h);
  const right = anchor.x + anchor.w + 12;
  const r = {
    x: Math.max(
      8,
      right + w * zoom < ui.width - 8 ? right : anchor.x - w * zoom - 12,
    ),
    y: Math.max(8, Math.min(anchor.y, ui.height - h * zoom - 10)),
    w,
    h,
  };
  const c = ui.ctx;
  c.save();
  c.translate(r.x * (1 - zoom), r.y * (1 - zoom));
  c.scale(zoom, zoom);
  drawItemFrame(ui, r, { rarity: data.rarity });
  c.fillStyle = "rgba(2,12,27,.97)";
  c.fillRect(r.x + 9, r.y + 9, w - 18, h - 18);
  const image = { x: r.x + 14, y: r.y + 14, w: 94, h: 110 };
  drawItemFrame(ui, image, { rarity: data.rarity });
  icon(ui, d, { x: image.x + 5, y: image.y + 5, w: 84, h: 100 });
  ui.paragraph(
    title,
    { x: r.x + 118, y: r.y + 18, w: titleWidth, h: 66 },
    17,
    color.edge,
  );
  const categoryY = r.y + 18 + titleHeight + 2;
  ui.text(
    data.label.toUpperCase(),
    r.x + 118,
    categoryY,
    12,
    data.usable ? palette.blue : palette.gold,
    titleWidth,
  );
  const badge = {
    x: r.x + 118,
    y: categoryY + 19,
    w: Math.min(titleWidth, 94),
    h: 19,
  };
  c.strokeStyle = color.edge;
  c.fillStyle = color.wash;
  c.fillRect(badge.x, badge.y, badge.w, badge.h);
  c.strokeRect(badge.x + 0.5, badge.y + 0.5, badge.w - 1, badge.h - 1);
  ui.text(
    color.label.toUpperCase(),
    badge.x + 6,
    badge.y + 3,
    11,
    color.bright,
    badge.w - 12,
  );
  ui.paragraph(
    data.description,
    { x: r.x + 16, y: r.y + descriptionY, w: w - 32, h: 70 },
    13,
    palette.muted,
  );
  const top = r.y + statsY;
  data.stats.forEach((stat, i) => {
    const y = top + i * 27;
    ui.text(stat.label, r.x + 16, y, 12, palette.muted, 108);
    ui.bar({ x: r.x + 125, y: y + 2, w: w - 205, h: 8 }, stat.fraction);
    ui.text(stat.value, r.x + w - 72, y, 12, palette.text, 62);
  });
  const y = top + data.stats.length * 27;
  c.fillStyle = "#2676a877";
  c.fillRect(r.x + 16, y + 4, w - 32, 1);
  ui.text(`${d.massKg} kg`, r.x + 17, y + 15, 13, palette.muted);
  ui.text(
    `◉  ${data.price.toLocaleString()} cr`,
    r.x + 100,
    y + 15,
    13,
    color.edge,
  );
  ui.text(
    weapon
      ? "Provisional server stats · preview price"
      : "Includes preview stats & price",
    r.x + 17,
    y + 37,
    10,
    palette.muted,
    w - 34,
  );
  c.restore();
}
