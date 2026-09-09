import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export const POSE_REVIEW_PREFIX = "/__pose-review/r002/";
const revision =
  "assets/art-library/designs/crew.animation.aim/revisions/r002/";
const files = [
  "crew-poses.glb",
  "runtime-aim-space.json",
  "profile-socket-metadata.json",
  "equipment/manifest.json",
  ...[
    "carbine",
    "long-rifle",
    "compact-pistol",
    "heavy-handgun",
    "flashlight",
    "plasma-cutter",
    "sample-scanner",
  ].map((id) => `equipment/${id}.glb`),
];

/** Snapshot the whole verified pair together; no generic repository file serving. */
export function readPoseReviewAssets(root: string) {
  const directory = join(root, revision);
  const delivery = JSON.parse(
    readFileSync(join(directory, "delivery-manifest.json"), "utf8"),
  );
  const validation = JSON.parse(
    readFileSync(join(directory, "asset-validation.json"), "utf8"),
  );
  if (delivery.revision !== "r002" || validation.status !== "pass")
    throw new Error("Unvalidated pose review revision");
  return new Map(
    files.map((file) => {
      const bytes = readFileSync(join(directory, file));
      const hash = createHash("sha256").update(bytes).digest("hex");
      const validated = validation.files[revision + file];
      if (
        hash !== delivery.artifacts[file] ||
        (!["profile-socket-metadata.json", "equipment/manifest.json"].includes(
          file,
        ) &&
          (!validated ||
            hash !== validated.sha256 ||
            bytes.length !== validated.bytes))
      )
        throw new Error(`Paired pose review hash mismatch: ${file}`);
      return [file, bytes] as const;
    }),
  );
}

export function poseReviewAssets(root: string): Plugin {
  return {
    name: "paired-pose-review-assets",
    apply: "serve",
    configureServer(server) {
      let assets: ReturnType<typeof readPoseReviewAssets> | undefined;
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith(POSE_REVIEW_PREFIX)) return next();
        const file = path.slice(POSE_REVIEW_PREFIX.length);
        if (
          !files.includes(file) ||
          !["GET", "HEAD"].includes(request.method ?? "")
        ) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          assets ??= readPoseReviewAssets(root);
          const bytes = assets.get(file)!;
          response.setHeader(
            "Content-Type",
            file.endsWith(".glb") ? "model/gltf-binary" : "application/json",
          );
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Length", bytes.length);
          response.end(request.method === "HEAD" ? undefined : bytes);
        } catch (error) {
          server.config.logger.error(String(error));
          response.statusCode = 503;
          response.end("Paired pose review assets failed validation");
        }
      });
    },
  };
}
