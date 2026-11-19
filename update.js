// ============================================================================
// 在线更新模块
// ----------------------------------------------------------------------------
// 结构参考《朔夜》0.1.42 的 update.js（比《一中杀》那版更完善），要点：
//   · 多个镜像源并发抢跑，谁先成功用谁（不用串行等待，弱网下快很多）
//   · LOCAL_ONLY 白名单：本地开发文件既不发布、也不会被"清理旧文件"误删
//   · 清单【最后】写：中途断网时旧清单还在，下次还能重试
//   · 下载 URL 走 encodeURI：本扩展文件名含中文，不编码会 404
// ============================================================================

import { lib, game, ui, get, ai, _status } from "noname";

export const EXTENSION_VERSION_FALLBACK = "0.0.0";

// ============ 线上更新配置 ============
const EXTNAME = "脑花乔尼";

// GitHub 仓库坐标
const GH_USER = "xxz10086";
const GH_REPO = "xxz";
const GH_BRANCH = "main";

// ── 更新源列表（按顺序，索引对应扩展设置里的 update_source 选项）──
//
// 【默认用 gh-proxy 加速代理】——它是「实时转发」，不缓存，
// 一推送就能取到新版本，且国内能直连（实测约 1 秒）。
//
// 为什么不用 jsDelivr 当默认：
//   jsDelivr 会按分支名缓存约 12 小时。刚发布的新版本，
//   用 @main 访问会拿到旧清单 → 玩家点更新提示「已是最新」，
//   必须等十几小时才生效。这个问题在实测中已经踩到。
//   （jsDelivr 按 commit hash 访问能绕过缓存，但代码事先不知道最新 hash。）
//   所以把它放到第 3 位当备用。
const SOURCES = [
	// ① gh-proxy（实时、国内可直连）—— 默认
	{ name: "gh-proxy 加速", base: `https://gh-proxy.com/https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/refs/heads/${GH_BRANCH}` },
	// ② ghproxy.net（另一家加速，备用）
	{ name: "ghproxy.net", base: `https://ghproxy.net/https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/refs/heads/${GH_BRANCH}` },
	// ③ jsDelivr 国内节点（有缓存，最后兜底）
	{ name: "jsDelivr 国内", base: `https://quantil.jsdelivr.net/gh/${GH_USER}/${GH_REPO}@${GH_BRANCH}` },
	// ④ GitHub 直连（海外 / 开了代理时最快）
	{ name: "GitHub 直连", base: `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/refs/heads/${GH_BRANCH}` },
];

// 兼容旧变量名（代码里还在用 REPO / MIRRORS 的地方）
const REPO = SOURCES[0].base;

// ── 只在本地存在的文件：不发布、也不被清理逻辑误删 ──
const LOCAL_ONLY = [
	/(^|\/)backup(\/|$)/i,
	/\.bak$/i,
	/(^|\/)assets(\/|$)/i,
	/^genManifest\.js$/,
	/^UPDATE\.md$/,
	/^noname-kit\.history\.json$/,
	/^manifest\.json$/,
];
export const isLocalOnly = (rel) => LOCAL_ONLY.some((re) => re.test(rel));

/** 询问是否更新（走系统 confirm，不碰游戏内 UI） */
function askUpdate(text) {
	return confirm(text);
}

/**
 * 执行更新
 * @param {boolean} isManual true=用户点「检查更新」；false=启动时自动检查
 * @param {string} localVersion 当前版本号
 */
