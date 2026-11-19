import { lib, game, ui, get, ai, _status } from "noname";

const RULE_BUTTON_ENABLED = false;

const fieldSkills = {
	// 泳者 + 点数合并标记：有此标记即视为泳者，标记数量为「点数」
	naohua_point: {
		charlotte: true,
		mark: true,
		marktext: "泳/点",
		intro: {
			content: "有此标记即视为「泳者」；当前有#枚「点数」，公开可见。",
		},
		gain(player, num) {
			if (num > 0) {
				player.addMark("naohua_point", num);
				lib.skill.naohua_field.checkWin(player);
			}
		},
		discard(player, num) {
			const count = Math.min(num, player.countMark("naohua_point"));
			if (count > 0) {
				player.removeMark("naohua_point", count);
			}
		},
		count(player) {
			return player.countMark("naohua_point");
		},
	},

	// 场地主规则
	naohua_field: {
		global: true,
		charlotte: true,
		forceDie: true,
		forced: true,
		state: {
			initialized: false,
			activeRules: [],
			rulePool: [
				"naohua_rule_1",
				"naohua_rule_2",
				"naohua_rule_3",
				"naohua_rule_4",
				"naohua_rule_5",
				"naohua_rule_6",
				"naohua_rule_7",
				"naohua_rule_8",
			],
		},
		ruleNames: {
			naohua_rule_1: "点数交易",
			naohua_rule_2: "术式公开",
			naohua_rule_3: "管理者裁定",
			naohua_rule_4: "结界加固",
			naohua_rule_5: "点数保险",
			naohua_rule_6: "回游休战",
			naohua_rule_7: "术式反制",
			naohua_rule_8: "点数均衡",
		},
		isSwimmer(player) {
			return !!player.storage.naohua_swimmer;
		},
		checkWin(player) {
			if (player && lib.skill.naohua_field.isSwimmer(player) && player.countMark("naohua_point") >= 1000) {
				game.over(player);
			}
		},
		addSwimmer(player, points) {
			player.storage.naohua_swimmer = true;
			game.broadcastAll(player => {
				player.storage.naohua_swimmer = true;
			}, player);
			player.addSkill("naohua_point");
			player.markSkill("naohua_point");
			if (points > 0) {
				lib.skill.naohua_point.gain(player, points);
			}
		},
		removeField() {
			const players = game.players.concat(game.dead);
			game.broadcastAll(players => {
				for (const player of players) {
					player.storage.naohua_swimmer = false;
					player.removeSkill("naohua_point");
					player.removeMark("naohua_point", player.countMark("naohua_point"));
				}
				for (const rule of lib.skill.naohua_field.state.activeRules) {
					game.removeGlobalSkill(rule);
				}
				lib.skill.naohua_field.state.activeRules = [];
				game.removeGlobalSkill("naohua_join");
				game.removeGlobalSkill("naohua_gate");
				game.removeGlobalSkill("naohua_rule");
				game.removeGlobalSkill("naohua_field");
			}, players);
			game.log("场上已没有「泳者」，「死灭回游」被移除");
			lib.skill.naohua_field.removeRuleButton();
			lib.skill.naohua_field.updateRuleTip();
		},
		removeRuleButton() {
			game.broadcastAll(() => {
				if (ui.naohuaRuleButton) {
					ui.naohuaRuleButton.remove();
					delete ui.naohuaRuleButton;
				}
			});
		},
		updateRuleTip() {
			game.broadcastAll(() => {
				const owner = game.players.find(p => p.isAlive() && p.hasSkill("naohua_shimie"));
				if (!owner || typeof owner.removeTip !== "function") {
					return;
				}
				const active = lib.skill.naohua_field.state.activeRules;
				owner.removeTip("naohua_rule");
				if (!active.length) {
					return;
				}
				const marks = ["①", "②", "③"];
				const text = active
					.map((id, index) => `${marks[index] || index + 1}${get.translation(id)}`)
					.join(" ");
				owner.addTip("naohua_rule", "追加规则 " + text);
			});
		},
		buildRuleLines(full) {			const state = lib.skill.naohua_field.state;
			const active = state.activeRules.slice();
			const lines = ["<b>当前生效规则</b>"];
			if (active.length) {
				for (const id of active) {
					lines.push(`「${get.translation(id)}」：${get.translation(id + "_info")}`);
				}
			} else {
				lines.push("暂无生效规则");
			}
			if (full) {
				lines.push("<br><b>规则池（未生效）</b>");
				let count = 0;
				for (const id of state.rulePool) {
					if (active.includes(id)) {
						continue;
					}
					count++;
					lines.push(`「${get.translation(id)}」：${get.translation(id + "_info")}`);
				}
				if (!count) {
					lines.push("规则池已空");
				}
			}
			return lines;
		},
		buildRuleHoverDialog() {
			const dialog = ui.create.dialog("hidden");
			dialog.classList.add("naohua-rule-hover");
			dialog.add(lib.skill.naohua_field.buildRuleLines(false).join("<br>"));
			return dialog;
		},
		showRuleDialog() {
			const lines = lib.skill.naohua_field.buildRuleLines(true);
			ui.create.dialog("死灭回游·追加规则", lines.join("<br>"), "hidden");
		},
		createRuleButton() {
			if (!RULE_BUTTON_ENABLED) {
				return;
			}
			game.broadcastAll(() => {
				if (ui.naohuaRuleButton || !ui.create || typeof ui.create.system !== "function") {
					return;
				}
				const button = ui.create.system(
					"追加规则",
					function () {
						lib.skill.naohua_field.showRuleDialog();
					},
					true,
					true
				);
				ui.naohuaRuleButton = button;
				// 悬停只显示当前生效规则，点击再看完整规则池
				if (lib.setPopped && typeof lib.setPopped === "function") {
					lib.setPopped(
						button,
						function () {
							return lib.skill.naohua_field.buildRuleHoverDialog();
						},
						180
					);
				}
			});
		},
		async initField(player) {
			const state = lib.skill.naohua_field.state;
			if (state.initialized) {
				return;
			}
			state.initialized = true;
			game.broadcastAll(() => {
				lib.skill.naohua_field.state.initialized = true;
			});
			const players = game.players.slice().sortBySeat();
			for (const current of players) {
				const result = await current
					.chooseBool("是否加入", "是否加入〖死灭回游〗，成为「泳者」？")
					.set("ai", () => true)
					.forResult();
				if (result?.bool) {
					lib.skill.naohua_field.addSwimmer(current, 1);
				} else {
					current.storage.naohua_swimmer = false;
					game.broadcastAll(current => {
						current.storage.naohua_swimmer = false;
					}, current);
				}
			}
			if (!game.hasPlayer(current => lib.skill.naohua_field.isSwimmer(current))) {
				// 场地必须发动：无人加入时强制羂索成为泳者，避免场地被移除
				if (player) {
					lib.skill.naohua_field.addSwimmer(player, 1);
					game.log(player, "被强制加入", "#g「死灭回游」");
				}
			}
		},
		trigger: {
			global: "die",
			source: "damageEnd",
		},
		async content(event, trigger, player) {
			if (trigger._naohua_field_done) {
				return;
			}
			trigger._naohua_field_done = true;
			if (trigger.name === "damage" || trigger.name === "damageEnd") {
				// 记录最后伤害来源，供死亡结算使用
				trigger.player.storage.naohua_last_damage_source = trigger.source;
				// R1：泳者每造成1点伤害获得1枚点数
				if (trigger.source && lib.skill.naohua_field.isSwimmer(trigger.source) && trigger.num > 0) {
					lib.skill.naohua_point.gain(trigger.source, trigger.num);
				}
				return;
			}

			if (trigger.name === "die") {
				const dead = trigger.player;
				if (lib.skill.naohua_field.isSwimmer(dead)) {
					const killer = dead.storage.naohua_last_damage_source;
					if (killer && killer !== dead && killer.isIn() && lib.skill.naohua_field.isSwimmer(killer)) {
						lib.skill.naohua_point.gain(killer, 3);
					}
					const points = dead.countMark("naohua_point");
					const active = lib.skill.naohua_field.state.activeRules;
					if (active.includes("naohua_rule_3") && game.hasPlayer(current => lib.skill.naohua_field.isSwimmer(current) && current !== dead)) {
						// 管理者裁定：点数给当前存活泳者中点数最低者
						let list = game.filterPlayer(current => lib.skill.naohua_field.isSwimmer(current) && current !== dead);
						if (list.length) {
							let min = Math.min(...list.map(current => current.countMark("naohua_point")));
							let candidates = list.filter(current => current.countMark("naohua_point") === min);
							let receiver;
							if (candidates.length === 1) {
								receiver = candidates[0];
							} else if (killer && killer.isIn()) {
								const result = await killer.chooseTarget("管理者裁定：选择一名点数最低的泳者获得点数", true, (card, player, target) => candidates.includes(target)).forResult();
								receiver = result.bool ? result.targets[0] : candidates[0];
							} else {
								const current = _status.currentPhase && _status.currentPhase.isIn() ? _status.currentPhase : game.players[0];
								const result = await current.chooseTarget("管理者裁定：选择一名点数最低的泳者获得点数", true, (card, player, target) => candidates.includes(target)).forResult();
								receiver = result.bool ? result.targets[0] : candidates[0];
							}
							if (receiver) {
								lib.skill.naohua_point.discard(dead, points);
								lib.skill.naohua_point.gain(receiver, points);
							} else {
								lib.skill.naohua_point.discard(dead, points);
							}
						} else {
							lib.skill.naohua_point.discard(dead, points);
						}
					} else {
						lib.skill.naohua_point.discard(dead, points);
					}
					// ⚠️ 联机适配：技能与 storage 都要广播，否则各端状态不一致
					game.broadcastAll((p) => {
						try {
							if (!p) return;
							p.storage.naohua_swimmer = false;
							p.removeSkill("naohua_point");
						} catch (e) {}
					}, dead);
					if (!game.hasPlayer(current => lib.skill.naohua_field.isSwimmer(current))) {
						lib.skill.naohua_field.removeField();
					} else if (game.countPlayer() === 1) {
						game.over(game.players[0]);
					}
				}
			}
		},
	},

	// R0：未加入角色出牌阶段限一次加入回游
	naohua_join: {
		global: true,
		locked: true,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return !player.storage.naohua_swimmer;
		},
		async content(event, trigger, player) {
			const result = await player.chooseBool("是否加入", "是否加入〖死灭回游〗？加入后不可退出。").set("ai", () => true).forResult();
			if (result.bool) {
				lib.skill.naohua_field.addSwimmer(player, 0);
				game.log(player, "加入了", "#g「死灭回游」");
			}
		},
	},

	// R2：结界入口
	naohua_gate: {
		global: true,
		locked: true,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return (
				lib.skill.naohua_field.isSwimmer(player) &&
				player.countMark("naohua_point") >= 1 &&
				game.hasPlayer(current => current !== player && lib.skill.naohua_field.isSwimmer(current))
			);
		},
		async content(event, trigger, player) {
			const result = await player
				.chooseTarget("结界入口：选择一名其他泳者", true, (card, player, target) => target !== player && lib.skill.naohua_field.isSwimmer(target))
				.set("ai", target => -get.attitude(get.player(), target))
				.forResult();
			if (!result.bool) {
				return;
			}
			lib.skill.naohua_point.discard(player, 1);
			const target = result.targets[0];
			const controls = target.countCards("he") > 0 ? ["交给对方一张牌", "令其视为对你使用【杀】"] : ["令其视为对你使用【杀】"];
			const choice = await target.chooseControl(controls).set("prompt", "结界入口：请选择一项").forResult();
			if (choice.control === "交给对方一张牌") {
				const cardResult = await target.chooseCard("he", true, "交给对方一张牌").forResult();
				if (cardResult.bool) {
					await target.give(cardResult.cards, player);
				}
			} else {
				const next = player.useCard({ name: "sha", isCard: true }, target, false);
				next.set("nodistance", true);
				next.set("addCount", false);
				await next;
				if (!target.hasHistory("damage", evt => evt.getParent("useCard") === next)) {
					lib.skill.naohua_point.gain(target, 1);
				}
			}
		},
	},

	// R3：追加规则
	naohua_rule: {
		global: true,
		locked: true,
		direct: true,
		enable: "phaseUse",
		filter(event, player) {
			const state = lib.skill.naohua_field.state;
			return (
				lib.skill.naohua_field.isSwimmer(player) &&
				player.countMark("naohua_point") >= 5 &&
				player.storage.naohua_rule_used_phase !== game.phaseNumber &&
				state.rulePool.some(rule => !state.activeRules.includes(rule))
			);
		},
		async content(event, trigger, player) {
			const state = lib.skill.naohua_field.state;
			const available = state.rulePool.filter(rule => !state.activeRules.includes(rule));
			// 用 textbutton 竖排列表，只显示规则名，不要 chooseControl 的横排按钮
			const buttons = available.map(rule => [rule, get.translation(rule)]);
			const result = await player
				.chooseButton(["选择一条追加规则置入场上", [buttons, "textbutton"]])
				.forResult();
			if (!result.bool) {
				// 取消：不扣点数，本次也不记入已使用
				return;
			}
			const rule = result.links[0];
			lib.skill.naohua_point.discard(player, 5);
			let removed;
			if (state.activeRules.length >= 3) {
				removed = state.activeRules.shift();
				game.log("追加规则", "#g「" + lib.skill.naohua_field.ruleNames[removed] + "」", "被最早置入的规则顶替");
			}
			state.activeRules.push(rule);
			const activeRules = state.activeRules.slice();
			game.broadcastAll(
				(removed, rule, activeRules) => {
					if (removed) {
						game.removeGlobalSkill(removed);
					}
					game.addGlobalSkill(rule);
					lib.skill.naohua_field.state.activeRules = activeRules;
				},
				removed,
				rule,
				activeRules
			);
			game.broadcastAll(
				(player, phase) => {
					player.storage.naohua_rule_used_phase = phase;
				},
				player,
				game.phaseNumber
			);
			player.logSkill("naohua_rule");
			game.log(player, "置入了追加规则", "#g「" + lib.skill.naohua_field.ruleNames[rule] + "」");
			lib.skill.naohua_field.updateRuleTip();
		},
	},

	// 1 点数交易
	naohua_rule_1: {
		global: true,
		locked: true,
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return lib.skill.naohua_field.isSwimmer(player) && (player.countMark("naohua_point") >= 2 || player.countCards("he") > 0);
		},
		async content(event, trigger, player) {
			const controls = [];
			if (player.countMark("naohua_point") >= 2) {
				controls.push("支付2枚点数摸一张牌");
			}
			if (player.countCards("he") > 0) {
				controls.push("弃置一张牌获得1枚点数");
			}
			if (!controls.length) {
				return;
			}
			const result = await player
				.chooseControl(controls)
				.set("prompt", "点数交易")
				.forResult();
			if (result.control === "支付2枚点数摸一张牌") {
				lib.skill.naohua_point.discard(player, 2);
				await player.draw();
			} else if (result.control === "弃置一张牌获得1枚点数") {
				const discard = await player.chooseToDiscard("he", true).forResult();
				if (discard.bool) {
					lib.skill.naohua_point.gain(player, 1);
				}
			}
		},
	},

	// 2 术式公开
	naohua_rule_2: {
		global: true,
		trigger: {
			source: "useCardToPlayered",
		},
		filter(event, player) {
			return event.player === player && event.card.name === "sha" && lib.skill.naohua_field.isSwimmer(player) && player.countMark("naohua_point") >= 1;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool("术式公开", "支付1枚点数，令此【杀】不可被【闪】响应？")
				.set("ai", () => true)
				.forResult();
		},
		async content(event, trigger, player) {
			lib.skill.naohua_point.discard(player, 1);
			trigger.getParent()?.directHit?.add(trigger.target);
			if (lib.skill.naohua_field.isSwimmer(trigger.target)) {
				lib.skill.naohua_point.gain(trigger.target, 1);
			}
		},
	},

	// 3 管理者裁定：死亡点数转移由 naohua_field 的 die 结算处理
	naohua_rule_3: {
		global: true,
	},

	// 4 结界加固
	naohua_rule_4: {
		global: true,
		trigger: {
			player: "phaseAfter",
		},
		forced: true,
		filter(event, player) {
			return lib.skill.naohua_field.isSwimmer(player) && !player.hasHistory("damage");
		},
		async content(event, trigger, player) {
			await player.draw();
		},
	},

	// 5 点数保险
	naohua_rule_5: {
		global: true,
		trigger: {
			player: "damageBegin4",
		},
		filter(event, player) {
			return (
				lib.skill.naohua_field.isSwimmer(player) &&
				player.countMark("naohua_point") >= 2 &&
				!player.hasSkill("naohua_rule_5_used")
			);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool("点数保险", "支付2枚点数，防止此伤害？")
				.set("ai", () => true)
				.forResult();
		},
		async content(event, trigger, player) {
			lib.skill.naohua_point.discard(player, 2);
			// ⚠️ 联机适配：这个技能记录"本回合已用过"，各端都要有，否则各端限次判断不一致
			game.broadcastAll((p) => {
				try {
					if (p) p.addTempSkill("naohua_rule_5_used", "phaseAfter");
				} catch (e) {}
			}, player);
			trigger.cancel();
		},
	},

	naohua_rule_5_used: {
		charlotte: true,
		popup: false,
		nopop: true,
	},

	// 6 回游休战
	naohua_rule_6: {
		global: true,
		trigger: {
			global: "roundStart",
		},
		forced: true,
		async content(event, trigger, player) {
			if (trigger._naohua_rule6_done) {
				return;
			}
			trigger._naohua_rule6_done = true;
			for (const current of game.filterPlayer(current => lib.skill.naohua_field.isSwimmer(current))) {
				await current.draw();
			}
		},
	},

	// 7 术式反制
	naohua_rule_7: {
		global: true,
		trigger: {
			target: "shaBegin",
		},
		filter(event, player) {
			return event.card.name === "sha" && lib.skill.naohua_field.isSwimmer(player) && player.countMark("naohua_point") >= 1;
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool("术式反制", "支付1枚点数，令此【杀】无效？")
				.set("ai", () => true)
				.forResult();
		},
		async content(event, trigger, player) {
			lib.skill.naohua_point.discard(player, 1);
			trigger.cancel();
			if (lib.skill.naohua_field.isSwimmer(trigger.player)) {
				lib.skill.naohua_point.gain(trigger.player, 1);
			}
		},
	},

	// 8 点数均衡
	naohua_rule_8: {
		global: true,
		trigger: {
			player: "phaseZhunbeiBegin",
		},
		forced: true,
		filter(event, player) {
			return lib.skill.naohua_field.isSwimmer(player);
		},
		async content(event, trigger, player) {
			const list = game.filterPlayer(current => lib.skill.naohua_field.isSwimmer(current));
			const points = list.map(current => current.countMark("naohua_point"));
			const max = Math.max(...points);
			const min = Math.min(...points);
			const self = player.countMark("naohua_point");
			if (self === max) {
				lib.skill.naohua_point.discard(player, 2);
			}
			if (self === min) {
				lib.skill.naohua_point.gain(player, 1);
			}
		},
	},
};

export default fieldSkills;