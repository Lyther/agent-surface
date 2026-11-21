FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pytest==8.3.4
WORKDIR /app
COPY app/ /app/
RUN git init -q && git add -A && git -c user.name=ops -c user.email=ops@example.com commit -q -m "Initial import"
