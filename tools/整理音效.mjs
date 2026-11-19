/**
 * 整理 audio/fx 下的音效：
 *   1. 去掉开头静音（很多素材是"留白 + 击打"，直接播会感觉延迟）
 *   2. 按 RMS 统一响度，峰值上限兜底
 *
 * 用法：node tools/整理音效.mjs [目标RMS=0.09]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(here, "..", "audio", "fx");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const TARGET_RMS = parseFloat(process.argv[2] || "0.09");
const PEAK_CAP = 0.92;
const SILENCE_DB = "-42dB";

function runFF(args) {
	return new Promise((resolve, reject) => {
		const p = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		p.stderr.on("data", d => (err += d));
		p.on("close", c => (c === 0 ? resolve() : reject(new Error(err.slice(-300)))));
	});
}

function readWav(buf) {
	let off = 12;
	while (off + 8 <= buf.length) {
		const id = buf.toString("ascii", off, off + 4);
		const size = buf.readUInt32LE(off + 4);
		if (id === "data") {
			const n = Math.floor(Math.min(size, buf.length - off - 8) / 2);
			const s = new Float32Array(n);
			for (let i = 0; i < n; i++) s[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
			return s;
		}
		off += 8 + size + (size % 2);
	}
	throw new Error("wav 缺少 data");
}

function writeWav(file, s) {
	const n = s.length;
	const b = Buffer.alloc(44 + n * 2);
	b.write("RIFF", 0);
	b.writeUInt32LE(36 + n * 2, 4);
	b.write("WAVE", 8);
	b.write("fmt ", 12);
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(44100, 24);
	b.writeUInt32LE(44100 * 2, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write("data", 36);
	b.writeUInt32LE(n * 2, 40);
	for (let i = 0; i < n; i++) {
		b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
	}
	fs.writeFileSync(file, b);
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".mp3"));
const tmpA = path.join(DIR, ".a.wav");
const tmpB = path.join(DIR, ".b.wav");

console.log("文件".padEnd(22) + "原时长".padStart(8) + "去静音后".padStart(10) + "增益".padStart(8));
for (const f of files) {
	const src = path.join(DIR, f);
	try {
		// 1 去开头静音
		await runFF([
			"-y",
			"-loglevel",
			"error",
			"-i",
			src,
			"-af",
			`silenceremove=start_periods=1:start_threshold=${SILENCE_DB}:start_silence=0.02`,
			"-ac",
			"1",
			"-ar",
			"44100",
			tmpA,
		]);
		const a = readWav(fs.readFileSync(tmpA));
		if (a.length < 44100 * 0.05) {
			console.log(f.padEnd(22) + " 去静音后过短，跳过");
			continue;
		}
		// 2 RMS 归一
		let sum = 0;
		let max = 0;
		for (let i = 0; i < a.length; i++) {
			sum += a[i] * a[i];
			max = Math.max(max, Math.abs(a[i]));
		}
		const rms = Math.sqrt(sum / a.length) || 1e-6;
		let gain = TARGET_RMS / rms;
		if (max * gain > PEAK_CAP) gain = PEAK_CAP / max;
		for (let i = 0; i < a.length; i++) a[i] *= gain;
		writeWav(tmpB, a);
		// 3 编码
		await runFF(["-y", "-loglevel", "error", "-i", tmpB, "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1", src]);
		console.log(
			f.padEnd(22) +
				"".padStart(2) +
				(a.length / 44100).toFixed(2) +
				"s" +
				"".padStart(6) +
				(20 * Math.log10(gain)).toFixed(1) +
				"dB"
		);
	} catch (e) {
		console.log(f.padEnd(22) + " 失败: " + e.message);
	}
}
fs.rmSync(tmpA, { force: true });
fs.rmSync(tmpB, { force: true });
console.log("\n完成。");
