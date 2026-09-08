export const STARTER = {
  id: "wayfarer",
  name: "Wayfarer",
  massKg: 12000,
  thrustN: 36000,
  turnAcceleration: 0.65,
  model: "/assets/wayfarer.glb",
} as const;
export const LAYERS = [
  "Rooms",
  "Interior equipment",
  "Hull armor",
  "Exterior hardpoints",
  "Roof",
  "Markings",
  "Utilities",
] as const;
export const THEMES = [
  "Frontier Industrial",
  "Aegis Naval",
  "Helix Research",
  "Corsair Salvage",
  "Verdant Logistics",
  "Umbra Syndicate",
] as const;
export const DECK_HALF_WIDTH = 5;
export const DECK_HALF_LENGTH = 9;