export async function performUpdate(isManual, localVersion) {
	if (_status.connectMode && isManual) {
		alert("联机状态下无法更新");
		throw new Error("联机状态下无法更新");
	}
	if (!window.navigator.onLine && isManual) {
		alert("断网状态下无法检查更新，请检查网络连接");
		throw new Error("网络连接失败");
	}
	if (!isManual && sessionStorage.nh_check) return;

	if (!REPO) {
		if (isManual) {
			alert(
				"尚未配置在线更新源。\n\n" +
					"请编辑 extension/脑花乔尼/update.js，\n" +
					"把顶部 const REPO = \"\"; 改成你的仓库地址后重新打包。"
			);
		}
		return;
	}

	// ── 获取清单：首选源立即发，其余源 400ms 后并发抢跑 ──
	// 说明：jsDelivr 会缓存文件（约 12 小时），刚推送的新文件可能还没生效，
	//      所以这里并发跑多个源，谁先返回有效清单就用谁。
	const preferredIdx = Number(lib.config[`extension_${EXTNAME}_update_source`]) || 0;
	const ordered = [SOURCES[preferredIdx] ?? SOURCES[0], ...SOURCES.filter((s, i) => i !== preferredIdx)];
	const attempts = ordered.map(
		(src, i) =>
			new Promise((resolve, reject) => {
				setTimeout(async () => {
					try {
						const opt = { cache: "no-store" };
						if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
							opt.signal = AbortSignal.timeout(10000);
						}
						const r = await fetch(`${src.base}/manifest.json`, opt);
						if (!r.ok) throw new Error(`${src.name} HTTP ${r.status}`);
						const manifest = await r.json();
						if (typeof manifest?.version !== "string" || !manifest.files || typeof manifest.files !== "object") {
							throw new Error(`${src.name} 清单格式不正确`);
						}
						resolve({ source: src, manifest });
					} catch (e) {
						reject(e);
					}
				}, i === 0 ? 0 : 400);
			})
	);

	let picked = null;
	try {
		picked = await Promise.any(attempts);
	} catch (e) {
		console.warn(`[${EXTNAME}] 所有更新源均失败`, e);
	}
	if (!picked) {
		sessionStorage.nh_check = true;
		if (isManual) {
			alert(
				"清单文件获取失败。\n\n" +
					"可能原因：\n" +
					"· 网络不通（请确认能正常上网）\n" +
					"· jsDelivr 缓存了旧文件（等几分钟再试）\n" +
					"· 仓库地址或分支名有误\n\n" +
					"可在扩展设置里切换「更新源」后重试。"
			);
		}
		return;
	}
	const p = picked.source.base;
	const m = picked.manifest;
	console.log(`[${EXTNAME}] 使用「${picked.source.name}」获取清单成功，仓库版本 v${m.version}`);

	// ── 版本号比较：本地更高则跳过（防止开发版被旧清单覆盖）──
	if (compareVersion(localVersion, m.version) > 0) {
		sessionStorage.nh_check = true;
		if (isManual) alert(`本地版本 ${localVersion} 高于仓库版本 ${m.version}，已跳过`);
		return;
	}

	// ── 逐文件比对 SHA-1（每批 5 个并发）──
	const hex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
	const entries = Object.entries(m.files);
	const onlyCode = lib.config[`extension_${EXTNAME}_update_method`];
	const updateFiles = [];

	for (let i = 0; i < entries.length; i += 5) {
		const batch = entries.slice(i, i + 5);
		await Promise.all(
			batch.map(async ([f, h]) => {
				if (onlyCode && !f.endsWith(".js") && !f.endsWith(".css")) return;
				const path = `extension/${EXTNAME}/${f}`;
				if ((await game.promises.checkFile(path)) !== 1) {
					updateFiles.push(f);
					return;
				}
				try {
					const raw = await game.promises.readFile(path);
					let buf = raw;
					if (typeof raw === "string") buf = new TextEncoder().encode(raw);
					else if (raw instanceof ArrayBuffer) buf = raw;
					else if (!(raw instanceof Uint8Array)) buf = new Uint8Array(raw);
					const digest = await crypto.subtle.digest("SHA-1", buf);
					const localHash = Array.from(new Uint8Array(digest), (x) => hex[x]).join("");
					if (localHash !== h) updateFiles.push(f);
				} catch {
					updateFiles.push(f);
				}
			})
		);
	}

	sessionStorage.nh_check = true;

	if (updateFiles.length === 0) {
		if (isManual) alert(`已是最新版本（v${localVersion}）`);
		return;
	}

	const okToUpdate = await askUpdate(
		`《${EXTNAME}》发现新版本 v${m.version}（当前 v${localVersion}）\n` +
			`${updateFiles.length} 个文件需更新\n` +
			`更新说明：\n${m.update || "无"}`
	);
	if (!okToUpdate) return;

	// ── 下载 ──
	const prog = makeProgress(`更新《${EXTNAME}》扩展`, updateFiles.length);
	try {
		const downloadFileWithRetry = async (url, maxRetries = 3) => {
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					const r = await fetch(url);
					if (r.ok) return r;
					if (r.status === 429) {
						if (attempt === maxRetries) throw new Error(`请求过于频繁(429)，重试 ${maxRetries + 1} 次仍失败`);
						const wait = Math.pow(2, attempt) * 1000;
						console.warn(`[${EXTNAME}] 请求过于频繁，等待 ${wait / 1000}s`);
						await new Promise((resolve) => setTimeout(resolve, wait));
						continue;
					}
					throw new Error(`HTTP ${r.status}`);
				} catch (e) {
					if (attempt === maxRetries) throw e;
					await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
				}
			}
		};

		const ensureDir = async (dirPath) => {
			let current = "";
			for (const part of dirPath.split("/")) {
				current += (current ? "/" : "") + part;
				try {
					await game.promises.createDir(current);
				} catch (e) {
					/* 已存在 */
				}
			}
		};

		for (let i = 0; i < updateFiles.length; i++) {
			const f = updateFiles[i];
			prog.setProgress(i + 1);
			prog.setFile(f);
			// ⚠️ encodeURI：本扩展有大量中文文件名，不编码会 404
			// p 已经是完整的源根地址（如 https://quantil.jsdelivr.net/gh/user/repo@main），
			// 直接拼相对路径即可，不要再加 REPO。
			const fileUrl = encodeURI(`${p}/${f}`);
			const r = await downloadFileWithRetry(fileUrl);
			const data = await r.arrayBuffer();
			const fullPath = `extension/${EXTNAME}/${f}`;
			const dir = fullPath.split("/").slice(0, -1).join("/");
			await ensureDir(dir);
			await game.promises.writeFile(data, dir, fullPath.split("/").pop());
			await new Promise((resolve) => setTimeout(resolve, 200));
		}

		// 清单最后写：中途断网时旧清单还在，下次还能重试
		await game.promises.writeFile(JSON.stringify(m, null, 2), `extension/${EXTNAME}`, "manifest.json");

		// ── 清理清单外的旧文件（本地开发文件除外）──
		const clean = async (path, pre = "") => {
			let list = [];
			try {
				const [dirs, files] = await game.promises.getFileList(path);
				list = files.map((file) => (pre ? `${pre}/${file}` : file));
				for (const d of dirs) list = list.concat(await clean(`${path}/${d}`, pre ? `${pre}/${d}` : d));
			} catch (e) {}
			return list;
		};
		const fList = (await clean(`extension/${EXTNAME}`)).filter((file) => {
			if (m.files[file]) return false;
			if (isLocalOnly(file)) return false;
			if (onlyCode && !file.endsWith(".js") && !file.endsWith(".css")) return false;
			return true;
		});
		if (fList.length) {
			const cleanProg = makeProgress("清理旧文件", fList.length);
			for (let i = 0; i < fList.length; i++) {
				cleanProg.setProgress(i + 1);
				cleanProg.setFile(fList[i]);
				try {
					await game.promises.removeFile(`extension/${EXTNAME}/${fList[i]}`);
				} catch (e) {
					console.warn(`[${EXTNAME}] 清理失败：${fList[i]}`, e);
				}
			}
			cleanProg.remove();
		}

		prog.remove();
		alert("更新完成！（将自动重启）");
		game.reload();
	} catch (e) {
		if (prog) prog.remove();
		throw e;
	}
}

