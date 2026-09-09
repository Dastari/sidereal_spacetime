import { NATIVE_EXTERNAL_AIRLOCK_AUDIT_TEXT } from "@sidereal/content/construction-airlock-room";
import { createPublishedNativeExternalAirlockCompiler } from "./construction-airlock-plan";
export const compilePublishedNativeExternalAirlock =
  createPublishedNativeExternalAirlockCompiler(
    new TextEncoder().encode(NATIVE_EXTERNAL_AIRLOCK_AUDIT_TEXT),
  );
