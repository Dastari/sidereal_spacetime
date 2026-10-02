/** Finite R24 pressure-case source prototype. The listed RAW outer cubes retire
 * only their outward half; both original inward CORE courses and optical duties
 * remain intact. Exact R23 source admission: trace762f6263 / receiptf904f1fa.
 * Old bow helper and global optical/mesher guards are deliberately unchanged. */
import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import type {
  ShipVisualLayer,
  ShipVisualProfileId,
  ShipVisualView,
} from "@sidereal/content/ship-visual";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import { referenceCockpitApertureSourceAdmittedR002 } from "@sidereal/content/ship-visual-r002";
import { dressShip } from "./ship-dresser";
import {
  sampleShipVisualLayers,
  visualCellKey,
  polygonBoundaryDistance,
  type VisualCell,
} from "./ship-visual-sampler";

// Exact independent north/south source coordinates, slots and final writers.
const expected: Record<
  ShipVisualView,
  readonly (readonly [string, string, string])[]
> = {
  deck: [
    ["173,14,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,14,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,14,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,14", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,15", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,16", "secondary", "volume:hull:diagonal-pressure-case"],
    ["178,19,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,11", "trim", "volume:hull:exposed-bay:1:0:armor:case"],
    ["181,22,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["182,23,11", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["182,23,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["184,25,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["185,26,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["185,26,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["186,27,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["186,27,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["187,28,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["187,28,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["188,29,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["188,29,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,8", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,9", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,10", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,18", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,19", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,30,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,30,22", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,31,9", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,10", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,11", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,12", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,17", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,18", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,19", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,31,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["191,32,9", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,10", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,11", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,18", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,19", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,20", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["190,80,9", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,10", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,11", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,12", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,17", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,18", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,19", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,80,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,8", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,9", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,10", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,17", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,18", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,19", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,22", "primary", "volume:hull:diagonal-inset-lip"],
    ["188,82,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["187,83,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["187,83,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["186,84,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["186,84,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["185,85,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["185,85,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["184,86,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["183,87,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["182,88,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["181,89,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["180,90,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["177,93,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,93,14", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,93,15", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,16", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,97,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,97,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,97,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["172,98,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
  ],
  flight: [
    ["173,14,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,14,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,14,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,14", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,18,15", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,16", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,18,24", "primary", "volume:hull:diagonal-inset-lip"],
    ["177,18,25", "primary", "volume:hull:diagonal-inset-lip"],
    ["177,18,26", "primary", "volume:hull:diagonal-inset-lip"],
    ["178,19,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["178,19,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["179,20,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,11", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["180,21,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,11", "trim", "volume:hull:exposed-bay:1:0:armor:case"],
    ["181,22,12", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,13", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,14", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,15", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["181,22,16", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["182,23,11", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["182,23,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["182,23,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["183,24,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["184,25,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["185,26,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["185,26,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["186,27,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["186,27,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["187,28,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["187,28,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["188,29,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["188,29,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,8", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,9", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,10", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,11", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,12", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,18", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["189,30,19", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["189,30,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,30,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,30,22", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,31,9", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,10", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,11", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,12", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,13", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,14", "trim", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,15", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,16", "primary", "volume:hull:exposed-bay:1:32:access:armor"],
    ["190,31,17", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,18", "trim", "volume:hull:exposed-bay:1:32:access:case"],
    ["190,31,19", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,31,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,31,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["191,32,9", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,10", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,11", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,18", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,19", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,20", "trim", "volume:hull:exposed-bay:2:0:access:case"],
    ["191,32,21", "secondary", "volume:hull:sloped-pressure-skin"],
    ["190,80,9", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,10", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,11", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,12", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["190,80,17", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,18", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["190,80,19", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,80,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["190,80,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,8", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,9", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,10", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,17", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,18", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["189,81,19", "trim", "volume:hull:exposed-bay:3:0:access:case"],
    ["189,81,20", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,21", "primary", "volume:hull:diagonal-inset-lip"],
    ["189,81,22", "primary", "volume:hull:diagonal-inset-lip"],
    ["188,82,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,13", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,14", "trim", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,15", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["188,82,16", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["187,83,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["187,83,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["186,84,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["186,84,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["185,85,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["185,85,12", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["184,86,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["183,87,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["182,88,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["181,89,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["180,90,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["177,93,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,93,14", "trim", "volume:hull:diagonal-pressure-case"],
    ["177,93,15", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,16", "secondary", "volume:hull:diagonal-pressure-case"],
    ["177,93,24", "primary", "volume:hull:diagonal-inset-lip"],
    ["177,93,25", "primary", "volume:hull:diagonal-inset-lip"],
    ["177,93,26", "primary", "volume:hull:diagonal-inset-lip"],
    ["173,97,11", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,97,12", "secondary", "volume:hull:diagonal-pressure-case"],
    ["173,97,13", "trim", "volume:hull:diagonal-pressure-case"],
    ["172,98,11", "primary", "volume:hull:exposed-bay:3:0:access:armor"],
    ["161,2,32", "primary", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["161,2,33", "trim", "volume:hull:exposed-bay:1:0:armor:case"],
    ["161,2,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["161,2,35", "trim", "volume:hull:diagonal-inset-lip"],
    ["161,2,36", "trim", "volume:hull:diagonal-inset-lip"],
    ["162,3,32", "trim", "volume:hull:exposed-bay:1:0:armor:armor"],
    ["162,3,33", "trim", "volume:hull:exposed-bay:1:0:armor:case"],
    ["162,3,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["162,3,35", "trim", "volume:hull:diagonal-inset-lip"],
    ["162,3,36", "primary", "volume:hull:diagonal-inset-lip"],
    ["163,4,32", "trim", "volume:hull:exposed-bay:1:0:armor:case"],
    ["163,4,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["163,4,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["163,4,35", "primary", "volume:hull:diagonal-inset-lip"],
    ["164,5,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["164,5,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["164,5,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["165,6,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["165,6,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["165,6,34", "primary", "volume:hull:diagonal-inset-lip"],
    ["166,7,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["166,7,33", "primary", "volume:hull:diagonal-inset-lip"],
    ["167,8,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["168,9,32", "primary", "volume:hull:diagonal-inset-lip"],
    ["168,102,32", "primary", "volume:hull:diagonal-inset-lip"],
    ["167,103,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["166,104,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["166,104,33", "primary", "volume:hull:diagonal-inset-lip"],
    ["165,105,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["165,105,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["165,105,34", "primary", "volume:hull:diagonal-inset-lip"],
    ["164,106,32", "trim", "volume:hull:diagonal-inset-lip"],
    ["164,106,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["164,106,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["163,107,32", "trim", "volume:hull:exposed-bay:3:32:armor:case"],
    ["163,107,33", "trim", "volume:hull:diagonal-inset-lip"],
    ["163,107,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["163,107,35", "primary", "volume:hull:diagonal-inset-lip"],
    ["162,108,32", "trim", "volume:hull:exposed-bay:3:32:armor:armor"],
    ["162,108,33", "trim", "volume:hull:exposed-bay:3:32:armor:case"],
    ["162,108,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["162,108,35", "trim", "volume:hull:diagonal-inset-lip"],
    ["162,108,36", "primary", "volume:hull:diagonal-inset-lip"],
    ["161,109,32", "primary", "volume:hull:exposed-bay:3:32:armor:armor"],
    ["161,109,33", "trim", "volume:hull:exposed-bay:3:32:armor:case"],
    ["161,109,34", "trim", "volume:hull:diagonal-inset-lip"],
    ["161,109,35", "trim", "volume:hull:diagonal-inset-lip"],
    ["161,109,36", "trim", "volume:hull:diagonal-inset-lip"],
  ],
} as const;

const sides = [
  {
    piece: "bow.slope1.deck.s2.a1.edge1",
    frame: [10, 1, 0, 270],
    a: [1, -1, 0],
    d: 159,
    y0: 2,
    y1: 33,
    id: "volume:hull:case:1:159",
  },
  {
    piece: "bow.slope1.deck.s2.a0.edge1",
    frame: [10, 6, 0, 0],
    a: [1, 1, 0],
    d: 271,
    y0: 80,
    y1: 110,
    id: "volume:hull:case:3:271",
  },
] as const;
const protectedCell = (c: VisualCell) =>
  c.slot === "glass" ||
  c.role === "doorframe" ||
  c.slot === "emit_a" ||
  c.slot === "emit_b";
const inLayer = (l: ShipVisualLayer, c: VisualCell) => {
  if ([c.x, c.y, c.z].some((v, i) => v < l.bounds[i] || v >= l.bounds[i + 3]))
    return false;
  if (!l.polygon) return true;
  const p: [number, number] = [c.x + 0.5, c.y + 0.5];
  return (
    insidePolygon(l.polygon, ...p) &&
    !l.holes?.some((h) => insidePolygon(h, ...p)) &&
    (l.band === undefined || polygonBoundaryDistance(p, l.polygon) <= l.band)
  );
};
function cloneCell(
  c: VisualCell,
  facet: NonNullable<ShipVisualLayer["facet"]>,
): ShipVisualLayer {
  return {
    id: `${facet.id}:r24-source:${c.x}:${c.y}:${c.z}`,
    role: c.role,
    slot: c.slot,
    support: c.family,
    bounds: [c.x, c.y, c.z, c.x + 1, c.y + 1, c.z + 1],
    ...(c.surfaceRole ? { surfaceRole: c.surfaceRole } : {}),
    ...(c.normalHint ? { normalHint: [...c.normalHint] } : {}),
    ...(c.normalChart ? { normalChart: c.normalChart } : {}),
    ...(c.normalSide ? { normalSide: c.normalSide } : {}),
    facet,
  };
}

/** Atomic admission: a changed source leaves the complete previous candidate.
 * Pane layers are the actual unchanged aperture recipe, never inferred mirroring. */
export function referenceBowTransitionR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profile: ShipVisualProfileId,
  finalLayers: readonly ShipVisualLayer[],
  paneLayers: readonly ShipVisualLayer[],
): ShipVisualLayer[] {
  if (
    doc.id !== "fed.s.wren" ||
    profile !== "federation" ||
    !referenceCockpitApertureSourceAdmittedR002(profile)
  )
    return [];
  const kit = dressShip(doc, { catalog }).kit;
  for (const s of sides) {
    const k = kit.filter((k) => k.piece === s.piece);
    if (
      k.length !== 1 ||
      k[0].view !== "both" ||
      k[0].mirror ||
      [k[0].x, k[0].y, k[0].z, k[0].rotDeg].some((n, i) => n !== s.frame[i])
    )
      return [];
  }
  const cells = sampleShipVisualLayers(finalLayers),
    additions = new Map<string, ShipVisualLayer>();
  // Identical-plane maintenance changes only identity, not the clipping shape.
  for (const [key, c] of cells) {
    const s = sides.find(
      (s) =>
        c.y >= s.y0 &&
        c.y < s.y1 &&
        c.z >= 8 &&
        c.z < 42 &&
        c.x + 0.5 + s.a[1] * (c.y + 0.5) === s.d,
    );
    if (!s || c.family !== "volume:hull" || !c.facet || c.facet.id === s.id)
      continue;
    const priorJoined =
      s.a[1] === -1
        ? "volume:hull:joined-bow-frame:south"
        : "volume:hull:joined-bow-frame:north";
    if (
      c.facet.id !== priorJoined ||
      c.facet.d !== s.d ||
      c.facet.a.join(",") !== s.a.join(",")
    )
      return [];
    additions.set(key, cloneCell(c, { ...c.facet, id: s.id }));
  }
  for (const [key, slot, writer] of expected[view]) {
    const c = cells.get(key);
    if (
      !c ||
      c.role !== "core" ||
      c.family !== "volume:hull" ||
      c.slot !== slot ||
      c.facet ||
      protectedCell(c)
    )
      return [];
    const s = sides.find(
      (s) =>
        c.y >= s.y0 && c.y < s.y1 && c.x + 0.5 + s.a[1] * (c.y + 0.5) === s.d,
    );
    if (!s) return [];
    let owner: ShipVisualLayer | undefined;
    for (let i = finalLayers.length - 1; i >= 0; i--)
      if (inLayer(finalLayers[i], c)) {
        owner = finalLayers[i];
        break;
      }
    if (owner?.id !== writer || owner.role !== "core" || owner.slot !== slot)
      return [];
    for (const [dx, dy] of [
      [-1, 0],
      [0, -s.a[1]],
    ])
      for (const n of [1, 2]) {
        const b = cells.get(visualCellKey(c.x + dx * n, c.y + dy * n, c.z));
        if (
          !b ||
          b.role !== "core" ||
          b.family !== c.family ||
          protectedCell(b)
        )
          return [];
      }
    for (let z = -2; z <= 2; z++)
      for (let y = -2; y <= 2; y++)
        for (let x = -2; x <= 2; x++) {
          const b = cells.get(visualCellKey(c.x + x, c.y + y, c.z + z));
          if (b && protectedCell(b)) return [];
        }
    if (
      paneLayers.some(
        (l) =>
          l.slot === "glass" &&
          [c.x, c.y, c.z].every(
            (v, i) => v < l.bounds[i + 3] + 2 && v + 1 > l.bounds[i] - 2,
          ),
      )
    )
      return [];
    additions.set(key, cloneCell(c, { id: s.id, a: [...s.a], d: s.d }));
  }
  // No neighboring descriptor exemption: every active patch has exact identity/plane.
  for (const l of additions.values()) {
    const [X, Y, Z] = l.bounds;
    for (let z = -1; z <= 1; z++)
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const key = visualCellKey(X + x, Y + y, Z + z),
            f = additions.get(key)?.facet ?? cells.get(key)?.facet;
          if (
            f &&
            (f.id !== l.facet!.id ||
              f.d !== l.facet!.d ||
              f.a.join(",") !== l.facet!.a.join(","))
          )
            return [];
        }
  }
  return [...additions.values()];
}
