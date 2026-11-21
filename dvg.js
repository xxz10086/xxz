import { lib, game, ui, get, ai, _status } from "noname";

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

/* ============================================================================
 * D&G（JOJO 第七部「Steel Ball Run」的替身使者）
 * 势力：群 / 3 体力
 * 技能：隐匿 / 帮助 / 马友友 / 腐蚀
 *
 * 设计要点：
 *   1. 开局隐匿 → 移出游戏；一个轮次后重新登场
 *   2. 登场后在 D&G 自己的第一个回合里，依次询问每名其他角色是否需要帮助
 *   3. 询问结束后召唤「马友友」作为独立武将，登场于 D&G 的上家位置
 *   4. 马友友：5 血、不回体力上限、每回合回满、不濒死不死亡、
 *      受伤摸 2 张、不能用牌、跳过出牌/弃牌改为摸牌
 *   5. 被帮助者：每回合可用 1 次马友友的手牌（每回合每种牌名限一次）、
 *      回合结束交给马友友 1 张手牌、弃牌阶段的牌入手马友友
 *   6. 腐蚀：被帮助者每轮 +1；使用马友友的牌 +1（D&G 除外）；效果待定
 *
 * 本文件只导出数据，由 脑花数据.js 统一注册。
 * ========================================================================== */

const DG = "dvg_dg";
const MAYY = "dvg_mayouyou";
const HIDDEN = "dvg_skill_hidden";
const HELP = "dvg_skill_help";
const MAYOUYOU = "dvg_skill_mayouyou";
const CORRUPT = "dvg_skill_corrupt";
const RETURN = "dvg_skill_return";
const USE = "dvg_skill_use";
const MAYY_LIMIT = "dvg_skill_marklimit"; // 马友友的牌：每种牌名每回合限一次
const MAYY_MARK = "dvg_mayycard"; // 牌上的 gaintag

const HELPED = "dvg_helped"; // 「被帮助」标记
const CORRUPT_MARK = "dvg_corrupt"; // 「腐蚀」标记

/* ---------------------------------------------------------------- 工具函数 */

/** 找出场上的马友友 */
function findMayouyou() {
	try {
		return (game.players || []).find(p => p && p.name1 === MAYY || p?.name === MAYY) || null;
	} catch (e) {
		return null;
	}
}

/** 拥有「被帮助」标记的角色 */
function helpedPlayers() {
	try {
		return (game.players || []).filter(p => p && p.isAlive() && p.hasMark(HELPED));
	} catch (e) {
		return [];
	}
}

/** 判断是不是 D&G 本体。
 *  ⚠️ 不能用 game.players.find()！D&G 隐匿期间不在 game.players 里
 *  （只在 game.dead 里，为了收事件），那样会误判成"场上没有 D&G"，
 *  导致 D&G 用马友友的牌时被错误地加腐蚀。
 *  这里直接看角色名，不依赖任何玩家列表。
 */
function isDgPlayer(p) {
	try {
		if (!p) return false;
		return p.name1 === DG || p.name === DG || p.name2 === DG;
	} catch (e) {
		return false;
	}
}

/** 给某人 +1 枚腐蚀（带联机广播 + 刷新「被帮助」图标层数） */
function addCorrupt(p) {
	try {
		if (!p) return;
		game.broadcastAll((who, mark) => {
			try {
				if (!who) return;
				who.addMark(mark, 1, false);
			} catch (e) {}
		}, p, CORRUPT_MARK);
		lib.skill[CORRUPT].refreshMark(p);
	} catch (e) {}
}

