---
name: ship-artifact
description: "Package immutable release artifacts with provenance evidence."
---

## Objective

Turn code into a portable artifact that records its exact repo, full Git commit, builder, and build time; ships the smallest practical runtime; and carries digests, checksums, signatures, SBOM, and provenance that a consumer can verify independently. Never promote an unsigned, unscanned, or unverifiable artifact. Claim "same source, same artifact" only after pinning inputs and comparing repeated builds.

## Rules

1. Abort when `git status` is not clean; a dirty build cannot be traced.
2. Keep secrets out of the image (never `COPY .env .`); pass config at runtime.
3. Pin base images, dependencies, lockfiles, and third-party CI actions by digest, checksum, or immutable version.
4. Sign, verify, and deploy by digest, never by mutable tag.
5. Every downstream step consumes the generated release or bundle manifest, never hand-copied values.

## 1. Release Identity

- The image digest or binary checksum is the identity; tags are pointers. Use specific names, not "v1.0".
- Tag `sha-a1b2c3d` for operators and `v1.2.3` only for an intentional release.
- Move `latest` only after verification and deployment succeed.
- For non-OCI artifacts, publish `SHA256SUMS`, signatures, SBOM, and provenance together.
- Publish one machine-readable release manifest binding Git SHA, artifact digest or checksum, bundle hash, version, SBOM path, and provenance path.

## 2. Build

- Build through one checked-in entrypoint (`scripts/build_artifact.sh` or `make artifact`) on `docker buildx` for OCI artifacts or an isolated builder otherwise, never an ad-hoc host with hidden state.
- Target `linux/amd64` and `linux/arm64`.
- Build multi-stage onto distroless or another minimal base pinned by digest; the final image holds no compiler, package manager, or source tree.
- In every language, copy dependency manifests before application source so the cache survives rebuilds.
- Prefer self-contained binaries for public CLI releases: Go with `CGO_ENABLED=0` and `-trimpath`, checked with `file`/`ldd`; Rust with a `*-unknown-linux-musl` target when Linux portability matters and dependencies allow. Verify libc, TLS, CGO, and target-runtime behavior before claiming portability. `upx` is optional; it can trigger AV heuristics and hinders debugging.
- Set `SOURCE_DATE_EPOCH` from the commit timestamp and strip non-deterministic metadata and absolute paths where the toolchain supports it. To claim reproducibility, build twice and compare digests or artifact hashes.

## 3. Registry and Supply Chain

- Auth with `docker login` locally; in CI use OIDC or short-lived credentials from a secret manager, never long-lived static tokens.
- Set OCI labels `org.opencontainers.image.source` (repo URL), `.revision` (full Git SHA), `.version` (SemVer, if any), and `.created` (build timestamp).
- Emit SBOM and provenance during the build when the toolchain supports it (`docker buildx --sbom=true --provenance=mode=max`); capture the pushed digest from build metadata and use it in every later step.
- Scan the pushed image's SBOM before signing and fail above the policy threshold (the script uses `--fail-on high`); an unsigned image is not released.
- Verify signatures and attestations against a pinned identity and OIDC issuer, or an equivalent admission policy, so the pipeline rejects unsigned or unverifiable artifacts.
- Promote `latest` or production channels only after verification passes.

## 4. Packaging

Generate customer-facing archives, installers, manifests, docs, and checksum files from one packaging step; never hand-assemble release zips on a builder host.

- Desktop (Tauri/Electron): `tauri build` / `electron-builder` → `.msi`, `.dmg`, `.AppImage`; codesign, and notarize for Apple.
- Mobile: Gradle / Xcode → `.aab` / `.ipa`; keep keystores in CI secrets and never commit `.jks` or `.p12`.
- CLI: `cargo build --release --target x86_64-unknown-linux-musl` or `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`; check linkage with `file`/`ldd`, smoke test on a clean host or container, and publish binaries, `SHA256SUMS`, signatures, SBOM, and install instructions together.
- IoT/edge: cross-compile (`GOARCH=arm`, `armv7-unknown-linux-gnueabihf`) to a static binary or multi-arch image (`linux/arm/v7`); check binary size, startup memory, and read-only filesystem limits.

