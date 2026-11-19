import { lib, game, ui, get, ai, _status } from "noname";
import fieldSkills from "./脑花场地.js";
import "./脑花特效.js";

/* ============================================================================
 * 表现层驱动
 * ----------------------------------------------------------------------------
 * FX 只负责"让每个客户端各播一遍"，绝不参与结算；任何异常都被吞掉。
 * FXWait 是演出节奏用的等待，特效关闭时立即返回，不会拖慢游戏。
 * ========================================================================== */
function FXOn() {
	try {
		return !!(lib.naohuaFx && lib.naohuaFx.on);
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
				if (lib.naohuaFx) lib.naohuaFx.play(arguments[0], rest);
			} catch (e) {}
		};
		if (typeof game.broadcastAll === "function") {
			game.broadcastAll(runner, name, ...args);
		} else {
			runner(name, ...args);
		}
	} catch (e) {}
}

function FXWait(ms, skippable) {
	if (!FXOn()) return Promise.resolve();
	// 画质档位 1/2 会缩短演出等待，低端机不必干等
	try {
		const _f = lib.naohuaFx;
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
		const timer = setTimeout(finish, ms);
		if (skippable) {
			try {
				// 大特效期间任意点击可直接跳过，不强迫所有人看完
				document.addEventListener("pointerdown", finish, true);
			} catch (e) {}
		}
	});
}

