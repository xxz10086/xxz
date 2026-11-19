import { lib, game, ui, get, ai, _status } from "noname";
import "./乔鲁诺特效.js";

/* ============================================================================
 * 表现层驱动：只负责"让每个客户端各播一遍"，任何异常都吞掉，绝不参与结算。
 * ========================================================================== */
function FXOn() {
	try {
		return !!(lib.jojoFx && lib.jojoFx.on);
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
				if (lib.jojoFx) lib.jojoFx.play(arguments[0], rest);
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
		const _f = lib.jojoFx;
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

/* ============================================================================
 * 乔鲁诺·乔巴纳（并入「脑花乔尼」合并扩展）
 * 势力：群 / 4体力 / 称号：黄金之风
 * 技能：黄金体验 / 虫箭 / 黄金体验镇魂曲 / 决心
 * 内部 ID 前缀：jojo_
 * 注册方式与 qnj_/naohua_ 一致：本文件被 extension.js 的 precontent 动态 import。
 * ========================================================================== */

const CARD = "beetleArrow";
const ENERGY = "jojo_energy";
const ENERGY_MAX = 5;
const HUANGJIN = "jojo_giorno_huangjin";
const ARROW_SKILL = "jojo_giorno_chongjian";
const REQUIEM = "jojo_giorno_zhenhunqu";
const JIANG = "jojo_giorno_juexin";
const REQUIEM_CHAR = "jojo_giorno_requiem";

// 「虫箭」是否已完成第一个回合的牌堆投放（模块级状态，不依赖 lib.skill 的注册时序）
let arrowFirstTurnDone = false;

/** 当前牌堆里是否有虫箭 */
function getArrowInPile() {
	try {
		return Array.from(ui.cardPile?.childNodes || []).some(card => card?.name === CARD);
	} catch (e) {
		return false;
	}
}

/**
 * 找出“跑丢”的虫箭：既不在乔鲁诺手牌、也不在乔鲁诺宝物栏、更不在牌堆里的那些。
 * （即：弃牌堆、判定区、扩展区、特殊区、其他角色的手牌/装备区。）
 */
function findLooseArrow(player) {
	const found = [];
	const push = card => {
		if (card && card.name === CARD && !found.includes(card)) found.push(card);
	};
	// 弃牌堆（牌堆本身不遍历：牌堆里的虫箭属于正常状态）
	try {
		for (const card of Array.from(ui.discardPile?.childNodes || [])) push(card);
	} catch (e) {}
	// 场上所有角色的手牌 / 装备区 / 判定区 / 扩展区
	for (const target of game.players || []) {
		if (!target || !target.isAlive?.()) continue;
		const isSelf = target === player;
		// 手牌：自己手里的属于正常状态；别人手里的留着走「弃牌阶段夺取」规则
		if (!isSelf) continue;
		// 自己的：手牌正常，宝物栏正常，其余（判定区/扩展区）算跑丢
		try {
			for (const card of target.getCards("j", c => c.name === CARD)) push(card);
		} catch (e) {}
		try {
			for (const card of target.getCards("x", c => c.name === CARD)) push(card);
		} catch (e) {}
	}
	// 其他角色装备区里（含宝物栏）的虫箭：非乔鲁诺装备时无效果，也应收回
	for (const target of game.players || []) {
		if (!target || target === player || !target.isAlive?.()) continue;
		try {
			for (const card of target.getCards("e", c => c.name === CARD)) push(card);
		} catch (e) {}
	}
	return found;
}

/** 把一张新的「虫箭」随机洗入牌堆（不是放到牌堆顶） */
async function insertArrowToPile() {
	const arrow = game.createCard2(CARD, "spade", 1);
	// "insert" 会插到 pile.firstChild 之前 = 牌堆顶（game/index.js:1438），
	// 那样乔鲁诺第一回合必定摸到虫箭。改用 insert_index 回调返回随机位置，实现真正的“洗入”。
	await game.cardsGotoPile(arrow, (event2, card) => {
		const nodes = ui.cardPile.childNodes;
		if (!nodes.length) return null;
		// 用事件级随机（getRand 在同一事件内主客机取值一致），避免两端插入位置不同。
		const pos = Math.floor((event2.getRand?.("beetleArrowPos") ?? Math.random()) * (nodes.length + 1));
		return nodes[pos] || null; // null = 追加到牌堆末尾
	});
}

/* ============================================================================
 * 觉醒 BGM
 * 曲目：il vento d'oro（Golden Wind）
 * 位置：extension/脑花乔尼/audio/fx/il_vento_doro.mp3
 * 播放：乔鲁诺觉醒为「黄金体验镇魂曲」时，从头完整播放一遍（不循环）。
 *       文件不存在时静默跳过，不影响任何结算。
 * ========================================================================== */
const BGM_FILE = "il_vento_doro.mp3";
const BGM_DIR = "extension/脑花乔尼/audio/fx/";
const BGM_CFG = "extension_脑花乔尼_jojo_bgm";

let _bgmCache = null;
let _bgmNode = null;
// 被暂停的其他音乐现场（用于 BGM 结束后恢复）
let _pausedMusic = null;

/** 暂停其他所有音乐（引擎背景音乐 + 页面上正在播的 audio 元素），记录现场以便恢复 */
function pauseOtherMusic() {
	const paused = { engine: null, myBgm: _bgmNode, elements: [] };
	try {
		// 1) 引擎背景音乐
		const bgm = ui.backgroundMusic;
		if (bgm && !bgm.paused) {
			paused.engine = { node: bgm, time: bgm.currentTime };
			bgm.pause();
		}
	} catch (e) {}
	try {
		// 2) 页面上其他正在播放的 audio（排除本扩展的 BGM 节点本身）
		const list = document.querySelectorAll("audio");
		for (const el of list) {
			if (el === _bgmNode) continue;
			if (!el.paused && !el.ended) {
				paused.elements.push({ node: el, time: el.currentTime });
				el.pause();
			}
		}
	} catch (e) {}
	_pausedMusic = paused;
	return paused;
}

/** 恢复之前被暂停的其他音乐（各客户端各做各的） */
function resumeOtherMusic() {
	const paused = _pausedMusic;
	_pausedMusic = null;
	if (!paused) return;
	try {
		if (paused.engine && paused.engine.node) {
			// 只有 src 没被换过才恢复到原进度，避免播放到错误音频
			paused.engine.node.currentTime = paused.engine.time || 0;
			const p = paused.engine.node.play();
			if (p?.catch) p.catch(() => {});
		}
	} catch (e) {}
	for (const item of paused.elements || []) {
		try {
			if (item.node && item.node.isConnected) {
				item.node.currentTime = item.time || 0;
				const p = item.node.play();
				if (p?.catch) p.catch(() => {});
			}
		} catch (e) {}
	}
}

/** 播放觉醒 BGM（各客户端各播一遍；无文件/配置关闭/异常时静默） */
function playAwakenBgm() {
	try {
		if (typeof Audio !== "function") return;
		if (lib.config?.[BGM_CFG] === false) return;
		if (lib.config?.volume === 0) return;
		const base = _bgmCache || new Audio((lib.assetURL || "") + BGM_DIR + BGM_FILE);
		base.preload = "auto";
		_bgmCache = base;
		// 若上一次 BGM 还在播，先停掉，避免多轨叠加
		try {
			if (_bgmNode) {
				_bgmNode.pause();
				_bgmNode.currentTime = 0;
			}
		} catch (e) {}
		// 播放前先暂停其他所有音乐
		pauseOtherMusic();
		const node = base.cloneNode();
		node.volume = 0.6;
		_bgmNode = node;
		// 播完（自然结束或被打断）后恢复其他音乐
		try {
			node.addEventListener("ended", () => {
				if (_bgmNode === node) _bgmNode = null;
				resumeOtherMusic();
			});
		} catch (e) {}
		const p = node.play();
		if (p?.catch) p.catch(() => {}); // 文件缺失或浏览器拦截 → 静默
	} catch (e) {}
}

const skills = {
	[HUANGJIN]: {
		locked: true,
		forced: true,
		group: [
			"jojo_giorno_huangjin_energy",
			"jojo_giorno_huangjin_convert",
			"jojo_giorno_huangjin_damage",
		],
		init(player) {
			player.addSkill(ENERGY);
			player.markSkill(ENERGY);
		},
		subSkill: {
			energy: {
				trigger: { player: ["useCard", "respond"] },
				forced: true,
				silent: true,
				popup: false,
				filter(event, player) {
					if (player.countMark(ENERGY) >= ENERGY_MAX) return false;
					// 注意：useCard/respond 触发时牌已被 lose 到 ui.ordering（引擎 content.js 先 lose、后 trigger），
					// 此时 get.position(card) 为 "o" 而非 "h"，不能用来判断“手牌”。
					// 判定“使用了实体牌（手牌）”采用官方惯用写法：event.cards 非空。
					return (event.cards || []).some(card => get.itemtype(card) === "card");
				},
				async content(event, trigger, player) {
					if (player.countMark(ENERGY) < ENERGY_MAX) {
						player.addMark(ENERGY, 1, false);
						FX("energy", player, player.countMark(ENERGY));
					}
				},
			},
			convert: {
				enable: "phaseUse",
				usable: 1,
				filter(event, player) {
					return player.countCards("h") > 0 && player.countMark(ENERGY) > 0;
				},
				async content(event, trigger, player) {
					const choice = await player
						.chooseButton(
							[
								"黄金体验：选择一项",
								[
									[
										["tao", "视为使用一张【桃】"],
										["distance", "直到你的下回合开始，其他角色计算与你的距离+1（同「+1马」）"],
										["armor", "直到你的下回合开始，你获得「黄金反甲」"],
									],
									"textbutton",
								],
							],
							true
						)
						.forResult();
					if (!choice.bool || !choice.links?.length) return;
					const discard = await player
						.chooseToDiscard("h", 1, true, "黄金体验：弃置一张手牌")
						.set("ai", card => 6 - get.value(card))
						.forResult();
					if (!discard.bool || !discard.cards?.length) return;
					if (player.countMark(ENERGY) < 1) return;
					player.removeMark(ENERGY, 1, false);
					const key = choice.links[0];
					if (key === "tao") {
						await player.useCard({ name: "tao", isCard: true }, player, false);
						FX("convert", player, "tao");
					} else if (key === "distance") {
						// ⚠️ 联机适配：带 mod（影响距离），各端都要有
						game.broadcastAll((p) => {
							try {
								if (p) p.addTempSkill("jojo_giorno_distance", { player: "phaseBegin" });
							} catch (e) {}
						}, player);
						FX("convert", player, "distance");
					} else if (key === "armor") {
						// ⚠️ 联机适配：带 mod（受伤反伤），各端都要有
						game.broadcastAll((p) => {
							try {
								if (p) p.addTempSkill("jojo_giorno_armor", { player: "phaseBegin" });
							} catch (e) {}
						}, player);
						FX("convert", player, "armor");
					}
					game.log(player, "发动了", "#g「黄金体验」");
				},
				ai: { order: 4, result: { player: 1 } },
			},
			damage: {
				trigger: { source: "damageEnd" },
				filter(event, player) {
					return (
						event.player && event.player !== player && event.player.isAlive() &&
						player.countMark(ENERGY) >= 2 &&
						player.storage.jojo_damage_used_phase !== game.phaseNumber
					);
				},
				async cost(event, trigger, player) {
					event.result = await player
						.chooseBool("黄金体验：消耗2枚精神能量，令其跳过下一个摸牌阶段？")
						.set("ai", () => true)
						.forResult();
				},
				async content(event, trigger, player) {
					if (player.countMark(ENERGY) < 2) return;
					player.removeMark(ENERGY, 2, false);
					player.storage.jojo_damage_used_phase = game.phaseNumber;
					const target = trigger.player;
					if (target && target.isAlive() && !target.hasSkill("jojo_giorno_skip_draw")) {
						// ⚠️ 联机适配：技能 + storage 都要广播
						game.broadcastAll((t) => {
							try {
								if (!t) return;
								t.addSkill("jojo_giorno_skip_draw");
								t.storage.jojo_giorno_skip_draw = true;
							} catch (e) {}
						}, target);
						FX("skipDraw", target);
						game.log(player, "令", target, "跳过下一个摸牌阶段");
					}
				},
			},
		},
	},
	[ENERGY]: {
		charlotte: true,
		mark: true,
		marktext: "能",
		intro: { content: "当前有#枚「精神能量」，上限5。" },
	},
	jojo_giorno_distance: {
		charlotte: true,
		popup: false,
		nopop: true,
		mod: {
			// 与「+1马」（防御马）同效：其他角色计算与你的距离 +1。
			// 引擎中 globalTo 由距离的目标（to）提供，正好对应“别人看你 +1”。
			globalTo(from, to, distance) {
				if (to && to.hasSkill("jojo_giorno_distance")) return distance + 1;
			},
		},
	},
	jojo_giorno_armor: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "damageEnd" },
		filter(event, player) {
			return (
				event.source && event.source !== player && event.num > 0 &&
				player.storage.jojo_armor_used_phase !== game.phaseNumber
			);
		},
		async content(event, trigger, player) {
			player.storage.jojo_armor_used_phase = game.phaseNumber;
			FX("reflect", player, trigger.source);
			await trigger.source.loseHp(1);
			game.log(player, "的", "#g「黄金反甲」", "令", trigger.source, "失去1点体力");
		},
	},
	jojo_giorno_skip_draw: {
		charlotte: true,
		forced: true,
		silent: true,
		popup: false,
		trigger: { player: "phaseDrawBegin" },
		filter(event, player) {
			return player.storage.jojo_giorno_skip_draw === true;
		},
		async content(event, trigger, player) {
			// ⚠️ 联机适配：storage + 技能移除都要广播
			game.broadcastAll((p) => {
				try {
					if (!p) return;
					delete p.storage.jojo_giorno_skip_draw;
					p.removeSkill("jojo_giorno_skip_draw");
				} catch (e) {}
			}, player);
			FX("ring", player);
			trigger.cancel();
			game.log(player, "跳过了摸牌阶段");
		},
	},
	[ARROW_SKILL]: {
		locked: true,
		forced: true,
		silent: true,
		popup: false,
		// 乔鲁诺自己的回合开始时：把虫箭放进牌堆 + 收回跑丢的虫箭。
		// phaseDiscardBegin 保留“他人手里有虫箭则抢过来”的旧规则。
		trigger: { global: ["phaseBegin", "phaseDiscardBegin"] },
		init(player) {
			arrowFirstTurnDone = false;
		},
		filter(event, player) {
			if (!player.isAlive()) return false;
			// 其他人的弃牌阶段开始：其手牌有虫箭 → 抢过来
			if (event.name === "phaseDiscardBegin") {
				return (
					event.player && event.player !== player && event.player.isAlive() &&
					event.player.countCards("h", card => card.name === CARD) > 0
				);
			}
			// phaseBegin：只处理乔鲁诺自己的回合
			if (event.player !== player) return false;
			// 第一个回合：按牌堆实际情况判断（若牌堆中没有「虫箭」才需要放入）
			if (!arrowFirstTurnDone) return true;
			// 之后：只在虫箭跑丢时收拾
			return findLooseArrow(player).length > 0;
		},
		async content(event, trigger, player) {
			if (event.name === "phaseDiscardBegin") {
				const target = event.player;
				if (!player.isAlive() || player === target) return;
				const arrows = target.getCards("h", card => card.name === CARD);
				if (!arrows.length) return;
				FX("arrow", target, player, "take");
				await target.lose(arrows, ui.special);
				await player.gain(arrows, "gain2");
				game.log(player, "获得了", target, "的", "#g「虫箭」");
				return;
			}
			// 以下时机都在玩家（乔鲁诺）自己的回合
			// 1) 第一个回合：若牌堆中没有「虫箭」，放入一张
			if (!arrowFirstTurnDone) {
				arrowFirstTurnDone = true;
				if (!getArrowInPile()) {
					FX("arrow", null, null, "shuffle");
					await insertArrowToPile();
					game.log("「虫箭」已洗入牌堆");
				}
				return;
			}
			// 2) 虫箭跑到「手牌 / 牌堆 / 自己宝物栏」之外的地方 → 收回手中
			const lost = findLooseArrow(player);
			if (lost.length) {
				FX("arrow", null, player, "back");
				await player.gain(lost, "gain2");
				game.log(player, "收回了", "#g「虫箭」");
			}
		},
		async awaken(player, cards) {
			// 镇魂曲觉醒：虫箭贯穿 → 生命环 → 标题 → 换立绘
			FX("awaken", player);
			const list = (cards && cards.length ? cards : player.getCards("he", card => card.name === CARD)).slice();
			if (list.length) {
				// 走引擎的弃牌流程，联机下由引擎同步（不手写 card.delete，避免各端状态不一致）。
				try {
					await game.cardsDiscard(list);
				} catch (e) {
					try { await player.lose(list, ui.discardPile); } catch (e2) {}
				}
			}
			if (player.hp < player.maxHp) await player.recover(player.maxHp - player.hp);
			const need = Math.max(0, ENERGY_MAX - player.countMark(ENERGY));
			if (need > 0) player.addMark(ENERGY, need, false);
			// ⚠️ 联机适配：觉醒获得镇魂曲，各端都要挂上
			// ⚠️ 联机注意：broadcastAll 的函数体会被序列化发到客户端，
			// 里面不能引用模块作用域的常量（REQUIEM 在客户端不存在），必须写字面量。
			game.broadcastAll((p) => {
				try {
					if (p && !p.hasSkill("jojo_giorno_zhenhunqu")) p.addSkill("jojo_giorno_zhenhunqu");
				} catch (e) {}
			}, player);
			// 等巨箭贯穿的演出播完，再换立绘
			await FXWait(1000, true);
			try {
				player.setAvatar("jojo_giorno", REQUIEM_CHAR);
			} catch (e) {}
			// 觉醒演出：各客户端各播一遍 BGM（纯表现层，绝不影响结算）
			try {
				game.broadcastAll(() => {
					try {
						if (lib.jojoPlayBgm) lib.jojoPlayBgm();
					} catch (e) {}
				});
			} catch (e) {}
			await FXWait(700, true);
			game.log(player, "使用了", "#g「虫箭」", "，觉醒为", "#g「黄金体验镇魂曲」");
			// 觉醒完成后〖决心〗与〖虫箭〗完成使命，一并移除。
			// 放在最后执行，避免影响到正在运行的本函数（removeSkill 只改技能列表，不移除函数引用）。
			const toRemove = [JIANG, ARROW_SKILL].filter(skill => player.hasSkill(skill));
			if (toRemove.length) player.removeSkill(toRemove);
		},
	},
	[REQUIEM]: {
		// 引擎无 useCardBefore 事件（content.js 中只触发 useCard0/useCard1/yingbian/useCard2/useCard）。
		// 在 useCard 阶段（目标已确定、牌尚未结算）声明“是/否”，再用 excluded 令牌无效（content.js:9424）。
		trigger: { global: "useCard" },
		forced: false,
		filter(event, player) {
			return (
				event.player && event.player !== player && event.card && event.card.name !== CARD &&
				(event.targets || []).length > 0 && player.countMark(ENERGY) > 0 &&
				player.storage.jojo_zhen_used_phase !== game.phaseNumber
			);
		},
		async cost(event, trigger, player) {
			const result = await player
				.chooseButton(
					[
						"黄金体验镇魂曲：此牌最终会指定你为目标吗？",
						[
							[
								["yes", "是"],
								["no", "否"],
							],
							"textbutton",
						],
					],
					true
				)
				.forResult();
			if (!result.bool || !result.links?.length) {
				event.result = { bool: false };
				return;
			}
			if (player.countMark(ENERGY) < 1) {
				event.result = { bool: false };
				return;
			}
			player.removeMark(ENERGY, 1, false);
			player.storage.jojo_zhen_used_phase = game.phaseNumber;
			event.result = { bool: true, cost_data: result.links[0] === "yes" };
		},
		async content(event, trigger, player) {
			const guessYes = !!event.cost_data;
			const targetedMe = (trigger.targets || []).includes(player);
			FX("requiem", player, "declare");
			if (guessYes && targetedMe) {
				// 猜中「是」：令此牌对我无效（引擎原生 excluded 机制，content.js:9424 直跳过结算）。
				FX("requiem", player, "zero");
				trigger.excluded.add(player);
				if (player.countMark(ENERGY) < ENERGY_MAX) player.addMark(ENERGY, 1, false);
				game.log(player, "猜中「是」，此牌对", player, "无效，并返还1枚精神能量");
				await game.delayx(0.5);
			} else if (!guessYes && !targetedMe) {
				// 猜中「否」：此牌确实没打我，摸一张牌。
				FX("requiem", player, "draw");
				await player.draw(1);
				game.log(player, "猜中「否」，摸一张牌");
			} else {
				FX("requiem", player, "miss");
				game.log(player, "猜错了，消耗的精神能量不返还");
			}
		},
	},
	[JIANG]: {
		locked: true,
		forced: true,
		trigger: { player: "dying" },
		filter(event, player) {
			return player.getCards("he", card => card.name === CARD).length > 0;
		},
		async content(event, trigger, player) {
			const arrows = player.getCards("he", card => card.name === CARD);
			FX("dying", player);
			if (arrows.length) await lib.skill[ARROW_SKILL].awaken(player, arrows);
		},
	},
};

