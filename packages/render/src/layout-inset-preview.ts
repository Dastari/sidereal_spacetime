import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { loadInsetNativeVisuals } from "./inset-native-visuals";
import {
  planLayoutInsetVisuals,
  type LayoutInsetPreviewInput,
} from "./layout-inset-visual-plan";

type Visibility = Record<"wall" | "roof" | "floor", boolean>;

/** Local native preview. No collision, seal or publication capability is granted. */
export function createLayoutInsetPreview(
  scene: Scene,
  report: (message: string) => void = () => {},
  loader = loadInsetNativeVisuals,
) {
  const root = new TransformNode("layout-inset-preview", scene);
  const pending = new Set<Promise<void>>();
  let disposed = false;
  let previous: LayoutInsetPreviewInput | undefined;
  let signature = "";
  let controller: AbortController | undefined;
  let loaded: Awaited<ReturnType<typeof loader>> | undefined;
  let plan: ReturnType<typeof planLayoutInsetVisuals> = {
    requests: [],
    issues: [],
  };
  let visibility: Visibility = { wall: true, roof: true, floor: true };
  function applyVisibility() {
    for (const node of loaded?.roots ?? [])
      node.setEnabled(visibility[node.metadata.role as keyof Visibility]);
  }
  function clear() {
    controller?.abort();
    loaded?.dispose();
    loaded = undefined;
  }
  return {
    get meshes() {
      return loaded?.meshes ?? [];
    },
    get plan() {
      return plan;
    },
    update(
      input: LayoutInsetPreviewInput | undefined,
      visible: Visibility,
      origin: readonly number[] = [0, 0, 0],
    ) {
      if (disposed) return;
      visibility = visible;
      root.position.set(-origin[0], -origin[1], -origin[2]);
      applyVisibility();
      if (
        input &&
        previous &&
        input.document === previous.document &&
        input.compiled === previous.compiled &&
        input.deckId === previous.deckId
      )
        return;
      const next = input
        ? planLayoutInsetVisuals(input)
        : { requests: [], issues: [] };
      previous = input;
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      signature = nextSignature;
      clear();
      plan = next;
      if (!next.requests.length) {
        report(
          next.issues.length
            ? `Native boundary preview unavailable · ${next.issues.length} fit notes`
            : "0 native boundary pieces",
        );
        return;
      }
      const active = new AbortController();
      controller = active;
      report("Loading pinned native boundary pieces");
      const work = loader(scene, root, next.requests, { signal: active.signal })
        .then((view) => {
          if (disposed || active.signal.aborted) {
            view.dispose();
            return;
          }
          loaded = view;
          applyVisibility();
          report(
            `${next.requests.length} native boundary pieces · physical qualification pending`,
          );
        })
        .catch((error: unknown) => {
          if (disposed || active.signal.aborted) return;
          plan = {
            requests: [],
            issues: [
              {
                key: "native-load",
                message:
                  error instanceof Error
                    ? error.message
                    : "Native boundary preview failed",
              },
            ],
          };
          report(plan.issues[0].message);
        });
      pending.add(work);
      void work.finally(() => pending.delete(work));
    },
    async ready() {
      await Promise.allSettled([...pending]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      root.dispose();
    },
  };
}
