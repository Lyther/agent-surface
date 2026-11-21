FROM node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb
COPY app /app
WORKDIR /app
RUN git init -q && git add -A && git -c user.name=ops -c user.email=ops@example.com commit -q -m "Initial import"
# The change under review: uncommitted work on top of the commit.
COPY change /app
