/**
 * D&G 特效注入器
 * ----------------------------------------------------------------------------
 * 把 D&G特效.js 的演出钩子接进 dvg.js。
 * 只做加法：新增 1 行 import、3 个驱动函数、20 处 FX()/FXWait() 调用。
 * 不删除、不重写任何既有逻辑。
 *
 * 用法（在本文件所在目录的上一层，即扩展根目录执行）：
 *   node tools/注入dvg特效.mjs            # 默认 dry-run：只检查锚点，不写文件
 *   node tools/注入dvg特效.mjs --apply    # 真正写入（自动备份 dvg.js.fxbak）
 *   node tools/注入dvg特效.mjs --revert   # 从 dvg.js.fxbak 回滚
 *   node tools/注入dvg特效.mjs --check    # 只做自检：FX 名 ↔ 特效方法 ↔ 音效文件
 *
 * 幂等：已注入过会直接提示退出，不会重复插入。
 * 前置：D&G特效.js 必须在同目录（本脚本会自检它是否可加载）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FILE = process.env.DVG_FILE || path.join(ROOT, "dvg.js");
const FXFILE = path.join(ROOT, "D&G特效.js");
const BAK = FILE + ".fxbak";

const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");
const CHECKONLY = process.argv.includes("--check");

if (!fs.existsSync(FILE)) {
	console.error("✘ 找不到 " + FILE);
	process.exit(1);
}

/* ==========================================================================
 * 回滚
 * ======================================================================== */
if (REVERT) {
	if (!fs.existsSync(BAK)) {
		console.error("✘ 没有备份 " + BAK + "，无法回滚");
		process.exit(1);
	}
	fs.copyFileSync(BAK, FILE);
	console.log("✔ 已从备份回滚 " + FILE + "（" + fs.statSync(FILE).size + " 字节）");
	process.exit(0);
}

/* ==========================================================================
 * 驱动层（与 乔尼技能.js / 乔鲁诺.js / 脑花技能.js 完全同构）
 * ======================================================================== */
const DRIVER = `
import "./D&G特效.js";

/* ============================================================================
 * 表现层驱动：只负责"让每个客户端各播一遍"，任何异常都吞掉，绝不参与结算。
 * ========================================================================== */
function FXOn() {
	try {
		return !!(lib.dvgFx && lib.dvgFx.on);
	} catch (e) {
		return false;
	}
}

function FX(name, ...args) {
	try {
		if (!FXOn()) return;
		const runner = function () {
			try {
				const rest = Array.prototype.slice.call(arguments, 1);
				if (lib.dvgFx) lib.dvgFx.play(arguments[0], rest);
			} catch (e) {}
		};
		if (typeof game.broadcastAll === "function") game.broadcastAll(runner, name, ...args);
		else runner(name, ...args);
	} catch (e) {}
}

function FXWait(ms, skippable) {
	if (!FXOn()) return Promise.resolve();
	// 画质档位 1/2 会缩短演出等待，低端机不必干等
	try {
		const _f = lib.dvgFx;
		const _ts = _f && _f.timeScale;
		if (typeof _ts === "function") ms = Math.max(120, Math.round(ms * _ts()));
	} catch (e) {}
	return new Promise(resolve => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			try {
				document.removeEventListener("pointerdown", finish, true);
			} catch (e) {}
			resolve();
		};
		setTimeout(finish, ms);
		if (skippable) {
			try {
				document.addEventListener("pointerdown", finish, true);
			} catch (e) {}
		}
	});
}
`;

/* ==========================================================================
 * 20 处钩子
 *   find = dvg.js 里现存的锚点（TAB 缩进，必须逐字一致）
 *   repl = 替换后的内容（只多不少）
 * ======================================================================== */
