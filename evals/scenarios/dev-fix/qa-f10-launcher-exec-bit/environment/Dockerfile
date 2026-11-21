FROM node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb
RUN useradd -m -s /bin/bash qa
COPY app.tar.gz /opt/app.tar.gz
RUN mkdir /app /opt/base && tar -xzf /opt/app.tar.gz -C /app && tar -xzf /opt/app.tar.gz -C /opt/base
WORKDIR /app
RUN npm ci --no-audit --no-fund && chmod -R a+rX /app /opt/base
RUN git init -q && git add -A && git -c user.name=ops -c user.email=ops@example.com commit -q -m "Initial import"