const skills = {
	/* ============================================================ 隐匿 */
	// 三处参考的写法汇总：
	// 1) 「离场/入场」抄 REACGN 玛薇卡（REACGN/character/skill.js:5631 reacgn_yaosheng_init）
	//      player.out("原因") / player.in("原因") + forceOut: true
	// 2) 触发时机必须晚于「手气卡」。
	//      手气卡在 gameDraw 事件的 content 里处理（content.js:3179-3215）：
	//        gameStart ──► gameDraw（发牌 + 问手气卡）──► gameDrawEnd ──► phaseLoop
	//      所以要在 gameDrawEnd 触发，而不是 gameStart/enterGame（那两个都在发牌之前）。
	// 3) 「隐匿」的视觉在下面分两步：先暗置武将牌，再把节点移出游戏
	[HIDDEN]: {
		locked: true,
		forced: true,
		fixed: true,
		unique: true,
		charlotte: true,
		popup: false,
		silent: true,
		trigger: {
			player: ["enterGame"],
			global: ["gameDrawEnd", "gameStart"],
		},
		filter(event, player) {
			// 只处理 D&G 自己
			const self = player.name1 === DG || player.name === DG;
			if (!self) return false;
			// 只跑一次
			if (player.storage.dvg_hidden !== undefined) return false;
			// 关键：gameStart / enterGame 那次不做事（手气卡还没问完），必须等 gameDrawEnd。
			// _status.gameDrawed 由引擎在触发 gameDrawEnd 时置 true（gameEvent.js:428-430）。
			// 兜底：若环境里 gameDrawed 不可靠（如录像回放），则退到「第一回合且已开始」判定。
			const byDrawEnd =
				event.name === "gameDrawEnd" ||
				event.triggername === "gameDrawEnd" ||
				_status.gameDrawed === true;
			if (byDrawEnd) return true;
			// 兜底：已经进入回合循环（说明发牌+手气卡早就结束了）
			return (game.phaseNumber || 0) > 0 && (game.roundNumber || 0) <= 1;
		},
		async content(event, trigger, player) {
			player.storage.dvg_hidden = true;
			FX("hiddenStart", player);
			// 记录「应该在哪个轮次归来」。
			// ⚠️ 这里必须 +1，不能直接记当前轮次：
			//   gameDrawEnd 时 roundNumber 还是 0，而第一个角色一开局 roundNumber 就变 1
			//   （content.js:4035 在 phase 的第 2 步自增）。若记 0，条件 `1 > 0` 立刻成立，
			//   轮询 500ms 后马上把他拉回来 —— 这正是"移出后立马移回"的原因。
			//   记成 roundNumber+1 表示"下一轮才回来"。
			player.storage.dvg_hiddenRound = (game.roundNumber || 0) + 1;

			// ── 第一步：暗置武将牌（unseen + unseen_show → 显示未知武将背面图）──
			// 抄鸽府包 嘉豪 lib.element.player.gf_hideCharacter（gflib.js:5056）
			game.broadcastAll((p) => {
				if (!p || !p.node) return;
				try {
					game.hideCharacter(p, 0); // 引擎原生，加 unseen_v
				} catch (e) {}
				try {
					p.classList.add("unseen");
					if (!_status.video && get.mode() != "guozhan") p.classList.add("unseen_show");
				} catch (e) {}
				// 名字换成"未知"
				p.storage.dvg_rawName = p.storage.dvg_rawName || p.name;
				p.storage.dvg_rawSex = p.storage.dvg_rawSex || p.sex;
				p.storage.dvg_rawGroup = p.storage.dvg_rawGroup || p.group;
				p.name = "unknown";
				p.sex = "unknown";
				p.group = "unknown";
				// 技能暂时隐藏
				try {
					const own = (lib.character[p.name1]?.skills || []).filter((s) => p.skills.includes(s));
					if (!p.hiddenSkills) p.hiddenSkills = [];
					for (const s of own) {
						if (!p.hiddenSkills.includes(s)) p.hiddenSkills.push(s);
						const idx = p.skills.indexOf(s);
						if (idx >= 0) p.skills.splice(idx, 1);
						if (p.marks && p.marks[s]) {
							try {
								p.marks[s].delete();
							} catch (e) {}
							delete p.marks[s];
						}
					}
				} catch (e) {}
				// 侧边竖排名牌
				try {
					if (!p.node.name_seat && !_status.video) {
						p.node.name_seat = ui.create.div(".name.name_seat", get.verticalStr(get.translation(p.name)), p);
						p.node.name_seat.dataset.nature = get.groupnature(p.group);
					}
				} catch (e) {}
				try {
					p.update();
				} catch (e) {}
			}, player);
			game.log(player, "进入", "#g「隐匿」", "状态，武将牌已暗置");
			FX("hiddenOut", player);
			await FXWait(760, true);

			// 给一点时间让暗置动画/重绘完成，再进行第二步（delay 不存在时跳过，保证流程不中断）
			try {
				if (typeof game.delay === "function") await game.delay(0, 600);
			} catch (e) {}

			// ── 第二步：真正移出游戏（视觉上真消失、任何牌都指定不到他）──
			// 目标：① 画面上他的座位空出来  ② 所有牌（含南蛮/万箭等 AOE）都指定不到他
			//
			// 做法：手动完成 removePlayer 的关键步骤，但【不调 player.delete()】。
			// ⚠️ 为什么不能用 game.removePlayer：
			//    它内部会 player.delete()，把节点连同 handcards1/handcards2 等子节点一起销毁，
			//    导致归来后 restorePlayer 只是把"空壳"塞回 DOM —— 手牌就再也画不出来了。
			//
			// ★ 关键取舍（这次学到的）：只摘出节点，【其他一律不动】
			//   · 不重排任何人的 data-position
			//   · 不改 ui.arena.setNumber
			//   原因：之前的"把后续座位号 -1、再重建连续序列"那套，
			//   一旦期间有人死亡/加入就对不上，反而把全场位置搞乱。
			//   现在他原来的座位号一直留着（dvg_rawPosition），归来原样放回；
			//   别的人从头到尾没被碰过，所以绝不会错位。
			//   视觉结果：他的位置空出一格，其他人原地不动。
			try {
				game.broadcastAll((p) => {
					if (!p) return;
					try {
						// 记住原来的位置与内联样式，归来时还原
						p.storage.dvg_rawParent = p.parentNode || null;
						p.storage.dvg_rawStyle = p.getAttribute("style") || "";
						p.storage.dvg_rawPosition = p.dataset ? p.dataset.position : undefined;
						// 只摘出，不销毁（千万不要 delete()！）
						if (p.parentNode) p.parentNode.removeChild(p);
					} catch (e) {}
				}, player);
				// 从玩家列表移除 → 座次减少
				// ⚠️ 联机适配：这一步必须广播，否则其他客户端上他还留在 game.players 里，
				//    表现为"别人还能选他当目标""座次没减少"。
				game.broadcastAll((p) => {
					if (!p) return;
					try {
						game.players.remove(p);
					} catch (e) {
						game.players = game.players.filter((x) => x !== p);
					}
					// 标记已离场 → 所有牌都指定不到他
					// （library/index.js:11308 targetEnabled 第一行：target.removed → return false，
					//   所以放进 game.dead 也不会被任何牌选中，含南蛮/万箭等 AOE）
					p.removed = true;
					// ★ 关键：必须同时留在 game.dead 里！
					//   引擎的事件分发只遍历 game.players.concat(game.dead)（gameEvent.js:475），
					//   如果两边都不在，他身上所有技能（尤其「腐蚀」的 roundStart）都收不到事件。
					try {
						if (!game.dead.includes(p)) game.dead.push(p);
					} catch (e) {}
					// ★★ 同样关键：维护 _status.roundStart！
					//   引擎判定"新一轮开始"靠这一行（content.js:4030）：
					//       } else if (player == _status.roundStart) { isRound = true; }
					//   如果我们移出的正好是 _status.roundStart，他再也不会开始回合
					//   → isRound 永不成立 → roundStart 永不触发 → 「腐蚀」永远不加。
					//   引擎自己的 removePlayer（game/index.js:9476-9477）就是这么处理的。
					try {
						if (_status.roundStart === p) {
							_status.roundStart = p.next || p.getNext?.() || game.players[0] || game.dead[0];
						}
					} catch (e) {}
				}, player);
				// ★ 让座位紧凑：把「他之后」的在场角色座位号 -1，补上这个空洞。
				//   这样画面上不会留一个空格，别人会往前挪一格。
				//
				//   ⚠️ 只看 game.players（在场角色），绝对不碰 game.dead：
				//      game.dead 里既有真正死亡的角色，也有被我们临时塞进去的他本人，
				//      一起编号会互相干扰，这正是之前「位置错乱」的来源。
				//   此时他已经从 game.players 里移除了，所以循环里天然不会有他。
				game.broadcastAll((p) => {
					if (!p) return;
					// ★ 移出后同样把在场角色重排成连续 0..n-1。
					//   不能只做"他之后的人 -1"：如果隐匿之前已经有死亡留下的空洞，
					//   那样做只会把空洞留在别处，视觉上还是错位。
					//   统一重排是唯一能保证"任何情况下都连续"的做法。
					//   ⚠️ 只处理 game.players（在场角色），绝不碰 game.dead。
					try {
						const alive = (game.players || [])
							.filter((x) => x && x.dataset)
							.slice()
							.sort((a, b) => {
								const ap = parseInt(a.dataset.position);
								const bp = parseInt(b.dataset.position);
								return (isNaN(ap) ? 999 : ap) - (isNaN(bp) ? 999 : bp);
							});
						alive.forEach((x, i) => {
							try {
								x.dataset.position = i;
							} catch (e) {}
						});
					} catch (e) {}
					// 人数也同步（≤8 人时引擎走静态 CSS，靠 data-number 选布局）
					try {
						ui.arena.setNumber(game.players.length);
					} catch (e) {}
				}, player);
			} catch (e) {
				try {
					player.style.setProperty("visibility", "hidden", "important");
				} catch (e2) {}
			}
			game.log(player, "移出了游戏（位置已空出）");

			// ── 隐匿期间关掉手牌渲染 ──
			// 节点已被摘出 DOM，此时若还有人给他调 $draw（排队动画、五谷丰登等），
			// 会撞上 parentNode 为 null → Cannot read properties of null (reading 'appendChild')。
			// 隐匿期间他的手牌本来就不该显示，直接跳过整个 $draw 最省事；
			// 归来时 restore() 会按真实手牌重新铺一遍。
			try {
				if (!lib.element.player.__dvgDrawPatched) {
					const rawDraw = lib.element.player.$draw;
					lib.element.player.$draw = function (...args) {
						// 隐匿中 → 完全不做渲染（也不往下走，避免任何 appendChild）
						try {
							if (this && this.storage && this.storage.dvg_hidden === true) {
								return this;
							}
						} catch (e) {}
						return rawDraw.apply(this, args);
					};
					lib.element.player.__dvgDrawPatched = true;
				}
			} catch (e) {}

			// ── 启动「归来」轮询（因为技能触发已被移除，必须靠定时器）──
			try {
				lib.skill[RETURN].startPolling(player);
			} catch (e) {}

			// 移出后立刻触发「帮助」
			try {
				await lib.skill[HELP].askHelp(player);
			} catch (e) {}
		},
	},

	// 一个轮次后重新登场
	// ⚠️ 因为「移出游戏」用的是 game.removePlayer，玩家已不在 game.players 里，
	//    引擎的事件触发只遍历 game.players.concat(game.dead)（gameEvent.js:475），
	//    所以这里【不能靠 trigger】，必须用定时器轮询判断轮次。
	[RETURN]: {
		charlotte: true,
		forced: true,
		forceOut: true,
		fixed: true,
		// nopop：不显示在技能栏、不弹技能提示。
		// 它是「隐匿」的配套内部机制（一个轮次后归来），玩家不需要单独看到一个技能。
		// 功能完全保留：仍挂在 D&G 身上，trigger 作为轮询失败时的兜底，
		// startPolling / restore 都是模块级调用，不依赖显示。
		nopop: true,
		popup: false,
		silent: true,
		// 保留 trigger 作为万一时序兜底（正常情况下轮询会先命中）
		trigger: { global: "roundStart" },
		filter(event, player) {
			if (player.storage.dvg_hidden !== true) return false;
			// dvg_hiddenRound 记的是「隐匿发生时的轮次 + 1」。
			// 归来条件用 >（严格大于）：必须等到再下一个轮次，
			// 也就是「完整的过了一轮」——避免隐匿后立刻又回来。
			return (game.roundNumber || 0) > (player.storage.dvg_hiddenRound || 0);
		},
		async content(event, trigger, player) {
			await lib.skill[RETURN].restore(player);
		},

		/** 启动轮询：每 500ms 检查一次是否该归来
		 *  ⚠️ 联机适配：轮询是「游戏逻辑」，只能由房主（game.online 为 false 的一侧）驱动。
		 *  否则每个客户端都会各自跑一个 setInterval，各自调 restore，造成重复执行 / 状态错乱。
		 *  客户端靠 broadcastAll 收到的 DOM 变更来呈现，不自己跑定时器。
		 */
		startPolling(player) {
			// 联机客户端不启动轮询（只由房主推进）
			try {
				if (game.online) return;
			} catch (e) {}
			if (player.storage.dvg_pollId) {
				try {
					clearInterval(player.storage.dvg_pollId);
				} catch (e) {}
			}
			const check = async () => {
				try {
					// 已归来或已死亡则停止
					if (player.storage.dvg_hidden !== true) {
						if (player.storage.dvg_pollId) {
							clearInterval(player.storage.dvg_pollId);
							delete player.storage.dvg_pollId;
						}
						return;
					}
					// 必须等到再下一个轮次（dvg_hiddenRound = 隐匿时轮次 + 1，条件是严格大于）
					if ((game.roundNumber || 0) <= (player.storage.dvg_hiddenRound || 0)) return;
					// 停止轮询并执行归来
					if (player.storage.dvg_pollId) {
						clearInterval(player.storage.dvg_pollId);
						delete player.storage.dvg_pollId;
					}
					await lib.skill[RETURN].restore(player);
				} catch (e) {}
			};
			try {
				player.storage.dvg_pollId = setInterval(check, 500);
			} catch (e) {}
		},

		/** 真正执行「归来」 */
		async restore(player) {
			if (player.storage.dvg_hidden !== true) return;
			player.storage.dvg_hidden = false;

			// ── 第一步：把玩家加回游戏（座次恢复）──
			// 注意：节点当初只是从 arena 摘出、并没有销毁，所以这里原样插回即可，
			// 不用 game.restorePlayer（它假设节点已被 delete，会走重建路径）。
			// ⚠️ 联机适配：game.players 的增删属于纯客户端内存状态，
			//    broadcastAll 会把它同步到每个客户端（game.online 端不会重复执行）。
			game.broadcastAll((p) => {
				if (!p) return;
				try {
					if (!game.players.includes(p)) game.players.push(p);
					delete p.removed;
					// 隐匿期间他被临时放在了 game.dead 里（为了能收到事件），现在移出来
					try {
						game.dead.remove(p);
					} catch (e) {}
				} catch (e) {}
			}, player);
			game.broadcastAll((p) => {
				if (!p) return;
				try {
					// ① 插回 DOM（当初是从这里的父节点摘出去的）
					const parent = p.storage.dvg_rawParent || ui.arena;
					try {
						if (parent && p.parentNode !== parent) parent.appendChild(p);
						else if (!p.parentNode && ui.arena) ui.arena.appendChild(p);
					} catch (e) {}
					// ② 座位号：把他「原位置及之后」的在场角色 +1，腾出空位，他再坐回去。
					//   ⚠️ 只处理 game.players（他已经先被 push 回去了，但这里跳过自己），
					//      绝不碰 game.dead —— 那边混着真死的人，编号无意义且会互相干扰。
					//   这样无论隐匿期间人数怎么变，最终都是「0..n-1 连续、无重复」。
					if (p.storage.dvg_rawPosition !== undefined && p.dataset) {
						// ★ 归来时的座位号：直接按"当前在场人数"重排成连续序列 0..n-1。
						//
						// 为什么不能简单插回原位：
						//   隐匿期间可能有人死亡，引擎会让死亡角色保留原来的 data-position，
						//   于是场上会留出空洞（如 0,1,3）。此时如果只把他插回"原位置"，
						//   要么和别人撞号、要么让空洞更大 —— 这就是「死过人之后再登场会错乱」。
						//
						// 做法：把除他之外的所有在场角色按现有座位号排序，把他按原顺序插进去，
						//   再从头编号 0,1,2... 这样无论期间死没死人，结果一定是连续无重复。
						//   ⚠️ 只处理 game.players（在场角色），绝不碰 game.dead。
						try {
							const want = parseInt(p.storage.dvg_rawPosition);
							const others = (game.players || [])
								.filter((x) => x && x !== p && x.dataset)
								.slice()
								.sort((a, b) => {
									const ap = parseInt(a.dataset.position);
									const bp = parseInt(b.dataset.position);
									return (isNaN(ap) ? 999 : ap) - (isNaN(bp) ? 999 : bp);
								});
							// 插回"原位置"，但不超过人数上限
							const insertAt = isNaN(want) ? others.length : Math.max(0, Math.min(want, others.length));
							others.splice(insertAt, 0, p);
							others.forEach((x, i) => {
								try {
									x.dataset.position = i;
								} catch (e) {}
							});
						} catch (e) {
							try {
								p.dataset.position = p.storage.dvg_rawPosition;
							} catch (e2) {}
						}
					}
					delete p.storage.dvg_rawPosition;
					delete p.storage.dvg_rawParent;
					// ③ 摘掉任何残留的隐藏样式
					p.style.removeProperty("visibility");
					p.style.removeProperty("pointer-events");
					p.style.removeProperty("opacity");
					// ④ 还原原本的内联样式（里面含引擎算好的 left/top 等定位）
					if (p.storage.dvg_rawStyle !== undefined) {
						try {
							p.setAttribute("style", p.storage.dvg_rawStyle);
						} catch (e) {}
						delete p.storage.dvg_rawStyle;
						p.style.removeProperty("visibility");
						p.style.removeProperty("pointer-events");
						p.style.removeProperty("opacity");
					}
					try {
						if (p.dataset) delete p.dataset.dvgHidden;
					} catch (e) {}
				} catch (e) {}
			}, player);
			// 人数同步：用 setNumber 触发 ui.updatePlayerPositions。
			// 注意该函数在 ≤8 人时是【直接 return】的（ui/index.js:749），
			// 也就是只更新 data-number、不会重排任何人的位置 —— 正合我们需要。
			// 超过 8 人才会按人数重算动态样式，那时用的是 data-position，我们也已经排好了。
			try {
				ui.arena.setNumber(game.players.length);
			} catch (e) {
				try {
					ui.arena.dataset.number = game.players.length;
				} catch (e2) {}
			}

			// ── 第二步：恢复可见 + 取消暗置 ──
			game.broadcastAll((p) => {
				if (!p) return;
				try {
					p.style.removeProperty("visibility");
					p.style.removeProperty("pointer-events");
					p.style.removeProperty("opacity");
					delete p.dataset.dvgHidden;
					if (p.storage.dvg_rawStyle !== undefined) {
						p.setAttribute("style", p.storage.dvg_rawStyle);
						delete p.storage.dvg_rawStyle;
					}
				} catch (e) {}
				try {
					["unseen", "unseen2", "unseen_show", "unseen2_show", "unseen_v", "unseen2_v"].forEach((cls) => {
						p.classList.remove(cls);
					});
				} catch (e) {}
				try {
					if (p.storage.dvg_rawName) {
						p.name = p.storage.dvg_rawName;
						delete p.storage.dvg_rawName;
					}
					if (p.storage.dvg_rawSex) {
						p.sex = p.storage.dvg_rawSex;
						delete p.storage.dvg_rawSex;
					}
					if (p.storage.dvg_rawGroup) {
						p.group = p.storage.dvg_rawGroup;
						delete p.storage.dvg_rawGroup;
					}
				} catch (e) {}
				try {
					if (Array.isArray(p.hiddenSkills) && p.hiddenSkills.length) {
						for (const s of p.hiddenSkills.slice(0)) {
							if (!p.skills.includes(s)) p.skills.push(s);
						}
						p.hiddenSkills = [];
					}
				} catch (e) {}
				try {
					if (p.node && p.node.name_seat) {
						if (p.node.name_seat.delete) p.node.name_seat.delete();
						else p.node.name_seat.remove();
						delete p.node.name_seat;
					}
				} catch (e) {}
				try {
					p.update();
				} catch (e) {}
			}, player);
			// ★ 这里不调 game.arrangePlayers()。
			//   它除了维护 previous/next 链表，还会按 data-position 重排球员数组；
			//   而我们的座位号本来就是原样恢复的，一重排反而可能把他或别人挤到别处。
			//   链表关系在 restore 第一步 game.players.push 之后由引擎自己维护，
			//   这里不必再动。

			// ── 第三步：重新拉取手牌渲染（关键！）──
			// 隐匿期间 $draw 被整个跳过了，手牌区停留在"旧状态甚至空白"。
			// 归来时必须按【当前真实手牌】重新铺一遍，否则会出现「回来了但手牌不显示」。
			//
			// ⚠️ 联机适配：这段 DOM 操作必须广播！
			//   broadcastAll 的函数体会序列化发到每个客户端，所以：
			//     · 不能引用外部变量（player / get / lib 在客户端虽然也有，但不保证同名可闭包），
			//       数据一律通过参数传；
			//     · 传 playerid（数字），客户端用 lib.playerOL / game.playerMap 反查对应玩家对象；
			//     · 手牌用 player.getCards("h") 各端自己取 —— 牌对象无法序列化，也不该传。
			try {
				game.broadcastAll((playerid) => {
					// 各端自己找出这个玩家。
					// ⚠️ 注意两套索引的 key 不一样：
					//   · lib.playerOL  → key 是 playerid（game/index.js:1639）
					//   · game.playerMap → key 是 dataset.position（座位号，game/index.js:3345）
					//   所以优先用 playerOL，其次按 playerid 遍历，都找不到就放弃。
					let p = null;
					try {
						if (lib.playerOL && lib.playerOL[playerid]) p = lib.playerOL[playerid];
					} catch (e) {}
					if (!p) {
						try {
							p = (game.players || []).concat(game.dead || []).find((x) => x && x.playerid === playerid);
						} catch (e) {}
					}
					if (!p || !p.node) return;
					const h1 = p.node.handcards1;
					const h2 = p.node.handcards2;
					// ① 先把两个槽里现有的牌节点收起来（记下原本在哪个槽），再清空
					const exist1 = [];
					const exist2 = [];
					for (const [box, arr] of [[h1, exist1], [h2, exist2]]) {
						if (!box) continue;
						try {
							for (const n of Array.from(box.childNodes || [])) {
								if (!n) continue;
								arr.push(n);
								try {
									box.removeChild(n);
								} catch (e) {}
							}
						} catch (e) {}
					}
					// ② 用真实手牌；拿不到就退回刚才收集的 DOM 节点
					let hand = [];
					try {
						if (typeof p.getCards === "function") hand = Array.from(p.getCards("h") || []);
					} catch (e) {
						hand = [];
					}
					if (!hand.length) hand = exist1.concat(exist2);
					// ③ 分槽：能查到原槽就放回原槽；新牌才用 sort_card 判断
					let single = false;
					try {
						single = !!(get.is && get.is.singleHandcard && get.is.singleHandcard());
					} catch (e) {}
					const cards1 = [];
					const cards2 = [];
					for (const c of hand) {
						if (exist1.includes(c)) {
							cards1.push(c);
							continue;
						}
						if (exist2.includes(c)) {
							cards2.push(c);
							continue;
						}
						let sort = 0;
						try {
							sort = lib.config.sort_card(c);
						} catch (e) {
							sort = 0;
						}
						if (single || sort > 0) cards1.push(c);
						else cards2.push(c);
					}
					const place = (box, cards) => {
						if (!box || !cards.length) return;
						try {
							if (typeof box.prepend === "function") {
								box.prepend(...cards);
								return;
							}
						} catch (e) {}
						try {
							if (typeof box.insertBefore === "function" && box.firstChild) {
								for (let i = cards.length - 1; i >= 0; i--) {
									box.insertBefore(cards[i], box.firstChild);
								}
								return;
							}
						} catch (e) {}
						for (const c of cards) {
							try {
								box.appendChild(c);
							} catch (e) {}
						}
						try {
							void box.offsetWidth; // 强制回流
						} catch (e) {}
					};
					place(h1, cards1);
					place(h2, cards2);
				}, player.playerid);
			} catch (e) {}
			// 再走一次引擎的界面刷新
			try {
				player.update();
			} catch (e) {}
			try {
				if (typeof ui.updatehl === "function") ui.updatehl();
			} catch (e) {}

			FX("returnBack", player);
			game.log(player, "从", "#g「隐匿」", "中重新登场（座次已恢复）");
		},
	},

	/* ============================================================ 帮助 */
	[HELP]: {
		locked: true,
		forced: true,
		popup: false,
		silent: true,
		// 不再挂 trigger——询问时机改由「隐匿」的 content 在游戏开始时主动调用 askHelp()。
		// （原写法 trigger: player:phaseZhunbei 会拖到自己的回合才问，不符合"游戏开始时"）
		trigger: { global: "gameStart" },
		filter(event, player) {
			// 兜底：如果隐匿因故没触发，这里补一次（但不会重复，因为有 dvg_helpDone）
			const self = player.name1 === DG || player.name === DG;
			return self && player.storage.dvg_helpDone !== true;
		},
		async content(event, trigger, player) {
			await lib.skill[HELP].askHelp(player);
		},
		// 单独抽出询问逻辑，供隐匿技能直接调用
		async askHelp(player) {
			if (player.storage.dvg_helpDone === true) return;
			player.storage.dvg_helpDone = true;
			// D&G 本体【有】「被帮助」标记，但这个标记对他不显示图标
			// （by design：帮主自己不需要那个图标，但规则上他算"被帮助"）
			// ⚠️ 联机适配：addSkill / addMark 都是纯客户端内存状态，必须广播
			game.broadcastAll((p, helped) => {
				try {
					if (!p) return;
					if (!p.hasMark(helped)) p.addMark(helped, 1, false);
					// 注意：不调 markSkill，所以不显示图标
					// dvg_skill_ask 已停用（改为虚拟牌直接可用），不再授予。
					// dvg_skill_borrow_reset 仍需要（每回合清记录）。
					for (const s of ["dvg_skill_use", "dvg_skill_borrow", "dvg_skill_borrow_reset", "dvg_skill_marklimit"]) {
						if (!p.hasSkill(s)) p.addSkill(s);
					}
				} catch (e) {}
			}, player, HELPED);
			// 依次询问每名其他角色（活的、在场的）
			const targets = (game.players || []).filter(p => p && p !== player && p.isAlive() && p.isIn());
			for (const target of targets) {
				FX("helpAsk", player, target);
				await FXWait(320, true);
				const result = await target
					.chooseBool(`D&G 询问：是否接受〖帮助〗？`, `接受后将获得「被帮助」标记，并可与「${get.poptip(MAYY)}」互动。`)
					.set("ai", () => {
						// AI：血少/牌少时接受
						const p = get.player();
						return p.hp <= 2 || p.countCards("h") <= 1;
					})
					.forResult();
				if (result.bool) {
					player.line(target, "green");
					// ⚠️ 联机适配：标记与技能都要广播
					game.broadcastAll((t, helped) => {
						try {
							if (!t) return;
							t.addMark(helped, 1, false);
							// ★ 必须 addSkill(helped)！
							//   HELPED 上挂着 mod.maxHandcard（腐蚀扣手牌上限），
							//   而 checkMod 只遍历玩家【身上真正挂着的技能】
							//   （player.js:5426 getModableSkills → getSkills → this.skills）。
							//   之前只 addMark 不 addSkill，所以 mod 从来不会被调用，
							//   表现就是「腐蚀扣手牌上限实际不扣」。
							if (!t.hasSkill(helped)) t.addSkill(helped);
							t.markSkill(helped);
							// dvg_skill_ask 已停用（虚拟牌可直接使用），不再授予。
							for (const s of ["dvg_skill_use", "dvg_skill_borrow", "dvg_skill_borrow_reset", "dvg_skill_marklimit", "dvg_skill_give", "dvg_skill_discard_to_mayouyou"]) {
								if (!t.hasSkill(s)) t.addSkill(s);
							}
						} catch (e) {}
					}, target, HELPED);
					game.log(target, "接受了", player, "的", "#g「帮助」");
					FX("helped", target);
				} else {
					FX("declined", target);
				}
			}
			// 询问结束 → 召唤马友友
			try {
				await lib.skill[MAYOUYOU].summon(player);
			} catch (e) {}
		},
	},

	/* ============================================================ 马友友 */
	[MAYOUYOU]: {
		locked: true,
		forced: true,
		popup: false,
		silent: true,
		// 召唤马友友：作为独立武将登场于 D&G 的上家位置
		async summon(player) {
			if (findMayouyou()) return; // 已存在
			FX("summon", player);
			await FXWait(1250, true);
			try {
				// 「上家」= 玩家座位顺序里的前一位。引擎里 previous 就是上家；
				// addPlayerOL(target, char, char2, isNext)：isNext=false 表示插在 target 之前，
				// 因此把 target 设为 player 自己、isNext 设为 false，马友友就落在 player 的上家位。
				const mayouyou = await game.addPlayerOL(player, MAYY, null, false, {
					animate: false,
				});
				if (mayouyou) {
					// ⚠️ 联机适配：storage / addSkill 都要广播
					game.broadcastAll((my, corruptSkill) => {
						try {
							if (!my) return;
							my.storage.dvg_isMayouyou = true;
							my.addSkill("dvg_skill_mayouyou_core");
							// ★ 显式补挂「腐蚀」计时器。
							//   虽然 [MAYY].skills 里已经声明了，但不同版本的 addPlayerOL
							//   对角色定义 skills 的应用时机不完全一致，这里再兜一次，
							//   保证马友友一登场就带着腐蚀技能（否则整局都不会加腐蚀）。
							if (corruptSkill && !my.hasSkill(corruptSkill)) my.addSkill(corruptSkill);
						} catch (e) {}
					}, mayouyou, CORRUPT);
					game.log("#g「马友友」", "登场了");
					// ══════════════════════════════════════════════════════════
					// ★ 修正座位重叠。
					//   引擎 addPlayerOL 的位置算法（game/index.js:10002-10005）：
					//     position = target.dataset.position;   // isNext=false
					//     if (position == 0) position = setNumber后的人数 - 1;
					//   当 D&G 坐在 0 号位时，这里会绕到"最后一位"，
					//   而 setNumber 已经先 +1 了，导致算出来的位置和 D&G 自己撞上 ——
					//   表现就是马友友的将框压在 D&G 身上（截图里的重叠）。
					//   修法：召唤完把在场角色按现顺序重新编号成 0..n-1，保证连续不重叠。
					//   ⚠️ 只处理 game.players，不碰 game.dead。
					// ══════════════════════════════════════════════════════════
					game.broadcastAll(() => {
						try {
							const alive = (game.players || [])
								.filter((x) => x && x.dataset)
								.slice()
								.sort((a, b) => {
									const ap = parseInt(a.dataset.position);
									const bp = parseInt(b.dataset.position);
									return (isNaN(ap) ? 999 : ap) - (isNaN(bp) ? 999 : bp);
								});
							alive.forEach((x, i) => {
								try {
									x.dataset.position = i;
								} catch (e) {}
							});
							ui.arena.setNumber(alive.length);
							game.arrangePlayers();
						} catch (e) {}
					});
					// 初始把手牌搬进「扩展区」（这批牌才是共享的正本）
					// 注意：召唤时马友友可能还没摸牌（hand 为空），所以后面摸牌时还会再搬。
					try {
						await lib.skill[MAYOUYOU].moveHandToExpansion(mayouyou);
					} catch (e) {}
					// 再给所有被帮助者铺一份虚拟牌
					try {
						lib.skill[MAYY_LIMIT].syncToAll();
					} catch (e) {}
				}
			} catch (e) {
				console.log("召唤马友友失败", e);
			}
		},

		/** 马友友手牌变动后，刷新所有人的虚拟牌 */
		async moveHandToExpansion(player) {
			// ⚠️ 名字保留（调用处不变），但内部不再搬去扩展区 ——
			// 实测 addToExpansion 在本环境始终为 0，改用「真牌=手牌，假牌=s区」方案。
			try {
				lib.skill[MAYY_LIMIT].syncToAll();
			} catch (e) {}
		},

		/** D&G 死亡时带走马友友 */
		async killMayouyou(player) {
			const my = findMayouyou();
			if (!my) return;
			try {
				FX("mayouyouGone", my);
				game.log("#g「马友友」", "随着 D&G 一同消失了");
				// ★ 第一步就清空所有人手里的虚拟牌（不含马友友本体，它自己稍后处理）。
				//   必须放在致死之前：万一 die() 抛错走到 catch，
				//   至少别人手上的幽灵牌已经清掉了。
				try {
					lib.skill[MAYY_LIMIT].clearAllFakeCards();
				} catch (e) {}
				// 先强制致死（它本身有「不会死亡」的技能，所以要先摘掉）
				// ⚠️ 联机适配：removeSkill 要广播
				game.broadcastAll((p) => {
					try {
						if (!p) return;
						p.removeSkill("dvg_skill_mayouyou_core");
						p.removeSkill(["dvg_mayouyou_immortal", "dvg_mayouyou_heal", "dvg_mayouyou_damage", "dvg_mayouyou_skip", "dvg_mayouyou_noreply"]);
					} catch (e) {}
				}, my);
				try {
					// 联机适配：hp 属于纯客户端状态，必须广播
					game.broadcastAll((p) => {
						if (!p) return;
						p.hp = 0;
						try {
							p.update();
						} catch (e) {}
					}, my);
				} catch (e) {}
				// 走引擎的死亡流程
				try {
					await my.die();
				} catch (e) {
					// 兜底：直接判死
					try {
						my.die();
					} catch (e2) {}
				}
				// 再兜一层：如果还没死，强制移出
				try {
					if (!my.isDead()) {
						my.classList.add("dead");
						if (my.parentNode) {
							try {
								game.removePlayer(my);
							} catch (e) {
								my.parentNode.removeChild(my);
							}
						}
					}
				} catch (e) {}
			} catch (e) {}
		},


	},

	/* ==================================== 马友友本体（挂在召唤物身上） */
	dvg_skill_mayouyou_core: {
		locked: true,
		forced: true,
		// 1) 每个角色的回合开始 → 回满
		// 2) 受伤摸两张
		// 3) 跳过出牌/弃牌，改为摸牌
		// 4) 不濒死不死
		charlotte: true,
		group: ["dvg_mayouyou_heal", "dvg_mayouyou_damage", "dvg_mayouyou_skip", "dvg_mayouyou_immortal", "dvg_mayouyou_noreply"],
	},

	// 每个角色回合开始回满
	dvg_mayouyou_heal: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { global: "phaseBegin" },
		async content(event, trigger, player) {
			if (!player.storage.dvg_isMayouyou) return;
			FX("heal", player);
			if (player.hp < player.maxHp) {
				await player.recover(player.maxHp - player.hp);
			}
			if (player.hp <= 0) {
				// 联机适配：hp 需广播
				game.broadcastAll((p) => {
					if (!p || p.hp > 0) return;
					p.hp = 1;
					try {
						p.update();
					} catch (e) {}
				}, player);
			}
		},
	},

	// 受伤摸两张
	dvg_mayouyou_damage: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "damageEnd" },
		async content(event, trigger, player) {
			if (!player.storage.dvg_isMayouyou) return;
			FX("damageDraw", player, 2);
			await player.draw(2);
			// 摸到的牌搬进扩展区（共享正本）
			try {
				await lib.skill[MAYOUYOU].moveHandToExpansion(player);
			} catch (e) {}
		},
	},

	// 跳过出牌/弃牌阶段，各改为一个摸牌阶段
	dvg_mayouyou_skip: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: ["phaseUseBegin", "phaseDiscardBegin"] },
		async content(event, trigger, player) {
			if (!player.storage.dvg_isMayouyou) return;
			trigger.cancel();
			// 阶段名在 trigger.name 上（engine 把 triggername 挂在 trigger 事件，而不是技能 event）
			const isUse = trigger.name === "phaseUseBegin";
			FX("skipPhase", player, isUse);
			game.log(player, "跳过了", isUse ? "出牌阶段" : "弃牌阶段", "，改为摸牌");
			await player.draw(2);
			// 摸到的牌搬进扩展区（共享正本）
			try {
				await lib.skill[MAYOUYOU].moveHandToExpansion(player);
			} catch (e) {}
		},
	},

	// 不进入濒死、不死亡（体力停在 0）
	dvg_mayouyou_immortal: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "dying" },
		async content(event, trigger, player) {
			if (!player.storage.dvg_isMayouyou) return;
			FX("immortal", player);
			// 取消濒死，体力拉到 1 以上以便继续存活（但显示停在 0 由后续回血处理）
			trigger.cancel?.();
			event.cancel?.();
			if (player.hp < 1) {
				// 联机适配：hp 需广播
				game.broadcastAll((p) => {
					if (!p || p.hp >= 1) return;
					p.hp = 1;
					try {
						p.update();
					} catch (e) {}
				}, player);
			}
		},
	},

	// 马友友：需要「响应」时能取消就取消（不主动出闪/杀/无懈）
	// 设计：马友友无法自己使用任何牌，被要求打出/响应时直接放弃。
	// 拦截点用 chooseToRespondBefore —— 这是引擎在执行「请打出一张牌」之前触发的钩子，
	// firstDo + 高优先级确保在其它响应类技能之前抢先放弃。
	dvg_mayouyou_noreply: {
		charlotte: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		priority: 100,
		// ═══════════════════════════════════════════════════════════════
		// ★ 最可靠的一层：AI 标签。让引擎【根本不问】它要不要出杀/闪/无懈。
		//
		// 引擎 hasSkillTag（player.js:13369）读的就是 info.ai[tag]：
		//   · 若 ai[tag] === true           → 无条件算"有该标签"
		//   · 若 ai[tag] 是具体值           → 要求 ai[tag] == 调用时传的 arg 才算
		//
		// 各类卡牌的询问条件（对照源码）：
		//   【南蛮入侵】card/standard.js:1262  hasSkillTag("noSha",  null, "respond")
		//   【决斗】  / 【借刀杀人】           同样查 noSha("respond")
		//   【杀】    / 【万箭齐发】           查 noShan("respond")
		//   【无懈可击】                       查 noWuxie("respond")
		//
		// 所以这里直接声明这三个标签为 "respond"。
		// 比起在 chooseToRespondBefore 里改 result 更底层、更可靠 ——
		// 引擎在"要不要询问"这一步就把马友友排除了，后面自然不会有响应。
		// ═══════════════════════════════════════════════════════════════
		ai: {
			// ⚠️ 注意 hasSkillTag 的匹配规则（player.js:13369-13383）：
			//   · ai[tag] === true  → 无条件命中
			//   · ai[tag] 是具体值  → 只有 ai[tag] == 调用时的 arg 才命中
			// 而各处调用传的 arg 并不统一（"respond" / "use" / undefined），
			// 所以这里用 true（无条件命中）最稳。配合 skillTagFilter 限定只对马友友生效。
			skillTagFilter(player, tag, arg) {
				// 只管马友友；其他角色一律不受影响
				return !!(player && player.storage && player.storage.dvg_isMayouyou);
			},
			noSha: true,
			noShan: true,
			noWuxie: true,
			// 濒死求桃必须能响应，所以不给 noTao
		},
		trigger: { player: ["chooseToRespondBefore", "chooseToUseBefore"] },
		filter(event, player) {
			// 只管马友友自己
			if (!player.storage.dvg_isMayouyou) return false;
			// 已经响应过了就不再干预
			if (event.responded) return false;
			// 濒死求桃这类「必须给个答复」的流程不能硬取消，否则会卡住
			try {
				if (event.getParent && event.getParent("_save")) return false;
			} catch (e) {}
			// 强制响应（forced）也不拦
			if (event.forced) return false;
			// ① 主动出牌阶段（chooseToUse）：马友友本来就不能出牌，直接放弃
			if (event.name === "chooseToUse" || event.triggername === "chooseToUseBefore") {
				return true;
			}
			// ★ 关键闸门：只有「响应类」事件才继续往下判断。
			//   表达方式刻意放宽 —— 引擎里这个事件在不同版本/不同卡牌下，
			//   name 可能是 "chooseToRespond"、也可能只靠 triggername 标识，
			//   还可能因为技能包装而变成空串。这里用"排除法"：
			//   只要是明确的非响应事件就放行，其余一律往下判断。
			//   （之前用的是"白名单"，一旦真实事件名不在白名单里就直接 return false，
			//     导致南蛮入侵这类卡没被拦住 —— 这是实际踩到的坑。）
			const evName = String(event.name || "");
			const trgName = String(event.triggername || "");
			const sig = evName + "|" + trgName;
			// 明确的非响应事件 → 直接放行（弃牌、选牌、拼点等）
			if (/chooseToDiscard|chooseToCard|chooseToGain|chooseToPindian|chooseToCompare|chooseToMove|chooseToPlace|showCards/.test(sig)) {
				return false;
			}
			// 明确的非响应行为 → 放行
			if (/chooseToUse(?!.*Respond)/.test(evName) && evName !== "chooseToRespond") return false;
			// ② 响应阶段：只对「出闪 / 出杀 / 出无懈可击」装死不响应。
			//
			//  ⚠️ 判断依据换成引擎官方的响应映射表 lib.respondMap（library/index.js:924）：
			//       sha:["shan"]  wanjian:["shan"]  juedou:["sha"]  nanman:["sha"]
			//       jiedao:["sha"]  trick:["wuxie"]  ...
			//     语义是"这张牌需要用什么来响应"。
			//     顺着父事件找到正在结算的那张牌（如【杀】），查表得到需要【闪】，
			//     若需要的是 闪/杀/无懈 三者之一 → 装死不出。
			//
			//  为什么不用旧办法：拿 {name:"shan"} 去试 filterCard 经常通不过
			//  （filterCard 还要校验这张牌是否真在他手里），探测失败就落到"保守放行"，
			//  结果他还是照常出闪 —— 这就是之前"设置了却还在出"的原因。
			const LAZY = ["shan", "sha", "wuxie"];
			try {
				let evt = event;
				let depth = 0;
				while (evt && depth++ < 12) {
					const cs = evt.cards || (evt.card ? [evt.card] : null);
					if (cs && cs.length) {
						for (const c of cs) {
							let nm = "";
							try {
								nm = get.name(c) || (c && c.name);
							} catch (e) {
								nm = c && c.name;
							}
							if (!nm) continue;
							// 查表：这张牌需要什么响应
							let need = null;
							try {
								if (lib.respondMap && lib.respondMap[nm]) need = lib.respondMap[nm];
							} catch (e) {}
							if (Array.isArray(need) && need.some((x) => LAZY.includes(x))) return true;
						}
					}
					evt = evt.parent;
				}
				// 兜底一：拿他手里的真实牌去试 filterCard（比裸对象可靠）
				const fc = event.filterCard;
				if (typeof fc === "function") {
					let own = [];
					try {
						own = Array.from(player.getCards("h") || []);
					} catch (e) {
						own = [];
					}
					for (const card of own) {
						let nm = "";
						try {
							nm = get.name(card) || (card && card.name);
						} catch (e) {
							nm = card && card.name;
						}
						if (!LAZY.includes(nm)) continue;
						try {
							if (fc(card, player, event)) return true;
						} catch (e) {}
					}
				}
				// 兜底二：从提示语认（引擎提示语固定，如「请使用一张闪响应杀」）
				const txt = String(event.prompt || "") + String(event.prompt2 || "");
				if (txt && /闪|无懈可击/.test(txt) && !/桃/.test(txt)) return true;
			} catch (e) {}
			// 判断不了就保守放行，宁可响应也别卡流程
			return false;
		},
		async content(event, trigger, player) {
			// 把结果设为「不响应」，并结束这个选择事件，让流程继续往下走。
			// 注意：先设 result 再 finish —— 只 finish 不设 result 会让后续读到 undefined。
			try {
				trigger.result = { bool: false };
				// 有些事件带 responded 标记，一并清掉避免误判为"已响应"
				if (trigger.responded !== undefined) trigger.responded = false;
			} catch (e) {}
			try {
				trigger.finish?.();
			} catch (e) {}
			FX("noreply", player);
			game.log(player, "放弃了响应（闪/杀/无懈）");
		},
	},

	/* ============================================================ 同归 */
	// D&G 死亡时带走马友友
	// 用 dieBegin（死亡流程刚开始，还没结算胜负），此时把马友友一起弄死，
	// 这样他也算"已死亡"，不会在 D&G 死后残留影响结算。
	dvg_skill_takedown: {
		locked: true,
		forced: true,
		// ⚠️ 必须 forceOut：D&G 隐匿期间 removed = true，
		// 没有 forceOut 的技能会被 filterTrigger（library/index.js:10734）拦掉，
		// 导致「隐匿期间死亡时带不走马友友」。
		forceOut: true,
		forceDie: true,
		popup: false,
		silent: true,
		firstDo: true,
		trigger: { player: "dieBegin" },
		filter(event, player) {
			// 自己死 + 场上还有马友友
			return !!findMayouyou();
		},
		async content(event, trigger, player) {
			FX("takedown", player);
			await FXWait(620, true);
			await lib.skill[MAYOUYOU].killMayouyou(player);
		},
	},

	/* ============================================================ 腐蚀 */
	// ★★ 现在挂在【马友友】身上（不是 D&G）。
	// 原因：这个技能只在 roundStart 干活，而 D&G 隐匿期间会被 removed / 移出 game.players，
	// 导致三层障碍（事件分发 / filterTrigger 的 forceOut / _status.roundStart 轮次推进），
	// 每修一层还有下一层，非常容易漏。马友友从登场到结束都稳定在场，
	// 把它当"腐蚀计时器"就完全绕开了这三层问题。
	//
	// 谁被加腐蚀由 content 自己扫全场决定（找带 HELPED 标记的非 D&G 角色），
	// 与"谁在触发"无关，所以挂给谁都能正确工作。
	[CORRUPT]: {
		locked: true,
		forced: true,
		popup: false,
		silent: true,
		// ① roundStart：所有被帮助者 +1 腐蚀
		// ② phaseEnd（整个回合结束）：每 5 枚腐蚀，流失 1 点体力
		//    ⚠️ phaseEnd 每个【阶段】结束都会触发，必须用 event.name === "phase" 限定，
		//       否则一个回合会掉 6 次血。引擎里 phase 事件代表"一整个回合"：
		//       content.js:4241 触发 phaseEnd，6437 处官方技能同样用 event2.name == "phase" 判定。
		trigger: { global: ["roundStart", "phaseEnd"] },
		filter(event, player) {
			// 只有马友友身上这份才生效，避免（旧存档/误挂）别处也有一份导致重复加
			if (!player.storage.dvg_isMayouyou) return false;
			// 回合结束那次：必须是一整个回合结束（event.name === "phase"），且有回合角色
			if (event.name === "phaseEnd" || event.triggername === "phaseEnd") {
				return event.name === "phase" && !!event.player;
			}
			return true;
		},
		async content(event, trigger, player) {
			// ── 分支 A：回合结束 → 腐蚀 ≥5 则流失体力 ──
			if (trigger && trigger.name === "phase") {
				const who = trigger.player;
				if (!who || !who.isAlive()) return;
				// 只算「被帮助且非 D&G」的角色（与腐蚀获得规则一致）
				if (!who.hasMark(HELPED) || isDgPlayer(who)) return;
				const num = who.countMark(CORRUPT_MARK) || 0;
				const times = Math.floor(num / 5);
				if (times <= 0) return;
				FX("corruptDamage", who, times);
				game.log(who, "因", "#g「腐蚀」", "流失", get.cnNumber(times), "点体力");
				try {
					await who.loseHp(times);
				} catch (e) {
					// 兜底：loseHp 不可用时直接扣血
					try {
						who.hp = Math.max(0, (who.hp || 0) - times);
						who.update();
					} catch (e2) {}
				}
				return;
			}
			// ── 分支 B：每轮开始 → 所有被帮助者 +1 腐蚀 ──
			// 扫全场（players + dead），把所有「被帮助且非 D&G」的角色 +1 腐蚀。
			// 不依赖触发者是谁，也不受 D&G 隐匿影响。
			const all = [];
			try {
				for (const p of [...(game.players || []), ...(game.dead || [])]) {
					if (!p) continue;
					if (all.includes(p)) continue;
					all.push(p);
				}
			} catch (e) {}
			let count = 0;
			for (const p of all) {
				if (!p) continue;
				// 只给「被帮助」且没死的人加
				if (!p.isAlive() || !p.hasMark(HELPED)) continue;
				// D&G 自己虽然也带「被帮助」标记，但按设计不吃腐蚀
				if (isDgPlayer(p)) continue;
				addCorrupt(p);
				FX("corruptGain", p, 1);
				count++;
			}
			if (count > 0) {
				FX("corruptWave", count);
				game.log("#g「马友友」", "的「腐蚀」发作了：", count, "名被帮助者各 +1 枚");
			}
		},
		/** 刷新「被帮助」图标，并清掉可能残留的「腐蚀」独立图标 */
		refreshMark(p) {
			try {
				// 清掉历史残留的腐蚀图标（旧版本可能生成过）
				if (p.marks && p.marks[CORRUPT_MARK]) {
					try {
						p.marks[CORRUPT_MARK].delete();
					} catch (e) {
						try {
							p.marks[CORRUPT_MARK].remove();
						} catch (e2) {}
					}
					delete p.marks[CORRUPT_MARK];
				}
				// 刷新帮助标记（图标上的数字会跟着 markcount 更新）
				if (p.hasMark(HELPED)) {
					p.markSkill(HELPED);
					// 触发一次 updateMark 让层数重新计算
					if (typeof p.updateMark === "function") p.updateMark(HELPED, true);
				}
			} catch (e) {}
		},
	},

	// 腐蚀（改为纯数据，不再单独显示图标 —— 已合并进「被帮助」标记里）
	// 仍然保留这个技能定义，因为：
	//   ① storage[CORRUPT_MARK] 需要它来计数（countMark 依赖 lib.skill 里有定义）
	//   ② 通过 marktext 在「被帮助」图标上叠加腐蚀层数
	[CORRUPT_MARK]: {
		charlotte: true,
		// ⚠️ 关键：这里【不能有 intro，也不能有 mark】。
		// 引擎的 updateMark（player.js:4685）里：
		//     if (lib.skill[i].intro && (this.storage[i] || lib.skill[i].intro.markcount))
		//         this.markSkill(i);   ← 只要有 intro + storage 有值，就会自动生成图标
		// 所以之前虽然没设 mark:true，腐蚀还是单独显示成了一个图标。
		// 现在只把它当作纯数据（storage[CORRUPT_MARK] 计数），显示完全交给「被帮助」标记。
		//
		// ⚠️ 注意：mod 不能放这里！checkMod 只遍历玩家【身上挂着】的技能
		// （player.js:5426 getModableSkills → getSkills → this.skills），
		// 而腐蚀只是纯数据，没挂在身上，mod 永远不会被调用。
		// 所以「每 2 枚腐蚀 -1 手牌上限」的效果写在 HELPED 的 mod 里。
	},

	// 「被帮助」标记本体（合并了原「腐蚀」标记：显示为「帮·腐 N」）
	// 说明：原来 HELPED 和 CORRUPT_MARK 是两个独立标记，显示成两个图标太占地方，
	// 现在统一挂在 HELPED 上：storage[HELPED] 记"是否被帮助"，
	// 腐蚀层数另外记在 storage[CORRUPT_MARK]（数值仍可通过 countMark(CORRUPT_MARK) 读）。
	[HELPED]: {
		charlotte: true,
		mark: true,
		marktext: "帮",
		// 腐蚀的负面效果：每 2 枚「腐蚀」减少 1 点手牌上限（向下取整，最低 0）
		// 放在这里而不是 CORRUPT_MARK 上，因为 checkMod 只遍历玩家身上挂着的技能
		// （player.js:5426 getModableSkills → getSkills → this.skills），
		// 而 HELPED 是真正 addSkill 上去的，CORRUPT_MARK 只是纯数据。
		mod: {
			maxHandcard(player, num) {
				try {
					const n = player.countMark(CORRUPT_MARK) || 0;
					const minus = Math.floor(n / 2);
					if (minus > 0) return Math.max(0, num - minus);
				} catch (e) {}
				return num;
			},
		},
		// 让图标上实时显示腐蚀层数
		intro: {
			markcount(storage, player) {
				try {
					return player ? player.countMark(CORRUPT_MARK) : 0;
				} catch (e) {
					return 0;
				}
			},
			content(storage, player) {
				const n = player ? player.countMark(CORRUPT_MARK) : 0;
				const minus = Math.floor(n / 2);
				const lose = Math.floor(n / 5);
				const limitNow = player ? player.getHandcardLimit() : 0;
				return (
					"你接受了 D&G 的「帮助」。<br>" +
					"①每回合每种类型的「马友友」手牌，你可以使用或打出 1 张。<br>" +
					"②回合结束时须将一张手牌置于「马友友」的手牌区。<br>" +
					"③弃牌阶段弃置的牌置入「马友友」的手牌区。<br>" +
					"④<b>腐蚀</b>：每轮 +1 枚；<b>每次使用马友友的牌再 +1 枚</b>。<br>" +
					"⑤每 2 枚「腐蚀」使你手牌上限 -1。<br>" +
					"⑥每 5 枚「腐蚀」使你在自己的回合结束时流失 1 点体力。<br>" +
					"当前<b>腐蚀</b>：" + n + " 枚（手牌上限 -" + minus + "，现为 " + limitNow + "；回合结束流失 " + lose + " 点体力）。"
				);
			},
		},
	},

	/* ===================================== D&G：把马友友的手牌当自己的手牌用 */
	// 参考 REACGN 的 reacgn_Polyxia_shiyin.reacgn（skill.js:2616）：
	// 核心手法是——别人手牌也能出现在"选牌"里，靠的是自己构造 vcard 列表
	// 用 chooseButton 选，选完按 suit/number/name 反查回真实牌；
	// 最后直接写 trigger.result / trigger.responded 让引擎接受这次响应。
	dvg_skill_use: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		priority: 95,
		trigger: { player: ["chooseToRespondBefore", "chooseToUseBefore"] },
		// 找出马友友手里"能满足当前这个事件"的牌
		getUsableCards(player, event) {
			const my = findMayouyou();
			if (!my || my === player) return [];
			if (!my.isIn || !my.isIn()) return [];
			const list = [];
			for (const card of my.getCards("h") || []) {
				try {
					// 构造这张牌的「虚拟牌」形态，再交给事件的 filterCard 判定。
					// autoViewAs 在极少数环境下可能不可用，做多重回退。
					let vc = card;
					try {
						if (typeof get.autoViewAs === "function") {
							vc = get.autoViewAs({ name: get.name(card), cards: [card] }, [card]);
						} else {
							vc = { name: get.name(card), cards: [card], isCard: true, suit: card.suit, number: card.number };
						}
					} catch (e) {
						vc = { name: get.name(card), cards: [card], isCard: true, suit: card.suit, number: card.number };
					}
					// 没有 filterCard 就认为可用
					if (typeof event.filterCard !== "function") {
						list.push(card);
						continue;
					}
					if (event.filterCard(vc, player, event)) {
						list.push(card);
						continue;
					}
					// 有些事件的 filterCard 只认真实牌对象，再试一次
					if (event.filterCard(card, player, event)) {
						list.push(card);
					}
				} catch (e) {}
			}
			return list;
		},
		filter(event, player) {
			if (event.responded) return false;
			// 濒死求桃这类硬流程不插
			try {
				if (event.getParent && event.getParent("_save")) return false;
			} catch (e) {}
			return lib.skill[USE].getUsableCards(player, event).length > 0;
		},
		async content(event, trigger, player) {
			const my = findMayouyou();
			const cards = lib.skill[USE].getUsableCards(player, trigger);
			if (!my || !cards.length) return;

			// 用 vcard 列表让玩家从"马友友的手牌"里选
			const list = cards.map((c) => [c.suit, c.number, c.name, c.nature]);
			const result = await player
				.chooseButton(["从「马友友」的手牌中选择一张使用", [list, "vcard"]], true)
				.set("ai", () => 0)
				.forResult();
			if (!result || !result.bool || !result.links || !result.links.length) return;
			const link = result.links[0];

			// 按属性反查回真实牌
			let card = null;
			for (const c of my.getCards("h") || []) {
				if (c.name == link[2] && c.suit == link[0] && c.number == link[1]) {
					card = c;
					break;
				}
			}
			if (!card) return;

			// 记录借用的牌名（每回合每种牌名限一次）
			const nm = get.name(card);
			if (!Array.isArray(player.storage.dvg_borrowNames)) player.storage.dvg_borrowNames = [];
			if (player.storage.dvg_borrowNames.includes(nm)) return;
			player.storage.dvg_borrowNames.push(nm);

			// 马友友失去这张牌（真正移交），再由玩家获得
			try {
				await my.lose([card], ui.special);
				await player.gain([card], "gain2");
			} catch (e) {}

			// 给玩家 1 枚腐蚀（D&G 自己不吃）
			if (!isDgPlayer(player)) addCorrupt(player);

			FX("useCard", player, card);
			game.log(player, "取用了", "#g「马友友」", "的", card);

			// 关键：直接写响应结果，让引擎认这次响应
			try {
				trigger.result = {
					bool: true,
					result: nm === "shan" ? "shaned" : undefined,
					card: card,
					cards: [card],
				};
				trigger.responded = true;
				trigger.animate = false;
			} catch (e) {}
			// 如果这次只是"使用"（不是响应），直接把牌用出去
			try {
				if (trigger.name === "chooseToUse" && !trigger.responded) {
					if (player.canUse(card, player, false)) await player.useCard(card, player, false);
				}
			} catch (e) {}
		},
	},

	// 借用马友友手牌（改为「出牌阶段自动询问」）
	// 为什么不用 enable:"phaseUse"：引擎只在【选牌界面】把主动技显示成一张"虚拟牌"时才会出按钮
	// （player.js:3004 —— 必须有 viewAs 或 hiddenCard），纯逻辑主动技根本不显示。
	// 所以改成触发器：出牌阶段开始时问一次。
	dvg_skill_borrow: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		// 不再需要玩家主动"取牌"：马友友的手牌会自动同步展示到每个被帮助者手里。
		// 这个技能改成「同步器」——在马友友手牌变化时，刷新所有人的复制牌。
		trigger: {
			global: ["gainAfter", "loseAfter", "loseAsyncAfter", "cardsDiscardAfter", "phaseBegin"],
		},
		filter(event, player) {
			// 只有马友友的牌发生变动、或有人回合开始时才同步
			const my = findMayouyou();
			if (!my) return false;
			// 事件涉及马友友的手牌
			try {
				const involve =
					event.player === my ||
					(event.getl && event.getl(my) && ((event.getl(my).cards || []).length || (event.getl(my).cards2 || []).length)) ||
					(event.cards && event.cards.some((c) => get.owner(c) === my));
				if (involve) return true;
			} catch (e) {}
			// 回合开始也同步一次（兜底，防止漏事件）
			return event.name === "phaseBegin";
		},
		async content(event, trigger, player) {
			// 延迟一点，等事件流程走完再同步，避免牌还在 transfer 中途
			try {
				lib.skill[MAYY_LIMIT].syncToAll();
			} catch (e) {}
		},
	},

	/* ========================= 马友友的牌「如手牌般使用」，但每种牌名每回合限一次 */
	// 机制：牌进入手牌区后打上 gaintag（MAYY_MARK），
	// 用 mod.cardEnabled / mod.cardUsable 拦住"本回合这个牌名已经用过"的情况。
	dvg_skill_marklimit: {
		charlotte: true,
		nopop: true,
		// ═══════════════════════════════════════════════════════════════
		// 抄自 错乱时空「谋岁望 · 棋劫」的 shadow 机制（extension.js:77038-77133）
		//
		// 核心思路：
		//   ① 真牌 = 马友友的手牌（本环境 addToExpansion 不可靠，实测扩展区始终为 0）
		//   ② 别的被帮助者手里放「虚拟牌」（createFakeCards + _cardid 指向真牌），打进 "s" 区
		//   ③ 用牌时在 useCardBefore 把虚拟牌换成真牌，并从马友友手里扣掉
		//   ④ 靠 _cardid 比对来同步增删虚拟牌
		//
		// 为什么"不占手牌上限"：s 区的牌带 glows class，
		// 而 countCards("h") 只统计不带 glows 的牌（player.js:5170），所以天然不算手牌。
		// ═══════════════════════════════════════════════════════════════

		/** 给一张牌打上标记 */
		tagCard(card) {
			try {
				if (!card) return;
				if (typeof card.addGaintag === "function") card.addGaintag(MAYY_MARK);
				else {
					if (!Array.isArray(card.gaintag)) card.gaintag = [];
					if (!card.gaintag.includes(MAYY_MARK)) card.gaintag.push(MAYY_MARK);
				}
				// 额外维护一份 cardid 集合：VCard 会丢掉 gaintag，只能靠 cardid 认回来
				try {
					const self = lib.skill[MAYY_LIMIT];
					if (!Array.isArray(self.taggedIds)) self.taggedIds = [];
					const cid = card._cardid || card.cardid;
					if (cid && !self.taggedIds.includes(cid)) self.taggedIds.push(cid);
				} catch (e) {}
			} catch (e) {}
		},
		/** 是不是「马友友的虚拟牌」
		 *  ⚠️ 关键：mod 收到的 card 是 get.autoViewAs(card) 生成的 VCard（library/index.js:10988），
		 *  VCard 构造函数只拷贝 name/suit/number/nature/cardid/storage/skills，【不拷贝 gaintag】
		 *  （vcard.js:19-36），所以只判 gaintag 会永远返回 false → 限次完全失效。
		 *  这里三重判断：gaintag / _cardid / cards 数组里任一张带标记。
		 */
		isMayyCard(card) {
			try {
				if (!card) return false;
				// ① 直接带 gaintag（原始牌）
				if (typeof card.hasGaintag === "function" && card.hasGaintag(MAYY_MARK)) return true;
				if (Array.isArray(card.gaintag) && card.gaintag.includes(MAYY_MARK)) return true;
				// ② VCard 形态：靠 cards 里的原始牌判断
				if (Array.isArray(card.cards) && card.cards.length) {
					for (const c of card.cards) {
						if (!c) continue;
						if (typeof c.hasGaintag === "function" && c.hasGaintag(MAYY_MARK)) return true;
						if (Array.isArray(c.gaintag) && c.gaintag.includes(MAYY_MARK)) return true;
					}
				}
				// ③ VCard 形态：靠 _cardid 反查（虚拟牌都带 _cardid 或 cardid）
				const cid = card._cardid || card.cardid;
				if (cid) {
					const my = findMayouyou();
					const pool = (my && my.getCards("h")) || [];
					// 虚拟牌的 cardid 就是真牌 cardid（createFakeCards 里 cardx._cardid = card.cardid）
					if (pool.some((rc) => rc.cardid === cid)) {
						// 再确认这个 cardid 确实被标记过（我们维护一份 id 集合）
						const ids = lib.skill[MAYY_LIMIT].taggedIds;
						if (Array.isArray(ids) && ids.includes(cid)) return true;
					}
				}
			} catch (e) {}
			return false;
		},
		/** 计算这张牌占用的「限次键」：
		 *  D&G 本人 → 按牌名（每回合每种牌名限一张）
		 *  其他被帮助者 → 按类型（每回合每种类型限一张）
		 */
		limitKey(player, card) {
			try {
				const isDG = player.name1 === DG || player.name === DG;
				const nm = get.name(card);
				if (isDG) return "n:" + nm;
				// 类型：basic / trick / equip（delay 归入 trick）
				// 注意：get.type 的第二个参数是 method，第三个才是 player。
				// 之前传 get.type(card, "trick") 没给 player，某些情况下 get.name 会取不到名字，
				// 导致拿不到类型 → 退回按牌名限次（这正是"变成每种牌限一次"的原因）。
				// 这里三种写法依次尝试，任一拿到就返回。
				let t = null;
				if (typeof get.type === "function") {
					try {
						t = get.type(card, "trick", player);
					} catch (e) {}
					if (!t) {
						try {
							t = get.type(card, undefined, player);
						} catch (e) {}
					}
					if (!t) {
						try {
							t = get.type(nm);
						} catch (e) {}
					}
				}
				// 最后兜底：直接查 lib.card 表
				if (!t) {
					try {
						const info = lib.card[nm];
						if (info && info.type) t = info.type === "delay" ? "trick" : info.type;
					} catch (e) {}
				}
				// 真的拿不到类型才退回按牌名（保证不会崩）
				return t ? "t:" + t : "n:" + nm;
			} catch (e) {
				return "n:unknown";
			}
		},
		/** 本回合这个限次键是否已经用过了
		 *  ⚠️ 用 game.phaseNumber 做「回合戳」，而不是靠 phaseBegin 去清数组：
		 *  - game.phaseNumber 在 phase 事件第 2 步自增（content.js:4012），
		 *    也就是【每个角色回合开始时 +1】，语义就是"第几个回合"。
		 *  - 旧写法依赖 dvg_skill_borrow_reset 在 phaseBegin 清 storage 数组，
		 *    一旦那个技能没触发（比如玩家被 removed / 技能被清 / 联机各端 storage 不同步），
		 *    数组就永远不清 → 表现为"用一次就永久废了，不是每回合重置"。
		 *  - 现在直接比对戳：戳变了就等于"新回合"，自动作废，不需要任何清空逻辑。
		 */
		usedThisPhase(player, card) {
			const rec = player.storage.dvg_mayyUsed;
			if (!rec || typeof rec !== "object") return false;
			// 回合戳不一致 → 上个回合的记录，视为未使用
			if (rec.phase !== game.phaseNumber) return false;
			const key = lib.skill[MAYY_LIMIT].limitKey(player, card);
			return Array.isArray(rec.keys) && rec.keys.includes(key);
		},
		markUsed(player, card) {
			const key = lib.skill[MAYY_LIMIT].limitKey(player, card);
			const cur = player.storage.dvg_mayyUsed;
			// 回合变了就重建，不变就追加
			if (!cur || typeof cur !== "object" || cur.phase !== game.phaseNumber) {
				player.storage.dvg_mayyUsed = { phase: game.phaseNumber, keys: [key] };
			} else {
				if (!Array.isArray(cur.keys)) cur.keys = [];
				if (!cur.keys.includes(key)) cur.keys.push(key);
			}
			try {
				player.markSkill(HELPED);
			} catch (e) {}
		},

		mod: {
			// 虚拟牌在 "s" 区，本来就不算手牌；这里不用补偿上限。
			// 限次：D&G 按牌名，其他人按类型
			cardEnabled(card, player) {
				const self = lib.skill[MAYY_LIMIT];
				if (!self.isMayyCard(card)) return;
				if (self.usedThisPhase(player, card)) return false;
			},
			cardUsable(card, player) {
				const self = lib.skill[MAYY_LIMIT];
				if (!self.isMayyCard(card)) return;
				if (self.usedThisPhase(player, card)) return false;
			},
			cardRespondable(card, player) {
				const self = lib.skill[MAYY_LIMIT];
				if (!self.isMayyCard(card)) return;
				if (self.usedThisPhase(player, card)) return false;
			},
			cardSavable(card, player) {
				const self = lib.skill[MAYY_LIMIT];
				if (!self.isMayyCard(card)) return;
				if (self.usedThisPhase(player, card)) return false;
			},
		},

		group: [MAYY_LIMIT + "_sync", MAYY_LIMIT + "_use", MAYY_LIMIT + "_lose"],

		/** 把所有被帮助者的虚拟牌与马友友的手牌对齐 */
		syncToAll() {
			const self = lib.skill[MAYY_LIMIT];
			const my = findMayouyou();
			if (!my) {
				// ★ 马友友已经不在场（死亡/被同归带走）→ 把所有人手里的虚拟牌全部清掉。
				//   以前这里直接 return，导致马友友死后，之前发出去的虚拟牌
				//   还赖在别人手牌里 —— 玩家能继续"用"一个已经不存在的召唤物的牌。
				self.clearAllFakeCards();
				return;
			}
			// ⚠️ 用马友友的【手牌】作为真牌来源。
			// 之前想用 addToExpansion 放进扩展区，但实测日志显示扩展区始终为 0（该 API 在本环境不可靠）。
			// 改用真牌=手牌 + 假牌=s 区：s 区的牌带 glows，countCards("h") 数不到（player.js:5170），
			// 所以照样不占手牌上限，效果等价且更稳。
			const realCards = my.getCards("h") || [];
			const realIds = realCards.map((c) => c.cardid);
			for (const p of game.players || []) {
				if (!p || p === my) continue;
				const isDG = p.name1 === DG || p.name === DG;
				if (!isDG && !p.hasMark(HELPED)) continue;
				self.syncToPlayer(p, realCards, realIds);
			}
		},

		/**
		 * 清空全场所有「马友友的牌」虚拟牌。
		 * 用于马友友死亡/消失时彻底回收，避免留下"幽灵手牌"。
		 * ⚠️ 扫 game.players + game.dead，因为 D&G 隐匿期间在 game.dead 里，
		 *    他手上也可能残留虚拟牌。
		 */
		clearAllFakeCards() {
			const self = lib.skill[MAYY_LIMIT];
			const targets = [];
			try {
				for (const p of [...(game.players || []), ...(game.dead || [])]) {
					if (p && !targets.includes(p)) targets.push(p);
				}
			} catch (e) {}
			let cleared = 0;
			for (const p of targets) {
				let fakes = [];
				try {
					fakes = p.getCards("s", (c) => c && c.hasGaintag && c.hasGaintag(MAYY_MARK)) || [];
				} catch (e) {
					fakes = [];
				}
				if (!fakes.length) continue;
				cleared += fakes.length;
				try {
					game.deleteFakeCards(fakes);
				} catch (e) {
					// 兜底：官方 API 不可用时逐个删除
					for (const c of fakes) {
						try {
							c.delete();
						} catch (e2) {}
					}
				}
				// 清掉残留的限次记录，避免下次召唤时沿用旧的"已用"状态
				try {
					delete p.storage.dvg_mayyUsed;
					delete p.storage.dvg_mayyUsedKeys;
					delete p.storage.dvg_mayyUsedNames;
					delete p.storage.dvg_borrowPhase;
					delete p.storage.dvg_borrowNames;
				} catch (e) {}
				try {
					p.update();
				} catch (e) {}
			}
			if (cleared > 0) {
				game.log("#g「马友友」", "的牌全部消失了（共 " + cleared + " 张）");
			}
			return cleared;
		},

		/** 单个玩家的虚拟牌对齐（抄 shadow_int 的增删逻辑） */
		syncToPlayer(p, realCards, realIds) {
			const self = lib.skill[MAYY_LIMIT];
			if (!realCards) {
				const my = findMayouyou();
				realCards = (my && my.getCards("h")) || [];
				realIds = realCards.map((c) => c.cardid);
			}
			// 现有虚拟牌
			const fakeCards = p.getCards("s", (c) => c.hasGaintag && c.hasGaintag(MAYY_MARK));
			const fakeIds = fakeCards.map((c) => c._cardid);

			// ① 真牌已不在 → 用引擎官方 deleteFakeCards 清理
			const toRemove = fakeCards.filter((c) => !realIds.includes(c._cardid));
			if (toRemove.length) {
				try {
					game.deleteFakeCards(toRemove);
				} catch (e) {
					toRemove.forEach((c) => {
						try {
							c.delete();
						} catch (e2) {}
					});
				}
			}
			// ② 真牌新增 → 用引擎官方 createFakeCards 造虚拟牌
			const toAdd = realCards.filter((c) => !fakeIds.includes(c.cardid));
			let cardsx = [];
			if (toAdd.length) {
				try {
					cardsx = game.createFakeCards(toAdd);
				} catch (e) {
					cardsx = [];
				}
				// createFakeCards 内部已设好 isFake 和 _cardid，只需补标记
				for (const c of cardsx) {
					if (!self.isMayyCard(c)) self.tagCard(c);
				}
			}
			if (cardsx.length) {
				try {
					p.directgains(cardsx, null, MAYY_MARK);
				} catch (e) {}
				for (const c of cardsx) {
					if (!self.isMayyCard(c)) self.tagCard(c);
				}
			}
			if (toRemove.length || cardsx.length) {
				try {
					p.update();
				} catch (e) {}
			}
		},
	},

	/* ---- 同步：把马友友的牌做成虚拟牌铺到每个人手里 ---- */
	dvg_skill_marklimit_sync: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		trigger: {
			global: [
				"addToExpansionAfter",
				"loseAsyncAfter",
				"cardsDiscardAfter",
				"gainAfter",
				"phaseBegin",
				"phaseZhunbeiBegin",
				"gameDrawEnd",
				"roundStart",
				// 有人死亡：马友友可能被同归/技能带走，
				// 触发一次让 content 去清掉残留的虚拟牌
				"dieAfter",
			],
		},
		filter(event, player) {
			// ⚠️ 不能只判断「马友友是否存在」——
			//   马友友死亡时 findMayouyou() 已经是 null，
			//   若这里 return false，content 永远不执行，清理逻辑就跑不到，
			//   导致它死后虚拟牌还赖在别人手里。
			//   所以：马友友活着 → 正常同步；马友友不在 → 也要放行一次，让 content 去清理。
			if (findMayouyou()) return true;
			// 马友友不在了：只有在「场上确实还有残留虚拟牌」时才触发清理，避免无谓执行
			try {
				const all = [...(game.players || []), ...(game.dead || [])];
				for (const p of all) {
					if (!p || typeof p.getCards !== "function") continue;
					const fakes = p.getCards("s", (c) => c && c.hasGaintag && c.hasGaintag(MAYY_MARK));
					if (fakes && fakes.length) return true;
				}
			} catch (e) {}
			return false;
		},
		async content(event, trigger, player) {
			lib.skill[MAYY_LIMIT].syncToAll();
		},
	},

	/* ---- 用牌：把虚拟牌换成真牌，并从所有人身上扣除 ---- */
	dvg_skill_marklimit_use: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		trigger: { player: ["useCardBefore", "respondBefore"] },
		filter(event, player) {
			const cards = player.getCards("s", (c) => c.hasGaintag && c.hasGaintag(MAYY_MARK) && c._cardid);
			return event.cards && event.cards.some((c) => cards.includes(c));
		},
		async content(event, trigger, player) {
			const self = lib.skill[MAYY_LIMIT];
			const my = findMayouyou();
			// 收集所有真牌（不用 addArray：那是引擎给 Array 打的补丁，某些环境/沙箱里可能没有）
			const realCards = my ? Array.from(my.getCards("h") || []) : [];
			const realIds = realCards.map((c) => c.cardid);

			const useFake = [];
			for (let i = 0; i < (trigger.cards || []).length; i++) {
				const card = trigger.cards[i];
				if (!card.hasGaintag || !card.hasGaintag(MAYY_MARK)) continue;
				useFake.push(card);
				const real = realCards.find((c) => c.cardid == card._cardid);
				if (real) {
					// 记录限次（D&G 按牌名，其他人按类型）
					self.markUsed(player, real);
					// 从扩展区真牌扣掉
					try {
						const owner = get.owner(real);
						if (owner) {
							owner.lose(real, ui.special);
							owner.$throw?.(real);
						}
					} catch (e) {}
					// 用一张同名牌替换（让引擎正常结算）
					try {
						const tempCard = game.createCard(real.name, real.suit, real.number, real.nature);
						trigger.cards[i] = tempCard;
						if (trigger.card && trigger.card.cards) trigger.card.cards[i] = tempCard;
					} catch (e) {}
				}
			}
			// 删掉用过的虚拟牌
			if (useFake.length) {
				try {
					player.send?.(
						function (cards) {
							cards.forEach((i) => i.delete());
						},
						useFake,
						player
					);
				} catch (e) {}
				useFake.forEach((i) => {
					try {
						i.delete();
					} catch (e) {}
				});
				try {
					if (player == game.me) ui.updatehl?.();
				} catch (e) {}
			}
			// 同步所有人的虚拟牌
			self.syncToAll();
			// ★ 腐蚀：这才是「使用马友友的牌」真正走的路径。
			//   玩家手里拿的是【虚拟牌】（s 区 + MAYY_MARK），用掉时触发的是
			//   useCardBefore / respondBefore → 就是这个技能，而不是 dvg_skill_use / dvg_skill_ask
			//   （那两条是旧的"转移真牌"路径，现在基本走不到）。
			//   之前腐蚀加在旧路径上，所以"用了牌却不加腐蚀"。
			if (useFake.length && !isDgPlayer(player)) {
				addCorrupt(player);
			}
		},
	},

	/* ---- 失去：其他人的虚拟牌也跟着消失 ---- */
	dvg_skill_marklimit_lose: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		trigger: { global: ["gainAfter", "addToExpansionAfter", "loseAsyncAfter", "loseAfter", "cardsDiscardAfter"] },
		filter(event, player) {
			const idList = player.getCards("s", (c) => c.hasGaintag && c.hasGaintag(MAYY_MARK)).map((i) => i._cardid);
			return event.cards && event.cards.some((c) => idList.includes(c.cardid));
		},
		async content(event, trigger, player) {
			lib.skill[MAYY_LIMIT].syncToAll();
		},
	},


	// 【已停用】回合外「向马友友请求」。
	// 原因：马友友的手牌现在会以【虚拟牌】的形式直接铺到每个被帮助者手里（s 区 + MAYY_MARK），
	// 需要出闪/杀/无懈时，那些牌本来就直接可点，不需要再弹窗「是否向马友友请求」。
	// 留着这个技能会导致每次响应都弹两次窗（先问要不要请求、再选牌），既多余又打断节奏。
	// 这里保留定义（翻译/旧存档引用不会报错），但 filter 恒为 false，等于完全禁用。
	dvg_skill_ask: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		firstDo: true,
		priority: 90,
		trigger: { player: ["chooseToRespondBefore"] },
		filter(event, player) {
			return false; // 已停用：虚拟牌可直接使用，不再需要"请求"弹窗
		},
		async content(event, trigger, player) {
			// 已停用：filter 恒 false，这里不会被执行
			return;
		},
	},

	// 每回合开始时清空「牌名使用记录」和「取牌记录」
	dvg_skill_borrow_reset: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "phaseBegin" },
		content(event, trigger, player) {
			if (player.storage.dvg_borrowNames) delete player.storage.dvg_borrowNames;
			// 限次记录现在用「回合戳」比对（见 usedThisPhase），不再依赖这里清空。
			// 这里只做一次顺手的清理，避免旧字段越积越多。
			if (player.storage.dvg_mayyUsedKeys) delete player.storage.dvg_mayyUsedKeys;
			if (player.storage.dvg_mayyUsedNames) delete player.storage.dvg_mayyUsedNames;
			if (player.storage.dvg_borrowPhase) delete player.storage.dvg_borrowPhase;
			try {
				player.markSkill(HELPED);
			} catch (e) {}
		},
	},

	// 回合结束：交给马友友一张手牌
	dvg_skill_give: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "phaseJieshuBegin" },
		filter(event, player) {
			const my = findMayouyou();
			return !!my && player.hasMark(HELPED) && player.countCards("h") > 0;
		},
		async content(event, trigger, player) {
			const my = findMayouyou();
			if (!my) return;
			const result = await player
				.chooseCard("h", "回合结束：须将一张手牌置于「马友友」的手牌区", true)
				.set("ai", card => -get.value(card))
				.forResult();
			if (!result.bool || !result.cards?.length) return;
			await player.lose(result.cards, ui.special);
			await my.gain(result.cards, "gain2");
			FX("give", player, my, 1);
			game.log(player, "将一张手牌交给了", "#g「马友友」");
		},
	},

	// 弃牌阶段的牌置入马友友
	dvg_skill_discard_to_mayouyou: {
		charlotte: true,
		nopop: true,
		forced: true,
		popup: false,
		silent: true,
		trigger: { player: "phaseDiscardEnd" },
		filter(event, player) {
			const my = findMayouyou();
			return !!my && player.hasMark(HELPED) && (event.cards || []).length > 0;
		},
		async content(event, trigger, player) {
			const my = findMayouyou();
			if (!my) return;
			const cards = (trigger.cards || []).filter(c => get.position(c, true) === "d");
			if (!cards.length) return;
			await my.gain(cards, "gain2");
			FX("give", player, my, cards.length);
			game.log(player, "弃置的牌置入了", "#g「马友友」", "的手牌区");
		},
	},
};

