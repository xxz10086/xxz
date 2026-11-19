import { lib, game, ui, get, ai, _status } from "noname";
import "./乔尼特效.js";

/* ============================================================================
 * 表现层驱动：只负责"让每个客户端各播一遍"，任何异常都吞掉，绝不参与结算。
 * ========================================================================== */
function FXOn() {
	try {
		return !!(lib.qnjFx && lib.qnjFx.on);
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
				if (lib.qnjFx) lib.qnjFx.play(arguments[0], rest);
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
		const _f = lib.qnjFx;
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
 * 乔尼·乔斯达
 * 技能：漆黑意志 / 漫舞者 / 牙
 * 内部 ID 前缀：qnj_
 * ========================================================================== */

const skills = {
	// ==================== 漆黑意志 ====================
	qnj_qhei: {
		locked: true,
		forced: true,
		trigger: {
			player: "useCard",
		},
		filter(event, player) {
			return event.card && event.card.name === "sha" && player.hp <= 2;
		},
		async content(event, trigger, player) {
			const result = await player.judge().forResult();
			const card = result.card || result.result?.card;
			const ok = !!card && get.color(card) === "black" && (card.number === 1 || card.number === 13);
			if (!ok) {
				// 判定未达：只给压暗，不做"成功"演出，避免假预告
				FX("qhei", player, false);
				return;
			}
			const targets = trigger.targets || [];
			if (!targets.length) {
				return;
			}
			if (!trigger.directHit) {
				trigger.directHit = new Set();
			}
			const hit = trigger.directHit;
			for (const target of targets) {
				if (typeof hit.add === "function") {
					hit.add(target);
				} else if (Array.isArray(hit)) {
					if (!hit.includes(target)) {
						hit.push(target);
					}
				}
			}
			FX("qhei", player, true, targets);
			game.log(player, "发动了", "#g「漆黑意志」", "，此【杀】不能被【闪】响应");
		},
	},

	// ==================== 漫舞者 ====================
	qnj_manwuzhe_skill: {
		locked: true,
		forced: true,
		// ① roundStart：乔尼没装备就给他装一张（动态创建，不占牌堆）
		// ② loseAfter：这张牌一旦离开乔尼的装备区就彻底销毁
		trigger: {
			global: ["roundStart", "loseAfter"],
		},
		filter(event, player) {
			if (event.name === "loseAfter") {
				// 只关心装备区失去的牌
				const cards = event.cards || [];
				if (!cards.some((c) => c && c.name === "qnj_manwuzhe")) return false;
				// 失去这张牌的人必须是乔尼本人。
				// event.player 是"谁失去了牌"，不是当前技能持有者。
				// 身份判定用 name1/name/name2 多路匹配（角色可能因变化技改过 name）。
				const owner = event.player;
				if (!owner) return false;
				const isJonny = owner.name1 === "qnj_jonny" || owner.name === "qnj_jonny" || owner.name2 === "qnj_jonny";
				if (!isJonny) return false;
				// 确认确实离开了装备区（而不是装备区内部调整）
				const stillEquip = owner.getCards("e", (c) => c && c.name === "qnj_manwuzhe");
				return stillEquip.length === 0;
			}
			// roundStart 分支：乔尼活着且没装备
			return player.isAlive() && !player.getCards("e", (card) => card.name === "qnj_manwuzhe").length;
		},
		async content(event, trigger, player) {
			if (trigger && trigger.name === "loseAfter") {
				const cards = (trigger.cards || []).filter((c) => c && c.name === "qnj_manwuzhe");
				if (!cards.length) return;
				// 用引擎自带的销毁流程（card.js:115 selfDestroy）：
				//   · 设置 _selfDestroyed 标记，后续 lose 流程看到它会跳过、不再进弃牌堆
				//   · 内部调用 delete() 移除 DOM
				//   · 触发 info.onDestroy 钩子、写"被销毁了"日志
				// 比裸调 delete() 彻底 —— delete() 只摘 DOM，牌数据仍可能留在弃牌堆。
				for (const c of cards) {
					try {
						if (typeof c.selfDestroy === "function") {
							c.selfDestroy(trigger);
						} else {
							c.delete();
						}
					} catch (e) {
						try {
							c.delete();
						} catch (e2) {}
					}
				}
				// 兜底：万一某张牌还是落进了弃牌堆，把它从那里摘走
				try {
					for (const c of cards) {
						if (c.parentNode) c.parentNode.removeChild(c);
					}
				} catch (e) {}
				game.log("#g「漫舞者」", "离开了乔尼，已销毁");
				return;
			}
			const card = game.createCard("qnj_manwuzhe", "spade", 13);
			// 标记"离开装备区即销毁"。
			// ⚠️ 必须写成函数而不是 true：
			//   引擎在【装备时】也会调 willBeDestroyed("equip")（content.js:961），
			//   写 true 会让这张牌刚装上就被销毁。
			//   这里只在目标是「非装备区」时返回 true，装备流程照常通过。
			try {
				card.destroyed = (c, targetPosition) => targetPosition !== "equip";
			} catch (e) {}
			await player.equip(card);
			FX("horse", player);
			game.log(player, "装备了", "#g「漫舞者」");
		},
	},

	// ==================== 牙 ====================
	qnj_ya: {
		locked: true,
		forced: true,
		mark: true,
		marktext: "牙",
		// 图标上实时显示「回旋」层数（牙与回旋已合并为一个标记）
		intro: {
			markcount(storage, player) {
				try {
					return player ? player.countMark("qnj_huixuan") : 0;
				} catch (e) {
					return 0;
				}
			},
			content(storage, player) {
				const level = (player && player.storage.qnj_ya_level) || 1;
				const count = player ? player.countMark("qnj_huixuan") : 0;
				const NEXT = { 1: 3, 2: 5, 3: 7 };
				let next = NEXT[level] ? `距下一级还需 ${Math.max(0, NEXT[level] - count)} 枚。` : "已达最高级「牙4」。";
				return `当前「牙${level}」，共 ${count} 枚「回旋」。<br>${next}`;
			},
		},
		init(player) {
			if (player.storage.qnj_ya_level == null) {
				player.storage.qnj_ya_level = 1;
			}
			player.addSkill("qnj_zhuadan");
			player.addSkill("qnj_huixuan");
		},
		trigger: {
			global: "damageEnd",
		},
		filter(event, player) {
			return event.num > 0 && (event.source === player || event.player === player);
		},
		async content(event, trigger, player) {
			let times = 0;
			if (trigger.source === player) {
				times++;
			}
			if (trigger.player === player) {
				times++;
			}
			if (!times) {
				return;
			}
			const total = trigger.num * times;
			for (let i = 0; i < total; i++) {
				player.addMark("qnj_huixuan", 1, false);
				await lib.skill.qnj_ya.checkUpgrade(player);
			}
			// 回旋数变了，刷新「牙」图标上的数字
			lib.skill.qnj_ya.refresh(player);
			FX("spin", player, player.countMark("qnj_huixuan"));
		},
		/** 刷新「牙」标记（合并后它同时承载回旋层数） */
		refresh(player) {
			try {
				if (player.hasSkill("qnj_ya")) {
					player.markSkill("qnj_ya");
					if (typeof player.updateMark === "function") player.updateMark("qnj_ya", true);
				}
			} catch (e) {}
		},
		async checkUpgrade(player) {
			const count = player.countMark("qnj_huixuan");
			let level = player.storage.qnj_ya_level || 1;
			while (level < 4) {
				const next = level + 1;
				const need = next === 2 ? 3 : next === 3 ? 5 : 7;
				if (count < need) {
					break;
				}
				level = next;
				player.storage.qnj_ya_level = level;
				FX("levelup", player, level);
				if (level === 2) {
					game.log(player, "的", "#g「牙」", "升级为", "#g「牙2」");
				} else if (level === 3) {
					// ⚠️ 联机适配：qnj_ya3 是响应伤害的技能，各端都要有
					game.broadcastAll((p) => {
						try {
							if (p && !p.hasSkill("qnj_ya3")) p.addSkill("qnj_ya3");
						} catch (e) {}
					}, player);
					game.log(player, "的", "#g「牙」", "升级为", "#g「牙3」");
				} else if (level === 4) {
					// TODO：体力上限为 1 时是否允许减到 0，待实测确认
					if (player.maxHp > 1) {
						await player.loseMaxHp(1);
					}
					// ⚠️ 联机适配：黄金回旋是主动技（按钮），各端都要有
					game.broadcastAll((p) => {
						try {
							if (p && !p.hasSkill("qnj_huangjin")) p.addSkill("qnj_huangjin");
						} catch (e) {}
					}, player);
					game.log(player, "的", "#g「牙」", "升级为", "#g「牙4」", "，并获得了", "#g「完全なる黄金回旋エネルギー」");
				}
			}
		},
	},

	// 回旋：已合并进「牙」的标记（不再单独显示图标）
	// 只作为纯数据计数器存在（storage.qnj_huixuan）。
	// ⚠️ 不能设 mark / intro：引擎 updateMark（player.js:4685）里
	//     if (lib.skill[i].intro && (this.storage[i] || ...)) this.markSkill(i);
	//     只要有 intro + 有值就会自动生成第二个图标。
	qnj_huixuan: {
		charlotte: true,
	},

	// ==================== 爪弹 ====================
	qnj_zhuadan: {
		direct: true,
		enable: "phaseUse",
		filter(event, player) {
			return (
				player.countCards("h") > 0 &&
				player.storage.qnj_zhuadan_used_phase !== game.phaseNumber &&
				game.hasPlayer(target => target !== player)
			);
		},
		async content(event, trigger, player) {
			const targetResult = await player
				.chooseTarget("爪弹：选择一名角色", (card, player2, target) => target !== player2, true)
				.forResult();
			if (!targetResult.bool || !targetResult.targets?.length) {
				return;
			}
			const target = targetResult.targets[0];
			const discardResult = await player
				.chooseToDiscard("h", 1, true, "爪弹：弃置一张手牌")
				.set("ai", card => 6 - get.value(card))
				.forResult();
			if (!discardResult.bool || !discardResult.cards?.length) {
				return;
			}
			game.broadcastAll(
				(player, phase) => {
					player.storage.qnj_zhuadan_used_phase = phase;
				},
				player,
				game.phaseNumber
			);
			player.logSkill("qnj_zhuadan");
			await lib.skill.qnj_zhuadan.useZhuadan(player, target, false);

			if (target.isAlive()) {
				const choice = await player
					.chooseControl("你计算与其距离-1", "其计算与你距离+1")
					.set("prompt", "爪弹：选择距离效果")
					.set("ai", () => 0)
					.forResult();
				if (typeof choice.index === "number" && choice.index >= 0) {
					lib.skill.qnj_zhuadan.addDistance(player, target, choice.index === 0 ? "from" : "to");
				}
			}
		},
		async useZhuadan(player, target, additional) {
			const before = target.hp;
			// 指甲弹：牙2 起弹孔会追踪目标，牙3 起弹孔更大
			const _lv = player.storage.qnj_ya_level || 1;
			FX("nail", player, target, { track: _lv >= 2, big: _lv >= 3 });
			await player.useCard({ name: "sha", isCard: true }, [target], false);
			if (additional) {
				return;
			}
			const level = player.storage.qnj_ya_level || 1;
			const dealt = target.hp < before;
			if (
				level >= 2 &&
				!dealt &&
				target.isAlive() &&
				player.countMark("qnj_huixuan") > 0 &&
				player.storage.qnj_ya2_used_phase !== game.phaseNumber
			) {
				const bool = await player
					.chooseBool("爪弹追加：移去1枚「回旋」，对同一目标追加一张【杀】？")
					.set("ai", () => true)
					.forResult();
				if (bool.bool) {
					player.removeMark("qnj_huixuan", 1);
					// 回旋减少后刷新「牙」图标（合并标记，不降级）
					lib.skill.qnj_ya.refresh(player);
					game.broadcastAll(
						(player, phase) => {
							player.storage.qnj_ya2_used_phase = phase;
						},
						player,
						game.phaseNumber
					);
					player.logSkill("qnj_ya");
					game.log(player, "发动了", "#g「爪弹」", "的牙2追加效果");
					await lib.skill.qnj_zhuadan.useZhuadan(player, target, true);
				}
			}
		},
		addDistance(player, target, type) {
			if (!target || !target.playerid) {
				return;
			}
			if (type === "from") {
				player.storage.qnj_zhuadan_from ??= [];
				player.storage.qnj_zhuadan_from.push(target.playerid);
			} else {
				player.storage.qnj_zhuadan_to ??= [];
				player.storage.qnj_zhuadan_to.push(target.playerid);
			}
			// ⚠️ 联机适配：这个技能带 mod（影响距离计算），
			// 必须让每个客户端都挂上，否则只有房主那侧的界面距离是对的。
			game.broadcastAll((p) => {
				try {
					if (p && !p.hasSkill("qnj_zhuadan_distance")) p.addSkill("qnj_zhuadan_distance");
				} catch (e) {}
			}, player);
			game.log(
				player,
				"选择了",
				type === "from" ? "#g「你计算与其距离-1」" : "#g「其计算与你距离+1」",
				"，直到其下个回合开始"
			);
		},
	},

	// 爪弹距离修正：持续到拥有者下个回合开始
	qnj_zhuadan_distance: {
		charlotte: true,
		popup: false,
		nopop: true,
		trigger: {
			player: "phaseZhunbeiBegin",
		},
		forced: true,
		filter(event, player) {
			return !!(player.storage.qnj_zhuadan_from?.length || player.storage.qnj_zhuadan_to?.length);
		},
		async content(event, trigger, player) {
			const fromList = player.storage.qnj_zhuadan_from || [];
			const toList = player.storage.qnj_zhuadan_to || [];
			delete player.storage.qnj_zhuadan_from;
			delete player.storage.qnj_zhuadan_to;
			// ⚠️ 联机适配：同步移除，避免各端距离不一致
			game.broadcastAll((p) => {
				try {
					if (p) p.removeSkill("qnj_zhuadan_distance");
				} catch (e) {}
			}, player);
			if (fromList.length || toList.length) {
				game.log(player, "的", "#g「爪弹」", "距离修正已结束");
			}
		},
		mod: {
			globalFrom(from, to, distance) {
				const list = from.storage.qnj_zhuadan_from;
				if (!list || !to || !to.playerid) {
					return;
				}
				const count = list.filter(id => id === to.playerid).length;
				if (count > 0) {
					return distance - count;
				}
			},
			globalTo(from, to, distance) {
				const list = to.storage.qnj_zhuadan_to;
				if (!list || !from || !from.playerid) {
					return;
				}
				const count = list.filter(id => id === from.playerid).length;
				if (count > 0) {
					return distance + count;
				}
			},
		},
	},

	// ==================== 牙3：移去回旋防止伤害 ====================
	qnj_ya3: {
		charlotte: true,
		forced: false,
		trigger: {
			player: "damageBegin4",
		},
		filter(event, player) {
			return (player.storage.qnj_ya_level || 1) >= 3 && player.countMark("qnj_huixuan") > 0 && event.num > 0;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool("爪弹追加：移去1枚「回旋」，防止此次伤害？")
				.set("ai", () => {
					const trigger2 = get.event().getTrigger();
					return trigger2.num > 0;
				})
				.forResult();
		},
		async content(event, trigger, player) {
			player.removeMark("qnj_huixuan", 1);
			// 回旋减少后刷新「牙」图标（合并标记，不降级）
			lib.skill.qnj_ya.refresh(player);
			FX("guard", player);
			trigger.cancel();
			game.log(player, "移去1枚「回旋」，防止了此次伤害");
		},
	},

	// ==================== 牙4：完全なる黄金回旋エネルギー ====================
	qnj_huangjin: {
		limited: true,
		enable: "phaseUse",
		filter(event, player) {
			return (
				(player.storage.qnj_ya_level || 1) >= 4 &&
				!player.storage.qnj_huangjin_used &&
				player.countMark("qnj_huixuan") >= 7 &&
				game.hasPlayer(target => target !== player)
			);
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseTarget("完全なる黄金回旋エネルギー：选择一名其他角色", (card, player2, target) => target !== player2, true)
				.forResult();
			if (!result.bool || !result.targets?.length) {
				return;
			}
			await lib.skill.qnj_huangjin.apply(player, result.targets[0]);
		},
		async apply(player, target) {
			if (!player || !target || !target.isAlive()) {
				return;
			}
			// 黄金回旋：顶层全屏演出（等待可点击跳过）
			FX("ultimate", player, target);
			await FXWait(1200, true);
			// 标记已发动。不要存 game.phaseNumber：首回合它是 0（falsy），
			// 会被 filter 的 !storage.qnj_huangjin_used 当成「没发动过」。
			game.broadcastAll(player => {
				player.storage.qnj_huangjin_used = true;
			}, player);
			player.storage.qnj_huangjin_used = true;
			// 限定技的标准收尾：标记觉醒并让技能本身失效
			try {
				player.awakenSkill("qnj_huangjin");
			} catch (e) {}
			// 移去所有回旋
			const count = player.countMark("qnj_huixuan");
			if (count > 0) {
				player.removeMark("qnj_huixuan", count);
				lib.skill.qnj_ya.refresh(player);
			}
			// 目标：无限回旋（回合开始失去1点体力，死亡不移除）+ 禁疗（直到其死亡）
			// 效果由目标自己持有，不注册全局技能——global 触发会按座次逐个跑 filter，
			// 导致同一事件被重复结算，还会误伤其他角色。
			game.broadcastAll(target => {
				target.storage.qnj_wuxianhuixuan = true;
				target.addSkill("qnj_wuxianhuixuan");
				target.markSkill("qnj_wuxianhuixuan");
				// 禁疗：只设标记，效果由 qnj_wuxianhuixuan 的 recoverBefore 分支处理。
				// （旧写法用 addTempSkill 挂独立技能，但那个技能会被 clearSkills/刷新类效果清掉，
				//   导致"禁疗有时不启用"。现在内建进本体，superCharlotte+fixed 保证清不掉。）
				target.storage.qnj_no_recover = true;
				target.markSkill("qnj_wuxianhuixuan");
			}, target);
			FX("infinity", target);
			// 1 点不可被防止的伤害：filterStop 在 trigger 入口（gameEvent.js:453）返回 true，
			// 使本次伤害的 damageBegin1~4 触发全部跳过，防伤技能因此无从介入。
			// 注意返回 true 只是“跳过触发”，事件本身照常走完并结算，不会卡住。
			const next = target.damage({
				num: 1,
				source: player,
				nocard: true,
				nohujia: true,
			});
			next.filterStop = () => true;
			await next;
			game.log(player, "对", target, "造成了不可被防止的1点伤害，并令其不能回复体力、获得「无限回旋」");
			// 结算结束后回复1点，然后失去所有技能
			await player.recover(1);
			await FXWait(1500, true);
			FX("shatterSkills", player);
			await FXWait(420, true);
			await lib.skill.qnj_huangjin.loseAllSkills(player);
		},
		async loseAllSkills(player) {
			game.broadcastAll(player => {
				player.storage.qnj_no_skill = true;
			}, player);
			player.storage.qnj_no_skill = true;
			// 「失去所有技能」用引擎原生的 skill_blocker 实现：
			// getSkills() → game.filterSkills() → get.is.blocked()（game/index.js:9617、get/is.js:286）
			// 会把被封锁的技能从技能列表中剔除，于是 hasSkill()、filterTrigger() 全部失效。
			// 这样无需 disableSkill 去改动 disabledSkills / 清理 stepCache，
			// 更不会动到「正在执行的技能」，避免事件链中断导致卡死。
			try {
				player.addSkillBlocker("qnj_no_skill");
			} catch (e) {}
			game.log(player, "的所有技能已失效，且不能再获得技能");
		},
		group: ["qnj_huangjin_dying"],
	},

	// 濒死时发动
	qnj_huangjin_dying: {
		trigger: {
			player: "dying",
		},
		forced: false,
		filter(event, player) {
			return (
				(player.storage.qnj_ya_level || 1) >= 4 &&
				!player.storage.qnj_huangjin_used &&
				player.countMark("qnj_huixuan") >= 7 &&
				game.hasPlayer(target => target !== player && target.isAlive())
			);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool("完全なる黄金回旋エネルギー：移去所有「回旋」，发动此限定技？")
				.set("ai", () => true)
				.forResult();
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseTarget("完全なる黄金回旋エネルギー：选择一名其他角色", (card, player2, target) => target !== player2, true)
				.forResult();
			if (!result.bool || !result.targets?.length) {
				return;
			}
			await lib.skill.qnj_huangjin.apply(player, result.targets[0]);
		},
	},

	// 无限回旋：目标持有，其回合开始时失去1点体力。
	// 标记不因死亡而移除，复活后继续生效（死亡期间玩家的技能不会触发，见 filterTrigger 的 isDead 判定）。
	// superCharlotte + fixed：clearSkills（player.js:11657-11669）只放行 superCharlotte 的技能，
	// fixed 让 removeSkill 直接返回。两者配合，对手「刷新自身状态」清不掉它。
	// global：由引擎在获得本技能时自动 addGlobalSkill（player.js:10739-10745），
	// 挂上守护技能用于兜底补状态。
	qnj_wuxianhuixuan: {
		charlotte: true,
		superCharlotte: true,
		fixed: true,
		forced: true,
		popup: false,
		nopop: true,
		mark: true,
		marktext: "∞",
		global: "qnj_wuxianhuixuan_guard",
		// forceDie：死亡后仍需触发 dieAfter 来清理「禁疗」标记
		forceDie: true,
		// 三个触发合一：
		//   phaseBegin    → 每回合开始失去 1 点体力
		//   recoverBefore → 【禁疗】直接内建在这里（不再靠 addTempSkill，那个会被清掉导致失效）
		//   dieAfter      → 死亡时解除禁疗（"直到其死亡"）
		trigger: { player: ["phaseBegin", "recoverBefore", "dieAfter"] },
		filter(event, player, triggername) {
			if (!player.storage.qnj_wuxianhuixuan) return false;
			// 死亡时只做清理（禁疗"直到其死亡"，死亡即解除）
			if (triggername === "dieAfter") return true;
			// 禁疗：只要标记还在就生效
			if (triggername === "recoverBefore") {
				// 濒死求桃（_save）流程必须放行，否则「用了桃却回不了血」会让 _save 的
				// while 循环反复询问同一名角色，直接卡死牌局。
				try {
					if (event.getParent && event.getParent("_save")) return false;
				} catch (e) {}
				return player.storage.qnj_no_recover === true;
			}
			return player.isAlive();
		},
		async content(event, trigger, player) {
			// ⚠️ 注意：技能触发时 trigger.name 是 "trigger"，原事件名在 trigger.triggername。
			// （game/index.js:5591 createEvent("trigger") + 5594 next.triggername = name2）
			const tn = trigger.triggername || trigger.name;
			// 死亡分支：解除禁疗
			if (tn === "dieAfter") {
				delete player.storage.qnj_no_recover;
				// 死亡后不再显示禁疗（无限回旋标记本身保留，复活后继续）
				player.markSkill("qnj_wuxianhuixuan");
				return;
			}
			// 禁疗分支
			if (tn === "recoverBefore") {
				trigger.cancel();
				game.log(player, "因", "#g「无限回旋」", "无法回复体力");
				return;
			}
			// 回合开始：失去 1 点体力
			await player.loseHp(1);
			FX("infinity", player);
			FX("ring", player);
		},
		intro: {
			content(storage, player) {
				const noRecover = player && player.storage && player.storage.qnj_no_recover === true;
				let str = "回合开始时失去 1 点体力；此标记不因死亡而移除，复活后继续生效，且不可移除。";
				if (noRecover) str += "<br><b>禁疗</b>：不能回复体力（濒死求桃除外），直到该角色死亡。";
				return str;
			},
		},
	},

	// 无限回旋守护（兜底）：每轮开始与每回合开始各检测一次，
	// 若因对手的效果导致目标身上丢了「无限回旋」技能/禁疗技能，就补回来。
	// 说明：global 触发会按座次逐个跑 filter，故在 content 里用事件标记去重，
	// 保证同一个事件只补一次，避免重复结算。
	qnj_wuxianhuixuan_guard: {
		charlotte: true,
		superCharlotte: true,
		forced: true,
		silent: true,
		popup: false,
		nopop: true,
		trigger: { global: ["roundStart", "phaseBegin"] },
		filter(event, player) {
			if (event._qnjWuxianGuarded) return false;
			return (game.players || []).some(p => p.storage && p.storage.qnj_wuxianhuixuan);
		},
		content(event, trigger, player) {
			trigger._qnjWuxianGuarded = true;
			for (const p of game.players || []) {
				if (!p.storage || !p.storage.qnj_wuxianhuixuan) continue;
				try {
					// 只补主技能本体（禁疗已内建在里面，不用单独补）
					const hasWuixian = (p.skills || []).includes("qnj_wuxianhuixuan") || p.hasSkill("qnj_wuxianhuixuan");
					if (!hasWuixian) {
						p.addSkill("qnj_wuxianhuixuan");
						game.log(p, "的", "#g「无限回旋」", "重新生效");
					}
					// 顺手清掉旧版本可能残留的独立禁疗技能（避免双标记/双图标）
					if ((p.skills || []).includes("qnj_no_recover_skill")) {
						p.removeSkill("qnj_no_recover_skill");
						game.log(p, "的旧版禁疗技能已清理（已合并进无限回旋）");
					}
					p.markSkill("qnj_wuxianhuixuan");
				} catch (e) {}
			}
		},
	},

	// 禁疗：已合并进 qnj_wuxianhuixuan 本体（不再单独挂技能，避免 addTempSkill 被清掉导致失效）。
	// 这里保留定义只为兼容旧存档/旧引用，本身不带任何触发（不会重复生效）。
	qnj_no_recover_skill: {
		charlotte: true,
		superCharlotte: true,
		fixed: true,
		popup: false,
		nopop: true,
		// 不设 mark / trigger：实际效果由 qnj_wuxianhuixuan 的 recoverBefore 分支处理。
	},

	// 技能封锁标记：技能用尽后挂载，阻止再获得任何新技能（引擎原生 skill_blocker 机制）
	qnj_no_skill: {
		charlotte: true,
		popup: false,
		nopop: true,
		skillBlocker(skill, player) {
			// 只拦截普通技能，放行全局技能与自身
			if (skill === "qnj_no_skill") return false;
			const info = lib.skill[skill];
			if (!info) return false;
			if (info.global) return false;
			return true;
		},
	},

};

export default skills;
