export interface FloorFinish {
  id: string;
  label: string;
  tint?: string;
  baseColor: string;
  normal: string;
  orm: string;
  repeatM: number;
}
export const DEFAULT_FLOOR_FINISH: FloorFinish = {
  id: "floor-panel-r002",
  label: "Pale panel",
  baseColor: "/assets/construction/floor-finishes/r002/basecolor.png",
  normal: "/assets/construction/floor-finishes/r002/normal.png",
  orm: "/assets/construction/floor-finishes/r002/orm.png",
  repeatM: 2,
};
export const FLOOR_FINISHES: readonly FloorFinish[] = [
  DEFAULT_FLOOR_FINISH,
  {
    ...DEFAULT_FLOOR_FINISH,
    id: "floor-panel-graphite",
    label: "Graphite panel",
    tint: "#66717d",
  },
];
