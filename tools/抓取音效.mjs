/**
 * 脑花 extension —— 音效抓取器（freesound 搜索页内嵌数据）
 * ---------------------------------------------------------------------------
 * 搜索页的每个结果都带 data-mp3 / data-duration / data-title，
 * 所以一个请求就能拿到全部候选，不必逐个打开音效页（那样会被限流）。
 *
 * 用法：node tools/抓取音效.mjs [--dry]
 * 输出：audio/fx/*.mp3 + audio/CREDITS.md（署名清单）
 *
 * 注意：仅用于个人本地游玩。公开分发请自行确认每条音效的授权。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const OUT = path.join(ROOT, "audio", "fx");
const TMP = path.join(ROOT, "audio", ".tmp");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const DRY = process.argv.includes("--dry");
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** [文件名, 搜索词, 最小时长, 最大时长, 截断上限] */
const SLOTS = [
	["jojo_energy", "chime", 0.15, 0.8, 0.55], // 精神能量 · 生命火花
	["jojo_bloom", "plant", 0.25, 1.4, 1.0], // 黄金体验 · 生命绽放
	["jojo_armor", "shield", 0.25, 1.0, 0.7], // 黄金反甲 · 生成
	["jojo_reflect", "ping", 0.15, 0.8, 0.5], // 黄金反甲 · 反弹
	["jojo_hit", "impact", 0.15, 0.7, 0.5], // 命中
	["jojo_arrow", "whoosh", 0.15, 0.9, 0.6], // 虫箭飞行
	["jojo_awaken", "choir", 1.2, 3.6, 2.8], // 镇魂曲觉醒
	["jojo_zero", "rewind", 0.3, 1.8, 1.3], // 归零
	["jojo_draw", "sparkle", 0.2, 0.9, 0.6], // 猜中·摸牌
	["jojo_seal", "stamp", 0.15, 0.9, 0.6], // 跳过摸牌 · 封印
	["jojo_declare", "bell", 0.2, 1.2, 0.8], // 镇魂曲 · 声明
	["jojo_miss", "error", 0.15, 0.9, 0.6], // 猜错
	["jojo_dying", "heartbeat", 0.4, 1.8, 1.3], // 决心
];

function runFF(args) {
	return new Promise((resolve, reject) => {
		const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		p.stderr.on("data", d => (err += d));
		p.on("close", code => (code === 0 ? resolve() : reject(new Error(err.slice(-300)))));
	});
}

async function get(url, retry = 3) {
	for (let i = 0; i <= retry; i++) {
		try {
			const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow" });
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res;
		} catch (e) {
			if (i === retry) throw e;
			await sleep(1500 * (i + 1));
		}
	}
}

/** 解析搜索页里的结果卡片 */
function parseResults(html) {
	const out = [];
	const re = /data-mp3="([^"]+)"[\s\S]{0,800}?data-title="([^"]*)"[\s\S]{0,400}?data-duration="([^"]+)"/g;
	let m;
	while ((m = re.exec(html))) {
		const mp3 = m[1];
		const id = (/(\d+)_\d+-(?:lq|hq)\.mp3/.exec(mp3) || [])[1];
		if (!id) continue;
		if (out.some(x => x.id === id)) continue;
		const userM = new RegExp("/people/([^/\"]+)/sounds/" + id + "/").exec(html);
		out.push({
			id,
			user: userM ? userM[1] : "?",
			title: m[2],
			duration: parseFloat(m[3]) || 0,
			hq: mp3.replace(/-lq\.mp3$/, "-hq.mp3"),
		});
	}
	return out;
}

function normalizeWav(buf, peak = 0.89) {
	let off = 12;
	let dataOff = -1;
	let dataLen = 0;
	while (off + 8 <= buf.length) {
		const id = buf.toString("ascii", off, off + 4);
		const size = buf.readUInt32LE(off + 4);
		if (id === "data") {
			dataOff = off + 8;
			dataLen = Math.min(size, buf.length - dataOff);
			break;
		}
		off += 8 + size + (size % 2);
	}
	if (dataOff < 0) throw new Error("wav 缺少 data 块");
	const n = Math.floor(dataLen / 2);
	const s = new Float32Array(n);
	let max = 0;
	for (let i = 0; i < n; i++) {
		const v = buf.readInt16LE(dataOff + i * 2) / 32768;
		s[i] = v;
		if (Math.abs(v) > max) max = Math.abs(v);
	}
	if (max > 0) for (let i = 0; i < n; i++) s[i] *= peak / max;
	const fade = Math.min(Math.floor(44100 * 0.006), Math.floor(n / 4));
	for (let i = 0; i < fade; i++) {
		const k = i / fade;
		s[i] *= k;
		s[n - 1 - i] *= k;
	}
	return s;
}

