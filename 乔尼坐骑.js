import { lib, game, ui, get, ai, _status } from "noname";

/*
 * 乔尼坐骑「漫舞者」—— 卡牌数据模块（不自行注册卡牌包）
 * 实际注册由 脑花数据.js 的 game.import("card") 统一完成。
 */

export const manwuzheCard = {
	qnj_manwuzhe: {
		fullskin: true,
		type: "equip",
		// 同时占用两个马槽（防御马 + 进攻马）：
		// get.subtypes 支持数组，canEquip 会分别校验 equip3 / equip4 各需 1 个空位，
		// 任一槽位不可用则无法装备（player.js:2088-2117、1841-1843）。
		subtypes: ["equip3", "equip4"],
		// 兼具 +1马 与 -1马 效果：别人到你 +1，你到别人 -1。
		distance: {
			globalFrom: -1,
			globalTo: 1,
		},
		equipDelay: false,
		loseDelay: false,
		ai: {
			basic: {
				equipValue: 7.5,
			},
		},
	},
};

export const manwuzheTranslate = {
	qnj_manwuzhe: "漫舞者",
	qnj_manwuzhe_info:
		"坐骑。装备时同时占用防御马与进攻马两个槽位；你计算与其他角色的距离-1，其他角色计算与你的距离+1。",
};

export default manwuzheCard;
