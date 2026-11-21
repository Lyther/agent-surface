FROM node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb
RUN useradd -m -s /bin/bash qa
COPY app.tar.gz submodules.txt /opt/
RUN mkdir /app /opt/base && tar -xzf /opt/app.tar.gz -C /app
# The installer refuses to run without its registered skill packs, so the pinned submodule commits are
# fetched at build time (the one network step); verification itself is offline.
RUN while read -r path url sha; do \
      git init -q "/tmp/gitdir-$sha" && git -C "/tmp/gitdir-$sha" fetch -q --depth 1 "$url" "$sha" \
      && mkdir -p "/app/$path" && git -C "/tmp/gitdir-$sha" archive "$sha" | tar -x -C "/app/$path"; \
    done < /opt/submodules.txt
WORKDIR /app
RUN npm ci --no-audit --no-fund && cp -a /app/. /opt/base/ && chmod -R a+rX /app /opt/base
RUN git init -q && echo external/ >> .git/info/exclude && git add -A \
    && git -c user.name=ops -c user.email=ops@example.com commit -q -m "Initial import"
# The install suite expects the machine CI provides: browsers the registry detects, uv, and the launchers
# the repository installs for its own MCP servers. Provisioned once here as the unprivileged user; root
# (the agent) shares that home state.
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends chromium firefox-esr xdg-user-dirs && chown -R qa /app
COPY --from=ghcr.io/astral-sh/uv:0.12.17@sha256:10787c682e4184e4f290de1171fd4703dc63de99221f10fe1c99002ce7fa9acc /uv /uvx /usr/local/bin/
USER qa
ENV HOME=/home/qa
RUN npm run install:mcps >/tmp/mcps.log 2>&1 && node scripts/agent-surface.mjs install --target droid --dest /tmp/prep --category mcps --service openosint -y >/tmp/prep.log 2>&1
USER root
ENV HOME=/root
RUN ln -s /home/qa/.local /root/.local
# The pristine pre-fix copy carries the same built state, so a failure on it is the defect and not a missing build.
RUN rm -rf /opt/base && mkdir /opt/base && cp -a /app/. /opt/base/ && chmod -R a+rX /app /opt/base
