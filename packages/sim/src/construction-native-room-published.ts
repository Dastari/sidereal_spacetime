import { NATIVE_PRESSURE_ROOM_AUDIT_TEXT } from "@sidereal/content/construction-pressure-room";
import { createPublishedNativePressureRoomCompiler } from "./construction-native-room";

/** Source bytes were checked by the publication installer. Runtime still checks
 * the exact audit hash, installed part identities and actual loader GLB hashes. */
export const compilePublishedNativePressureRoom =
  createPublishedNativePressureRoomCompiler(
    new TextEncoder().encode(NATIVE_PRESSURE_ROOM_AUDIT_TEXT),
  );
export const NATIVE_PRESSURE_FLOW_POLICY = Object.freeze({
  id: "native-room-review-flow-v1",
  openConductance: 0.002,
  closedConductance: 0.00001,
});