function writeWav(file, s, sr = 44100) {
	const n = s.length;
	const b = Buffer.alloc(44 + n * 2);
	b.write("RIFF", 0);
	b.writeUInt32LE(36 + n * 2, 4);
	b.write("WAVE", 8);
	b.write("fmt ", 12);
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(sr, 24);
	b.writeUInt32LE(sr * 2, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write("data", 36);
	b.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++) {
		const v = Math.max(-1, Math.min(1, s[i]));
		b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
	}
	fs.writeFileSync(file, b);
}

/* ------------------------------------------------------------------ 主流程 */

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const credits = [];
const results = [];

for (const [name, query, minD, maxD, cap] of SLOTS) {
	process.stdout.write("[" + name + "] 「" + query + "」… ");
	let picked = null;
	try {
		// duration_asc 只给最短的 15 条，单页往往全都短于下限，所以取两页
		const all = [];
		for (const p of [1, 2]) {
			const url =
				"https://freesound.org/search/?q=" + encodeURIComponent(query) + "&s=duration_asc&p=" + p;
			const html = await (await get(url)).text();
			all.push(...parseResults(html));
			await sleep(900);
		}
		const seen = new Set();
		const list = all.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
		process.stdout.write("候选 " + list.length + " … ");
		// 优先取落在区间内的；没有就取最接近区间中点的
		let best = null;
		let bestScore = Infinity;
		const mid = (minD + maxD) / 2;
		for (const r of list) {
			if (r.duration >= minD && r.duration <= maxD) {
				best = r;
				bestScore = -1;
				break;
			}
			const score = Math.abs(r.duration - mid);
			if (score < bestScore) {
				bestScore = score;
				best = r;
			}
		}
		picked = best;
	} catch (e) {
		console.log("搜索失败: " + e.message);
	}

	if (!picked) {
		console.log("× 没合适的，保留原文件");
		results.push({ name, ok: false });
		await sleep(1200);
		continue;
	}

	console.log("→ " + picked.title + " (" + picked.duration.toFixed(2) + "s)");

	if (DRY) {
		results.push({ name, ok: true });
		await sleep(1200);
		continue;
	}

	try {
		const raw = path.join(TMP, name + ".src");
		fs.writeFileSync(raw, Buffer.from(await (await get(picked.hq)).arrayBuffer()));
		const wav = path.join(TMP, name + ".wav");
		await runFF([
			"-y",
			"-loglevel",
			"error",
			"-i",
			raw,
			"-t",
			String(Math.min(cap, picked.duration)),
			"-ac",
			"1",
			"-ar",
			"44100",
			"-af",
			"highpass=f=35",
			wav,
		]);
		writeWav(wav, normalizeWav(fs.readFileSync(wav)));
		const mp3 = path.join(OUT, name + ".mp3");
		await runFF(["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1", mp3]);
		results.push({ name, ok: true, kb: fs.statSync(mp3).size / 1024 });
		credits.push({ ...picked, file: name });
	} catch (e) {
		console.log("  处理失败: " + e.message);
		results.push({ name, ok: false });
	}
	await sleep(1200);
}

console.log("\n===== 结果 =====");
for (const r of results) {
	console.log(r.ok ? "  OK   " + r.name + (r.kb ? "  " + r.kb.toFixed(1) + "KB" : "") : "  FAIL " + r.name);
}

if (!DRY && credits.length) {
	const lines = [
		"# 音效来源与署名",
		"",
		"以下音效取自 [freesound.org](https://freesound.org) 的公开预览文件，**仅用于个人本地游玩**。",
		"若要公开分发，请按各自授权（CC0 / CC-BY）保留署名，或替换为自有素材。",
		"",
		"| 文件 | 音效名 | 作者 | 链接 |",
		"|---|---|---|---|",
	];
	for (const c of credits) {
		lines.push(
			`| \`${c.file}.mp3\` | ${c.title} | ${c.user} | [${c.id}](https://freesound.org/people/${c.user}/sounds/${c.id}/) |`
		);
	}
	fs.writeFileSync(path.join(ROOT, "audio", "CREDITS.md"), lines.join("\n") + "\n", "utf8");
	console.log("\n已写入 audio/CREDITS.md（" + credits.length + " 条）");
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log("完成。");
