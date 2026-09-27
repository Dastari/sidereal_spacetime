// A precise transparent centre stays on the intended world target. The white
// under-stroke keeps the cyan combat reticle legible on pale ship floors.
const reticle = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke-linecap="square"><path d="M16 3v7m0 12v7M3 16h7m12 0h7" stroke="#061326" stroke-width="4"/><circle cx="16" cy="16" r="6" stroke="#061326" stroke-width="3"/><path d="M16 3v7m0 12v7M3 16h7m12 0h7" stroke="#dffaff" stroke-width="2"/><circle cx="16" cy="16" r="6" stroke="#36d9ff" stroke-width="1.5"/></g></svg>`;
export const COMBAT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(reticle)}") 16 16, crosshair`;
