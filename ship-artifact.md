## OBJECTIVE

**IMMUTABLE REALITY.**
Turn code into a portable artifact that can be traced, verified, and rejected automatically if the supply chain is wrong.
**The Law**:

1. **Traceable**: Every artifact points to an exact repo, full Git commit, builder, and build time.
2. **Portable**: Ship the smallest practical runtime; public CLI releases should prefer self-contained/static binaries when the stack supports it.
3. **Verifiable**: Publish digests, checksums, signatures, SBOM, and provenance that a consumer can verify independently.
4. **Policy-Enforced**: Unsigned, unscanned, or unverifiable artifacts do not get promoted.
5. **Reproducible by Proof**: If you claim "same source, same artifact", pin inputs and prove it with repeated-build verification.

## PROTOCOL

### Phase 1: Release Identity (Naming)

*No "v1.0". Use specifics.*

1. **Primary Identity**: The image digest or binary checksum. Tags are pointers, not truth.
2. **Commit Tag**: `sha-a1b2c3d` for operator convenience.
3. **Semantic Tag**: `v1.2.3` only for an intentional release.
4. **Latest Tag**: **DANGER**. Only update `latest` after successful verification and deployment.
5. **Release Bundle**: For non-OCI artifacts, publish `SHA256SUMS`, signatures, SBOM, and provenance together.

### Phase 2: Build for Portability

*The world is not just Intel.*

1. **Setup**: Use `docker buildx` for OCI artifacts and an isolated builder for non-container releases.
2. **Platforms**: `linux/amd64` (Server), `linux/arm64` (Apple Silicon/AWS Graviton).
3. **Minimize Runtime**:
    - **Multi-Stage**: The final image MUST NOT contain a compiler, package manager, or source tree.
    - **Minimal Final Layer**: Use distroless or another minimal base pinned by digest.
    - **Language-Neutral Caching**: Copy dependency manifests before application source so cache reuse works across rebuilds.
4. **Static / Self-Contained CLI Builds**:
    - Prefer self-contained binaries for public CLI releases. They reduce install friction and improve accessibility on clean hosts.
    - Go: prefer `CGO_ENABLED=0`, `-trimpath`, and verify the result with `file` / `ldd`.
    - Rust: prefer a `*-unknown-linux-musl` target when Linux portability matters and dependencies allow it.
    - Treat `upx` as optional. It can trigger AV heuristics and make debugging harder.
5. **Reproducibility Controls**:
    - Set `SOURCE_DATE_EPOCH` from the commit timestamp.
    - Pin base images, dependencies, and lockfiles by digest or checksum.
    - Strip non-deterministic metadata and absolute paths where the toolchain supports it.
    - If you claim reproducibility, build twice and compare digests or artifact hashes.

### Phase 3: Registry / Supply-Chain Handshake

1. **Auth**:
    - Local: `docker login`.
    - CI: OIDC or short-lived creds from a secret manager. No long-lived static tokens.
2. **Metadata Injection (OCI Labels)**:
    - `org.opencontainers.image.source` = Repo URL.
    - `org.opencontainers.image.revision` = full Git SHA.
    - `org.opencontainers.image.version` = SemVer (if any).
    - `org.opencontainers.image.created` = build timestamp.
3. **SBOM & Provenance**:
    - Emit SBOM and build provenance during the build when the toolchain supports it.
    - `docker buildx`: `--sbom=true` and `--provenance=mode=max`.
    - Capture the pushed digest from build metadata and use that digest for every downstream step.
4. **Security Gates**:
    - Scan the image, dependencies, and SBOM before publish; fail above policy threshold.
    - Sign by digest, not mutable tag.
    - Verify signatures and attestations with pinned identity / OIDC issuer or equivalent admission policy.
    - Only promote `latest` or production channels after verification passes.

### Phase 4: Platform Packaging

1. **Desktop (Tauri/Electron)**:
    - Build: `tauri build` / `electron-builder`
    - Output: `.msi` (Win), `.dmg` (Mac), `.AppImage` (Linux)
    - **Security**: Codesign (Cert) + Notarize (Apple).
2. **Mobile (iOS/Android)**:
    - Build: Gradle (Android) / Xcode (iOS)
    - Output: `.aab` / `.ipa`
    - **Security**: Keystores in CI Secrets. Never commit `.jks` or `.p12`.
3. **CLI (Binary)**:
    - Build: `cargo build --release --target x86_64-unknown-linux-musl` / `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`
    - **Verification**: Check linkage with `file` / `ldd`; smoke test on a clean host or container.
    - **Distribution**: Publish binaries, `SHA256SUMS`, signatures, SBOM, and install instructions together.
4. **IoT (Firmware/Edge)**:
    - Build: Cross-compile (`GOARCH=arm` / `armv7-unknown-linux-gnueabihf`)
    - Output: Static Binary or Multi-arch Docker Image (`linux/arm/v7`)
    - **Constraint**: Check binary size, startup memory, and read-only filesystem limits.

### Phase 5: Verification & Enforcement

*Did we ship something users can trust, or just something that happened to compile?*

1. **Run It**: `docker run --rm [image@digest] --version` (or healthcheck).
2. **Check Size**: If > 1GB, flag for review (unless ML model).
3. **Check Layers**: `docker history`. Ensure no secrets, package-manager caches, or source dumps.
4. **Check Signature**: `cosign verify` (or equivalent) with expected identity and issuer.
5. **Check Attestations**: Confirm provenance and SBOM exist and are inspectable.
6. **Check Runtime**: Confirm non-root execution and expected entrypoint / linkage.

## OUTPUT FORMAT

**The Build Script (`scripts/build_artifact.sh`)**

```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/OWNER/IMAGE}"
REPO_URL="${REPO_URL:-https://github.com/OWNER/REPO}"
COMMIT_SHA="$(git rev-parse HEAD)"
COMMIT_SHORT="$(git rev-parse --short HEAD)"
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

cosign sign --yes "${IMAGE_REF}"
cosign attest --yes --predicate sbom.cdx.json --type cyclonedx "${IMAGE_REF}"

cosign verify \
  --certificate-identity "https://github.com/OWNER/REPO/.github/workflows/release.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "${IMAGE_REF}" >/dev/null

docker buildx imagetools inspect "${IMAGE_REF}" --format '{{json .Provenance}}' >/dev/null
docker buildx imagetools inspect "${IMAGE_REF}" --format '{{json .SBOM}}' >/dev/null

docker run --rm "${IMAGE_REF}" --version
```

## EXECUTION RULES

1. **NO DIRTY BUILDS**: If `git status` is not clean, **ABORT**. You cannot trace a dirty build.
2. **NO SECRETS IN IMAGE**: Never `COPY .env .`. Pass config at runtime.
3. **PIN THE SUPPLY CHAIN**: Pin base images, dependencies, and third-party CI actions by digest, checksum, or immutable version.
4. **CACHE BY MANIFEST**: Arrange Dockerfile layers so dependency manifests install before application source. Do not make this Node-only.
5. **DIGESTS ONLY**: Deploy by image digest, not mutable tags.
6. **SIGN, VERIFY, ENFORCE**: Verification is not optional. The pipeline or admission policy must reject unsigned or unverifiable artifacts.
7. **STATIC DOES NOT MEAN MAGIC**: Prefer self-contained binaries for CLI accessibility, but verify libc, TLS, CGO, and target-runtime reality before claiming portability.
