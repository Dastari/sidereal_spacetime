# Native input bundle for reproducible CI

Date:2026-09-15. Status:Accepted implementation choice for the owner's CI repair.

The existing published-native allowlist names over1,300 files omitted from Git, while local tests/builds consume them. Individual GLBs repeat large identical textures. Committing them independently preserves bytes but adds unnecessary storage and checkout overhead; regenerating them in CI adds Blender/version dependence and cannot guarantee the signed native hashes. Serving them from the developer machine would make CI depend on private service availability.

Store the exact omitted published inputs and narrowly required test metadata in a lossless versioned tar.xz file tracked with Git LFS. A JSON manifest pins its hash and each member's path, size and SHA-256. A Python bootstrap validates the complete bundle before populating missing repository paths and refuses conflicting local files. Current runtime URLs, native catalogs and physical/art revisions remain unchanged. Build preparation and CI invoke the same bootstrap.

This introduces an explicit asset preparation step and a bundle update obligation when new native inputs are admitted. It avoids changing native representation, checking in generated public/build folders, or relaxing qualification tests. Authoring sources/reference art remain in their existing preservation workflow, outside this CI bundle.

See [repair contract](../ci_reproducibility.md).