/* ---------------------------------------------------------------- 翻译 */

const translates = {
	[DG]: "D&G",
	[MAYY]: "马友友",
	[MAYY + "_info"]:
		`召唤物。体力上限与体力值均为 5。<br>拥有${get.poptip("dvg_mayouyou_heal")}、${get.poptip("dvg_mayouyou_damage")}、${get.poptip("dvg_mayouyou_skip")}、${get.poptip("dvg_mayouyou_immortal")}、${get.poptip("dvg_mayouyou_noreply")}。<br>他的全部手牌对所有${get.poptip(HELPED)}者可见可用。`,

	[HIDDEN]: "隐匿",
	[HIDDEN + "_info"]:
		`锁定技，游戏开始时你暗置武将牌并移出游戏（座次减少，任何牌都无法指定你）；一个轮次后重新登场。`,

	[HELP]: "帮助",
	[HELP + "_info"]:
		`游戏开始时，你获得${get.poptip(HELPED)}标记，然后依次询问其他角色是否需要帮助；答应的角色获得${get.poptip(HELPED)}标记。`,

	[MAYOUYOU]: "马友友",
	[MAYOUYOU + "_info"]:
		`锁定技，询问结束后，你令「${get.poptip(MAYY)}」作为独立武将登场于你的上家位置。`,

	[CORRUPT]: "腐蚀",
	[CORRUPT + "_info"]:
		`锁定技，拥有${get.poptip(HELPED)}标记的角色每轮获得 1 枚${get.poptip(CORRUPT_MARK)}；<b>每次使用「${get.poptip(MAYY)}」的手牌再获得 1 枚</b>（D&G 除外）。<br>每 2 枚${get.poptip(CORRUPT_MARK)}使其手牌上限 -1；<b>每 5 枚使其在自己的回合结束时流失 1 点体力</b>。`,

	[HELPED]: "被帮助",
	[HELPED + "_info"]:
		`拥有此标记的角色：<br>①可以使用「${get.poptip(MAYY)}」的手牌，限次见${get.poptip("dvg_skill_marklimit")}。<br>②回合结束时，须将一张手牌置于「${get.poptip(MAYY)}」的手牌区。<br>③弃牌阶段弃的牌将置入「${get.poptip(MAYY)}」的手牌区。<br>④每轮获得${get.poptip(CORRUPT_MARK)}，效果见该标记。`,

	[CORRUPT_MARK]: "腐蚀",
	[CORRUPT_MARK + "_info"]:
		`每轮获得 1 枚；<b>每次使用「${get.poptip(MAYY)}」的手牌再获得 1 枚</b>（D&G 除外）。<br>每 2 枚使你手牌上限 -1。`,

	dvg_skill_mayouyou_core: "马友友",
	dvg_skill_mayouyou_core_info: `组合技，由下列各项组成。`,
	dvg_mayouyou_heal: "回满",
	dvg_mayouyou_heal_info: "每个角色的回合开始时，回复至体力上限。",
	dvg_mayouyou_damage: "受伤摸牌",
	dvg_mayouyou_damage_info: "每次受到伤害后，摸两张牌。",
	dvg_mayouyou_skip: "跳跃阶段",
	dvg_mayouyou_skip_info: "跳过出牌阶段与弃牌阶段，每个被跳过的阶段改为执行一个摸牌阶段。",
	dvg_mayouyou_immortal: "不死",
	dvg_mayouyou_immortal_info: "没有濒死阶段，不会死亡。",
	dvg_mayouyou_noreply: "不响应",
	dvg_mayouyou_noreply_info: `需要打出【闪】【杀】【无懈可击】时，直接放弃；其他响应（如【桃】）照常进行。`,

	dvg_skill_return: "隐匿·归来",
	dvg_skill_return_info: "一个轮次后，你从隐匿中重新登场。（隐藏项，随〖隐匿〗一同生效）",
	dvg_skill_borrow: "借用",
	dvg_skill_borrow_info: `内部同步机制：把「${get.poptip(MAYY)}」的手牌同步成虚拟牌发给所有${get.poptip(HELPED)}者。`,
	dvg_skill_marklimit: "马友友的牌",
	dvg_skill_marklimit_info: `拥有「${get.poptip(MAYY)}」标志的牌。<br>限次：<b>D&G</b> 每回合每种<b>牌名</b>限 1 张；<b>其他角色</b>每回合每种<b>类型</b>（基本牌/锦囊牌/装备牌）限 1 张。`,
	dvg_skill_marklimit_sync: "马友友的牌·同步",
	dvg_skill_marklimit_sync_info: `「${get.poptip(MAYY)}」的手牌变动时，自动同步给所有${get.poptip(HELPED)}者。`,
	dvg_skill_marklimit_use: "马友友的牌·取用",
	dvg_skill_marklimit_use_info: `使用或打出「${get.poptip(MAYY)}」的虚拟牌时，从「${get.poptip(MAYY)}」手中扣掉对应的真牌。`,
	dvg_skill_marklimit_lose: "马友友的牌·失去",
	dvg_skill_marklimit_lose_info: `「${get.poptip(MAYY)}」失去牌时，同步移除所有人手里的对应虚拟牌。`,
	// 牌上的 gaintag 标记（card.js:223-237）：
	//   addGaintag 会把每个 tag 的【翻译】渲染到牌面下方；翻译为 "invisible" 时跳过不显示。
	// 这里设成「马友友」，于是每张共享过来的牌下方都会显一行小字「马友友」，
	// 一眼能看出这张牌是从马友友那儿借来的（和木牛流马在牌下留名字是一个意思）。
	[MAYY_MARK]: "马友友",
	dvg_skill_use: "取用",
	dvg_skill_use_info: `锁定技，见${get.poptip(HELPED)}第 ① 条。`,
	dvg_skill_ask: "请求",
	dvg_skill_ask_info: `（已停用：手牌本就是虚拟牌，可直接使用，无需请求）`,
	dvg_skill_borrow_reset: "借用·重置",
	dvg_skill_borrow_reset_info: "回合开始时清空借用记录。",
	dvg_skill_takedown: "同归",
	dvg_skill_takedown_info: `锁定技，你死亡时，「${get.poptip(MAYY)}」随你一同消失。`,
	dvg_skill_give: "交付",
	dvg_skill_give_info: `回合结束时，见${get.poptip(HELPED)}第 ② 条。`,
	dvg_skill_discard_to_mayouyou: "转移",
	dvg_skill_discard_to_mayouyou_info: `弃牌阶段，见${get.poptip(HELPED)}第 ③ 条。`,
};

