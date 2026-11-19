import { lib, game, ui, get, ai, _status } from "noname";

/* ============================================================================
 * 乔尼·乔斯达 —— 技能特效层
 * ----------------------------------------------------------------------------
 * 视觉语言（依据角色设定）：
 *   黄金螺旋（回旋/黄金矩形）· 指甲弹 · 会追踪的弹孔 · 莫比乌斯环 · 漆黑意志
 * 纯 DOM/CSS + WAAPI + Canvas，不依赖外部图片。
 * 所有入口都吞异常：特效出错绝不中断结算。
 * ========================================================================== */

const LAYER_ID = "qnj-fx";
const TOP_ID = "qnj-fx-top";
const STYLE_ID = "qnj-fx-style";
const CFG_KEY = "extension_脑花乔尼_qnj_fx";
const CFG_SFX = "extension_脑花乔尼_qnj_sfx";
const AUDIO_BASE = "extension/脑花乔尼/audio/fx/";

const GOLD = "rgba(232,178,58,.95)";
const GOLD_L = "rgba(255,214,107,1)";
const WHITE = "rgba(246,240,226,.98)";
const INK = "rgba(10,8,6,.94)";
const BLOOD = "rgba(122,31,29,.9)";

const CSS_TEXT = `
#qnj-fx{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:hidden}
#qnj-fx *{box-sizing:border-box;pointer-events:none}
#qnj-fx-top{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden}
#qnj-fx-top *{box-sizing:border-box;pointer-events:none}

@keyframes qnjSpin{to{transform:rotate(360deg)}}
@keyframes qnjSpinBack{to{transform:rotate(-360deg)}}

/* 回旋彗尾环 */
.qnj-ring{position:absolute;border-radius:50%;
	background:conic-gradient(from 0deg,transparent 0 60%,rgba(232,178,58,.12) 72%,rgba(255,214,107,.95) 88%,#fff 93%,transparent 97%);
	-webkit-mask:radial-gradient(circle,transparent 50%,#000 53%,#000 92%,transparent 97%);
	mask:radial-gradient(circle,transparent 50%,#000 53%,#000 92%,transparent 97%);
	animation:qnjSpin .85s linear infinite;will-change:transform}

/* 回旋粒子臂 */
.qnj-arm{position:absolute;animation:qnjSpin 1.1s linear infinite;will-change:transform}
.qnj-arm i{position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;
	background:radial-gradient(circle,#fff 0%,rgba(255,214,107,.95) 45%,rgba(232,178,58,0) 72%);
	box-shadow:0 0 8px rgba(255,214,107,.9);transition:transform .55s cubic-bezier(.2,.7,.3,1),opacity .55s}

/* 指甲弹 */
.qnj-nail{position:absolute;width:4px;height:30px;border-radius:60% 60% 40% 40%/50%;
	background:linear-gradient(180deg,#fff 0%,rgba(255,214,107,.95) 40%,rgba(232,178,58,.2) 100%);
	box-shadow:0 0 10px rgba(255,214,107,.95),0 0 24px rgba(232,178,58,.6);
	transform-origin:50% 100%;will-change:transform,opacity}

/* 弹孔 */
.qnj-hole{position:absolute;border-radius:50%;
	background:radial-gradient(circle,#000 0 38%,rgba(20,14,4,.9) 46%,rgba(255,214,107,.95) 58%,rgba(232,178,58,0) 72%);
	box-shadow:0 0 12px rgba(255,214,107,.85);animation:qnjHoleIn .22s ease-out forwards}
@keyframes qnjHoleIn{0%{transform:translate(-50%,-50%) scale(0)}70%{transform:translate(-50%,-50%) scale(1.25)}100%{transform:translate(-50%,-50%) scale(1)}}

/* 莫比乌斯护盾 */
.qnj-shield{position:absolute;border-radius:50%;opacity:0;
	border:3px solid rgba(255,214,107,.9);box-shadow:0 0 26px rgba(255,214,107,.9),inset 0 0 26px rgba(232,178,58,.7);
	animation:qnjShield .85s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes qnjShield{
	0%{opacity:0;transform:translate(-50%,-50%) scale(.3) rotate(0deg)}
	25%{opacity:1}
	100%{opacity:0;transform:translate(-50%,-50%) scale(1.9) rotate(220deg)}}

/* 漆黑意志：压暗 + 墨色边缘 */
.qnj-dark{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;
	background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 30%,rgba(6,4,3,.55) 72%,rgba(0,0,0,.92) 100%);
	animation:qnjDark 1.5s ease-out forwards}
@keyframes qnjDark{0%{opacity:0}18%{opacity:1}75%{opacity:1}100%{opacity:0}}

/* 墨星（判定成功） */
.qnj-star{position:absolute;width:60px;height:60px;
	background:radial-gradient(circle,#000 0 34%,rgba(122,31,29,.95) 46%,rgba(122,31,29,0) 70%);
	box-shadow:0 0 24px rgba(122,31,29,.9);
	clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
	animation:qnjStar .8s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes qnjStar{0%{opacity:0;transform:translate(-50%,-50%) scale(.2) rotate(-40deg)}
	40%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(6deg)}
	100%{opacity:0;transform:translate(-50%,-50%) scale(.9) rotate(0)}}

/* маркер"无法闪避" */
.qnj-lock{position:absolute;width:26px;height:26px;border-radius:50%;
	border:2px solid rgba(10,8,6,.95);box-shadow:0 0 0 2px rgba(122,31,29,.6),0 0 14px rgba(122,31,29,.85);
	animation:qnjLock .9s ease-out forwards}
@keyframes qnjLock{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}
	30%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}
	80%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}

/* 漫舞者：尘土 */
.qnj-dust{position:absolute;width:6px;height:6px;border-radius:50%;background:rgba(196,170,128,.85);opacity:0;
	animation:qnjDust .9s ease-out forwards}
@keyframes qnjDust{0%{opacity:.9;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}

/* 升级爆发 */
.qnj-burst{position:absolute;border-radius:50%;border:3px solid rgba(255,214,107,.95);
	box-shadow:0 0 30px rgba(255,214,107,.9),inset 0 0 30px rgba(232,178,58,.6);
	animation:qnjBurst .7s cubic-bezier(.15,.7,.25,1) forwards}
@keyframes qnjBurst{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}10%{opacity:1}100%{transform:translate(-50%,-50%) scale(2.6);opacity:0}}

/* 飘字 */
.qnj-float{position:absolute;transform:translate(-50%,-50%);font-weight:700;white-space:nowrap;opacity:0;
	text-shadow:0 0 10px rgba(255,214,107,.9),0 0 22px rgba(232,178,58,.7),0 1px 2px rgba(0,0,0,.9);
	animation:qnjFloat 1.1s ease-out forwards}
@keyframes qnjFloat{0%{opacity:0;transform:translate(-50%,-50%) scale(.8)}
	16%{opacity:1;transform:translate(-50%,-58%) scale(1)}
	100%{opacity:0;transform:translate(-50%,-134%) scale(.96)}}

/* 无限回旋：常驻金环 */
.qnj-infinity{position:absolute;border-radius:50%;pointer-events:none;opacity:0;
	background:conic-gradient(from 0deg,transparent 0 55%,rgba(255,214,107,.85) 82%,#fff 90%,transparent 96%);
	-webkit-mask:radial-gradient(circle,transparent 58%,#000 61%,#000 90%,transparent 95%);
	mask:radial-gradient(circle,transparent 58%,#000 61%,#000 90%,transparent 95%);
	animation:qnjInfinityIn .6s ease-out forwards,qnjSpin 1.4s linear infinite}
@keyframes qnjInfinityIn{to{opacity:1}}

/* ---------------- 黄金螺旋（斐波那契） ---------------- */

/* 螺旋容器：缓慢自转 = 无限回转 */
/* ===== 画质档位：CSS 变量（默认 5 档全开，低档向下覆盖） ===== */
#qnj-fx,#qnj-fx-top{
	--f-line:drop-shadow(0 0 1.2px #fff3c4) drop-shadow(0 0 4px rgba(255,214,107,.95)) drop-shadow(0 0 12px rgba(232,178,58,.8));
	--f-head:drop-shadow(0 0 2px #fff) drop-shadow(0 0 8px rgba(255,214,107,1));
}
#qnj-fx.fx-lv4,#qnj-fx-top.fx-lv4{
	--f-line:drop-shadow(0 0 1.2px #fff3c4) drop-shadow(0 0 5px rgba(255,214,107,.95));
	--f-head:drop-shadow(0 0 6px rgba(255,214,107,1));
}
#qnj-fx.fx-lv3,#qnj-fx-top.fx-lv3{
	--f-line:drop-shadow(0 0 4px rgba(255,214,107,.95));
	--f-head:drop-shadow(0 0 5px rgba(255,214,107,1));
}
#qnj-fx.fx-lv2,#qnj-fx-top.fx-lv2{
	--f-line:drop-shadow(0 0 3px rgba(255,214,107,.85));
	--f-head:none;
}
#qnj-fx.fx-lv1,#qnj-fx-top.fx-lv1{
	--f-line:none;
	--f-head:none;
}
/* 1 档：把锥形+遮罩的圆环换成纯边框，省掉遮罩合成 */
#qnj-fx.fx-lv1 .qnj-ring{background:none;border:2px solid rgba(255,214,107,.9);
	-webkit-mask:none;mask:none;animation:qnjSpin 1.1s linear infinite}
/* ===== 低档清洗：1 档关闭所有滤镜/阴影/混合；2 档去阴影与混合 ===== */
#qnj-fx.fx-lv1 *,#qnj-fx-top.fx-lv1 *{
	filter:none!important;mix-blend-mode:normal!important;text-shadow:none!important}
/* 注意：不关 box-shadow —— 「帐」「护盾」「冲击波」等完全靠阴影成形，关掉会变透明 */
#qnj-fx.fx-lv2 *,#qnj-fx-top.fx-lv2 *{mix-blend-mode:normal!important}
/* 1~2 档：标题不做模糊入场（模糊是全屏最贵的一类滤镜） */
#qnj-fx.fx-lv1 .qnj-title,#qnj-fx.fx-lv2 .qnj-title,
#qnj-fx-top.fx-lv1 .qnj-title,#qnj-fx-top.fx-lv2 .qnj-title{animation:qnjTitleLite 1s ease forwards}
@keyframes qnjTitleLite{0%{opacity:0;transform:translate(-50%,-50%) scale(1.55)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
/* 1~2 档：漩涡改成纯边框 */
#qnj-fx.fx-lv1 .qnj-vortex,#qnj-fx.fx-lv2 .qnj-vortex,
#qnj-fx-top.fx-lv1 .qnj-vortex,#qnj-fx-top.fx-lv2 .qnj-vortex{
	background:none;border:2px solid rgba(255,214,107,.8);-webkit-mask:none;mask:none}
#qnj-fx.fx-lv1 .qnj-infinity{background:none;border:2px solid rgba(255,214,107,.85);
	-webkit-mask:none;mask:none}

.qnj-spiral{will-change:transform,opacity}
@keyframes qnjSpiralSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}

/* 螺旋主线：金色描边 + 双层发光 */
.qnj-spiral-line{fill:none;stroke:#ffd66b;stroke-width:.46;stroke-linecap:round;stroke-linejoin:round;
	filter:var(--f-line)}

/* 螺旋上的光点 */
.qnj-spiral-head{fill:#fffdf5;filter:var(--f-head)}

/* 斐波那契正方形骨架 */
.qnj-sq{fill:rgba(255,214,107,.03);stroke:rgba(255,214,107,.5);stroke-width:.09;stroke-dasharray:.55 .35}

/* 黄金矩形外框：虚线更重 */
.qnj-frame{fill:none;stroke:rgba(255,214,107,.75);stroke-width:.14;stroke-dasharray:1.2 .8}

/* 金色浮尘 */
.qnj-goldmote{position:absolute;width:6px;height:6px;border-radius:50%;opacity:0;
	background:radial-gradient(circle,#fff 0%,rgba(255,214,107,1) 40%,rgba(232,178,58,0) 74%);
	box-shadow:0 0 10px rgba(255,214,107,.95);
	animation:qnjGoldMote 1.5s ease-out forwards}
@keyframes qnjGoldMote{0%{opacity:0;transform:translate(0,0) scale(.3)}
	20%{opacity:1}72%{opacity:.9}
	100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.4)}}

/* 黄金矩形（旧版遗留，仅作 SVG 不可用时的退路） */
.qnj-rect{position:absolute;border:2px solid rgba(255,214,107,.9);
	box-shadow:0 0 24px rgba(255,214,107,.7),inset 0 0 40px rgba(232,178,58,.25);
	transform-origin:0 0;animation:qnjRect 1.1s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes qnjRect{0%{opacity:0;transform:scale(.2) rotate(-8deg)}
	30%{opacity:1}70%{opacity:.9;transform:scale(1) rotate(0)}
	100%{opacity:0;transform:scale(1.35) rotate(6deg)}}

/* 黄金漩涡（旧版遗留，仅作退路） */
.qnj-vortex{position:absolute;border-radius:50%;opacity:0;
	background:conic-gradient(from 0deg,rgba(255,214,107,0) 0deg,rgba(255,214,107,.85) 42deg,rgba(255,255,255,.95) 58deg,rgba(232,178,58,.25) 92deg,rgba(255,214,107,0) 150deg,rgba(255,214,107,.7) 220deg,rgba(255,255,255,.9) 236deg,rgba(255,214,107,0) 300deg);
	-webkit-mask:radial-gradient(circle,transparent 6%,#000 22%,#000 72%,transparent 88%);
	mask:radial-gradient(circle,transparent 6%,#000 22%,#000 72%,transparent 88%);
	animation:qnjVortex 2.2s cubic-bezier(.2,.7,.3,1) forwards,qnjSpin 1s linear infinite}
@keyframes qnjVortex{0%{opacity:0;transform:translate(-50%,-50%) scale(.1)}
	25%{opacity:.95}80%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) scale(2.4)}}

/* 标题 */
.qnj-title{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
	font-size:76px;font-weight:900;letter-spacing:.16em;color:#fff8e6;white-space:nowrap;opacity:0;
	text-shadow:0 0 22px rgba(255,214,107,1),0 0 60px rgba(232,178,58,.9),0 4px 0 #3a2408;
	animation:qnjTitle 1s cubic-bezier(.16,1,.3,1) forwards}
@keyframes qnjTitle{0%{opacity:0;transform:translate(-50%,-50%) scale(2.6);filter:blur(12px)}
	40%{opacity:1;filter:blur(0)}60%{transform:translate(-50%,-50%) scale(.96)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.qnj-sub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.6em;
	color:rgba(255,248,230,.85);white-space:nowrap;opacity:0;
	text-shadow:0 0 14px rgba(232,178,58,.95);animation:qnjFade .5s ease-out .3s forwards}

/* 技能碎裂 */
.qnj-chip{position:absolute;padding:2px 8px;border-radius:3px;font-size:12px;white-space:nowrap;
	color:#f6f0e2;border:1px solid rgba(232,178,58,.7);
	background:linear-gradient(180deg,rgba(58,36,8,.92),rgba(20,12,4,.92));
	box-shadow:0 0 12px rgba(232,178,58,.5);opacity:1;
	transition:transform .6s cubic-bezier(.3,0,.2,1),opacity .6s ease,filter .6s}

@keyframes qnjFade{to{opacity:1}}
`;

