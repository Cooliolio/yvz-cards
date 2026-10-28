import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// Stands in for Frigate's HTTP endpoints in the playground: previews, thumbnails and clips.
// The camera decides what happens, so every case of the review card can be tried:
//   oprit    the full clip plays (without range support, like the real recording endpoint)
//   veranda  the full clip answers 400 "No recordings found", the short clip plays
//   garage   neither clip is available
//   tuin     the full clip never answers, so the card has to give up on it and use the short one
function fakeFrigate(): Plugin {
  const clip = fs.readFileSync(path.resolve("dev/fixtures/clip.mp4"));
  const picture = (id: string, label: string): string => {
    const hue = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="hsl(${hue} 18% 18%)"/><rect y="250" width="640" height="110" fill="hsl(${hue} 14% 12%)"/><rect x="${200 + (hue % 160)}" y="120" width="70" height="150" rx="10" fill="hsl(${hue} 40% 60%)" opacity=".85"/><text x="18" y="340" fill="#cfd4da" font-family="sans-serif" font-size="22">${label}</text></svg>`;
  };
  return {
    name: "fake-frigate",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parts = new URL(req.url ?? "/", "http://x").pathname.split("/").filter(Boolean);
        if (parts[0] !== "api" || parts[1] !== "frigate") return next();
        const send = (status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}) => {
          res.writeHead(status, { "Content-Type": type, ...headers });
          res.end(body);
        };
        const video = (ranges: boolean) => {
          const range = ranges ? /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "") : null;
          if (!range) return send(200, "video/mp4", clip, ranges ? { "Accept-Ranges": "bytes" } : {});
          const start = Number(range[1] || 0);
          const end = Number(range[2] || clip.length - 1);
          send(206, "video/mp4", clip.subarray(start, end + 1), {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${clip.length}`,
          });
        };
        // /api/frigate/notifications/<id>/review_preview.gif | thumbnail.jpg | <camera>/clip.mp4
        if (parts[2] === "notifications") {
          const id = decodeURIComponent(parts[3] ?? "");
          if (parts[4] === "review_preview.gif" || parts[4] === "thumbnail.jpg") return send(200, "image/svg+xml", picture(id, id));
          if (parts[5] === "clip.mp4") {
            return parts[4] === "garage" ? send(404, "application/json", '{"message":"Not found"}') : video(true);
          }
        }
        // /api/frigate/<instance>/recording/<camera>/start/<s>/end/<e>
        if (parts[3] === "recording" || parts[2] === "recording") {
          const camera = parts[parts.indexOf("recording") + 1];
          // Headers sent, body never: the video keeps waiting.
          if (camera === "tuin") return void res.writeHead(200, { "Content-Type": "video/mp4" });
          return camera === "oprit" ? video(false) : send(400, "application/json", '{"message":"No recordings found for the time range"}');
        }
        return send(404, "text/plain", "not found");
      });
    },
  };
}

// Playground only; the HACS bundle is built by vite.config.ts.
export default defineConfig({
  root: "dev",
  plugins: [fakeFrigate()],
  server: { port: 5173, fs: { allow: [process.cwd()] } },
});