## 5. Verify

1. Run it: `docker run --rm <image@digest> --version`, or the healthcheck.
2. Flag an image over 1 GB for review unless it carries an ML model.
3. Check `docker history` for secrets, package-manager caches, and source dumps.
4. Run `cosign verify` (or equivalent) with the expected identity and issuer.
5. Confirm the provenance and SBOM exist and are inspectable.
6. Confirm non-root execution and the expected entrypoint and linkage.
7. Install or unpack the exact shipped bundle on a fresh host or container; verify required files exist and forbidden files are absent.
8. Ship no source tree, test fixtures, internal prompts, debug endpoints, or private config unless explicitly intended.

## Output

The build script (`scripts/build_artifact.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/OWNER/IMAGE}"
REPO_URL="${REPO_URL:-https://github.com/OWNER/REPO}"
RELEASE_MANIFEST="${RELEASE_MANIFEST:-release-manifest.json}"
COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
VERSION="${VERSION:-}"
BUNDLE_SHA256="${BUNDLE_SHA256:-}"
SOURCE_DATE_EPOCH="$(git log -1 --pretty=%ct)"
BUILD_METADATA="$(mktemp)"
BUILD_DATE="$(
  SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" python3 - <<'PY'
from datetime import datetime, timezone
import os
print(datetime.fromtimestamp(int(os.environ["SOURCE_DATE_EPOCH"]), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
PY
)"

docker buildx create --name artifact-builder --use >/dev/null 2>&1 || docker buildx use artifact-builder

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag "${IMAGE_NAME}:sha-${COMMIT_SHORT}" \
  --label "org.opencontainers.image.source=${REPO_URL}" \
  --label "org.opencontainers.image.revision=${COMMIT_SHA}" \
  --label "org.opencontainers.image.created=${BUILD_DATE}" \
  --provenance=mode=max \
  --sbom=true \
  --metadata-file "${BUILD_METADATA}" \
  --push \
  .

IMAGE_DIGEST="$(
  python3 - "${BUILD_METADATA}" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
print(data["containerimage.digest"])
PY
)"
IMAGE_REF="${IMAGE_NAME}@${IMAGE_DIGEST}"

syft "${IMAGE_REF}" -o cyclonedx-json > sbom.cdx.json
grype sbom:sbom.cdx.json --fail-on high   # vulnerability gate before signing

cosign sign --yes "${IMAGE_REF}"
cosign attest --yes --predicate sbom.cdx.json --type cyclonedx "${IMAGE_REF}"

cosign verify \
  --certificate-identity "https://github.com/OWNER/REPO/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "${IMAGE_REF}" >/dev/null

COMMIT_SHA="${COMMIT_SHA}" IMAGE_REF="${IMAGE_REF}" IMAGE_DIGEST="${IMAGE_DIGEST}" REPO_URL="${REPO_URL}" BUILD_DATE="${BUILD_DATE}" VERSION="${VERSION}" BUNDLE_SHA256="${BUNDLE_SHA256}" python3 - <<'PY' > "${RELEASE_MANIFEST}"
import json
import os

print(json.dumps({
    "repo": os.environ["REPO_URL"],
    "git_sha": os.environ["COMMIT_SHA"],
    "version": os.environ["VERSION"] or None,
    "image_ref": os.environ["IMAGE_REF"],
    "image_digest": os.environ["IMAGE_DIGEST"],
    "bundle_sha256": os.environ["BUNDLE_SHA256"] or None,
    "built_at": os.environ["BUILD_DATE"],
    "sbom": "sbom.cdx.json",
    "provenance": "oci-attestation",
}, indent=2))
PY

docker buildx imagetools inspect "${IMAGE_REF}" --format '{{json .Provenance}}' >/dev/null
docker buildx imagetools inspect "${IMAGE_REF}" --format '{{json .SBOM}}' >/dev/null

docker run --rm "${IMAGE_REF}" --version
```
