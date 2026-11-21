import { lib, game, ui, get, ai, _status } from "noname";
import skills from "./脑花技能.js";
import { characters as qnjCharacters, translates as qnjTranslates, qnjSkills } from "./乔尼数据.js";
import { manwuzheCard as qnjManwuzheCard, manwuzheTranslate as qnjManwuzheTranslate } from "./乔尼坐骑.js";
import { jojoCharacters, jojoSkills, jojoTranslates, jojoCards, jojoCardTranslates } from "./乔鲁诺.js";
import { dvgCharacters, dvgSkills, dvgTranslates } from "./dvg.js";

/*
 * 统一角色包：羂索 / 乔尼·乔斯达 / 乔鲁诺·乔巴纳
 * 全部角色、技能、翻译与卡牌都在这一个 game.import 里注册，
 * 选将界面只显示一个包（naohua），不再按角色拆成多个包。
 */

const characters = {
	naohua_kenjaku: {
		sex: "male",
		group: "qun",
		hp: 3,
		skills: ["naohua_shimie", "naohua_zhoulingshu", "naohua_zhang", "naohua_duoshe"],
		trashBin: ["legend"],
		dieAudios: [],
		img: "extension/脑花乔尼/image/character/羂索.jpg",
	},
	...qnjCharacters,
	...jojoCharacters,
	...dvgCharacters,
};