let _styleDone = false;
let _lastPlay = {};
let _sfxCache = {};

function cfg(key, dflt) {
	try {
		const v = lib.config[key];
		return v === undefined ? dflt : v;
	} catch (e) {
		return dflt;
	}
}

function injectStyle() {
	if (_styleDone) return;
	try {
		if (typeof document === "undefined") return;
		if (document.getElementById(STYLE_ID)) {
			_styleDone = true;
			return;
		}
		const s = document.createElement("style");
		s.id = STYLE_ID;
		s.textContent = CSS_TEXT;
		(document.head || document.body).appendChild(s);
		_styleDone = true;
	} catch (e) {}
}

function layer() {
	try {
		if (typeof document === "undefined" || !document.body) return null;
		let l = document.getElementById(LAYER_ID);
		if (!l) {
			injectStyle();
			l = document.createElement("div");
			l.id = LAYER_ID;
			document.body.appendChild(l);
		}
		try {
			l.className = "fx-lv" + qlv();
		} catch (e) {}
		return l;
	} catch (e) {
		return null;
	}
}

function topLayer() {
	try {
		if (typeof document === "undefined" || !document.body) return null;
		let l = document.getElementById(TOP_ID);
		if (!l) {
			injectStyle();
			l = document.createElement("div");
			l.id = TOP_ID;
			document.body.appendChild(l);
		}
		try {
			l.className = "fx-lv" + qlv();
		} catch (e) {}
		return l;
	} catch (e) {
		return null;
	}
}

