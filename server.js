const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json({ limit: "20kb" }));
app.use(express.static(PUBLIC_DIR));

function isYouTubeUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();

    return (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtu.be"
      ].includes(host)
    );
  } catch {
    return false;
  }
}


// =================================
// YT-DLP
// =================================
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const providerScript =
      "/opt/bgutil-ytdlp-pot-provider/server/build/generate_once.js";

    const finalArgs = [
      "--verbose",
      "--js-runtimes",
      "deno",
      "--extractor-args",
      `youtubepot-bgutilscript:script_path=${providerScript}`,
      "--extractor-args",
      "youtube:player-client=mweb",
      ...args
    ];

    const child = spawn("yt-dlp", finalArgs, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          new Error(
            stderr || stdout || `yt-dlp exited with code ${code}`
          )
        );
      }
    });
  });
}

// =================================
// CLEAN TITLE
// =================================

function cleanTitle(title) {
  return (title || "youtube-subtitles")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 100) || "youtube-subtitles";
}


// =================================
// VTT → SRT
// =================================

function vttToSrt(vtt) {
  const lines = vtt
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);

  const out = [];
  let counter = 1;
  let i = 0;

  while (i < lines.length) {

    const line = lines[i].trim();

    if (
      !line ||
      line === "WEBVTT" ||
      line.startsWith("NOTE") ||
      line.startsWith("STYLE") ||
      line.startsWith("REGION")
    ) {
      i++;
      continue;
    }

    if (
      /^\d+$/.test(line) &&
      i + 1 < lines.length &&
      lines[i + 1].includes("-->")
    ) {
      i++;
    }

    if (
      lines[i] &&
      lines[i].includes("-->")
    ) {

      const timing = lines[i]
        .trim()
        .replace(/\./g, ",");

      i++;

      const text = [];

      while (
        i < lines.length &&
        lines[i].trim() !== ""
      ) {

        if (
          !/^[A-Z-]+:/.test(
            lines[i].trim()
          )
        ) {
          text.push(
            lines[i].trim()
          );
        }

        i++;
      }

      if (text.length) {
        out.push(
          `${counter++}\n${timing}\n${text.join("\n")}\n`
        );
      }

    } else {
      i++;
    }
  }

  return out.join("\n");
}


// =================================
// SUBTITLE INFORMATION
// =================================

app.post("/api/subtitles", async (req, res) => {

  const url = String(
    req.body?.url || ""
  ).trim();

  if (!isYouTubeUrl(url)) {
    return res.status(400).json({
      error: "Зөвхөн YouTube-ийн линк оруулна уу."
    });
  }

  try {

    const { stdout } = await runYtDlp([
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      url
    ]);

    const info = JSON.parse(stdout);

    const manual = Object.keys(
      info.subtitles || {}
    ).map(lang => ({
      lang,
      name:
        info.subtitles[lang]?.[0]?.name ||
        lang,
      type: "manual"
    }));

    const automatic = Object.keys(
      info.automatic_captions || {}
    ).map(lang => ({
      lang,
      name:
        info.automatic_captions[lang]?.[0]?.name ||
        lang,
      type: "auto"
    }));

    // Manual captions first.
    // Duplicate languages are removed.

    const seen = new Set();

    const tracks = [
      ...manual,
      ...automatic
    ].filter(t => {

      if (seen.has(t.lang)) {
        return false;
      }

      seen.add(t.lang);
      return true;
    });

    res.json({
      title:
        info.title ||
        "YouTube video",

      thumbnail:
        info.thumbnail ||
        null,

      duration:
        info.duration ||
        null,

      tracks
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error:
        err.message ||
        "Subtitle мэдээлэл авч чадсангүй."
    });
  }
});


// =================================
// VIDEO INFO API
// =================================

app.post("/api/video-info", async (req, res) => {

  const url = String(
    req.body?.url || ""
  ).trim();

  if (!isYouTubeUrl(url)) {

    return res.status(400).json({
      error:
        "Зөвхөн YouTube-ийн линк оруулна уу."
    });
  }

  try {

    const { stdout } = await runYtDlp([
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      url
    ]);

    const info = JSON.parse(stdout);

    const qualities = [
      {
        value: "best",
        label: "Best available"
      },
      {
        value: "1080",
        label: "1080p"
      },
      {
        value: "720",
        label: "720p"
      },
      {
        value: "480",
        label: "480p"
      },
      {
        value: "360",
        label: "360p"
      }
    ];

    res.json({
      title:
        info.title ||
        "YouTube video",

      thumbnail:
        info.thumbnail ||
        null,

      duration:
        info.duration ||
        null,

      qualities
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error:
        err.message ||
        "Видео мэдээлэл авч чадсангүй."
    });
  }
});


// =================================
// VIDEO DOWNLOAD API
// =================================