const HOOKS = [
	{
		no: "①",
		where: "文件头",
		what: "import 特效模块 + 注入驱动层 FXOn/FX/FXWait",
		find: `import { lib, game, ui, get, ai, _status } from "noname";\n`,
		repl: `import { lib, game, ui, get, ai, _status } from "noname";\n` + DRIVER,
	},
	{
		no: "②",
		where: "dvg_skill_hidden.content 开头",
		what: 'FX("hiddenStart") — 暗置武将牌（未知牌背面 + 「隐」字）',
		find: `\t\t\tplayer.storage.dvg_hidden = true;\n\t\t\t// 记录「应该在哪个轮次归来」。`,
		repl: `\t\t\tplayer.storage.dvg_hidden = true;\n\t\t\tFX("hiddenStart", player);\n\t\t\t// 记录「应该在哪个轮次归来」。`,
	},
	{
		no: "③",
		where: "dvg_skill_hidden.content 第二步之前",
		what: 'FX("hiddenOut") — 黑雾吞没 + 溶解碎片，并等待 760ms',
		find: `\t\t\tgame.log(player, "进入", "#g「隐匿」", "状态，武将牌已暗置");`,
		repl: `\t\t\tgame.log(player, "进入", "#g「隐匿」", "状态，武将牌已暗置");\n\t\t\tFX("hiddenOut", player);\n\t\t\tawait FXWait(760, true);`,
	},
	{
		no: "④",
		where: "dvg_skill_return.content 末尾日志前",
		what: 'FX("returnBack") — 虚空裂隙 + 光柱 + 粒子重组 + 白闪 + 「再登场」',
		find: `\t\t\tgame.log(player, "从", "#g「隐匿」", "中重新登场（座次已恢复）");`,
		repl: `\t\t\tFX("returnBack", player);\n\t\t\tgame.log(player, "从", "#g「隐匿」", "中重新登场（座次已恢复）");`,
	},
	{
		no: "⑤",
		where: "dvg_skill_help.askHelp 的询问循环内",
		what: 'FX("helpAsk") — 琥珀金线连到目标 + 「？」',
		find: `\t\t\tfor (const target of targets) {\n\t\t\t\tconst result = await target`,
		repl: `\t\t\tfor (const target of targets) {\n\t\t\t\tFX("helpAsk", player, target);\n\t\t\t\tawait FXWait(320, true);\n\t\t\t\tconst result = await target`,
	},
	{
		no: "⑥",
		where: "dvg_skill_help.askHelp 的 if (result.bool) 分支",
		what: '接受 → FX("helped")；新增 else 分支 → FX("declined")',
		find: `\t\t\t\t\tgame.log(target, "接受了", player, "的", "#g「帮助」");\n\t\t\t\t}\n\t\t\t}`,
		repl: `\t\t\t\t\tgame.log(target, "接受了", player, "的", "#g「帮助」");\n\t\t\t\t\tFX("helped", target);\n\t\t\t\t} else {\n\t\t\t\t\tFX("declined", target);\n\t\t\t\t}\n\t\t\t}`,
	},
	{
		no: "⑦",
		where: "dvg_skill_mayouyou.summon 开头（已存在检查之后）",
		what: 'FX("summon") — 召唤阵 + 落雷 + 光柱 + 冲击环 + 「马友友」，等待 1250ms',
		find: `\t\tasync summon(player) {\n\t\t\tif (findMayouyou()) return; // 已存在`,
		repl: `\t\tasync summon(player) {\n\t\t\tif (findMayouyou()) return; // 已存在\n\t\t\tFX("summon", player);\n\t\t\tawait FXWait(1250, true);`,
	},
	{
		no: "⑧",
		where: "dvg_skill_mayouyou.killMayouyou 日志前",
		what: 'FX("mayouyouGone") — 青玉碎片消散',
		find: `\t\t\t\tgame.log("#g「马友友」", "随着 D&G 一同消失了");`,
		repl: `\t\t\t\tFX("mayouyouGone", my);\n\t\t\t\tgame.log("#g「马友友」", "随着 D&G 一同消失了");`,
	},
	{
		no: "⑨",
		where: "dvg_skill_takedown.content",
		what: 'FX("takedown") — 引力坍缩 + 虚线环 + 「同归」大字，等待 620ms',
		find: `\t\t\tawait lib.skill[MAYOUYOU].killMayouyou(player);`,
		repl: `\t\t\tFX("takedown", player);\n\t\t\tawait FXWait(620, true);\n\t\t\tawait lib.skill[MAYOUYOU].killMayouyou(player);`,
	},
	{
		no: "⑩",
		where: "dvg_skill_corrupt.content 分支 A（流失体力）",
		what: 'FX("corruptDamage", who, times) — 酸绿腐蚀 + 气泡 + 「腐蚀 -N」',
		find: `\t\t\t\tgame.log(who, "因", "#g「腐蚀」", "流失", get.cnNumber(times), "点体力");`,
		repl: `\t\t\t\tFX("corruptDamage", who, times);\n\t\t\t\tgame.log(who, "因", "#g「腐蚀」", "流失", get.cnNumber(times), "点体力");`,
	},
	{
		no: "⑪",
		where: "dvg_skill_corrupt.content 分支 B 的加腐蚀循环",
		what: 'FX("corruptGain", p, 1) — 每个被帮助者各播一次腐蚀蔓延',
		find: `\t\t\t\taddCorrupt(p);\n\t\t\t\tcount++;`,
		repl: `\t\t\t\taddCorrupt(p);\n\t\t\t\tFX("corruptGain", p, 1);\n\t\t\t\tcount++;`,
	},
	{
		no: "⑫",
		where: "dvg_skill_corrupt.content 分支 B 的收尾日志前",
		what: 'FX("corruptWave", count) — 全屏绿波 + 「腐蚀发作 ×N」',
		find: `\t\t\t\tgame.log("#g「马友友」", "的「腐蚀」发作了：", count, "名被帮助者各 +1 枚");`,
		repl: `\t\t\t\tFX("corruptWave", count);\n\t\t\t\tgame.log("#g「马友友」", "的「腐蚀」发作了：", count, "名被帮助者各 +1 枚");`,
	},
	{
		no: "⑬",
		where: "dvg_mayouyou_heal.content",
		what: 'FX("heal") — 青玉生命光 + 「回满」',
		find: `\t\t\tif (!player.storage.dvg_isMayouyou) return;\n\t\t\tif (player.hp < player.maxHp) {`,
		repl: `\t\t\tif (!player.storage.dvg_isMayouyou) return;\n\t\t\tFX("heal", player);\n\t\t\tif (player.hp < player.maxHp) {`,
	},
	{
		no: "⑭",
		where: "dvg_mayouyou_damage.content",
		what: 'FX("damageDraw", player, 2) — 卡牌虚影飞入 + 「+2 张」',
		find: `\t\ttrigger: { player: "damageEnd" },\n\t\tasync content(event, trigger, player) {\n\t\t\tif (!player.storage.dvg_isMayouyou) return;\n\t\t\tawait player.draw(2);`,
		repl: `\t\ttrigger: { player: "damageEnd" },\n\t\tasync content(event, trigger, player) {\n\t\t\tif (!player.storage.dvg_isMayouyou) return;\n\t\t\tFX("damageDraw", player, 2);\n\t\t\tawait player.draw(2);`,
	},
	{
		no: "⑮",
		where: "dvg_mayouyou_skip.content（trigger.cancel() 之后）",
		what: 'FX("skipPhase", player, isUse) — 阶段名被斜线划掉 + 「→ 摸两张」',
		find: `\t\t\tconst isUse = trigger.name === "phaseUseBegin";`,
		repl: `\t\t\tconst isUse = trigger.name === "phaseUseBegin";\n\t\t\tFX("skipPhase", player, isUse);`,
	},
	{
		no: "⑯",
		where: "dvg_mayouyou_immortal.content",
		what: 'FX("immortal") — 白闪 + 不灭烙印环 + 逆流粒子 + 「不死」',
		find: `\t\ttrigger: { player: "dying" },\n\t\tasync content(event, trigger, player) {\n\t\t\tif (!player.storage.dvg_isMayouyou) return;`,
		repl: `\t\ttrigger: { player: "dying" },\n\t\tasync content(event, trigger, player) {\n\t\t\tif (!player.storage.dvg_isMayouyou) return;\n\t\t\tFX("immortal", player);`,
	},
	{
		no: "⑰",
		where: "dvg_mayouyou_noreply 日志前",
		what: 'FX("noreply") — 灰色「放弃响应」浮字',
		find: `\t\t\tgame.log(player, "放弃了响应（闪/杀/无懈）");`,
		repl: `\t\t\tFX("noreply", player);\n\t\t\tgame.log(player, "放弃了响应（闪/杀/无懈）");`,
	},
	{
		no: "⑱",
		where: "dvg_skill_use 的取用日志前",
		what: 'FX("useCard", player, card) — 卡牌光影 + 「取用」',
		find: `\t\t\tgame.log(player, "取用了", "#g「马友友」", "的", card);`,
		repl: `\t\t\tFX("useCard", player, card);\n\t\t\tgame.log(player, "取用了", "#g「马友友」", "的", card);`,
	},
	{
		no: "⑲",
		where: "dvg_skill_give 日志前",
		what: 'FX("give", player, my, 1) — 卡牌飞向马友友 + 「交给马友友」',
		find: `\t\t\tgame.log(player, "将一张手牌交给了", "#g「马友友」");`,
		repl: `\t\t\tFX("give", player, my, 1);\n\t\t\tgame.log(player, "将一张手牌交给了", "#g「马友友」");`,
	},
	{
		no: "⑳",
		where: "dvg_skill_discard_to_mayouyou 日志前",
		what: 'FX("give", player, my, cards.length) — 弃牌飞向马友友',
		find: `\t\t\tgame.log(player, "弃置的牌置入了", "#g「马友友」", "的手牌区");`,
		repl: `\t\t\tFX("give", player, my, cards.length);\n\t\t\tgame.log(player, "弃置的牌置入了", "#g「马友友」", "的手牌区");`,
	},
];

