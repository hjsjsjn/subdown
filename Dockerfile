FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    ca-certificates \
    curl \
    && \
    python3 -m venv /opt/yt-dlp && \
    /opt/yt-dlp/bin/pip install --no-cache-dir -U yt-dlp && \
    ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp PO Token Provider plugin
RUN mkdir -p /opt/yt-dlp-plugins

RUN curl -L \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/heads/master.tar.gz \
    -o /tmp/bgutil.tar.gz && \
    tar -xzf /tmp/bgutil.tar.gz -C /tmp && \
    cp -r /tmp/bgutil-ytdlp-pot-provider-master/plugin/* /opt/yt-dlp-plugins/ && \
    rm -rf /tmp/bgutil*

ENV YTDLP_PLUGIN_DIR=/opt/yt-dlp-plugins

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
