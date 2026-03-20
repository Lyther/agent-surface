## OBJECTIVE

**IMMUTABLE REALITY.**
Turn code into a black box that runs anywhere.
**The Law**:

1. **Reproducible**: Same Commit = Same SHA256 Image.
2. **Traceable**: The image has metadata pointing back to the Git Commit.
3. **Portable**: Runs on my MacBook (ARM) and the Server (AMD).
4. **Attested**: SBOM + Provenance signed and verifiable.

## PROTOCOL

### Phase 1: The Tagging Strategy (Naming)

*No "v1.0". Use specifics.*

1. **Primary Tag**: The Git SHA (`sha-a1b2c3d`). *This is the truth.*
2. **Semantic Tag**: `v1.2.3` (Only if triggered by `release` command).
3. **Latest Tag**: **DANGER**. Only update `latest` after successful deployment.
4. **Date Tag**: `2024-05-20-build-1`.

### Phase 2: The Multi-Arch Compilation (Buildx)

*The world is not just Intel.*

1. **Setup**: Use `docker buildx`.
2. **Platforms**: `linux/amd64` (Server), `linux/arm64` (Apple Silicon/AWS Graviton).
3. **Optimization**:
    - **Multi-Stage**: The final image MUST NOT contain source code or build tools (GCC/Node/Cargo). Only the binary.
    - **Distroless/Minimal**: Use `gcr.io/distroless/static` or `alpine` as the final base; pin by digest.
    - **Cache**: Enable BuildKit cache mounts for deps.
4. **Reproducibility**:
    - Set `SOURCE_DATE_EPOCH` to commit timestamp
    - Strip non-deterministic metadata; ensure stable file ordering

### Phase 3: The Registry Handshake (The Push)

1. **Auth**:
    - Local: `docker login`.
    - CI: OIDC or token from secret manager (no long-lived creds).
2. **Metadata Injection (OCI Labels)**:
    - `org.opencontainers.image.source` = Repo URL.
    - `org.opencontainers.image.revision` = Git SHA.
    - `org.opencontainers.image.version` = SemVer (if any).
3. **SBOM & Provenance**:
    - Generate SBOM (CycloneDX/SPDX) during build; attach as artifact
    - Sign image and attestations with **cosign** (keyless if possible)

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
    - Build: `cargo build --release` / `go build -ldflags="-s -w"`
    - Optimization: Strip symbols, compress (`upx` if needed).
    - **Distribution**: Homebrew Tap / npm registry / GitHub Releases.
4. **IoT (Firmware/Edge)**:
    - Build: Cross-compile (`GOARCH=arm` / `armv7-unknown-linux-gnueabihf`)
    - Output: Static Binary or Multi-arch Docker Image (`linux/arm/v7`)
    - **Constraint**: Check binary size limits (Flash storage).

### Phase 5: Hallucination Check (Verify)

*Did we build a brick or a bomb?*

1. **Run It**: `docker run --rm [image] --version` (or healthcheck).
2. **Check Size**: If > 1GB, flag for review (unless ML model).
3. **Check Layers**: `docker history`. Ensure no secrets/source code keys.

## OUTPUT FORMAT

**The Build Script (`scripts/build_artifact.sh`)**

```bash
#!/bin/bash
set -euo pipefail

COMMIT_SHA=$(git rev-parse --short HEAD)
IMAGE_NAME="ghcr.io/catherine/geniux"
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Setup Buildx
docker buildx create --use || true

# Build & Push (Multi-arch)
echo "🏗️ Building $IMAGE_NAME:$COMMIT_SHA..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag $IMAGE_NAME:$COMMIT_SHA \
  --label "org.opencontainers.image.source=https://github.com/catherine/geniux" \
  --label "org.opencontainers.image.revision=$COMMIT_SHA" \
  --label "org.opencontainers.image.created=$BUILD_DATE" \
  --push \
  .

# SBOM (example with syft)
syft $IMAGE_NAME:$COMMIT_SHA -o cyclonedx-json > sbom.cdx.json

# Sign image and SBOM (keyless)
cosign sign --yes $IMAGE_NAME:$COMMIT_SHA
cosign attest --yes --predicate sbom.cdx.json --type cyclonedx $IMAGE_NAME:$COMMIT_SHA

echo "✅ Artifact Pushed and Attested."
```

## EXECUTION RULES

1. **NO DIRTY BUILDS**: If `git status` is not clean, **ABORT**. You cannot trace a dirty build.
2. **NO SECRETS IN IMAGE**: Never `COPY .env .`. Pass config at runtime.
3. **LAYER CACHING**: Arrange Dockerfile so that `COPY package.json` and `RUN npm install` happen *before* `COPY .`.
4. **DIGESTS ONLY**: Deploy by image digest, not mutable tags.
5. **SIGN & VERIFY**: All images must be signed and verified before deploy.