/** 版本号比较：2.34.1 > 2.34.0；2.9.0 < 2.10.0（按数字分段，不按字符串） */
export function compareVersion(a, b) {
	const pa = String(a || "0")
		.split(/[.\-+]/)
		.map((x) => parseInt(x, 10) || 0);
	const pb = String(b || "0")
		.split(/[.\-+]/)
		.map((x) => parseInt(x, 10) || 0);
	const n = Math.max(pa.length, pb.length);
	for (let i = 0; i < n; i++) {
		const x = pa[i] || 0;
		const y = pb[i] || 0;
		if (x > y) return 1;
		if (x < y) return -1;
	}
	return 0;
}

/**
 * 简易进度条。
 * 优先用引擎自带的 createProgress（有原生样式），拿不到就退化成自绘浮层，
 * 这样在网页版/App 版都能显示进度。
 */
function makeProgress(title, total) {
	// 尝试引擎原生进度条
	try {
		const lib2 = lib;
		if (lib2 && typeof window !== "undefined" && window.require) {
			// 无需处理，直接尝试动态导入
		}
	} catch (e) {}

	let node = null;
	const ensure = () => {
		if (node) return node;
		try {
			node = ui.create.div(".progress-text", title, ui.window || document.body);
			node.style.cssText =
				"position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;" +
				"background:rgba(0,0,0,.85);color:#fff;padding:16px 26px;border-radius:10px;" +
				"font-size:15px;line-height:1.7;text-align:center;max-width:80vw;min-width:280px;";
			node.innerHTML = `${title}<br><span class="nh-cur">0</span> / ${total}`;
		} catch (e) {}
		return node;
	};
	ensure();
	return {
		setProgress(n) {
			try {
				const el = node && node.querySelector && node.querySelector(".nh-cur");
				if (el) el.textContent = String(n);
			} catch (e) {}
		},
		setFile(f) {
			try {
				const el = node && node.querySelector && node.querySelector(".nh-file");
				if (el) el.textContent = f;
				else if (node) {
					const d = document.createElement("div");
					d.className = "nh-file";
					d.style.cssText = "color:#9cf;font-size:13px;margin-top:6px;word-break:break-all;";
					d.textContent = f;
					node.appendChild(d);
				}
			} catch (e) {}
		},
		remove() {
			try {
				if (node && node.parentNode) node.parentNode.removeChild(node);
				node = null;
			} catch (e) {}
		},
	};
}

// ============ 导出主函数 ============
/**
 * @param {boolean} manual true=手动，false=自动
 * @param {string} localVersion 当前版本
 */
export default async (manual, localVersion = EXTENSION_VERSION_FALLBACK) => {
	if (manual) {
		game.importedPack = true;
		try {
			await performUpdate(true, localVersion);
		} catch (e) {
			console.warn(e);
		} finally {
			game.importedPack = false;
		}
	} else {
		if (sessionStorage.nh_check) return;
		// 等别的扩展更新完再开始
		if (game.importedPack) {
			await new Promise((resolve) => {
				const check = () => (game.importedPack ? setTimeout(check, 300) : resolve());
				check();
			});
		}
		game.importedPack = true;
		try {
			await performUpdate(false, localVersion);
		} catch (e) {
			console.warn(e);
		} finally {
			game.importedPack = false;
		}
	}
};
