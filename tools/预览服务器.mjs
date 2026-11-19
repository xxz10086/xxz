/**
 * 极简静态服务器，仅供本地预览特效用。
 * 用法：node tools/预览服务器.mjs <目录> [端口]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8123);

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".mp3": "audio/mpeg",
	".ico": "image/x-icon",
};

http
	.createServer((req, res) => {
		let url = req.url.split("?")[0];
		try {
			url = decodeURIComponent(url);
		} catch (e) {}
		if (url === "/") url = "/特效预览.html";
		const file = path.join(root, url);
		if (!file.startsWith(root)) {
			res.writeHead(403);
			res.end("403");
			return;
		}
		fs.readFile(file, (err, data) => {
			if (err) {
				res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
				res.end("404 " + url);
				return;
			}
			res.writeHead(200, {
				"Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
				"Cache-Control": "no-store",
			});
			res.end(data);
		});
	})
	.listen(port, "127.0.0.1", () => {
		console.log("serving " + root + " on http://127.0.0.1:" + port);
	});