function mk(cls, parent) {
	const p = parent || layer();
	if (!p) return null;
	const d = document.createElement("div");
	if (cls) d.className = cls;
	p.appendChild(d);
	return d;
}

function kill(node, ms) {
	if (!node) return;
	setTimeout(function () {
		try {
			node.remove();
		} catch (e) {}
	}, ms);
}

function rnd(n) {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

function anchor(player) {
	try {
		if (!player) return null;
		const isMe = typeof game !== "undefined" && game.me && player === game.me;
		if (isMe) {
			if (ui.fakeme && ui.fakeme.getBoundingClientRect().width > 0) return ui.fakeme;
			if (ui.me && ui.me.getBoundingClientRect().width > 0) return ui.me;
		}
		if (player.node && player.node.avatar && player.node.avatar.getBoundingClientRect().width > 0) {
			return player.node.avatar;
		}
		if (player.node && player.node.avatar) return player.node.avatar;
		return player;
	} catch (e) {
		return null;
	}
}

function box(player) {
	const a = anchor(player);
	if (!a) return null;
	try {
		const r = a.getBoundingClientRect();
		if (!r || (!r.width && !r.height)) return null;
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, rect: r };
	} catch (e) {
		return null;
	}
}

/** 屏幕中心与尺寸（兜底 1920×1080） */
function screen() {
	try {
		if (typeof window === "undefined") return { x: 960, y: 540, w: 1920, h: 1080 };
		return { x: window.innerWidth / 2, y: window.innerHeight / 2, w: window.innerWidth, h: window.innerHeight };
	} catch (e) {
		return { x: 960, y: 540, w: 1920, h: 1080 };
	}
}

