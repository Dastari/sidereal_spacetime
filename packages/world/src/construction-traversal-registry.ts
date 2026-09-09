import {
  NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT,
  NATIVE_TRAVERSAL_ROOM_DELIVERY,
} from "@sidereal/content/construction-traversal-room";
import { createPublishedNativeTraversalCompiler } from "@sidereal/sim/construction-traversal";
import {
  traversalAdapterKey,
  type TraversalRegistry,
} from "./construction-traversal";

/** Installed, build-verified review adapter. Never supplied by a reducer caller. */
export const nativeTraversalRegistry: TraversalRegistry = new Map([
  [
    traversalAdapterKey(
      NATIVE_TRAVERSAL_ROOM_DELIVERY.adapterId,
      NATIVE_TRAVERSAL_ROOM_DELIVERY.revision,
    ),
    {
      adapterId: NATIVE_TRAVERSAL_ROOM_DELIVERY.adapterId,
      revision: NATIVE_TRAVERSAL_ROOM_DELIVERY.revision,
      auditSha256: NATIVE_TRAVERSAL_ROOM_DELIVERY.auditSha256,
      compile: createPublishedNativeTraversalCompiler({
        delivery: NATIVE_TRAVERSAL_ROOM_DELIVERY,
        audit: new TextEncoder().encode(NATIVE_TRAVERSAL_ROOM_AUDIT_TEXT),
      }),
    },
  ],
]);
