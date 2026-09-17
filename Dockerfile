FROM node:22-bookworm-slim

# System packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-venv \
    ca-certificates \
    git \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment
RUN python3 -m venv /opt/yt-dlp

RUN /opt/yt-dlp/bin/pip install --no-cache-dir -U "yt-dlp[default]"

# Install Deno for yt-dlp YouTube JavaScript challenges
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

# Make yt-dlp available globally
RUN ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp

# Download bgutil PO Token Provider
RUN git clone --depth 1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
    /opt/bgutil-ytdlp-pot-provider

# Install provider server dependencies
RUN cd /opt/bgutil-ytdlp-pot-provider/server && \
    npm ci && \
    npx tsc

# Install provider plugin into yt-dlp plugin directory
RUN mkdir -p /root/yt-dlp-plugins/bgutil-ytdlp-pot-provider && \
    cp -r /opt/bgutil-ytdlp-pot-provider/plugin/* \
    /root/yt-dlp-plugins/bgutil-ytdlp-pot-provider/

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy Subly
COPY . .

ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