const translates = {
	naohua: "脑花乔尼",
	naohua_kenjaku: "羂索",
	naohua_character_config: "脑花乔尼",
	// 选将分组名：合并包里同时有羂索/乔尼/乔鲁诺三位（均为群势力），
	// 不能再沿用羂索专属的「死灭回游」，用中性的势力名。
	naohua_pack: "群",
	naohua_possessed: "（被夺舍）·脑花",

	naohua_shimie: "死灭回游",
	naohua_shimie_info: `锁定技，你的第一个准备阶段开始时开展「死灭回游」：所有角色依次选择是否成为泳者；泳者获取或支付${get.poptip("naohua_point")}，先达到 1000 点者获胜。<br>你死亡后场地仍保留。`,
	naohua_shimie_append: "「死灭回游」已开展。",

	naohua_field: "死灭回游·场地",
	naohua_join: "加入回游",
	naohua_join_info: `出牌阶段限一次，你可以加入${get.poptip("naohua_shimie")}，成为泳者。`,
	naohua_gate: "结界入口",
	naohua_gate_info: `出牌阶段限一次，支付1枚${get.poptip("naohua_point")}，选择一名其他泳者，令其选择一项：1.交给你一张牌；2.令你视为对其使用一张无距离限制、不计入次数且造成伤害后你获得1枚${get.poptip("naohua_point")}的【杀】。若其没有牌，只能选择第2项。`,
	naohua_field: "死灭回游",
	naohua_field_info: `全局技能。管理「死灭回游」结界的运行：泳者标记、点数增减、追加规则的置入与失效，以及胜利条件。`,
	naohua_rule: "追加规则",
	naohua_rule_info: `出牌阶段限一次，支付 5 枚${get.poptip("naohua_point")}，从规则池中选择一条当前未生效的追加规则置入场上。<br>场上最多同时存在 3 条；置入第 4 条时，移除最早置入的规则并使其返回规则池。<br>规则池（点击查看详情）：${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => get.poptip("naohua_rule_" + i)).join("、")}。`,
	naohua_point: "泳者·点数",
	naohua_point_info: `有此标记即视为「泳者」，标记数量为「点数」。<br>获得：每造成1点伤害获得1枚；击杀泳者获得3枚；结界入口的【杀】未造成伤害时目标获得1枚；术式公开/术式反制/点数均衡等追加规则也会获得。<br>支付：结界入口支付1枚，追加规则支付5枚，点数交易/点数保险/术式公开/术式反制等按文本支付。`,

	naohua_rule_1: "点数交易",
	naohua_rule_1_info: `每名泳者出牌阶段限一次，可以支付2枚${get.poptip("naohua_point")}摸一张牌；或弃置一张牌，获得1枚${get.poptip("naohua_point")}。`,
	naohua_rule_2: "术式公开",
	naohua_rule_2_info:
		`一名泳者使用【杀】指定目标后，可以支付1枚${get.poptip("naohua_point")}，令此【杀】不可被【闪】响应；若此【杀】的目标为泳者，该目标获得1枚${get.poptip("naohua_point")}。`,
	naohua_rule_3: "管理者裁定",
	naohua_rule_3_info:
		`一名泳者死亡时，其全部${get.poptip("naohua_point")}改由当前存活泳者中${get.poptip("naohua_point")}最低者获得，而非弃置。<br>若最低者并列，由击杀者选择；若无击杀者，由当前回合角色选择。<br>击杀者仍获得3枚击杀奖励。`,
	naohua_rule_4: "结界加固",
	naohua_rule_4_info: "每名泳者回合结束时，若其本回合未受到过伤害，其摸一张牌。",
	naohua_rule_5: "点数保险",
	naohua_rule_5_info: `每名泳者受到伤害时，可以支付2枚${get.poptip("naohua_point")}，防止此伤害。每名泳者每回合限一次。`,
	naohua_rule_6: "回游休战",
	naohua_rule_6_info: "每轮开始时，所有存活泳者各摸一张牌。",
	naohua_rule_7: "术式反制",
	naohua_rule_7_info:
		`一名泳者成为【杀】的目标时，可以支付1枚${get.poptip("naohua_point")}，令此【杀】无效；若使用【杀】的角色为泳者，其获得1枚${get.poptip("naohua_point")}。`,
	naohua_rule_8: "点数均衡",
	naohua_rule_8_info:
		`每名泳者回合开始时，若其${get.poptip("naohua_point")}为当前存活泳者中最多（或并列最多），其弃置2枚${get.poptip("naohua_point")}；若其${get.poptip("naohua_point")}为当前存活泳者中最少（或并列最少），其获得1枚${get.poptip("naohua_point")}。`,
	naohua_rule_5_used: "点数保险·已用",
	naohua_rule_5_used_info: "本回合已发动过「点数保险」，需等到下个回合才能再次使用。",

	naohua_zhoulingshu: "咒灵操术",
	naohua_zhoulingshu_info:
		`你可以将一张黑色手牌当【无懈可击】使用；以此法使用后获得${get.poptip("naohua_zhoulingshu_mark")}。<br>出牌阶段，你可以弃置${get.poptip("naohua_zhoulingshu_mark")}发动${get.poptip("naohua_zhoulingshu_shan")}或${get.poptip("naohua_zhoulingshu_guohe")}。`,
	naohua_zhoulingshu_shan: "咒灵操术·闪",
	naohua_zhoulingshu_shan_info: `弃置1枚${get.poptip("naohua_zhoulingshu_mark")}，视为使用一张【闪】。`,
	naohua_zhoulingshu_guohe: "咒灵操术·拆",
	naohua_zhoulingshu_guohe_info: `弃置2枚${get.poptip("naohua_zhoulingshu_mark")}，视为使用一张【过河拆桥】。`,
	naohua_zhoulingshu_mark: "咒灵",
	naohua_zhoulingshu_mark_info: `上限 3 枚。<br>以${get.poptip("naohua_zhoulingshu")}使用【无懈可击】后获得 1 枚。`,

	naohua_zhang: "帐",
	naohua_zhang_info: `出牌阶段限一次，你可以弃置一张牌，令一名其他角色获得${get.poptip("naohua_zhang_mark")}。`,
	naohua_zhang_mark: "帐",
	naohua_zhang_mark_info:
		`你使用【杀】指定目标后，羂索可以移去此标记令该【杀】无效，然后你摸一张牌；否则在你下个弃牌阶段结束时移去。`,
	naohua_zhang_sha: "帐·无效",
	naohua_zhang_sha_info: `被${get.poptip("naohua_zhang_mark")}标记的角色使用【杀】指定目标后，移去其「帐」令此【杀】无效。`,

	naohua_duoshe: "夺舍",
	naohua_duoshe_info: `限定技。一名角色死亡时，你可以发动：弃置所有手牌和装备，将体力上限改为其体力上限并回复至上限 -1，获得其所有手牌、装备与可获得技能，转移至其位置并移除其尸体；然后你失去${get.poptip("naohua_zhoulingshu")}和${get.poptip("naohua_zhang")}。<br>若你不发动，你摸一张牌。`,
	naohua_duoshe_corpse: "夺舍·尸体",
	naohua_duoshe_corpse_info: `夺舍发动后接管目标遗留的手牌与装备。`,
	naohua_possessed: "被夺舍",
	naohua_possessed_info: `被羂索夺舍后的残余状态标记。`,
};