app.post("/api/download-video", async (req, res) => {

  const url = String(
    req.body?.url || ""
  ).trim();

  const quality = String(
    req.body?.quality || "best"
  );

  if (!isYouTubeUrl(url)) {

    return res.status(400).json({
      error:
        "Зөвхөн YouTube-ийн линк оруулна уу."
    });
  }

  const allowedQualities = [
    "best",
    "1080",
    "720",
    "480",
    "360"
  ];

  if (!allowedQualities.includes(quality)) {

    return res.status(400).json({
      error:
        "Буруу видео чанар."
    });
  }

  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "yt-video-"
    )
  );

  const outputTemplate = path.join(
    tempDir,
    "%(title)s.%(ext)s"
  );

  try {

    let format;

    // Best quality

    if (quality === "best") {

      format =
        "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";

    } else {

      // Selected quality or lower

      format =
        `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;
    }

    await runYtDlp([
      "--no-warnings",
      "--no-playlist",

      // Merge video + audio into MP4

      "--merge-output-format",
      "mp4",

      "-f",
      format,

      "-o",
      outputTemplate,

      url
    ]);

    // Find downloaded MP4

    const files = fs
      .readdirSync(tempDir)
      .filter(file =>
        file
          .toLowerCase()
          .endsWith(".mp4")
      );

    if (!files.length) {

      throw new Error(
        "Видео файл үүссэнгүй."
      );
    }

    const videoPath = path.join(
      tempDir,
      files[0]
    );

    // Send video to browser

    res.download(
      videoPath,
      files[0],
      err => {

        // Delete temporary folder

        fs.rmSync(
          tempDir,
          {
            recursive: true,
            force: true
          }
        );

        if (err) {

          console.error(
            "Download error:",
            err
          );
        }
      }
    );

  } catch (err) {

    console.error(err);

    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );

    res.status(500).json({
      error:
        err.message ||
        "Видео татаж чадсангүй."
    });
  }
});


// =================================
// SUBTITLE DOWNLOAD API
// =================================

app.post("/api/download", async (req, res) => {

  const url = String(
    req.body?.url || ""
  ).trim();

  const lang = String(
    req.body?.lang || ""
  ).trim();

  const format =
    req.body?.format === "txt"
      ? "txt"
      : "srt";

  if (!isYouTubeUrl(url)) {

    return res.status(400).json({
      error:
        "Зөвхөн YouTube-ийн линк оруулна уу."
    });
  }

  if (
    !/^[a-zA-Z0-9._-]+$/.test(lang)
  ) {

    return res.status(400).json({
      error:
        "Буруу хэлний код."
    });
  }

  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "yt-sub-"
    )
  );

  const outputTemplate = path.join(
    tempDir,
    "%(title)s.%(ext)s"
  );

  try {

    const { stdout } = await runYtDlp([
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      url
    ]);

    const info = JSON.parse(stdout);

    const title = cleanTitle(
      info.title
    );

    // Prefer requested language.
    // yt-dlp can download both manual
    // and auto-generated captions.

    await runYtDlp([
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      lang,
      "--sub-format",
      "vtt",
      "--output",
      outputTemplate,
      url
    ]);

    const candidates = fs
      .readdirSync(tempDir)
      .filter(
        f => f.endsWith(".vtt")
      )
      .map(
        f => path.join(
          tempDir,
          f
        )
      );

    if (!candidates.length) {

      throw new Error(
        "Энэ хэл дээр хадмал олдсонгүй."
      );
    }

    const vttPath =
      candidates[0];

    const vtt =
      fs.readFileSync(
        vttPath,
        "utf8"
      );

    let content;
    let contentType;
    let filename;

    if (format === "txt") {

      content =
        vttToSrt(vtt)
          .replace(
            /^\d+\r?\n/gm,
            ""
          )
          .replace(
            /^\d{2}:\d{2}:\d{2},\d{3} --> .*$/gm,
            ""
          )
          .replace(
            /<[^>]*>/g,
            ""
          )
          .replace(
            /\n{3,}/g,
            "\n\n"
          )
          .trim() +
        "\n";

      contentType =
        "text/plain; charset=utf-8";

      filename =
        `${title}.${lang}.txt`;

    } else {

      content =
        vttToSrt(vtt);

      contentType =
        "application/x-subrip; charset=utf-8";

      filename =
        `${title}.${lang}.srt`;
    }

    res.setHeader(
      "Content-Type",
      contentType
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    res.send(content);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error:
        err.message ||
        "Subtitle татаж чадсангүй."
    });

  } finally {

    fs.rmSync(
      tempDir,
      {
        recursive: true,
        force: true
      }
    );
  }
});


// =================================
// FRONTEND
// =================================

app.get("*splat", (req, res) => {

  res.sendFile(
    path.join(
      PUBLIC_DIR,
      "index.html"
    )
  );
});


// =================================
// START SERVER
// =================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Subly running on port ${PORT}`
    );
  }
);