function playSfx(name, vol) {
	try {
		if (!name || typeof Audio !== "function") return;
		if (cfg(CFG_SFX, true) === false) return;
		if (lib.config.volume === 0) return;
		let base = _sfxCache[name];
		if (!base) {
			const override = typeof window !== "undefined" && window.__QNJ_AUDIO_BASE;
			base = new Audio((override || (lib.assetURL || "") + AUDIO_BASE) + name + ".mp3");
			base.preload = "auto";
			_sfxCache[name] = base;
		}
		const node = base.cloneNode();
		node.volume = Math.max(0, Math.min(1, vol === undefined ? 0.75 : vol));
		const p = node.play();
		if (p && p.catch) p.catch(function () {});
	} catch (e) {}
}

const fx = {
	get on() {
		return cfg(CFG_KEY, true) !== false;
	},

	play(name, args) {
		try {
			if (!this.on) return;
			const p = args && args[0];
			let key = name;
			if (p && p.node) key += "|" + (p.name1 || "") + "|" + (p.dataset ? p.dataset.position : "");
			const now = Date.now();
			if (_lastPlay[key] && now - _lastPlay[key] < 150) return;
			if (Object.keys(_lastPlay).length > 200) _lastPlay = {};
			_lastPlay[key] = now;
			// 切档后立刻同步两个图层的类名，正在播的特效也能跟上新档位
			try {
				const _la = document.getElementById(LAYER_ID);
				if (_la) _la.className = "fx-lv" + qlv();
				const _lt = document.getElementById(TOP_ID);
				if (_lt) _lt.className = "fx-lv" + qlv();
			} catch (e) {}
			const fn = this[name];
			if (typeof fn === "function") return fn.apply(this, args || []);
		} catch (e) {}
	},

	sound(name, vol) {
		playSfx(name, vol);
	},

	/* ---------------- 基础 ---------------- */

	ring(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const size = opt.size || Math.max(80, Math.min(210, b.w * 1.2));
		const d = mk("qnj-ring");
		if (!d) return;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = size + "px";
		d.style.height = size + "px";
		d.style.transform = "translate(-50%,-50%)";
		kill(d, opt.life || 900);
	},

	float(player, text, opt) {
		if (!text) return;
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const d = mk("qnj-float");
		if (!d) return;
		d.textContent = text;
		d.style.left = b.x + "px";
		d.style.top = b.y + (opt.dy || -b.h * 0.2) + "px";
		d.style.fontSize = (opt.size || 15) + "px";
		d.style.color = opt.color || "#fff8e6";
		kill(d, 1200);
	},

	burst(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const d = mk("qnj-burst");
		if (!d) return;
		const s = opt.size || 120;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = s + "px";
		d.style.height = s + "px";
		kill(d, 800);
	},

	/* ---------------- 回旋：黄金螺旋粒子 ---------------- */

	spin(player, count, level) {
		const b = box(player);
		if (!b) return;
		this.sound("qnj_spin", 0.5);
		const arm = mk("qnj-arm");
		if (!arm) return;
		arm.style.left = b.x + "px";
		arm.style.top = b.y + "px";
		const n = 10;
		for (let i = 0; i < n; i++) {
			const dot = document.createElement("i");
			const ang = (i / n) * Math.PI * 2;
			dot.style.transform = "rotate(" + (ang * 180) / Math.PI + "deg) translateX(" + 8 + "px)";
			arm.appendChild(dot);
			((d, k) => {
				setTimeout(() => {
					try {
						const r = 46 + k * 26;
						d.style.transform = "rotate(" + (ang * 180) / Math.PI + "deg) translateX(" + r + "px)";
						d.style.opacity = "0";
					} catch (e) {}
				}, 40 + i * 18);
			})(dot, i);
		}
		kill(arm, 900);
		this.float(player, "回旋 " + count, { color: GOLD_L, size: 14 });
	},

	/* ---------------- 牙升级 ---------------- */

	levelup(player, level) {
		level = level || 2;
		const b = box(player);
		if (!b) return;
		this.sound("qnj_levelup", level >= 4 ? 0.85 : 0.6);
		const times = level === 4 ? 4 : level === 3 ? 3 : 2;
		for (let i = 0; i < times; i++) {
			setTimeout(
				() => {
					const d = mk("qnj-burst");
					if (!d) return;
					const s = 100 + i * 40;
					d.style.left = b.x + "px";
					d.style.top = b.y + "px";
					d.style.width = s + "px";
					d.style.height = s + "px";
					d.style.animationDelay = i * 0.05 + "s";
					kill(d, 900);
				},
				i * 90
			);
		}
		this.float(player, "牙 ACT" + level, { color: "#fff", size: 20, dy: -b.h * 0.3 });
	},

	/* ---------------- 爪弹：指甲弹 + 弹孔 ---------------- */

	nail(from, to, opt) {
		opt = opt || {};
		const A = box(from);
		const B = box(to);
		if (!A || !B) return;
		this.sound("qnj_nail", 0.55);
		const dx = B.x - A.x;
		const dy = B.y - A.y;
		const len = Math.sqrt(dx * dx + dy * dy) || 1;
		const ang = (Math.atan2(dy, dx) * 180) / Math.PI;

		for (let k = 0; k < 3; k++) {
			const d = mk("qnj-nail");
			if (!d) return;
			d.style.left = A.x + "px";
			d.style.top = A.y + "px";
			d.style.transform = "translate(-50%,-50%) rotate(" + (ang + 90) + "deg)";
			d.style.opacity = String(0.9 - k * 0.25);
			setTimeout(() => {
				try {
					d.style.transition = "transform " + (opt.fly || 180) + "ms linear, opacity 120ms ease";
					d.style.transform =
						"translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px)) rotate(" + (ang + 90) + "deg)";
					d.style.opacity = "0";
				} catch (e) {}
			}, 20 + k * 45);
			kill(d, 420 + k * 60);
		}

		const delay = opt.fly || 180;
		setTimeout(() => {
			try {
				this.hole(to, opt);
				this.sound("qnj_hit", 0.7);
			} catch (e) {}
		}, delay);
	},

	/** 弹孔：黄金回旋的弹孔会追踪目标 */
	hole(target, opt) {
		opt = opt || {};
		const b = box(target);
		if (!b) return;
		const d = mk("qnj-hole");
		if (!d) return;
		const size = opt.big ? 44 : 28;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = size + "px";
		d.style.height = size + "px";
		if (opt.track) {
			// 追踪：先偏移，再缓缓扑向目标
			const ox = (rnd(Date.now() % 97) - 0.5) * 140;
			const oy = -60 - rnd(Date.now() % 53) * 80;
			d.style.left = b.x + ox + "px";
			d.style.top = b.y + oy + "px";
			setTimeout(() => {
				try {
					d.style.transition = "left 700ms cubic-bezier(.5,0,.2,1),top 700ms cubic-bezier(.5,0,.2,1)";
					d.style.left = b.x + "px";
					d.style.top = b.y + "px";
				} catch (e) {}
			}, 60);
			kill(d, 1400);
		} else {
			kill(d, 900);
		}
	},

	/* ---------------- 牙3：莫比乌斯护盾 ---------------- */

	guard(player) {
		const b = box(player);
		if (!b) return;
		this.sound("qnj_guard", 0.6);
		for (let i = 0; i < 2; i++) {
			const d = mk("qnj-shield");
			if (!d) return;
			const s = b.w * (0.8 + i * 0.25);
			d.style.left = b.x + "px";
			d.style.top = b.y + "px";
			d.style.width = s + "px";
			d.style.height = s + "px";
			d.style.animationDelay = i * 0.08 + "s";
			kill(d, 1100);
		}
		this.float(player, "回旋·防壁", { color: GOLD_L, size: 14 });
	},

	/* ---------------- 漆黑意志 ---------------- */

	qhei(player, success, targets) {
		this.sound("qnj_judge", 0.6);
		const dark = mk("qnj-dark");
		if (dark) kill(dark, 1600);
		if (!success) {
			this.float(player, "漆黑意志…未达", { color: "rgba(180,170,160,.9)", size: 14 });
			return;
		}
		const b = box(player);
		if (b) {
			const s = mk("qnj-star");
			if (s) {
				s.style.left = b.x + "px";
				s.style.top = b.y + "px";
				kill(s, 900);
			}
		}
		this.float(player, "漆黑意志", { color: "#f6f0e2", size: 18 });
		const list = targets || [];
		for (let i = 0; i < list.length && i < 4; i++) {
			((t, d) =>
				setTimeout(() => {
					const bb = box(t);
					if (!bb) return;
					const s = mk("qnj-lock");
					if (!s) return;
					s.style.left = bb.x + "px";
					s.style.top = bb.y + "px";
					kill(s, 1000);
				}, d))(list[i], 140 + i * 90);
		}
		this.sound("qnj_lock", 0.55);
	},

	/* ---------------- 漫舞者 ---------------- */

	horse(player) {
		const b = box(player);
		if (!b) return;
		this.sound("qnj_horse", 0.6);
		for (let i = 0; i < qn(16); i++) {
			const d = mk("qnj-dust");
			if (!d) return;
			d.style.left = b.x + (rnd(i * 7) - 0.5) * b.w * 0.8 + "px";
			d.style.top = b.y + b.h * 0.35 + "px";
			d.style.setProperty("--dx", ((rnd(i * 11) - 0.5) * 90).toFixed(0) + "px");
			d.style.setProperty("--dy", (-30 - rnd(i * 13) * 50).toFixed(0) + "px");
			d.style.animationDelay = i * 0.02 + "s";
			kill(d, 1000);
		}
		this.float(player, "漫舞者", { color: "rgba(214,196,160,.95)", size: 15 });
	},

	/* ---------------- 无限回旋：常驻金环 ---------------- */

	infinity(target) {
		if (!target || !target.node) return;
		try {
			const old = target.querySelector(".qnj-infinity");
			if (old) old.remove();
		} catch (e) {}
		const host = target;
		const a = anchor(target);
		if (!a || !host.appendChild) return;
		try {
			const ar = a.getBoundingClientRect();
			const pr = host.getBoundingClientRect();
			if (!ar.width) return;
			const d = document.createElement("div");
			d.className = "qnj-infinity";
			d.style.left = ar.left - pr.left - 6 + "px";
			d.style.top = ar.top - pr.top - 6 + "px";
			d.style.width = ar.width + 12 + "px";
			d.style.height = ar.height + 12 + "px";
			host.appendChild(d);
			const born = Date.now();
			const timer = setInterval(function () {
				let alive = false;
				try {
					alive = d.isConnected && (Date.now() - born < 2000 || target.storage?.qnj_wuxianhuixuan);
				} catch (e) {
					alive = false;
				}
				if (!alive) {
					clearInterval(timer);
					try {
						d.remove();
					} catch (e) {}
				}
			}, 1000);
			d._qnjTimer = timer;
		} catch (e) {}
	},

	infinityClear(target) {
		try {
			const d = target.querySelector(".qnj-infinity");
			if (d) {
				if (d._qnjTimer) clearInterval(d._qnjTimer);
				d.remove();
			}
		} catch (e) {}
	},

	/* ---------------- 完全なる黄金回旋エネルギー ---------------- */

	/* ---------------- 完全なる黄金回旋エネルギー（斐波那契螺旋） ---------------- */

	ultimate(player, target) {
		const l = topLayer();
		if (!l) return;
		const self = this;
		const TOTAL = 5200;
		const root = document.createElement("div");
		root.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden";
		l.appendChild(root);

		const add = function (cls, style) {
			const d = document.createElement("div");
			if (cls) d.className = cls;
			if (style) d.style.cssText = style;
			root.appendChild(d);
			return d;
		};

		// 底幕：暖金
		const bg = add(
			"",
			"position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .45s ease;" +
				"background:radial-gradient(ellipse at 50% 50%,rgba(62,38,8,.58) 0%,rgba(12,7,2,.93) 68%,rgba(0,0,0,.98) 100%)"
		);
		setTimeout(() => {
			try {
				bg.style.opacity = "1";
			} catch (e) {}
		}, 20);

		this.sound("qnj_golden", 0.9);

		const sc = screen();

		/* ---- 斐波那契正方形 + 黄金螺旋（圆心/端点均已推导，首尾相接） ---- */
		// [半径r, 终点x, 终点y]，起点为上一段终点，首段起点为 (1,0)
		const ARCS = [
			[1, 0, 1],
			[1, -1, 0],
			[2, 1, -2],
			[3, 4, 1],
			[5, -1, 6],
			[8, -9, -2],
			[13, 4, -15],
			[21, 25, 6],
		];
		// [x, y, 边长]
		const SQ = [
			[0, 0, 1],
			[-1, 0, 1],
			[-1, -2, 2],
			[1, -2, 3],
			[-1, 1, 5],
			[-9, -2, 8],
			[-9, -15, 13],
			[4, -15, 21],
		];

		let pathD = "M 1 0";
		for (const a of ARCS) pathD += " A " + a[0] + " " + a[0] + " 0 0 1 " + a[1] + " " + a[2];

		let svg = null;
		try {
			if (typeof document.createElementNS === "function") {
				const NS = "http://www.w3.org/2000/svg";
				svg = document.createElementNS(NS, "svg");
				svg.setAttribute("viewBox", "-9 -15 34 21");
				svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
				svg.setAttribute("class", "qnj-spiral");
				svg.style.cssText =
					"position:absolute;left:50%;top:50%;width:80vmin;height:80vmin;transform:translate(-50%,-50%) scale(.55);opacity:0;overflow:visible";
				root.appendChild(svg);

				// 正方形骨架（分批淡入 = 构图过程）
				SQ.forEach((s, i) => {
					const r = document.createElementNS(NS, "rect");
					r.setAttribute("x", s[0]);
					r.setAttribute("y", s[1]);
					r.setAttribute("width", s[2]);
					r.setAttribute("height", s[2]);
					r.setAttribute("class", "qnj-sq");
					r.style.opacity = "0";
					svg.appendChild(r);
					setTimeout(() => {
						try {
							r.style.transition = "opacity .35s ease";
							r.style.opacity = "0.88";
						} catch (e) {}
					}, 120 + i * 110);
				});

				// 黄金矩形外框
				const frame = document.createElementNS(NS, "rect");
				frame.setAttribute("x", -9);
				frame.setAttribute("y", -15);
				frame.setAttribute("width", 34);
				frame.setAttribute("height", 21);
				frame.setAttribute("class", "qnj-frame");
				svg.appendChild(frame);

				// 螺旋主线
				const path = document.createElementNS(NS, "path");
				path.setAttribute("d", pathD);
				path.setAttribute("class", "qnj-spiral-line");
				svg.appendChild(path);

				// 描线动画：让螺旋自己"长"出来
				let len = 85;
				try {
					if (typeof path.getTotalLength === "function") {
						const real = path.getTotalLength();
						if (real > 1) len = real;
					}
				} catch (e) {}
				path.style.strokeDasharray = String(len);
				path.style.strokeDashoffset = String(len);
				setTimeout(() => {
					try {
						if (typeof path.animate === "function") {
							path.animate(
								[{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
								{ duration: 1500, easing: "cubic-bezier(.35,0,.15,1)", fill: "forwards" }
							);
						} else {
							path.style.transition = "stroke-dashoffset 1.5s cubic-bezier(.35,0,.15,1)";
							path.style.strokeDashoffset = "0";
						}
					} catch (e) {}
				}, 260);

				// 螺旋上跑动的光点
				setTimeout(() => {
					try {
						if (typeof path.getPointAtLength !== "function") return;
						const head = document.createElementNS(NS, "circle");
						head.setAttribute("r", "0.55");
						head.setAttribute("class", "qnj-spiral-head");
						svg.appendChild(head);
						const t0 = Date.now();
						const DUR = 1500;
						const step = function () {
							const k = Math.min(1, (Date.now() - t0) / DUR);
							try {
								const pt = path.getPointAtLength(len * k);
								head.setAttribute("cx", pt.x);
								head.setAttribute("cy", pt.y);
								head.style.opacity = String(1 - Math.max(0, k - 0.85) * 4);
							} catch (e) {}
							if (k < 1) requestAnimationFrame(step);
						};
						requestAnimationFrame(step);
					} catch (e) {}
				}, 260);
			}
		} catch (e) {
			svg = null;
		}

		// 不支持 SVG 时的退路：保留一个金色漩涡，不至于什么都不显示
		if (!svg) {
			const fb = add("qnj-vortex");
			fb.style.left = "50%";
			fb.style.top = "50%";
			fb.style.width = "70vmin";
			fb.style.height = "70vmin";
		}

		// 入场：整体放大到正常尺寸
		setTimeout(() => {
			try {
				if (!svg) return;
				svg.style.transition = "opacity .45s ease, transform 1s cubic-bezier(.2,.8,.2,1)";
				svg.style.opacity = "1";
				svg.style.transform = "translate(-50%,-50%) scale(1) rotate(0deg)";
			} catch (e) {}
		}, 60);

		// 持续自转：象征"无限回转"
		setTimeout(() => {
			try {
				if (!svg) return;
				svg.style.transition = "none";
				svg.style.animation = "qnjSpiralSpin 6s linear infinite";
			} catch (e) {}
		}, 1100);

		// 金色粒子沿螺旋由内向外溢出
		setTimeout(() => {
			try {
				for (let i = 0; i < qn(26); i++) {
					const d = add("qnj-goldmote");
					const ang = rnd(i * 3.7) * Math.PI * 2;
					const rad = 40 + rnd(i * 9.1) * 260;
					d.style.left = sc.x + Math.cos(ang) * rad + "px";
					d.style.top = sc.y + Math.sin(ang) * rad + "px";
					d.style.setProperty("--dx", (-Math.cos(ang) * 90).toFixed(0) + "px");
					d.style.setProperty("--dy", (-Math.sin(ang) * 90 - 40).toFixed(0) + "px");
					d.style.animationDelay = (rnd(i * 5.3) * 0.5).toFixed(2) + "s";
					kill(d, 2600);
				}
			} catch (e) {}
		}, 700);

		// 标题
		setTimeout(() => {
			try {
				const t = add("qnj-title");
				t.textContent = "黄金回旋";
				const s = add("qnj-sub");
				s.textContent = "GOLDEN SPIN · 完美无缺";
			} catch (e) {}
		}, 1000);

		// 收束：整条螺旋旋转着缩向目标
		setTimeout(() => {
			try {
				const b = box(target);
				if (!svg) return;
				svg.style.animation = "none";
				// 只用 transform + opacity：不触发布局，手机端才不会掉帧。
				// 原先改 width/height/left/top 会让这个 80vmin 的大块每帧重新布局+重新光栅化。
				svg.style.transition = "transform .95s cubic-bezier(.3,0,.2,1), opacity .95s ease";
				const dx = b ? b.x - sc.x : 0;
				const dy = b ? b.y - sc.y : 0;
				svg.style.transform =
					"translate(-50%,-50%) translate(" + dx + "px," + dy + "px) scale(.275) rotate(420deg)";
				svg.style.opacity = "0";
			} catch (e) {}
		}, 2700);

		// 命中：金色冲击波
		setTimeout(() => {
			try {
				self.sound("qnj_hit", 0.75);
				const b = box(target) || { x: sc.x, y: sc.y };
				for (let i = 0; i < 3; i++) {
					(function (k) {
						setTimeout(function () {
							try {
								const r = mk("qnj-burst");
								if (!r) return;
								const s2 = 110 + k * 70;
								r.style.left = b.x + "px";
								r.style.top = b.y + "px";
								r.style.width = s2 + "px";
								r.style.height = s2 + "px";
								kill(r, 900);
							} catch (e) {}
						}, k * 90);
					})(i);
				}
				self.spark(target, { count: 34, spread: 120 });
			} catch (e) {}
		}, 3300);

		// 目标：∞ 环
		setTimeout(() => {
			try {
				self.infinity(target);
				self.sound("qnj_infinity", 0.8);
			} catch (e) {}
		}, 3600);

		// 收束
		setTimeout(() => {
			try {
				root.style.transition = "opacity .7s ease";
				root.style.opacity = "0";
			} catch (e) {}
		}, TOTAL - 800);
		kill(root, TOTAL);
	},

		/* ---------------- 失去所有技能：碎裂 ---------------- */

	shatterSkills(player, names) {
		this.sound("qnj_shatter", 0.75);
		const b = box(player);
		if (!b) return;
		const list = (names && names.length ? names : ["漆黑意志", "漫舞者", "牙"]).slice(0, 6);
		list.forEach((name, i) => {
			setTimeout(() => {
				const c = mk("qnj-chip");
				if (!c) return;
				c.textContent = name;
				c.style.left = b.x - 40 + "px";
				c.style.top = b.y - 10 + i * 22 + "px";
				setTimeout(() => {
					try {
						c.style.transform = "translate(" + ((rnd(i * 3) - 0.5) * 90) + "px," + (-40 - rnd(i * 5) * 60) + "px) rotate(" + ((rnd(i * 7) - 0.5) * 60) + "deg) scale(.85)";
						c.style.opacity = "0";
						c.style.filter = "blur(2px)";
					} catch (e) {}
				}, 40);
				kill(c, 900);
			}, i * 120);
		});
	},

	/* ---------------- Canvas 粒子（金尘） ---------------- */

	spark(player, opt) {
		opt = opt || {};
		const l = topLayer();
		if (!l) return;
		const b = box(player);
		if (!b) return;
		const W = l.clientWidth || 1920;
		const H = l.clientHeight || 1080;
		const cv = document.createElement("canvas");
		cv.width = W;
		cv.height = H;
		cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
		l.appendChild(cv);
		const ctx = typeof cv.getContext === "function" ? cv.getContext("2d") : null;
		if (!ctx) {
			try {
				cv.remove();
			} catch (e) {}
			return;
		}
		const n = qn(Math.max(1, Math.min(120, opt.count || 40)));
		const color = opt.color || "rgba(255,214,107,1)";
		const dur = opt.duration || 900;
		const parts = [];
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = 1.2 + Math.random() * 4.6;
			parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 1 + Math.random() * 2 });
		}
		const t0 = Date.now();
		const step = function () {
			const k = (Date.now() - t0) / dur;
			if (k >= 1) {
				try {
					cv.remove();
				} catch (e) {}
				return;
			}
			ctx.clearRect(0, 0, W, H);
			ctx.globalCompositeOperation = "lighter";
			ctx.fillStyle = color;
			for (let i = 0; i < parts.length; i++) {
				const p = parts[i];
				p.x += p.vx;
				p.y += p.vy;
				p.vy += 0.09;
				p.vx *= 0.988;
				p.vy *= 0.988;
				ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
				ctx.beginPath();
				ctx.arc(p.x, p.y, Math.max(0.3, p.r * (1 - k * 0.5)), 0, Math.PI * 2);
				ctx.fill();
			}
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
		};
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
	},
};