// —— 统一角色包：本扩展的羂索/乔尼/乔鲁诺三个角色合并注册在同一个包（naohua）下，
// 选将界面只显示一个包，不再按角色拆成多个包。
game.import("character", function () {
	const naohua = {
		name: "naohua",
		connect: true,
		character: { ...characters },
		characterSort: {
			naohua: {
				naohua_pack: ["naohua_kenjaku", "qnj_jonny", "jojo_giorno", "dvg_dg"],
			},
		},
		characterTitle: {
			naohua_kenjaku: '<span class="bluetext" style="color:#8A2BE2">死灭回游</span>',
			qnj_jonny: '<span class="bluetext" style="color:#7A1F3D">漆黑意志</span>',
			jojo_giorno: '<span class="bluetext" style="color:#D4AF37">黄金之风</span>',
			jojo_giorno_requiem: '<span class="bluetext" style="color:#D4AF37">黄金体验镇魂曲</span>',
			dvg_dg: '<span class="bluetext" style="color:#2E8B57">Steel Ball Run</span>',
			dvg_mayouyou: '<span class="bluetext" style="color:#4B8B3B">腐蚀之力</span>',
		},
		characterIntro: {
			naohua_kenjaku: `羂索　群　3体力<br>〖${get.poptip("naohua_shimie")}〗〖${get.poptip("naohua_zhoulingshu")}〗〖${get.poptip("naohua_zhang")}〗〖${get.poptip("naohua_duoshe")}〗`,
			qnj_jonny: `乔尼·乔斯达　群　3体力<br>〖${get.poptip("qnj_qhei")}〗〖${get.poptip("qnj_manwuzhe_skill")}〗〖${get.poptip("qnj_ya")}〗`,
			jojo_giorno: `乔鲁诺·乔巴纳　群　4体力<br>〖${get.poptip("jojo_giorno_huangjin")}〗〖${get.poptip("jojo_giorno_chongjian")}〗〖${get.poptip("jojo_giorno_juexin")}〗`,
			jojo_giorno_requiem:
				`乔鲁诺·乔巴纳（镇魂曲）　群　4体力<br>觉醒形态，不可选。<br>〖${get.poptip("jojo_giorno_huangjin")}〗〖${get.poptip("jojo_giorno_zhenhunqu")}〗`,
			dvg_dg:
				`D&G　群　3体力<br>〖${get.poptip("dvg_skill_hidden")}〗〖${get.poptip("dvg_skill_help")}〗〖${get.poptip("dvg_skill_mayouyou")}〗〖${get.poptip("dvg_skill_corrupt")}〗`,
			dvg_mayouyou:
				`马友友　群　5体力<br>召唤物，与 D&G 绑定登场，不可选。<br>〖${get.poptip("dvg_skill_mayouyou_core")}〗`,
		},
		skill: { ...skills, ...qnjSkills, ...jojoSkills, ...dvgSkills },
		translate: { ...translates, ...qnjTranslates, ...jojoTranslates, ...dvgTranslates },
	};

	if (!lib.config[`extension_脑花乔尼_characterPack_naohua_enable`]) {
		game.saveExtensionConfig("脑花乔尼", "characterPack_naohua_enable", true);
		if (lib.config.characters?.add) {
			lib.config.characters.add("naohua");
			game.saveConfig("characters", lib.config.characters);
		}
	}
	lib.translate.naohua_character_config = "脑花乔尼";
	return naohua;
});

// 卡牌统一注册到 naohua 包（漫舞者坐骑 + 虫箭）
game.import("card", function () {
	const naohuaCard = {
		name: "naohua",
		connect: true,
		card: {
			...qnjManwuzheCard,
			...jojoCards,
		},
		translate: {
			...qnjManwuzheTranslate,
			// 只放卡牌相关翻译；不用 jojoTranslates（那会把乔鲁诺的角色名与
			// 全部技能说明一并塞进卡牌包，属冗余）。
			...jojoCardTranslates,
		},
		// ⚠️ 不写 list：不在牌堆留任何条目。
		//   「漫舞者」是乔尼的专属坐骑，由〖漫舞者〗技能用 game.createCard 动态生成，
		//   不需要出现在牌堆里（抽不到、洗牌也没有）。
		//   旧写法 list: [["spade", 13, "qnj_manwuzhe"]] 会把它塞进牌堆，
		//   导致其他角色也能摸到甚至抢走，与"专属"定位冲突。
		list: [],
	};
	if (lib.config?.all?.cards?.add) {
		lib.config.all.cards.add("naohua");
	}
	return naohuaCard;
});

export default characters;

