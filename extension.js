import { lib, game, ui, get, ai, _status } from "noname";
import update from "./update.js";
import { EXTENSION_VERSION } from "./version.js";

export const type = "extension";

// 版本号统一在 version.js 维护（唯一真相来源），genManifest.js 也读那一份，
// 避免"改了 extension.js 忘了改 info.json"这类不一致。
const EXT_VERSION = EXTENSION_VERSION;

export default async function () {
	return {
		name: "脑花乔尼",
		// ⚠️ 联机标记，必须有！
		//   init/loading.js:195 —— `if (!extension[5] && lib.config.mode === "connect") return;`
		//   没有这个标记时，联机模式下整个扩展的 content 会被直接跳过，
		//   表现为：联机房里技能不触发、角色数据缺失。
		//   （这个标记只影响 content，precontent 仍会照常执行。）
		connect: true,
		editable: false,
		async precontent() {
			// 控制台版本横幅：方便一眼确认"扩展是否更新成功"
			try {
				console.log(
					`%c【脑花乔尼】v${EXT_VERSION} 已加载`,
					"background:#2E8B57;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold"
				);
				console.log(
					`%c角色：羂索 / 乔尼·乔斯达 / 乔鲁诺·乔巴纳 / D&G　|　卡牌：漫舞者 / 虫箭`,
					"color:#8A2BE2"
				);
			} catch (e) {}
			// 统一开关 → 各特效模块读取的旧键（别名同步）。
			// 三个特效文件内部用的是 CFG_KEY/CFG_SFX（naohua_/qnj_/jojo_ 各一套），
			// 这里不改动它们，只把旧键的值跟着统一开关走，效果等价于“一个总开关”。
			try {
				const ALIAS = {
					naohua_fx: "fx_all",
					qnj_fx: "fx_all",
					jojo_fx: "fx_all",
					naohua_sfx: "sfx_all",
					qnj_sfx: "sfx_all",
					jojo_sfx: "sfx_all",
				};
				const PREFIX = "extension_脑花乔尼_";
				const DEFAULT = { fx_all: true, sfx_all: true };
				for (const newName of new Set(Object.values(ALIAS))) {
					const full = PREFIX + newName;
					const oldNames = Object.keys(ALIAS).filter(k => ALIAS[k] === newName);
					const oldFulls = oldNames.map(k => PREFIX + k);
					// 决定统一开关的初值：
					// 优先沿用已存在的统一开关值；否则取旧键里任一"显式设为 false"的值（尊重用户此前的关闭）；
					// 都没有则用默认值。
					let val = lib.config[full];
					if (val === undefined) {
						const explicitOff = oldFulls.some(k => lib.config[k] === false);
						if (explicitOff) {
							val = false;
						} else {
							val = DEFAULT[newName];
						}
					}
					const push = v => {
						for (const o of oldFulls) lib.config[o] = v;
					};
					try {
						Object.defineProperty(lib.config, full, {
							configurable: true,
							enumerable: true,
							get: () => val,
							set: v => {
								val = v;
								push(v);
							},
						});
					} catch (e) {}
					push(val); // 立即同步一次
				}
			} catch (e) {}
			// 只需加载统一数据模块：脑花数据.js 内部已 import 乔尼/乔鲁诺数据，
			// 三个角色与所有卡牌都在这一个包里注册。
			await import("./脑花数据.js");
			// 联机客机兜底角色数据
			try {
				if (!lib.character["naohua_kenjaku"]) {
					lib.character["naohua_kenjaku"] = [
						"male",
						"qun",
						3,
						["naohua_shimie", "naohua_zhoulingshu", "naohua_zhang", "naohua_duoshe"],
						["img:extension/脑花乔尼/image/character/羂索.jpg"],
					];
					lib.character["naohua_kenjaku"].img = "extension/脑花乔尼/image/character/羂索.jpg";
				}
				lib.translate.naohua_kenjaku = "羂索";
			} catch (e) {}
			try {
				if (!lib.character["qnj_jonny"]) {
					lib.character["qnj_jonny"] = [
						"male",
						"qun",
						3,
						["qnj_qhei", "qnj_manwuzhe_skill", "qnj_ya"],
						["img:extension/脑花乔尼/image/qnj_jonny.jpg"],
					];
				}
				if (lib.character["qnj_jonny"]) {
					lib.character["qnj_jonny"].img = "extension/脑花乔尼/image/qnj_jonny.jpg";
				}
				lib.translate.qnj_jonny = "乔尼·乔斯达";
			} catch (e) {}
			try {
				if (!lib.character["jojo_giorno"]) {
					lib.character["jojo_giorno"] = [
						"male",
						"qun",
						4,
						["jojo_giorno_huangjin", "jojo_giorno_chongjian", "jojo_giorno_juexin"],
						["img:extension/脑花乔尼/image/jojo_giorno.jpg"],
					];
				}
				if (lib.character["jojo_giorno"]) {
					lib.character["jojo_giorno"].img = "extension/脑花乔尼/image/jojo_giorno.jpg";
				}
				// 镇魂曲是隐藏形态：必须用对象形式并带 isUnseen，
				// 否则数组形式无法携带该标记，角色会重新出现在选将框。
				if (!lib.character["jojo_giorno_requiem"]) {
					lib.character["jojo_giorno_requiem"] = {
						sex: "male",
						group: "qun",
						hp: 4,
						skills: [],
						img: "extension/脑花乔尼/image/jojo_giorno_requiem.jpg",
						isUnseen: true,
					};
				}
				const _rq = lib.character["jojo_giorno_requiem"];
				if (_rq) {
					// 无论此前是对象还是数组形式，都补回立绘与 isUnseen 隐藏标记
					_rq.img = "extension/脑花乔尼/image/jojo_giorno_requiem.jpg";
					_rq.isUnseen = true;
				}
				lib.translate.jojo_giorno = "乔鲁诺·乔巴纳";
				lib.translate.jojo_giorno_requiem = "乔鲁诺·乔巴纳（镇魂曲）";
			} catch (e) {}
		},
		content() {
			// 启动时自动检查更新（可在扩展设置里关掉）。
			// 不 await：让它后台跑，不阻塞游戏加载。
			// 条件：开关开启 + 在线 + 非联机房 + 本次会话没查过。
			try {
				if (
					lib.config.extension_脑花乔尼_auto_update &&
					navigator.onLine &&
					lib.config.mode !== "connect" &&
					!sessionStorage.nh_check
				) {
					update(false, EXT_VERSION);
				}
			} catch (e) {}
		},
		config: {
			// 全扩展统一开关（不再按角色拆成 6 套）
			fx_all: {
				name: "技能特效",
				init: true,
				intro: "全扩展的技能演出特效（羂索 / 乔尼 / 乔鲁诺 / D&G 共用，纯前端表现，不影响任何结算）。<br>关闭后所有角色都不再播放特效与演出延时。",
				frequent: true,
			},
			// ⚠️ 这个键必须叫 fx_level：
			//   四个特效文件（脑花/乔尼/乔鲁诺/D&G）内部都用
			//   `const CFG_LEVEL = "extension_脑花乔尼_fx_level"` 去读它，
			//   引擎会把 config 里的键自动加前缀 "extension_<扩展名>_"。
			//   改名字（或删掉）会让 qlv() 读不到值，永远退化成默认档 3。
			fx_level: {
				name: "特效等级",
				init: "3",
				// 档位说明与特效文件里的 LEVEL_PART / LEVEL_TIME 对应：
				//   粒子数 [0.2, 0.4, 0.7, 1, 1.35]
				//   时长   [0.5, 0.7, 1, 1, 1.05]
				intro:
					"控制特效的粒子数量与持续时间。<br>" +
					"<b>1</b> 极简（粒子 20%，时长减半）—— 低端机首选<br>" +
					"<b>2</b> 简洁（粒子 40%）<br>" +
					"<b>3</b> 标准（默认）<br>" +
					"<b>4</b> 华丽（粒子 100% + 更多细节）<br>" +
					"<b>5</b> 极致（粒子 135%，时长略增）<br>" +
					"<small>只影响画面，不影响任何技能结算。</small>",
				item: {
					1: "1 - 极简",
					2: "2 - 简洁",
					3: "3 - 标准",
					4: "4 - 华丽",
					5: "5 - 极致",
				},
				frequent: true,
			},
			sfx_all: {
				name: "技能音效",
				init: true,
				intro: "全扩展的技能音效（羂索 / 乔尼 / 乔鲁诺 / D&G 共用）。<br>关闭后只有画面没有声音。",
				frequent: true,
			},
			jojo_bgm: {
				name: "乔鲁诺觉醒BGM",
				init: true,
				intro: "乔鲁诺觉醒为「黄金体验镇魂曲」时播放背景音乐。<br>音乐文件需自备，放到 <b>extension/脑花乔尼/audio/fx/il_vento_doro.mp3</b>。<br>文件不存在时会静默跳过，不影响游戏。",
				frequent: true,
			},
			// ── 在线更新 ──
			version_display: {
				name: `<span style="color:#ffa348">当前版本：v${EXT_VERSION}</span>`,
				clear: true,
				onclick: function () {
					alert(`《脑花乔尼》当前版本 v${EXT_VERSION}\n下方「检查更新」可获取最新版本`);
				},
			},
			update_source: {
				name: `<font color="#9c27b0">更新源`,
				init: "0",
				intro:
					"默认用 <b>gh-proxy 加速</b>，国内可直连，且实时生效（新版本推送后立刻能取到）。<br>" +
					"若检查更新失败，可切换其他源试试。<br>" +
					"<small>· jsDelivr 有约 12 小时缓存，新版本可能延迟生效<br>" +
					"· 开了海外代理的话，「GitHub 直连」通常最快</small>",
				item: {
					0: "gh-proxy 加速（推荐）",
					1: "ghproxy.net",
					2: "jsDelivr 国内",
					3: "GitHub 直连",
				},
			},
			update_method: {
				name: `<font color="#2196f3">极速更新`,
				init: false,
				intro: "跳过音频、图片等大文件，仅更新 .js / .css，显著加快速度。<br>首次安装或美术资源有变更时请关闭本项。",
			},
			auto_update: {
				name: `<font color="#e91e63">自动检查更新`,
				init: true,
				intro: "启动游戏时自动检查新版本。<br>发现更新会弹窗询问，不会静默改动文件。",
			},
			check_update: {
				name: `<span style="color:#4caf50;text-decoration:underline">检查更新`,
				clear: true,
				onclick: async function () {
					const self = this;
					self.innerHTML = `<span style="color:#f61515;text-decoration:underline">正在检测更新...`;
					try {
						await update(true, EXT_VERSION);
						self.innerHTML = `<span style="color:#4caf50;text-decoration:underline">检查完成`;
					} catch (e) {
						self.innerHTML = `<span style="color:#f44336;text-decoration:underline">更新失败`;
					}
					setTimeout(() => {
						try {
							self.innerHTML = `<span style="color:#4caf50;text-decoration:underline">检查更新`;
						} catch (e) {}
					}, 2000);
				},
			},
		},
		help: {},
		package: {
			intro: [
				"共 4 名角色：羂索、乔尼·乔斯达、乔鲁诺·乔巴纳、D&G",
				"另有 2 张卡牌：漫舞者、虫箭",
				`版本 v${EXT_VERSION}`,
			].join("<br>"),
			version: EXT_VERSION,
		},
		files: {
			character: [],
			card: [],
			skill: [],
			audio: [],
		},
	};
}






















