/* ============================================================================
 * 画质档位（1~5，默认 3）
 *   1 极简 / 2 省电 / 3 标准 / 4 高 / 5 极致
 * 只影响表现（粒子数、滤镜、遮罩、时长），不参与任何结算。
 * ========================================================================== */
const CFG_LEVEL = "extension_脑花乔尼_fx_level";
const LEVEL_PART = [0.2, 0.4, 0.7, 1, 1.35];
const LEVEL_TIME = [0.5, 0.7, 1, 1, 1.05];

function qlv() {
	let v = 3;
	try {
		const n = parseInt(lib.config[CFG_LEVEL], 10);
		if (n >= 1 && n <= 5) v = n;
	} catch (e) {}
	return v;
}

/** 粒子数量按档位缩放（至少 1 个，避免"看起来没放"） */
function qn(n) {
	try {
		return Math.max(1, Math.round(n * LEVEL_PART[qlv() - 1]));
	} catch (e) {
		return n;
	}
}

/** 演出时长倍率：1/2 档更快，5 档略长 */
function qtime(ms) {
	try {
		return Math.max(120, Math.round(ms * LEVEL_TIME[qlv() - 1]));
	} catch (e) {
		return ms;
	}
}

fx.timeScale = function () {
	try {
		return LEVEL_TIME[qlv() - 1];
	} catch (e) {
		return 1;
	}
};

fx.level = function () {
	return qlv();
};

lib.qnjFx = fx;

export default fx;