const translates = {
	jojo_giorno_huangjin: "黄金体验",
	jojo_giorno_huangjin_info: `锁定技，当你使用或打出一张手牌后，你获得${get.poptip(ENERGY)}。<br>出牌阶段限一次，你可以弃置一张手牌并消耗${get.poptip(ENERGY)}，选择一项：<br>①视为使用一张【桃】；<br>②直到你的下回合开始，其他角色计算与你的距离 +1；<br>③直到你的下回合开始，你获得${get.poptip("jojo_giorno_armor")}。<br>当你对其他角色造成伤害后，你可以消耗${get.poptip(ENERGY)}，令其获得${get.poptip("jojo_giorno_skip_draw")}；每回合限一次。`,

	jojo_giorno_chongjian: "虫箭",
	jojo_giorno_chongjian_info: `锁定技，在你的第一个回合开始时，若牌堆中没有${get.poptip(CARD)}，将一张洗入牌堆。<br>其他角色可以把${get.poptip(CARD)}装备到宝物栏（无任何效果）；其弃牌阶段开始时，若其手牌中有，你获得之。<br>若${get.poptip(CARD)}不在你的手牌、你的宝物栏或牌堆中，则其回到你的手牌。<br>你装备后即觉醒，详见${get.poptip("jojo_giorno_juexin")}。`,

	jojo_giorno_zhenhunqu: "黄金体验镇魂曲",
	jojo_giorno_zhenhunqu_info: `每回合限一次。当一名其他角色使用牌时，在其选择目标前，你可以消耗${get.poptip(ENERGY)}声明「是」或「否」：<br>若此牌最终指定你为目标且你声明「是」，此牌对你无效，你返还${get.poptip(ENERGY)}；<br>若此牌未指定你为目标且你声明「否」，你摸一张牌；<br>若猜错，消耗的${get.poptip(ENERGY)}不返还。`,

	jojo_giorno_juexin: "决心",
	jojo_giorno_juexin_info: `锁定技，当你进入濒死状态时，若你有${get.poptip(CARD)}，你可以立即使用它觉醒：回复所有体力并补满${get.poptip(ENERGY)}，然后获得${get.poptip(REQUIEM)}。`,

	jojo_energy: "精神能量",
	jojo_energy_info: `〖黄金体验〗的标记，上限 5 枚。<br><b>获得</b>：使用或打出一张手牌 +1；猜中${get.poptip(REQUIEM)}的「是」返还 1 枚；觉醒时补满。<br><b>消耗</b>：${get.poptip(HUANGJIN)} 1 枚；令目标跳过摸牌 2 枚；${get.poptip(REQUIEM)} 1 枚。`,

	jojo_giorno_distance: "距离+1",
	jojo_giorno_distance_info: "直到你的下回合开始，其他角色计算与你的距离+1（效果同「+1马」）。",

	jojo_giorno_armor: "黄金反甲",
	jojo_giorno_armor_info: "直到你的下回合开始，当你受到伤害后，伤害来源失去1点体力（每回合限一次）。",

	jojo_giorno_skip_draw: "跳过摸牌",
	jojo_giorno_skip_draw_info: "跳过下一个摸牌阶段。",

	jojo_giorno: "乔鲁诺·乔巴纳",
	jojo_giorno_requiem: "乔鲁诺·乔巴纳（镇魂曲）",

	beetleArrow: "虫箭",
	beetleArrow_info: `宝物。任何角色都可以将其装备到宝物栏；其他角色装备时无任何效果。<br>乔鲁诺装备后回复所有体力、补满${get.poptip(ENERGY)}，并觉醒为${get.poptip(REQUIEM)}。`,
};

