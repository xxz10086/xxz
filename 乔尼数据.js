import { lib, game, ui, get, ai, _status } from "noname";
import skills from "./乔尼技能.js";
import { manwuzheTranslate } from "./乔尼坐骑.js";

/*
 * 乔尼·乔斯达 —— 数据模块（不自行注册角色包）
 * 角色/技能/翻译统一由 脑花数据.js 合并注册到一个包里。
 */

export const characters = {
	qnj_jonny: {
		sex: "male",
		group: "qun",
		hp: 3,
		skills: ["qnj_qhei", "qnj_manwuzhe_skill", "qnj_ya"],
		trashBin: ["legend"],
		img: "extension/脑花乔尼/image/qnj_jonny.jpg",
	},
};

export const translates = {
	// 说明：合并成单一 naohua 包后，旧的 qnj 包名与其配置名已不存在，
	// 故不再保留 qnj / qnj_character_config 这两条死翻译。
	qnj_jonny: "乔尼·乔斯达",

	qnj_qhei: "漆黑意志",
	qnj_qhei_info:
		"锁定技。当你体力值不大于2时，你使用【杀】时进行判定，若结果为黑色K或A，此【杀】不能被【闪】响应。",

	qnj_manwuzhe_skill: "漫舞者",
	qnj_manwuzhe_skill_info: "每轮开始时，你装备「漫舞者」。",

	qnj_ya: "牙",
	qnj_ya_info:
		`锁定技。游戏开始时，你拥有「牙1」（见${get.poptip("qnj_zhuadan")}）。<br>你每造成或受到 1 点伤害后，获得 1 枚${get.poptip("qnj_huixuan")}。<br>获得${get.poptip("qnj_huixuan")}时检测：≥3 升级为牙2；≥5 升级为牙3；≥7 升级为牙4，减 1 点体力上限并获得${get.poptip("qnj_huangjin")}。`,

	qnj_huixuan: "回旋",
	qnj_huixuan_info: `${get.poptip("qnj_ya")}的成长标记（已并入「牙」图标显示），累计到 3/5/7 枚时依次升级，消耗不会降级。`,

	qnj_zhuadan: "爪弹",
	qnj_zhuadan_info:
		`牙1：出牌阶段限一次，弃置一张手牌，视为对一名角色使用一张无视距离的【杀】。此【杀】结算后，你选择一项：你计算与其距离 -1，或其计算与你距离 +1，直到你下个回合开始。<br>牙2追加：此【杀】结算后若未造成伤害，你可以移去 1 枚${get.poptip("qnj_huixuan")}，视为对同一目标使用一张无距离限制且不计入次数限制的【杀】。每回合限一次。<br>牙3追加：见${get.poptip("qnj_ya3")}。`,
	qnj_ya3: "爪弹·牙3",
	qnj_ya3_info: `当你受到伤害时，你可以移去 1 枚${get.poptip("qnj_huixuan")}，防止此伤害。`,

	qnj_huangjin: "完全なる黄金回旋エネルギー",
	qnj_huangjin_info:
		`限定技。出牌阶段或濒死时，若你有 7 枚或以上${get.poptip("qnj_huixuan")}，你可以移去所有${get.poptip("qnj_huixuan")}，选择一名其他角色：对其造成 1 点不可被防止的伤害，并令其获得${get.poptip("qnj_wuxianhuixuan")}与禁疗（不能回复体力，直到其死亡）。<br>结算后你回复 1 点体力，然后失去所有技能且不能获得技能直到游戏结束。`,
	qnj_huangjin_dying: "黄金回旋·濒死",
	qnj_huangjin_dying_info: `见${get.poptip("qnj_huangjin")}：濒死状态时同样可以发动。`,

	qnj_wuxianhuixuan: "无限回旋",
	qnj_wuxianhuixuan_info:
		"回合开始时失去 1 点体力；不因死亡而移除，复活后继续生效，不可移除。<br>同时附带<b>禁疗</b>：不能回复体力（濒死求桃除外），直到该角色死亡。",

	// 以下为内部辅助技能（nopop/charlotte，不会在界面上主动弹窗），
	// 但补齐中文名与描述，避免调试或鼠标悬停时露出裸 ID。
	qnj_zhuadan_distance: "爪弹·距离",
	qnj_zhuadan_distance_info: "爪弹结算后记录与目标的距离修正，持续到你下个回合开始。",
	qnj_wuxianhuixuan_guard: "无限回旋·守护",
	qnj_wuxianhuixuan_guard_info: `${get.poptip("qnj_wuxianhuixuan")}不可被移除：被其他技能清除时会自动恢复。`,
	qnj_no_recover_skill: "无法回复",
	qnj_no_recover_skill_info: `禁疗效果已并入${get.poptip("qnj_wuxianhuixuan")}，此技能不再单独生效。`,
	qnj_no_skill: "技能封锁",
	qnj_no_skill_info: "锁定技，你不能获得或使用普通技能。",

	...manwuzheTranslate,
};

export { skills as qnjSkills };

export default characters;