/* ---------------------------------------------------------------- 角色 */

const characters = {
	[DG]: {
		sex: "male",
		group: "qun",
		hp: 3,
		// ⚠️ 腐蚀（CORRUPT）不在 D&G 身上——它挂在马友友身上当「每轮计时器」，
		//    因为 D&G 隐匿期间会 removed / 离开 game.players，挂他这边极易失效。
		//
		// 技能栏只显示 4 个「玩家需要看到」的技能：隐匿 / 帮助 / 马友友 / 同归。
		//   · dvg_skill_return 是「隐匿」的配套内部机制（一个轮次后归来），
		//     已设 nopop，不会显示在技能栏，但保留在列表里是为了留住 roundStart 兜底触发。
		//   · dvg_skill_marklimit 是给「被帮助者」用的内部限次规则，
		//     不挂在 D&G 身上（他也不需要限次），这里去掉。
		skills: [HIDDEN, "dvg_skill_return", HELP, MAYOUYOU, "dvg_skill_takedown"],
		img: "extension/脑花乔尼/image/dvg_dg.jpg",
	},
	[MAYY]: {
		sex: "male",
		group: "qun",
		hp: 5,
		// CORRUPT 挂这里：马友友从登场到结束都在场，作为「腐蚀计时器」最可靠
		skills: ["dvg_skill_mayouyou_core", CORRUPT],
		isUnseen: true, // 不可选，只能被召唤
		img: "extension/脑花乔尼/image/dvg_mayouyou.jpg",
	},
};

export const dvgCharacters = characters;
export const dvgSkills = skills;
export const dvgTranslates = translates;

export default characters;