const characters = {
	jojo_giorno: {
		sex: "male",
		group: "qun",
		hp: 4,
		skills: [HUANGJIN, ARROW_SKILL, JIANG],
		img: "extension/脑花乔尼/image/jojo_giorno.jpg",
	},
	jojo_giorno_requiem: {
		sex: "male",
		group: "qun",
		hp: 4,
		skills: [],
		img: "extension/脑花乔尼/image/jojo_giorno_requiem.jpg",
		// 隐藏形态：仅用于觉醒后替换立绘，不出现在选将框（library/index.js:274 会过滤 unseen）。
		isUnseen: true,
	},
};

const cards = {
	[CARD]: {
		fullskin: true,
		// 装备牌：任何人都可以装备到宝物栏（其他角色装备时无任何效果）。
		type: "equip",
		subtype: "equip5",
		cardcolor: "black",
		image: "extension/脑花乔尼/beetleArrow.jpg",
		// 不挂任何附加技能 → 装在宝物栏里“无效果”。
		skills: [],
		// 作为装备牌，走引擎标准的装备流程。
		enable: true,
		toself: true,
		selectTarget: -1,
		filterTarget(card, player, target) {
			return target === player;
		},
		wuxie: false,
		async content(event, trigger, player) {
			// 只有持有〖虫箭〗技能的角色（乔鲁诺）装备时才触发觉醒；
			// 其他角色装上就是普通宝物，无效果。
			if (!player.hasSkill(ARROW_SKILL)) return;
			const cards = (event.cards || []).slice();
			await lib.skill[ARROW_SKILL].awaken(player, cards);
		},
		ai: { basic: { equipValue: 10 } },
	},
};

/*
 * 乔鲁诺·乔巴纳 —— 数据模块（不自行注册角色/卡牌包）
 * 角色/技能/翻译由 脑花数据.js 合并注册；卡牌由 脑花数据.js 统一注册。
 */

 // 挂到 lib 上供广播闭包调用（broadcastAll 的函数体不能引用模块作用域变量，
// 但可以访问全局的 lib，所以通过 lib.jojoPlayBgm 中转）。
try {
	lib.jojoPlayBgm = playAwakenBgm;
	lib.jojoResumeMusic = resumeOtherMusic;
} catch (e) {}

export const jojoCharacters = characters;
export const jojoSkills = skills;
export const jojoTranslates = translates;
export const jojoCards = cards;
// 仅卡牌相关翻译（供卡牌包使用）。卡牌包里不需要角色名与技能说明。
export const jojoCardTranslates = {
	[CARD]: translates[CARD],
	[`${CARD}_info`]: translates[`${CARD}_info`],
};

export default characters;