FROM node:22-bookworm-slim

# System packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN python3 -m venv /opt/yt-dlp && \
    /opt/yt-dlp/bin/pip install --no-cache-dir -U yt-dlp && \
    ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp

# Install bgutil yt-dlp PO Token plugin
RUN python3 -m pip install \
    --no-cache-dir \
    --target=/opt/yt-dlp-plugins \
    bgutil-ytdlp-pot-provider

ENV YTDLP_PLUGIN_DIR=/opt/yt-dlp-plugins

WORKDIR /app

# Node dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Application
COPY . .

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
