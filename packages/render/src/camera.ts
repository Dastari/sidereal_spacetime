/** Babylon right-handed orbit orientation: space north-up; cabin bow-left. */
export const cameraAlpha = (heading: number, interior: boolean) =>
  interior ? Math.PI - heading : Math.PI / 2;