const skills = {
	...fieldSkills,

	// ==================== 死灭回游（场地置入） ====================
	naohua_shimie: {
		locked: true,
		forced: true,
		direct: true,
		charlotte: true,
		forceDie: true,
		mark: false,
		init(player) {
			// 新一局开始时清理上一局残留的场地/规则全局技能
			const state = lib.skill.naohua_field.state;
			if (!game.phaseNumber && (!game.players || !game.players.some(current => current.storage.naohua_swimmer))) {
				try {
					for (const skill of ["naohua_field", "naohua_join", "naohua_gate", "naohua_rule"]) {
						game.removeGlobalSkill(skill);
					}
					for (const rule of state.activeRules) {
						game.removeGlobalSkill(rule);
					}
				} catch (e) {}
				state.activeRules = [];
			}
			state.initialized = false;
			lib.skill.naohua_field.removeRuleButton();
		},
		trigger: {
			player: "phaseZhunbeiBegin",
		},
		filter(event, player) {
			return !lib.skill.naohua_field.state.initialized;
		},
		async content(event, trigger, player) {
			// 开展演出：三段式大特效（结界展开 → 咒灵睁眼 / 立绘砸入 / 标题冲击 → 泳者登録收束）
			// 期间点击屏幕可跳过等待，不强迫所有人看完
			FX("shimie", player);
			const state = lib.skill.naohua_field.state;
			const oldRules = state.activeRules.slice();
			state.activeRules = [];
			state.initialized = false;
			game.broadcastAll(rules => {
				for (const rule of rules) {
					game.removeGlobalSkill(rule);
				}
				game.addGlobalSkill("naohua_field");
				game.addGlobalSkill("naohua_join");
				game.addGlobalSkill("naohua_gate");
				game.addGlobalSkill("naohua_rule");
				lib.skill.naohua_field.state.activeRules = [];
				lib.skill.naohua_field.state.initialized = false;
			}, oldRules);
			await FXWait(2600, true);
			await lib.skill.naohua_field.initField(player);
			lib.skill.naohua_field.createRuleButton();
			lib.skill.naohua_field.updateRuleTip();
			game.log(player, "开展了", "#g「死灭回游」");
		},
	},

	// ==================== 咒灵操术 ====================
	naohua_zhoulingshu: {
		mark: true,
		marktext: "灵",
		intro: {
			content: "当前有#枚「咒灵」标记，最多3枚。",
		},
		init(player) {
			if (typeof player.storage.naohua_zhoulingshu !== "number") {
				player.storage.naohua_zhoulingshu = 0;
			}
		},
		enable: "chooseToUse",
		position: "h",
		filterCard(card) {
			return get.color(card) === "black";
		},
		viewAsFilter(player) {
			return player.countCards("h", { color: "black" }) > 0;
		},
		viewAs: {
			name: "wuxie",
		},
		prompt: "将一张黑色手牌当【无懈可击】使用",
		check(card) {
			return 8 - get.value(card);
		},
		onuse(result, player) {
			// 只需将黑色手牌当【无懈可击】打出即可获得标记。
			FX("convert", player);
			if (player.countMark("naohua_zhoulingshu") < 3) {
				player.addMark("naohua_zhoulingshu", 1);
				FX("eggs", player, player.countMark("naohua_zhoulingshu"), "gain");
			} else {
				// 已满 3 枚：卵撞碎提示，明确"获得被上限吃掉了"
				FX("eggs", player, 3, "full");
			}
		},
		group: ["naohua_zhoulingshu_shan", "naohua_zhoulingshu_guohe"],
	},

	naohua_zhoulingshu_mark: {
		charlotte: true,
		mark: true,
		marktext: "咒灵",
		intro: {
			content: "最多3枚。以【咒灵操术】使用【无懈可击】后获得1枚；弃置1枚视为使用【闪】，弃置2枚视为使用【过河拆桥】。",
		},
	},

	naohua_zhoulingshu_shan: {
		popup: false,
		nopop: true,
		enable: ["chooseToRespond", "chooseToUse"],
		filterCard: () => false,
		selectCard: -1,
		viewAs: {
			name: "shan",
			isCard: true,
		},
		filter(event, player) {
			return (
				player.countMark("naohua_zhoulingshu") >= 1 &&
				event.filterCard(get.autoViewAs({ name: "shan" }, "unsure"), player, event)
			);
		},
		prompt: "弃置1枚「咒灵」标记，视为使用一张【闪】",
		check() {
			return 1;
		},
		async precontent(event, trigger, player) {
			if (player.countMark("naohua_zhoulingshu") < 1) {
				event.result = event.result || {};
				event.result.cancel = true;
				return;
			}
			player.removeMark("naohua_zhoulingshu", 1);
			player.logSkill("naohua_zhoulingshu");
			FX("eggs", player, player.countMark("naohua_zhoulingshu"), "spend");
		},
		ai: {
			respondShan: true,
			skillTagFilter(player) {
				return player.countMark("naohua_zhoulingshu") >= 1;
			},
		},
	},

	naohua_zhoulingshu_guohe: {
		popup: false,
		nopop: true,
		enable: "phaseUse",
		filterCard: () => false,
		selectCard: -1,
		viewAs: {
			name: "guohe",
			isCard: true,
		},
		filter(event, player) {
			return (
				player.countMark("naohua_zhoulingshu") >= 2 &&
				event.filterCard(get.autoViewAs({ name: "guohe" }, "unsure"), player, event)
			);
		},
		prompt: "弃置2枚「咒灵」标记，视为使用一张【过河拆桥】",
		check() {
			return 1;
		},
		onuse(result, player) {
			// 咒灵弹：蓄力 → 飞向目标 → 爆炸
			try {
				const targets = (result && result.targets) || [];
				if (targets.length) {
					FX("bolt", player, targets[0], { size: 70, core: "#ff6a78", glow1: "#c2413f", glow2: "#3a0a1c" });
				}
			} catch (e) {}
		},
		async precontent(event, trigger, player) {
			if (player.countMark("naohua_zhoulingshu") < 2) {
				event.result = event.result || {};
				event.result.cancel = true;
				return;
			}
			player.removeMark("naohua_zhoulingshu", 2);
			player.logSkill("naohua_zhoulingshu");
			FX("eggs", player, player.countMark("naohua_zhoulingshu"), "spend");
		},
		ai: {
			order: 7,
			result: {
				target(player, target) {
					return -get.attitude(player, target);
				},
			},
		},
	},

	// ==================== 帐 ====================
	naohua_zhang: {
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			return player.countCards("he") > 0 && game.hasPlayer(current => current !== player);
		},
		filterCard: true,
		position: "he",
		selectTarget: 1,
		filterTarget(card, player, target) {
			return target !== player;
		},
		prompt: "弃置一张牌，令一名其他角色获得「帐」标记",
		async content(event, trigger, player) {
			const target = event.targets[0];
			// ⚠️ 联机适配：技能挂载/移除要广播（「帐」有 mark，各端都要显示图标）
			const had = target.hasSkill("naohua_zhang_mark");
			game.broadcastAll((t) => {
				try {
					if (!t) return;
					if (t.hasSkill("naohua_zhang_mark")) t.removeSkill("naohua_zhang_mark");
					t.addTempSkill("naohua_zhang_mark", { player: "phaseDiscardAfter" });
				} catch (e) {}
			}, target);
			if (had) FX("veilClear", target);
			// 黑纱从羂索座位飞向目标，落到目标头像外环上常驻
			FX("line", player, target, { color: "rgba(122,30,61,.9)" });
			FX("veil", target);
			setTimeout(() => FX("ring", target, { color: "rgba(122,30,61,.9)", size: 110 }), 260);
			game.log(player, "令", target, "获得了", "#g「帐」", "标记");
		},
		group: ["naohua_zhang_sha"],
	},

	naohua_zhang_mark: {
		charlotte: true,
		mark: true,
		marktext: "帐",
		intro: {
			content: "有「帐」标记。其使用【杀】指定目标后，羂索可以移除此标记令此【杀】无效，然后其摸一张牌。其下个弃牌阶段结束时移除此标记。",
		},
	},

	naohua_zhang_sha: {
		charlotte: true,
		popup: false,
		nopop: true,
		trigger: {
			global: "useCard",
		},
		filter(event, player) {
			return (
				event.card.name === "sha" &&
				event.player !== player &&
				event.player.hasSkill("naohua_zhang_mark") &&
				event.targets &&
				event.targets.length > 0
			);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseBool(
					get.prompt("naohua_zhang", trigger.player),
					"移去其「帐」标记，令此【杀】无效，然后其摸一张牌。"
				)
				.set("ai", () => {
					const trigger = get.event().getTrigger();
					const player = get.player();
					const targets = trigger.targets || [];
					return targets.some(target => get.attitude(player, target) > 0 || target === player);
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const source = trigger.player;
			// 目标数组马上要被清空，先留一份给表现层用
			const targets = (trigger.targets || []).slice();
			// ⚠️ 联机适配：移除「帐」标记技能要广播
			game.broadcastAll((t) => {
				try {
					if (t) t.removeSkill("naohua_zhang_mark");
				} catch (e) {}
			}, source);
			FX("veilBreak", source);
			FX("hitReaction", source, 420);
			FX("shaVoid", source, targets);
			trigger.targets.length = 0;
			trigger.all_excluded = true;
			await source.draw();
			game.log(player, "移去了", source, "的", "#g「帐」", "标记，令此【杀】无效");
		},
	},

	// ==================== 夺舍 ====================
	naohua_duoshe: {
		limited: true,
		skillAnimation: true,
		animationColor: "gray",
		mark: false,
		trigger: {
			global: "die",
		},
		filter(event, player) {
			return event.player !== player && !player.awakenedSkills.includes("naohua_duoshe");
		},
		isClientSafeSkill(skill) {
			const info = lib.skill[skill];
			if (!info || info.forceLoad) {
				return true;
			}
			const extensions = lib.extensions || [];
			for (const ext of extensions) {
				const pack = ext && ext[4];
				if (pack && pack.skill && pack.skill[skill]) {
					return !!ext[5];
				}
			}
			return true;
		},
		async cost(event, trigger, player) {
			const result = await player
				.chooseBool(get.prompt(event.skill, trigger.player), "是否发动【夺舍】？若不发动，你摸一张牌。")
				.set("ai", () => true)
				.forResult();
			if (!result?.bool) {
				// 不发动时 content 不会执行，所以摸牌必须放在 cost 里
				FX("float", player, "放弃夺舍", { color: "rgba(160,160,160,.9)", size: 14 });
				await player.draw();
				event.result = { bool: false };
			} else {
				event.result = { bool: true };
			}
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const oldMax = player.maxHp;

			// —— 第 0 段：宣告（碎屏裂纹 + 巨瞳 + 立绘砸入 + 标题） ——
			// 只在宣告这一小段压暗，碎屏结束立刻回亮，不再全程黑屏。
			FX("duosheStart", player);
			FX("dimOn", 2600);
			await FXWait(1150, true);
			FX("dimOff");

			// ⚠️ 联机适配：夺舍后获得的技能要广播
			game.broadcastAll((p) => {
				try {
					if (p && !p.hasSkill("naohua_duoshe_corpse")) p.addSkill("naohua_duoshe_corpse");
				} catch (e) {}
			}, player);
			player.awakenSkill(event.name);

			// —— 第 1 段：弃置自己所有手牌和装备 ——
			const own = player.getCards("he");
			if (own.length) {
				await player.discard(own);
			}
			FX("ash", player, Math.min(20, 6 + own.length));
			FX("spark", player, { count: 48, color: "#c2413f", duration: 950 });
			await FXWait(230, true);

			// —— 第 2 段：体力上限改为死亡角色的体力上限，并回复至上限-1 ——
			const recoverTo = Math.max(1, target.maxHp - 1);
			const newHp = Math.min(player.hp, recoverTo);
			FX("hpShift", player, oldMax, target.maxHp);
			game.broadcastAll(
				(player, maxHp, hp) => {
					player.maxHp = maxHp;
					player.hp = hp;
					player.update();
				},
				player,
				target.maxHp,
				newHp
			);
			await player.recoverTo(recoverTo);
			await FXWait(230, true);

			// —— 第 3 段：在死亡角色的牌进入弃牌堆前，获得其所有手牌和装备 ——
			const cards = target.getCards("he");
			if (cards.length) {
				await player.gain(cards, "gain2");
			}
			FX("line", target, player, { color: "rgba(122,30,61,.9)" });
			FX("ring", player, { color: "rgba(122,30,61,.9)", size: 140 });
			await FXWait(210, true);

			// 获得其武将牌上的所有技能，排除羂索自身技能与不可偷取的锁定技
			let skills = target
				.getSkills(null, false, false)
				.filter(skill => !skill.startsWith("naohua_") && !get.info(skill)?.charlotte);
			if (_status.connectMode) {
				skills = skills.filter(skill => lib.skill.naohua_duoshe.isClientSafeSkill(skill));
			}
			if (skills.length) {
				game.broadcastAll(
					(player, skills) => {
						for (const skill of skills) {
							if (!player.hasSkill(skill)) {
								player.addSkill(skill);
							}
						}
					},
					player,
					skills
				);
				// —— 第 5 段：技能从死者座位逐个飞到夺舍者座位 ——
				FX("ring", target, { color: "rgba(232,222,210,.9)", size: 170 });
				FX("chipFlow", target, player, skills.map(skill => get.translation(skill)));
				setTimeout(() => FX("skillGainGlow", player, skills.length), 460);
				await FXWait(340, true);
			}

			// —— 第 6 段：失去咒灵操术和帐 ——
			FX("duosheEnd", player);
			setTimeout(() => FX("eggs", player, 0, "spend"), 110);
			// ⚠️ 联机适配：失去技能要广播，否则其他客户端上他还能用
			game.broadcastAll((p) => {
				try {
					if (!p) return;
					p.removeSkill("naohua_zhoulingshu");
					p.removeSkill("naohua_zhang");
				} catch (e) {}
			}, player);
			// 帐 技能已不存在，场上残留的帐幕只做视觉清除（不改动标记本身）
			setTimeout(() => FX("veilClearAll"), 180);
			await FXWait(440, true);

			// 替换武将牌立绘与显示名
			const deadName = target.name1 || target.name;
			const deadDisplayName = get.translation(target.name || deadName || "");
			const possessedName = `（${deadDisplayName}）·脑花`;
			const deadImg = lib.character[deadName]?.img;
			const deadBg = target.node?.avatar?.style?.backgroundImage;
			player.storage.naohua_possessed_name = possessedName;
			player.storage.naohua_possessed_img = deadBg || deadImg || "";
			player.addSkill("naohua_possessed");
			game.broadcastAll(
				(player, name, img, bg, deadName) => {
					if (!player?.node) {
						return;
					}
					player.storage.naohua_possessed_name = name;
					player.storage.naohua_possessed_img = bg || img || "";
					if (player.node.name) {
						player.node.name.innerHTML = get.verticalStr(name);
					}
					if (player.node.name_seat) {
						player.node.name_seat.innerHTML = get.verticalStr(name);
					}
					if (bg && player.node.avatar) {
						player.node.avatar.style.backgroundImage = bg;
					} else if (img && player.node.avatar?.setBackgroundImage) {
						player.node.avatar.setBackgroundImage(img);
					} else if (deadName && player.node.avatar?.setBackground) {
						player.node.avatar.setBackground(deadName, "character");
					}
					if (player.node.avatar) {
						player.node.avatar.show();
					}
					if (player == game.me && ui.fakeme && player.node.avatar) {
						ui.fakeme.style.backgroundImage = player.node.avatar.style.backgroundImage;
					}
				},
				player,
				possessedName,
				deadImg,
				deadBg,
				deadName
			);

			// 记录需要在 dieAfter 处理的尸体移除，避免在 die 结算中移除报错
			game.broadcastAll(target => {
				target.storage.naohua_corpse_remove = true;
			}, target);
			game.log(player, "夺舍了", target, "的躯体");
		},
		group: ["naohua_duoshe_corpse"],
	},

	naohua_duoshe_corpse: {
		charlotte: true,
		forced: true,
		popup: false,
		nopop: true,
		trigger: {
			global: "dieAfter",
		},
		filter(event, player) {
			return event.player && event.player.storage && event.player.storage.naohua_corpse_remove;
		},
		async content(event, trigger, player) {
			const dead = trigger.player;
			game.broadcastAll(dead => {
				delete dead.storage.naohua_corpse_remove;
			}, dead);

			// 原地留下自己的尸体：在自身原座位生成一具死亡角色
			const fieldState = lib.skill.naohua_field.state;
			const wasInitialized = fieldState.initialized;
			const activeRules = fieldState.activeRules.slice();
			try {
				const corpse = await game.addPlayerOL(player, player.name1, player.name2, false, { animate: false });
				if (corpse && get.itemtype(corpse) == "player") {
					game.broadcastAll(corpse => {
						corpse.hp = 0;
						corpse.maxHp = 0;
						corpse.classList.add("dead");
						corpse.classList.add("out");
						game.players.remove(corpse);
						if (!game.dead.includes(corpse)) {
							game.dead.push(corpse);
						}
						corpse.update();
					}, corpse);
				}
			} catch (e) {}
			// addPlayerOL 会初始化新角色并触发其 init，还原场地状态
			fieldState.initialized = wasInitialized;
			fieldState.activeRules = activeRules;
			game.broadcastAll(
				(initialized, rules) => {
					lib.skill.naohua_field.state.initialized = initialized;
					lib.skill.naohua_field.state.activeRules = rules;
				},
				wasInitialized,
				activeRules
			);

			// —— 第 4 段：抽魂 + 空间裂隙 + 座位环冲击波 → 转移座位 ——
			// 这一段才需要压暗：抽魂与转座是全场焦点，但只压 1.1 秒。
			FX("dimOn", 2200);
			FX("duosheSuck", dead, player);

			// 移除死亡角色尸体，并把自身移到其位置
			const position = parseInt(dead.dataset.position);
			await FXWait(560, true);
			await game.removePlayerOL(dead);
			game.broadcastAll(
				(player, position) => {
					try {
						if (lib.naohuaFx && lib.naohuaFx.on) {
							lib.naohuaFx.seatTransfer(player, position);
							return;
						}
					} catch (e) {}
					try {
						player.changeSeat(position, false);
						game.arrangePlayers();
					} catch (e) {}
				},
				player,
				position
			);
			await FXWait(260, true);
			FX("dimOff");
		},
	},

	naohua_possessed: {
		charlotte: true,
		forced: true,
		popup: false,
		nopop: true,
		mark: false,
		trigger: {
			player: ["phaseZhunbeiBegin", "damageEnd", "gainAfter", "loseAfter"],
		},
		apply(player) {
			const name = player.storage.naohua_possessed_name;
			const img = player.storage.naohua_possessed_img;
			if (!name || !player.node) {
				return;
			}
			if (player.node.name) {
				player.node.name.innerHTML = get.verticalStr(name);
			}
			if (player.node.name_seat) {
				player.node.name_seat.innerHTML = get.verticalStr(name);
			}
			if (img && player.node.avatar) {
				if (typeof img == "string" && img.startsWith("url(")) {
					player.node.avatar.style.backgroundImage = img;
				} else if (player.node.avatar.setBackgroundImage) {
					player.node.avatar.setBackgroundImage(img);
				}
			}
			if (player.node.avatar) {
				player.node.avatar.show();
			}
			if (player == game.me && ui.fakeme && player.node.avatar) {
				ui.fakeme.style.backgroundImage = player.node.avatar.style.backgroundImage;
			}
		},
		async content(event, trigger, player) {
			const name = player.storage.naohua_possessed_name;
			const img = player.storage.naohua_possessed_img;
			game.broadcastAll(
				(player, name, img) => {
					player.storage.naohua_possessed_name = name;
					player.storage.naohua_possessed_img = img;
					lib.skill.naohua_possessed.apply(player);
				},
				player,
				name,
				img
			);
		},
	},
};

export default skills;