/* ==========================================================================
 * 自检：FX 名 ↔ 特效方法 ↔ 音效文件
 * ======================================================================== */
function selfCheck() {
	console.log("=== 自检 ===");
	if (!fs.existsSync(FXFILE)) {
		console.log("  ✘ 缺少 D&G特效.js");
		return false;
	}
	const fxSrc = fs.readFileSync(FXFILE, "utf8");
	const defined = new Set();
	for (const m of fxSrc.matchAll(/^\t([a-zA-Z][\w]*)\s*\([^)]*\)\s*\{/gm)) defined.add(m[1]);

	const needed = new Set();
	for (const h of HOOKS) {
		for (const m of h.repl.matchAll(/FX\("([A-Za-z]+)"/g)) needed.add(m[1]);
	}
	let bad = 0;
	for (const n of [...needed].sort()) {
		const ok = defined.has(n);
		if (!ok) bad++;
		console.log("  " + (ok ? "✔" : "✘") + "  FX(\"" + n + "\")");
	}
	console.log("  方法 " + needed.size + " 个，" + (bad ? "缺 " + bad + " 个" : "全部有实现"));

	// 音效
	const sfx = new Set();
	for (const m of fxSrc.matchAll(/(?:sound|playSfx)\("(dvg_[a-z]+)"/g)) sfx.add(m[1]);
	const dir = path.join(ROOT, "audio", "fx");
	let miss = 0;
	if (fs.existsSync(dir)) {
		const have = new Set(fs.readdirSync(dir).map(f => f.replace(/\.mp3$/, "")));
		for (const s of [...sfx].sort()) {
			if (!have.has(s)) {
				miss++;
				console.log("  ✘ 缺音效 " + s + ".mp3");
			}
		}
	}
	console.log("  音效 " + sfx.size + " 个，" + (miss ? "缺 " + miss + " 个" : "全部存在"));
	return bad === 0 && miss === 0;
}

if (CHECKONLY) {
	const ok = selfCheck();
	process.exit(ok ? 0 : 1);
}

/* ==========================================================================
 * 注入
 * ======================================================================== */
let src = fs.readFileSync(FILE, "utf8");

if (src.includes("function FX(name, ...args)")) {
	console.log("ℹ dvg.js 已经注入过（检测到 FX 驱动层），无需重复。");
	console.log("  如需重来：node tools/注入dvg特效.mjs --revert 然后重新 --apply");
	process.exit(0);
}

console.log("目标：" + FILE + "（" + fs.statSync(FILE).size + " 字节 / " + src.split("\n").length + " 行）\n");

const missing = [];
for (const h of HOOKS) {
	if (!src.includes(h.find)) {
		missing.push(h);
		console.log("  ✘ " + h.no + " " + h.where);
		continue;
	}
	src = src.replace(h.find, () => h.repl);
	console.log("  ✔ " + h.no + " " + h.where);
}

console.log("\n命中 " + (HOOKS.length - missing.length) + "/" + HOOKS.length);

if (missing.length) {
	console.log("\n⚠️ 以下锚点不匹配（dvg.js 可能被改过）：");
	for (const h of missing) console.log("  " + h.no + " " + h.where + " — " + h.what);
	console.log("\n未写入任何内容。请人工核对这些位置后手动补 FX 调用。");
	process.exit(1);
}

if (!APPLY) {
	console.log("\n[dry-run] 未写文件。");
	console.log("确认无误后执行：  node tools/注入dvg特效.mjs --apply");
	process.exit(0);
}

if (!fs.existsSync(BAK)) fs.writeFileSync(BAK, fs.readFileSync(FILE));
fs.writeFileSync(FILE, src, "utf8");
console.log("\n✔ 已写入 " + FILE);
console.log("  " + fs.statSync(FILE).size + " 字节 / " + src.split("\n").length + " 行");
console.log("✔ 备份 " + BAK);
console.log("\n下一步：");
console.log("  1. node --check dvg.js            （语法）");
console.log("  2. node tools/注入dvg特效.mjs --check  （方法/音效自检）");
console.log("  3. 进游戏用 D&G 走一遍：隐匿 → 归来 → 帮助 → 召唤 → 腐蚀 → 同归");
