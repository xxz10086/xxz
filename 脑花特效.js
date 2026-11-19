import { lib, game, ui, get, ai, _status } from "noname";

/* ============================================================================
 * 羂索（脑花）技能特效层
 * ----------------------------------------------------------------------------
 * 纯 DOM + CSS 实现，不依赖任何外部图片 / 音频素材。
 * 设计原则：
 *   1. 只做视觉，不碰结算逻辑；任何一步抛错都只能吞掉，绝不影响游戏流程。
 *   2. 不遮挡手牌区、mark 区、血量、箭头、结算队列（见 LAYER_SAFE 说明）。
 *   3. 联机下由 game.broadcastAll 驱动，每个客户端各算各的锚点坐标。
 *   4. 尊重 lib.config.extension_脑花乔尼_naohua_fx 开关。
 * ========================================================================== */

const LAYER_ID = "naohua-fx";
const TOP_ID = "naohua-fx-top";
const STYLE_ID = "naohua-fx-style";
const CFG_KEY = "extension_脑花乔尼_naohua_fx";
const CFG_SFX = "extension_脑花乔尼_naohua_sfx";
const AUDIO_BASE = "extension/脑花乔尼/audio/fx/";

/* 层级说明：9 低于无名杀对话框（10+），高于 #arena（1），
 * 保证技能演出不会被牌堆 / 座位卡盖住，也不会盖住任何交互弹窗。 */
const LAYER_Z = 9;

const COL = {
	dark: "rgba(10,4,8,.92)",
	red: "rgba(194,65,63,.92)",
	purple: "rgba(122,30,61,.9)",
	bone: "rgba(232,222,210,.95)",
	gray: "rgba(160,160,160,.85)",
};

const CSS_TEXT = `
#naohua-fx{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:${LAYER_Z};overflow:hidden}
#naohua-fx *{box-sizing:border-box;pointer-events:none}

/* 高层：只给「死灭回游」「夺舍」这类大演出用，刻意压过对话框。
 * pointer-events:none 保证点击穿透，底下按钮照样能点。 */
#naohua-fx-top{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden}
#naohua-fx-top *{box-sizing:border-box;pointer-events:none}

/* 能量球内部流光 */
@keyframes nhFsSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* 受击抖动（挂在 .player 上，用完必须摘掉） */
.nh-hit{animation:nhHit .12s linear infinite !important;will-change:transform,filter}
@keyframes nhHit{
	0%{transform:translate(0,0) scale(1);filter:none}
	20%{transform:translate(-5px,3px) scale(1.05);filter:brightness(1.7) contrast(140%)}
	40%{transform:translate(4px,-4px) scale(1.03);filter:brightness(2) drop-shadow(0 0 12px #ff2b4d)}
	60%{transform:translate(-3px,-2px) scale(1.04);filter:contrast(170%) brightness(1.4)}
	80%{transform:translate(3px,2px) scale(1.02);filter:brightness(1.5)}
	100%{transform:translate(0,0) scale(1);filter:none}
}

/* 压暗层：只压边缘，中心几乎透明 —— 保证手牌与结算区始终看得清 */
/* ===== 画质档位：CSS 变量（默认 5 档全开） ===== */
#naohua-fx,#naohua-fx-top{
	--blend:screen;
	--f-art:contrast(1.3) saturate(.62) brightness(.92) drop-shadow(0 0 54px rgba(194,65,63,.5));
	--f-soul:blur(.4px) contrast(1.22) saturate(.7);
	--f-ciart:contrast(1.12) saturate(.88) brightness(.92);
}
#naohua-fx.fx-lv4,#naohua-fx-top.fx-lv4{
	--f-art:contrast(1.3) saturate(.62) drop-shadow(0 0 30px rgba(194,65,63,.4));
}
#naohua-fx.fx-lv3,#naohua-fx-top.fx-lv3{
	--blend:normal;
	--f-art:contrast(1.25) saturate(.65);
	--f-soul:contrast(1.2) saturate(.7);
	--f-ciart:contrast(1.1) saturate(.9);
}
#naohua-fx.fx-lv2,#naohua-fx-top.fx-lv2{
	--blend:normal;
	--f-art:none;
	--f-soul:none;
	--f-ciart:none;
}
/* ===== 低档清洗 ===== */
#naohua-fx.fx-lv1 *,#naohua-fx-top.fx-lv1 *{
	filter:none!important;mix-blend-mode:normal!important;text-shadow:none!important}
/* 注意：不关 box-shadow —— 「帐」「护盾」「冲击波」等完全靠阴影成形，关掉会变透明 */
#naohua-fx.fx-lv2 *,#naohua-fx-top.fx-lv2 *{mix-blend-mode:normal!important}
/* 2 档：标题仍保留色彩，但去掉模糊 */
#naohua-fx.fx-lv2 .nh-ci-title,#naohua-fx-top.fx-lv2 .nh-ci-title{filter:none}
#naohua-fx.fx-lv1,#naohua-fx-top.fx-lv1{
	--blend:normal;
	--f-art:none;
	--f-soul:none;
	--f-ciart:none;
}

.nh-dim{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .18s ease;
	background:radial-gradient(ellipse at 50% 52%,rgba(40,8,20,0) 0%,rgba(40,8,20,.05) 40%,rgba(8,3,6,.44) 74%,rgba(4,1,3,.58) 100%)}
.nh-dim.on{opacity:1}

/* 涟漪 */
.nh-ring{position:absolute;border-radius:50%;border:2px solid rgba(194,65,63,.85);
	box-shadow:0 0 16px rgba(194,65,63,.75),inset 0 0 24px rgba(122,30,61,.55);
	transform:translate(-50%,-50%) scale(.28);opacity:.95;
	animation:nhRing .55s cubic-bezier(.2,.75,.3,1) forwards}
@keyframes nhRing{60%{opacity:.72}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}

/* 咒力飞线 */
.nh-line{position:absolute;height:5px;width:0;border-radius:3px;opacity:0;transform-origin:0 50%;
	background:linear-gradient(90deg,rgba(30,8,18,0),rgba(122,30,61,.9) 30%,rgba(194,65,63,.95) 72%,rgba(30,8,18,0));
	box-shadow:0 0 10px rgba(194,65,63,.65);transition:width .28s ease-out,opacity .18s linear}

/* 咒灵卵 */
.nh-eggs{position:absolute;transform:translate(-50%,-50%);transition:opacity .3s ease;white-space:nowrap}
.nh-egg{position:absolute;width:14px;height:19px;border-radius:50% 50% 46% 46%/58% 58% 42% 42%;
	transform:translate(-50%,-50%);
	background:radial-gradient(circle at 42% 34%,#e0707a,#8d1f3a 55%,#3a0a1c);
	box-shadow:0 0 10px rgba(194,65,63,.8),inset 0 -2px 4px rgba(0,0,0,.6);
	animation:nhEggIn .26s ease-out}
.nh-egg:after{content:"";position:absolute;left:50%;top:46%;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;
	border-radius:50%;background:#1a0308;box-shadow:0 0 3px #000}
.nh-egg.off{opacity:.22;filter:grayscale(1);box-shadow:none}
.nh-egg.pop{animation:nhEggPop .4s ease-out}
.nh-egg.burst{animation:nhEggBurst .45s ease-in forwards}
@keyframes nhEggIn{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
@keyframes nhEggPop{0%{transform:translate(-50%,-50%) scale(.35)}60%{transform:translate(-50%,-50%) scale(1.35)}100%{transform:translate(-50%,-50%) scale(1)}}
@keyframes nhEggBurst{0%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(2.1);opacity:0}}

/* 帐：头像外环 */
.nh-veil{position:absolute;border-radius:50%;opacity:0;animation:nhVeilIn .45s ease-out forwards;
	box-shadow:inset 0 0 0 2px rgba(150,40,80,.55),inset 0 0 20px rgba(90,10,40,.45),0 0 14px rgba(90,10,40,.35)}
@keyframes nhVeilIn{to{opacity:1}}
.nh-veil i{position:absolute;top:-38%;width:2px;height:42%;transform-origin:50% 100%;
	background:linear-gradient(180deg,rgba(122,30,61,0),rgba(122,30,61,.85));animation:nhSway 3.2s ease-in-out infinite}
.nh-veil i:nth-child(1){left:26%}
.nh-veil i:nth-child(2){left:72%;animation-delay:-1.4s}
@keyframes nhSway{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
.nh-veil.break{animation:nhVeilBreak .3s ease-in forwards}
@keyframes nhVeilBreak{0%{transform:scale(1,1);opacity:1}55%{transform:scale(.06,1.18);opacity:1}100%{transform:scale(0,1);opacity:0}}

/* 断裂斩痕 */
.nh-slash{position:absolute;height:3px;transform-origin:0 50%;opacity:0;
	background:linear-gradient(90deg,transparent,rgba(194,65,63,.95),transparent);
	box-shadow:0 0 12px rgba(194,65,63,.9);animation:nhSlash .42s ease-out forwards}
@keyframes nhSlash{0%{opacity:0;transform:rotate(var(--a)) scaleX(.15)}28%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) scaleX(1)}}

/* 灰烬 / 碎屑 */
.nh-ash{position:absolute;width:4px;height:4px;border-radius:50%;opacity:0;
	animation:nhAsh .7s ease-out forwards}
@keyframes nhAsh{0%{opacity:.95;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.25)}}

/* 飘字 */
.nh-float{position:absolute;transform:translate(-50%,-50%);font-weight:700;white-space:nowrap;opacity:0;
	text-shadow:0 0 8px rgba(194,65,63,.9),0 0 18px rgba(122,30,61,.7),0 1px 2px rgba(0,0,0,.9);
	animation:nhFloat 1s ease-out forwards}
@keyframes nhFloat{0%{opacity:0;transform:translate(-50%,-50%) scale(.8)}
	16%{opacity:1;transform:translate(-50%,-58%) scale(1)}
	100%{opacity:0;transform:translate(-50%,-132%) scale(.96)}}

/* 技能名飞片 */
.nh-chip{position:absolute;padding:2px 8px;border-radius:3px;font-size:12px;white-space:nowrap;color:#f0e7dc;
	border:1px solid rgba(194,65,63,.75);background:linear-gradient(180deg,rgba(60,10,26,.92),rgba(26,4,12,.92));
	box-shadow:0 0 12px rgba(194,65,63,.55);opacity:1;
	transition:left .55s cubic-bezier(.3,0,.2,1),top .55s cubic-bezier(.3,0,.2,1),opacity .55s ease,transform .55s ease}

/* 座次转移残影 */
.nh-ghost{position:absolute;border-radius:6px;background-size:cover;background-position:center;
	opacity:.85;filter:drop-shadow(0 0 16px rgba(194,65,63,.7));
	transition:transform .5s cubic-bezier(.3,0,.2,1),opacity .5s ease}

/* 头像闪光 / 碎裂 */
.nh-flash{position:absolute;border-radius:8px;animation:nhFlash .42s ease-out forwards;
	background:radial-gradient(circle,rgba(194,65,63,.55),rgba(194,65,63,0) 70%)}
@keyframes nhFlash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}

/* 全屏 cut-in */
.nh-cutin{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;animation:nhCutIn .28s ease-out forwards}
@keyframes nhCutIn{to{opacity:1}}
.nh-cutin.nh-out{animation:nhOut .32s ease-in forwards}
@keyframes nhOut{to{opacity:0}}
.nh-ci-mask{position:absolute;left:0;top:0;width:100%;height:100%;
	background:linear-gradient(90deg,rgba(6,2,4,.93) 0%,rgba(10,3,8,.55) 44%,rgba(20,4,10,.12) 68%,rgba(6,2,4,.78) 100%)}
.nh-ci-img{position:absolute;right:2%;bottom:0;height:82%;width:56%;background-repeat:no-repeat;
	background-position:bottom center;background-size:contain;filter:var(--f-ciart);
	transform:translateX(7%) scale(1.04);animation:nhCiImg .5s cubic-bezier(.2,.8,.25,1) forwards;
	-webkit-mask-image:radial-gradient(ellipse 72% 80% at 50% 46%,#000 40%,rgba(0,0,0,.55) 72%,transparent 100%);
	mask-image:radial-gradient(ellipse 72% 80% at 50% 46%,#000 40%,rgba(0,0,0,.55) 72%,transparent 100%)}
@keyframes nhCiImg{to{transform:translateX(0) scale(1)}}
.nh-ci-title{position:absolute;left:7%;top:32%;font-size:62px;font-weight:700;letter-spacing:.2em;
	color:#e9dfd3;opacity:0;transform:scale(1.25);filter:blur(6px);
	text-shadow:0 0 18px rgba(194,65,63,.85),0 0 48px rgba(122,30,61,.7),0 2px 0 #2a0710;
	animation:nhCiTitle .55s cubic-bezier(.2,.8,.25,1) .08s forwards}
@keyframes nhCiTitle{to{opacity:1;transform:scale(1);filter:blur(0)}}
.nh-ci-sub{position:absolute;left:7.6%;top:52%;font-size:15px;letter-spacing:.34em;color:rgba(232,222,210,.7);
	opacity:0;animation:nhCutIn .4s ease-out .24s forwards}
.nh-eye{position:absolute;width:22px;height:22px;border-radius:50%;opacity:0;transform:scale(.4);
	background:radial-gradient(circle at 50% 50%,#0b0206 0%,#2a0710 38%,rgba(194,65,63,.55) 58%,rgba(194,65,63,0) 72%);
	box-shadow:0 0 14px rgba(194,65,63,.55);animation:nhEye 1.2s ease-out forwards}
@keyframes nhEye{25%{opacity:.95;transform:scale(1)}70%{opacity:.8}100%{opacity:0;transform:scale(.3)}}

/* ============================================================================
 * 死灭回游 · 大特效（三段式：结界展开 → 咒灵睁眼 / 立绘砸入 / 标题冲击 → 泳者登録收束）
 * 全部是 DOM + CSS，无图片素材；整段只在开展时播一次。
 * ========================================================================== */
.nh-sm{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;will-change:transform,opacity}
.nh-sm>*{position:absolute}

/* 底幕 */
.nh-sm-bg{left:0;top:0;width:100%;height:100%;opacity:0;
	background:radial-gradient(ellipse at 50% 48%,rgba(24,5,12,.52) 0%,rgba(6,2,4,.78) 58%,rgba(2,0,1,.92) 100%);
	animation:nhSmBg 3.2s ease-out forwards}
@keyframes nhSmBg{0%{opacity:0}7%{opacity:1}86%{opacity:1}100%{opacity:0}}

/* 爆闪 */
.nh-sm-flash{left:0;top:0;width:100%;height:100%;opacity:0;mix-blend-mode:var(--blend);
	background:radial-gradient(circle at 50% 50%,#fff 0%,rgba(255,236,238,.65) 26%,rgba(255,60,90,.18) 52%,transparent 70%);
	animation:nhSmFlash 1.05s ease-out forwards}
@keyframes nhSmFlash{0%{opacity:0}3%{opacity:.98}11%{opacity:0}22%{opacity:.5}30%{opacity:0}100%{opacity:0}}

/* 结界网格：从中心虹膜式张开 */
.nh-sm-grid{left:-12%;top:-12%;width:124%;height:124%;opacity:.9;
	background-image:
		repeating-linear-gradient(90deg,rgba(194,65,63,.5) 0 1px,transparent 1px 76px),
		repeating-linear-gradient(0deg,rgba(194,65,63,.5) 0 1px,transparent 1px 76px),
		repeating-linear-gradient(90deg,rgba(122,30,61,.28) 0 1px,transparent 1px 19px),
		repeating-linear-gradient(0deg,rgba(122,30,61,.28) 0 1px,transparent 1px 19px);
	animation:nhSmGrid 1.55s cubic-bezier(.16,.84,.24,1) forwards}
@keyframes nhSmGrid{
	0%{clip-path:inset(49% 49% 49% 49%);opacity:0}
	22%{opacity:.9}
	62%{clip-path:inset(0 0 0 0);opacity:.6}
	100%{clip-path:inset(0 0 0 0);opacity:.3}
}

/* 结界柱 */
.nh-sm-pillar{width:7px;height:132%;top:-16%;
	background:linear-gradient(180deg,transparent,rgba(194,65,63,.95) 28%,rgba(122,30,61,.35) 72%,transparent);
	box-shadow:0 0 26px rgba(194,65,63,.85);opacity:0;
	animation:nhSmPillar .95s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes nhSmPillar{0%{opacity:0;transform:scaleY(.15)}26%{opacity:1}100%{opacity:.32;transform:scaleY(1)}}

/* 咒纹环 */
.nh-sm-ring{left:50%;top:50%;border-radius:50%;border:2px dashed rgba(194,65,63,.8);
	transform:translate(-50%,-50%) scale(.12) rotate(0deg);opacity:0;
	animation:nhSmRing 1.7s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes nhSmRing{
	0%{transform:translate(-50%,-50%) scale(.12) rotate(0deg);opacity:0}
	14%{opacity:1}
	100%{transform:translate(-50%,-50%) scale(1) rotate(150deg);opacity:0}
}

/* 咒灵之眼 */
.nh-sm-eye{left:0;top:0;border-radius:50%;opacity:0;transform:scaleY(.05);
	background:radial-gradient(circle at 50% 50%,#0a0206 0%,#2a0710 38%,rgba(194,65,63,.55) 60%,rgba(194,65,63,0) 74%);
	box-shadow:0 0 14px rgba(194,65,63,.65);animation:nhSmEye 1.1s ease-in-out forwards}
@keyframes nhSmEye{
	0%{opacity:0;transform:scaleY(.05) scale(.6)}
	16%{opacity:1;transform:scaleY(1) scale(1)}
	38%{opacity:.92;transform:scaleY(.1) scale(1)}
	56%{opacity:1;transform:scaleY(1) scale(1.04)}
	80%{opacity:.7;transform:scaleY(.9) scale(1)}
	100%{opacity:0;transform:scaleY(.05) scale(.85)}
}

/* 立绘 */
.nh-sm-art{right:-6%;bottom:-6%;width:72%;height:112%;background-repeat:no-repeat;
	background-position:bottom right;background-size:contain;opacity:0;
	filter:contrast(1.22) saturate(.8) drop-shadow(0 0 46px rgba(194,65,63,.45));
	-webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.9) 26%,#000 100%);
	mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.9) 26%,#000 100%);
	animation:nhSmArt 3.1s cubic-bezier(.16,.84,.24,1) forwards}
@keyframes nhSmArt{
	0%{opacity:0;transform:translateX(15%) scale(1.08)}
	20%{opacity:.95;transform:translateX(0) scale(1)}
	78%{opacity:.88}
	100%{opacity:0;transform:translateX(-2%) scale(1.02)}
}

/* 万花筒残像 */
.nh-sm-kal{left:50%;top:50%;width:0;height:0}
.nh-sm-kal i{position:absolute;left:0;top:0;width:200px;height:280px;margin:-170px 0 0 -100px;
	background-size:contain;background-repeat:no-repeat;background-position:center;opacity:0;
	filter:blur(1px) contrast(1.3) saturate(.5);
	animation:nhSmKal 1.2s ease-out forwards}
@keyframes nhSmKal{
	0%{opacity:0;transform:rotate(var(--r)) translateY(0) scale(.35)}
	26%{opacity:.45}
	100%{opacity:0;transform:rotate(var(--r)) translateY(-280px) scale(1.05)}
}

/* 字符雨 */
.nh-sm-rain{left:0;top:0;width:100%;height:100%}
.nh-sm-rain span{position:absolute;top:-10%;color:rgba(194,65,63,.8);
	text-shadow:0 0 10px rgba(194,65,63,.85);animation:nhSmRain linear forwards}
@keyframes nhSmRain{0%{transform:translateY(0);opacity:0}12%{opacity:.95}100%{transform:translateY(118vh);opacity:0}}

/* 冲击环 */
.nh-sm-impact{left:50%;top:44%;border-radius:50%;border:3px solid rgba(255,255,255,.9);
	box-shadow:0 0 30px rgba(255,255,255,.7),0 0 70px rgba(194,65,63,.8);
	transform:translate(-50%,-50%) scale(.08);opacity:.95;
	animation:nhSmImpact .72s cubic-bezier(.1,.7,.2,1) forwards}
@keyframes nhSmImpact{100%{transform:translate(-50%,-50%) scale(3.4);opacity:0}}

/* 标题 */
.nh-sm-title{left:50%;top:42%;transform:translate(-50%,-50%);font-size:92px;font-weight:900;
	letter-spacing:.22em;color:#f4ece2;white-space:nowrap;opacity:0;
	text-shadow:
		3px 0 0 rgba(255,42,84,.55),
		-3px 0 0 rgba(64,214,255,.32),
		0 0 26px rgba(194,65,63,1),
		0 0 66px rgba(122,30,61,.9),
		0 5px 0 #180206;
	animation:nhSmTitle 1.05s cubic-bezier(.16,1,.3,1) forwards}
@keyframes nhSmTitle{
	0%{opacity:0;transform:translate(-50%,-50%) scale(3.4);filter:blur(16px)}
	34%{opacity:1;filter:blur(0)}
	50%{transform:translate(-50%,-50%) scale(.93)}
	60%{transform:translate(-50%,-50%) scale(1.03)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}
}

/* 副标题 */
.nh-sm-sub{left:50%;top:55.5%;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.62em;
	color:rgba(232,222,210,.82);white-space:nowrap;opacity:0;
	text-shadow:0 0 12px rgba(194,65,63,.8);animation:nhSmSub .55s ease-out .95s forwards}
@keyframes nhSmSub{to{opacity:1}}

/* 泳者登録 HUD */
.nh-sm-hud{left:50%;bottom:13%;transform:translateX(-50%);text-align:center;
	font-family:"Consolas","Courier New",monospace;color:#e9dfd3;opacity:0;
	animation:nhSmHud .5s ease-out 1s forwards}
@keyframes nhSmHud{to{opacity:1}}
.nh-sm-hud b{display:block;font-size:42px;letter-spacing:.08em;line-height:1;
	text-shadow:0 0 20px rgba(194,65,63,.95),0 0 44px rgba(122,30,61,.8)}
.nh-sm-hud em{display:block;font-style:normal;font-size:11px;letter-spacing:.48em;
	color:rgba(232,222,210,.6);margin-top:4px}
.nh-sm-bar{width:400px;height:3px;margin:9px auto 0;background:rgba(194,65,63,.16);overflow:hidden}
.nh-sm-bar i{display:block;height:100%;width:0;
	background:linear-gradient(90deg,rgba(122,30,61,.9),rgba(194,65,63,1));
	box-shadow:0 0 12px rgba(194,65,63,.95)}

/* 收尾 */
.nh-sm-out{animation:nhSmOut .55s ease-in forwards}
@keyframes nhSmOut{to{opacity:0}}

/* 震动（只震特效层，游戏 UI 不动） */
@keyframes nhSmShake{
	0%,100%{transform:translate(0,0)}
	10%{transform:translate(-7px,3px)}
	25%{transform:translate(6px,-4px)}
	40%{transform:translate(-5px,-3px)}
	55%{transform:translate(4px,4px)}
	70%{transform:translate(-3px,2px)}
	85%{transform:translate(2px,-2px)}
}

/* ============================================================================
 * 夺舍 · 大特效
 * 碎屏裂纹 → 巨瞳 → 立绘砸入 → 标题；尸魂抽取 → 座位环冲击波 → 收束扫光
 * ========================================================================== */
.nh-ds{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;will-change:transform,opacity}
.nh-ds>*{position:absolute}

/* 底幕 */
.nh-ds-bg{left:0;top:0;width:100%;height:100%;opacity:0;
	background:radial-gradient(ellipse at 50% 50%,rgba(64,6,20,.42) 0%,rgba(10,2,5,.86) 58%,rgba(2,0,1,.96) 100%);
	animation:nhDsBg 2.1s ease-out forwards}
@keyframes nhDsBg{0%{opacity:0}6%{opacity:1}86%{opacity:1}100%{opacity:0}}

/* 立绘特写（放大到只剩头肩） */
.nh-ds-art{left:50%;top:44%;width:46%;height:80%;margin:-40% 0 0 -23%;background-repeat:no-repeat;
	background-position:center 16%;background-size:contain;opacity:0;
	filter:var(--f-art);
	-webkit-mask-image:radial-gradient(ellipse 60% 64% at 50% 42%,#000 44%,transparent 100%);
	mask-image:radial-gradient(ellipse 60% 64% at 50% 42%,#000 44%,transparent 100%);
	animation:nhDsArt 1.95s cubic-bezier(.16,.84,.24,1) forwards}
@keyframes nhDsArt{
	0%{opacity:0;transform:scale(2.15)}
	16%{opacity:.96;transform:scale(1.55)}
	72%{opacity:.9;transform:scale(1.5)}
	100%{opacity:0;transform:scale(1.36)}
}

/* 巨瞳 */
.nh-ds-eye{left:50%;top:47%;width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;
	background:radial-gradient(circle at 50% 50%,#08010a 0%,#2a0710 34%,#5b1230 48%,rgba(194,65,63,.55) 58%,rgba(194,65,63,0) 70%);
	box-shadow:0 0 60px rgba(194,65,63,.8),inset 0 0 70px rgba(0,0,0,.9);
	opacity:0;transform:scale(.1);animation:nhDsEye 1.15s cubic-bezier(.16,1,.3,1) .16s forwards}
@keyframes nhDsEye{
	0%{opacity:0;transform:scale(.1)}
	28%{opacity:1;transform:scale(1)}
	44%{transform:scale(1.14)}
	58%{transform:scale(1)}
	100%{opacity:0;transform:scale(1.55)}
}
.nh-ds-eye i{position:absolute;left:50%;top:50%;width:34%;height:34%;margin:-17% 0 0 -17%;border-radius:50%;
	background:radial-gradient(circle,#000 0%,#12030a 58%,rgba(0,0,0,0) 72%);
	box-shadow:0 0 40px rgba(0,0,0,.95);animation:nhDsPupil 1s ease-in-out .34s}
@keyframes nhDsPupil{0%{transform:scale(1.7)}38%{transform:scale(.52)}68%{transform:scale(.78)}100%{transform:scale(.6)}}

/* 玻璃裂纹 */
.nh-ds-crack{left:50%;top:50%;height:3px;transform-origin:0 50%;opacity:0;
	background:linear-gradient(90deg,rgba(255,226,226,.95) 0%,rgba(255,60,90,.9) 26%,rgba(120,10,40,0) 100%);
	box-shadow:0 0 10px rgba(255,60,90,.9),0 0 24px rgba(194,65,63,.55);
	animation:nhDsCrack .42s cubic-bezier(.1,.85,.2,1) forwards}
@keyframes nhDsCrack{
	0%{opacity:0;transform:rotate(var(--a)) scaleX(0)}
	26%{opacity:1}
	100%{opacity:.85;transform:rotate(var(--a)) scaleX(1)}
}

/* 两片碎屏 */
.nh-ds-pane{top:-5%;width:56%;height:110%;background:linear-gradient(90deg,#0b0206,#190309);
	box-shadow:inset 0 0 70px 26px rgba(0,0,0,.92)}
.nh-ds-pane.l{left:-6%;clip-path:polygon(0 0,100% 0,86% 12%,100% 26%,82% 40%,100% 54%,88% 68%,100% 82%,90% 100%,0 100%);
	animation:nhDsPaneL .72s cubic-bezier(.7,0,.3,1) .1s forwards}
.nh-ds-pane.r{right:-6%;clip-path:polygon(0 0,100% 0,100% 100%,10% 100%,0 82%,14% 68%,0 54%,16% 40%,0 26%,12% 12%);
	animation:nhDsPaneR .72s cubic-bezier(.7,0,.3,1) .1s forwards}
@keyframes nhDsPaneL{0%{transform:translateX(0);opacity:1}100%{transform:translateX(-44%);opacity:0}}
@keyframes nhDsPaneR{0%{transform:translateX(0);opacity:1}100%{transform:translateX(44%);opacity:0}}

/* 白闪 */
.nh-ds-flash{left:0;top:0;width:100%;height:100%;mix-blend-mode:var(--blend);
	background:radial-gradient(circle at 50% 47%,#fff 0%,rgba(255,230,235,.7) 24%,rgba(255,40,80,.2) 50%,transparent 68%);
	animation:nhDsFlash .5s ease-out forwards}
@keyframes nhDsFlash{0%{opacity:0}8%{opacity:.96}100%{opacity:0}}

/* 标题 */
.nh-ds-title{left:50%;top:38%;transform:translate(-50%,-50%);font-size:112px;font-weight:900;
	letter-spacing:.3em;color:#f6eee4;white-space:nowrap;opacity:0;
	text-shadow:
		4px 0 0 rgba(255,42,84,.6),
		-4px 0 0 rgba(64,214,255,.34),
		0 0 30px rgba(194,65,63,1),
		0 0 82px rgba(122,30,61,.9),
		0 6px 0 #120104;
	animation:nhDsTitle 1.05s cubic-bezier(.16,1,.3,1) forwards}
@keyframes nhDsTitle{
	0%{opacity:0;transform:translate(-50%,-50%) scale(4.2);filter:blur(20px)}
	38%{opacity:1;filter:blur(0)}
	54%{transform:translate(-50%,-50%) scale(.92)}
	66%{transform:translate(-50%,-50%) scale(1.04)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}
}
.nh-ds-sub{left:50%;top:50%;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.7em;
	color:rgba(232,222,210,.8);white-space:nowrap;opacity:0;
	text-shadow:0 0 14px rgba(194,65,63,.85);animation:nhSmSub .5s ease-out .28s forwards}

/* 尸魂抽取 */
.nh-ds-soul{background-size:contain;background-repeat:no-repeat;background-position:center;
	border-radius:8px;opacity:.92;box-shadow:0 0 44px rgba(194,65,63,.85);
	filter:var(--f-soul);
	transform-origin:top left;
	transition:transform .64s cubic-bezier(.5,0,.2,1),opacity .64s ease-in}

/* 空间裂隙 */
.nh-ds-rift{width:10px;height:0;transform:translate(-50%,-50%);
	background:linear-gradient(180deg,transparent,#ff2b4d 22%,#12010a 50%,#ff2b4d 78%,transparent);
	box-shadow:0 0 34px rgba(255,43,77,.9);animation:nhDsRift .85s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes nhDsRift{0%{height:0;opacity:0}28%{height:120%;opacity:1}100%{height:160%;opacity:0}}

/* 座位环冲击波 */
.nh-ds-wave{border-radius:50%;border:2px solid rgba(194,65,63,.85);
	box-shadow:0 0 34px rgba(194,65,63,.75),inset 0 0 44px rgba(122,30,61,.5);
	animation:nhDsWave 1.15s cubic-bezier(.15,.7,.25,1) forwards}
@keyframes nhDsWave{0%{transform:scale(.2);opacity:0}8%{opacity:1}100%{transform:scale(22);opacity:0}}

/* 座位卡震动 */
.nh-ds-quake{animation:nhDsQuake .42s linear}
@keyframes nhDsQuake{
	0%,100%{transform:translate(0,0)}
	20%{transform:translate(-5px,3px)}
	45%{transform:translate(4px,-3px)}
	70%{transform:translate(-3px,-2px)}
	88%{transform:translate(2px,2px)}
}

/* 收束扫光带 */
.nh-ds-band{left:0;width:100%;height:6px;opacity:0;
	background:linear-gradient(90deg,transparent,rgba(255,242,242,.96),transparent);
	box-shadow:0 0 28px rgba(255,90,120,.95),0 0 60px rgba(194,65,63,.7);
	animation:nhDsBand .85s cubic-bezier(.3,0,.3,1) forwards}
@keyframes nhDsBand{0%{opacity:0;top:-2%}14%{opacity:1}100%{opacity:0;top:102%}}

/* 夺舍抖动 / 收尾 */
@keyframes nhDsShake{
	0%,100%{transform:translate(0,0)}
	12%{transform:translate(-9px,5px)}
	28%{transform:translate(8px,-6px)}
	45%{transform:translate(-6px,-4px)}
	62%{transform:translate(5px,5px)}
	80%{transform:translate(-3px,2px)}
}
@keyframes nhDsOut{to{opacity:0}}
`;

let _styleDone = false;
let _dimCount = 0;
let _lastPlay = {};
let _sfxCache = {};

/** 音效开关：跟随扩展配置，并尊重全局音量 */
function sfxAllowed() {
	try {
		if (lib.config[CFG_SFX] === false) return false;
		if (lib.config.volume === 0) return false;
	} catch (e) {}
	return true;
}

/**
 * 播放一个特效音。
 * 用 cloneNode 复用已解码的音频，避免每次重新拉取；同一音效可叠加播放。
 */
function playSfx(name, vol) {
	try {
		if (!name || typeof Audio !== "function") return;
		if (!sfxAllowed()) return;
		let base = _sfxCache[name];
		if (!base) {
			// 预览页会覆盖这个前缀，让它从本地目录读取同一批文件
			const override = typeof window !== "undefined" && window.__NAOHUA_AUDIO_BASE;
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
		(document.head || document.body || document.documentElement).appendChild(s);
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

/**
 * 高层容器（z-index 9999）：给「死灭回游」「夺舍」这类大演出用。
 * 和低层一样是 pointer-events:none，所以只会盖住视觉、不会挡住点击。
 */
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

function mk(cls) {
	const l = layer();
	if (!l) return null;
	const d = document.createElement("div");
	if (cls) d.className = cls;
	l.appendChild(d);
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

/** 固定种子伪随机：让各客户端的眼群 / 字符雨分布一致，观战不跳 */
function rnd(n) {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

/** 取玩家的视觉锚点：真人优先用 ui.fakeme，其它玩家用头像 */
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

/** 取武将立绘地址：优先夺舍后的缓存，其次头像背景，最后角色数据 */
function charImg(player) {
	try {
		const st = player && player.storage && player.storage.naohua_possessed_img;
		if (st) {
			const m = /url\(["']?(.+?)["']?\)/.exec(st);
			if (m && m[1]) return m[1];
			if (/^[\w./\-\u4e00-\u9fa5]+$/.test(st)) return st;
		}
		const av = player && player.node && player.node.avatar;
		const bg = av && av.style && av.style.backgroundImage;
		const m2 = bg && /url\(["']?(.+?)["']?\)/.exec(bg);
		if (m2 && m2[1]) return m2[1];
		// 本地玩家的大立绘（ui.fakeme）才是真正显示的那张
		const fm = typeof ui !== "undefined" && ui.fakeme && ui.fakeme.style && ui.fakeme.style.backgroundImage;
		const m3 = fm && /url\(["']?(.+?)["']?\)/.exec(fm);
		if (m3 && m3[1]) return m3[1];
		const info = lib.character[player.name1] || lib.character[player.name];
		if (info && info.img) return info.img;
	} catch (e) {}
	return "";
}

const fx = {
	get on() {
		try {
			return lib.config[CFG_KEY] !== false;
		} catch (e) {
			return true;
		}
	},

	play(name, args) {
		try {
			if (!this.on) return;
			/* 去重：同一特效 + 同一玩家在 150ms 内只播一次。
			 * 联机下 content 到底在几个客户端执行，各版本不一定一致；
			 * 靠这一层兜底，即使被重复驱动也只会播一遍。 */
			const p = args && args[0];
			let key = name;
			if (p && p.node) key += "|" + (p.name1 || "") + "|" + (p.name2 || "") + "|" + (p.dataset ? p.dataset.position : "");
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

	/** 播放特效音（程序合成，见 tools/生成音效.mjs） */
	sound(name, vol) {
		playSfx(name, vol);
	},

	/* ---------------- 基础：涟漪 ---------------- */

	ring(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const size = opt.size || Math.max(88, Math.min(240, b.w * 1.25));
		const d = mk("nh-ring");
		if (!d) return;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = size + "px";
		d.style.height = size + "px";
		if (opt.color) {
			d.style.borderColor = opt.color;
			d.style.boxShadow = "0 0 16px " + opt.color + ",inset 0 0 24px " + opt.color;
		}
		kill(d, 640);
	},

	/* ---------------- 基础：两点飞线 ---------------- */

	line(from, to, opt) {
		opt = opt || {};
		const p = box(from);
		const q = box(to);
		if (!p || !q) return;
		const dx = q.x - p.x;
		const dy = q.y - p.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 8) return;
		const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
		const d = mk("nh-line");
		if (!d) return;
		d.style.left = p.x + "px";
		d.style.top = p.y - 2.5 + "px";
		d.style.transform = "rotate(" + ang + "deg)";
		if (opt.color) d.style.background = "linear-gradient(90deg,rgba(30,8,18,0)," + opt.color + "," + opt.color + ",rgba(30,8,18,0))";
		requestAnimationFrame(function () {
			try {
				d.style.opacity = "1";
				d.style.width = len + "px";
			} catch (e) {}
		});
		setTimeout(function () {
			try {
				d.style.opacity = "0";
			} catch (e) {}
		}, 130);
		kill(d, 560);
	},

	/* ---------------- 飘字 ---------------- */

	float(player, text, opt) {
		if (!text) return;
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const d = mk("nh-float");
		if (!d) return;
		d.textContent = text;
		d.style.left = b.x + "px";
		d.style.top = b.y + (opt.dy || -b.h * 0.18) + "px";
		d.style.fontSize = (opt.size || 15) + "px";
		d.style.color = opt.color || COL.bone;
		kill(d, 1100);
	},

	/* ---------------- 灰烬 / 碎屑 ---------------- */

	ash(player, n, color) {
		const b = box(player);
		if (!b) return;
		n = Math.max(1, Math.min(24, n || 8));
		for (let i = 0; i < n; i++) {
			const d = mk("nh-ash");
			if (!d) return;
			const dx = (Math.random() - 0.5) * b.w * 1.1;
			const dy = -20 - Math.random() * b.h * 0.9;
			d.style.left = b.x + (Math.random() - 0.5) * b.w * 0.7 + "px";
			d.style.top = b.y + (Math.random() - 0.5) * b.h * 0.5 + "px";
			d.style.background = color || COL.gray;
			d.style.setProperty("--dx", dx.toFixed(1) + "px");
			d.style.setProperty("--dy", dy.toFixed(1) + "px");
			d.style.animationDelay = (i * 0.015).toFixed(3) + "s";
			kill(d, 800);
		}
	},

	/* ---------------- 咒灵卵：显示 3 槽当前状态 ---------------- */

	eggs(player, count, mode) {
		const b = box(player);
		if (!b) return;
		this.sound(mode === "spend" ? "egg_spend" : "egg_gain", 0.5);
		const wrap = mk("nh-eggs");
		if (!wrap) return;
		wrap.style.left = b.x + "px";
		wrap.style.top = b.y - b.h * 0.42 + "px";
		count = Math.max(0, Math.min(3, count | 0));
		const gap = 20;
		for (let i = 0; i < 3; i++) {
			const e = document.createElement("div");
			e.className = "nh-egg";
			e.style.left = (-gap + i * gap) + "px";
			if (i >= count) e.classList.add("off");
			if (mode === "gain" && i === count - 1) e.classList.add("pop");
			if (mode === "spend" && i >= count) e.classList.add("burst");
			wrap.appendChild(e);
		}
		if (mode === "full") {
			wrap.style.filter = "drop-shadow(0 0 6px rgba(194,65,63,.9))";
		}
		setTimeout(function () {
			try {
				wrap.style.opacity = "0";
			} catch (e) {}
		}, 720);
		kill(wrap, 1020);
	},

	/* ---------------- 咒灵操术：黑牌转化 ---------------- */

	convert(player) {
		this.ring(player, { color: COL.purple, size: 132 });
		this.ash(player, 7, "rgba(30,8,18,.92)");
		this.float(player, "咒灵操术", { color: COL.bone, size: 13 });
	},

	/* ---------------- 咒灵弹：蓄力 → 飞行 → 爆炸（WAAPI 三段） ---------------- */
	bolt(from, to, opt) {
		const l = topLayer();
		if (!l) return;
		opt = opt || {};
		const A = box(from);
		const B = box(to);
		if (!A || !B) return;

		const size = opt.size || 64;
		const c1 = opt.core || "#ff5a6e";
		const c2 = opt.rim || "rgba(194,65,63,.85)";
		const glow1 = opt.glow1 || "#c2413f";
		const glow2 = opt.glow2 || "#5b1230";

		const wrap = document.createElement("div");
		wrap.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%";
		l.appendChild(wrap);

		const orb = document.createElement("div");
		Object.assign(orb.style, {
			position: "absolute",
			width: size + "px",
			height: size + "px",
			left: A.x + "px",
			top: A.y + "px",
			borderRadius: "50%",
			background:
				"radial-gradient(circle at center, #fff 5%, " +
				c1 +
				" 24%, " +
				glow2 +
				" 52%, rgba(30,4,12,0) 72%), repeating-conic-gradient(from 0deg, transparent 0deg, " +
				c2 +
				" 12deg, transparent 24deg)",
			filter: "drop-shadow(0 0 " + size * 0.26 + "px " + glow1 + ") drop-shadow(0 0 " + size * 0.55 + "px " + glow2 + ") brightness(1.4)",
			boxShadow: "inset 0 0 " + size * 0.32 + "px rgba(255,226,226,.85)",
			opacity: "0",
			transform: "translate(-50%,-50%) scale(.08)",
			transformOrigin: "center center",
			willChange: "transform, opacity, filter",
		});

		const core = document.createElement("div");
		Object.assign(core.style, {
			width: "100%",
			height: "100%",
			borderRadius: "50%",
			border: "2px dashed rgba(255,255,255,.65)",
			animation: "nhFsSpin .18s linear infinite",
		});
		orb.appendChild(core);
		wrap.appendChild(orb);

		const chargeMs = opt.charge || 520;
		const flyMs = opt.fly || 300;
		const spinDir = opt.reverse ? -1 : 1;
		const self = this;

		this.sound("zhouling_charge", 0.55);

		try {
			const a1 = orb.animate(
				[
					{ transform: "translate(-50%,-50%) scale(.08) rotate(0deg)", opacity: "0" },
					{ transform: "translate(-50%,-50%) scale(1.28) rotate(" + 340 * spinDir + "deg)", opacity: "1", offset: 0.72 },
					{ transform: "translate(-50%,-50%) scale(1) rotate(" + 680 * spinDir + "deg)", opacity: "1" },
				],
				{ duration: chargeMs, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }
			);
			a1.onfinish = function () {
				self.sound("zhouling_fly", 0.6);
				const a2 = orb.animate(
					[
						{
							left: A.x + "px",
							top: A.y + "px",
							transform: "translate(-50%,-50%) scale(1)",
							filter: "blur(0px) brightness(1.4)",
							opacity: "1",
						},
						{
							left: B.x + "px",
							top: B.y + "px",
							transform: "translate(-50%,-50%) scale(1.12)",
							filter: "blur(0px) brightness(2.1)",
							offset: 0.88,
							opacity: "1",
						},
						{
							left: B.x + "px",
							top: B.y + "px",
							transform: "translate(-50%,-50%) scale(" + (opt.blast || 4.6) + ")",
							filter: "blur(" + size * 0.26 + "px) brightness(3)",
							opacity: "0",
						},
					],
					{ duration: flyMs, easing: "ease-in", fill: "forwards" }
				);
				a2.onfinish = function () {
					self.sound("zhouling_blast", 0.8);
					setTimeout(function () {
						try {
							wrap.remove();
						} catch (e) {}
					}, 60);
				};
			};
		} catch (e) {}

		// 保底清理：任何异常路径都不会留下残骸
		kill(wrap, chargeMs + flyMs + 900);
	},

	/* ---------------- Canvas 粒子爆发（DOM 做不出的量级） ---------------- */
	spark(player, opt) {
		const l = topLayer();
		if (!l) return;
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const W = l.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1920) || 1920;
		const H = l.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 1080) || 1080;
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
		const n = qn(Math.max(1, Math.min(120, opt.count || 36)));
		const color = opt.color || "#c2413f";
		const dur = opt.duration || 900;
		const parts = [];
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = 1.4 + Math.random() * 5.2;
			parts.push({
				x: b.x,
				y: b.y,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp - 1.1,
				r: 1 + Math.random() * 2.4,
			});
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
				p.vy += 0.13;
				p.vx *= 0.985;
				p.vy *= 0.985;
				ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
				ctx.beginPath();
				ctx.arc(p.x, p.y, Math.max(0.3, p.r * (1 - k * 0.55)), 0, Math.PI * 2);
				ctx.fill();
			}
			if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
		};
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(step);
	},

	/* ---------------- 受击抖动：给目标 .player 挂动画类，用完必须摘 ---------------- */
	hitReaction(player, dur) {
		if (!player || !player.classList) return;
		dur = dur || 420;
		this.sound("hit_impact", 0.65);
		const old = player.style ? player.style.transform : "";
		try {
			player.classList.add("nh-hit");
		} catch (e) {}
		setTimeout(function () {
			try {
				player.classList.remove("nh-hit");
			} catch (e) {}
			try {
				if (player.style) player.style.transform = old;
			} catch (e) {}
		}, dur);
	},

	/* ---------------- 帐：挂上 / 破除 ---------------- */

	veil(player) {
		if (!player || !player.node) return;
		this.sound("zhang_seal", 0.6);
		try {
			const old = player.querySelector(".nh-veil");
			if (old) old.remove();
		} catch (e) {}
		const a = anchor(player);
		const host = player && player.node && player.node.avatar ? player : null;
		if (!a || !host) return;
		try {
			const ar = a.getBoundingClientRect();
			const pr = host.getBoundingClientRect();
			if (!ar.width) return;
			const v = document.createElement("div");
			v.className = "nh-veil";
			v.style.left = ar.left - pr.left + "px";
			v.style.top = ar.top - pr.top + "px";
			v.style.width = ar.width + "px";
			v.style.height = ar.height + "px";
			v.appendChild(document.createElement("i"));
			v.appendChild(document.createElement("i"));
			host.appendChild(v);
			/* 自检兜底：无论标记因何消失（拦截 / 到时 / 顶替），最多 1 秒后回收 */
			const born = Date.now();
			const timer = setInterval(function () {
				let alive = false;
				try {
					alive = v.isConnected && (Date.now() - born < 1500 || player.hasSkill("naohua_zhang_mark"));
				} catch (e) {
					alive = false;
				}
				if (!alive) {
					clearInterval(timer);
					try {
						v.remove();
					} catch (e) {}
				}
			}, 800);
			v._nhTimer = timer;
		} catch (e) {}
	},

	veilBreak(player) {
		if (!player) return;
		try {
			const v = player.querySelector(".nh-veil");
			if (v) {
				if (v._nhTimer) clearInterval(v._nhTimer);
				v.classList.add("break");
				kill(v, 340);
			}
		} catch (e) {}
	},

	veilClear(player) {
		if (!player) return;
		try {
			const v = player.querySelector(".nh-veil");
			if (v) {
				if (v._nhTimer) clearInterval(v._nhTimer);
				v.remove();
			}
		} catch (e) {}
	},

	/** 失去〖帐〗时的全场清理：只清视觉，不动标记数据 */
	veilClearAll() {
		try {
			const list = document.querySelectorAll(".nh-veil");
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				if (v._nhTimer) clearInterval(v._nhTimer);
				v.remove();
			}
		} catch (e) {}
	},

	/* ---------------- 帐：令【杀】无效 ---------------- */

	shaVoid(source, targets) {
		this.sound("zhang_break", 0.7);
		const b = box(source);
		if (b) {
			for (let i = 0; i < 2; i++) {
				const s = mk("nh-slash");
				if (!s) break;
				s.style.left = b.rect.left + b.w * 0.12 + "px";
				s.style.top = b.rect.top + b.h * (0.34 + i * 0.3) + "px";
				s.style.width = b.w * 0.76 + "px";
				s.style.setProperty("--a", (i ? -16 : -7) + "deg");
				s.style.animationDelay = i * 0.06 + "s";
				kill(s, 620);
			}
		}
		this.spark(source, { count: 30, color: "#ff2b4d", duration: 620 });
		this.float(source, "帐·杀无效", { color: COL.red, size: 15 });
		const list = targets || [];
		for (let i = 0; i < list.length && i < 4; i++) {
			((t, d) =>
				setTimeout(() => {
					this.ring(t, { color: COL.red, size: 96 });
				}, d))(list[i], 110 + i * 70);
		}
	},

	/* ---------------- 夺舍 ---------------- */

	cutin(player, title, sub, ms, opt) {
		if (!title) return;
		opt = opt || {};
		ms = ms || 1600;
		if (opt.dim !== false) this.dimOn(ms + 400);
		const wrap = mk("nh-cutin");
		if (!wrap) return;
		const mask = document.createElement("div");
		mask.className = "nh-ci-mask";
		wrap.appendChild(mask);
		const src = charImg(player);
		if (src) {
			const img = document.createElement("div");
			img.className = "nh-ci-img";
			img.style.backgroundImage = 'url("' + src + '")';
			wrap.appendChild(img);
		}
		if (opt.eyes) {
			for (let i = 0; i < 3; i++) {
				const e = document.createElement("div");
				e.className = "nh-eye";
				e.style.right = 17 + i * 7 + "%";
				e.style.top = 11 + i * 9 + "%";
				e.style.animationDelay = 0.08 + i * 0.09 + "s";
				wrap.appendChild(e);
			}
		}
		const t = document.createElement("div");
		t.className = "nh-ci-title";
		t.textContent = title;
		wrap.appendChild(t);
		if (sub) {
			const s = document.createElement("div");
			s.className = "nh-ci-sub";
			s.textContent = sub;
			wrap.appendChild(s);
		}
		setTimeout(function () {
			try {
				wrap.classList.add("nh-out");
			} catch (e) {}
		}, Math.max(200, ms - 320));
		kill(wrap, ms);
		if (opt.dim !== false) setTimeout(() => this.dimOff(), ms);
	},

	/* ---------------- 死灭回游：三段式大特效 ---------------- */
	shimie(player) {
		const l = topLayer();
		if (!l) return;
		const TOTAL = 3200;
		const self = this;
		this.sound("shimie_open", 0.85);
		const root = document.createElement("div");
		root.className = "nh-sm";
		l.appendChild(root);
		const add = function (cls) {
			const d = document.createElement("div");
			d.className = cls;
			root.appendChild(d);
			return d;
		};

		// 1 底幕 + 爆闪
		add("nh-sm-bg");
		add("nh-sm-flash");

		// 2 结界网格（中心虹膜式张开）
		add("nh-sm-grid");

		// 3 结界柱
		[9, 31, 69, 91].forEach(function (p, i) {
			const d = add("nh-sm-pillar");
			d.style.left = p + "%";
			d.style.animationDelay = i * 0.07 + "s";
		});

		// 4 咒纹环 ×3
		[420, 660, 920].forEach(function (s, i) {
			const d = add("nh-sm-ring");
			d.style.width = s + "px";
			d.style.height = s + "px";
			d.style.animationDelay = i * 0.13 + "s";
			if (i === 1) d.style.borderStyle = "solid";
		});

		// 5 咒灵之眼 ×22
		for (let i = 0; i < qn(22); i++) {
			const d = add("nh-sm-eye");
			const sc = 0.45 + rnd(i * 11 + 3) * 1.25;
			d.style.width = 26 * sc + "px";
			d.style.height = 26 * sc + "px";
			d.style.left = 5 + rnd(i * 3 + 1) * 90 + "%";
			d.style.top = 7 + rnd(i * 7 + 5) * 80 + "%";
			d.style.animationDelay = 0.28 + rnd(i * 13 + 2) * 0.95 + "s";
			d.style.animationDuration = 0.95 + rnd(i * 17) * 0.75 + "s";
		}

		const src = charImg(player);

		// 6 立绘 + 7 万花筒残像
		if (src) {
			const art = add("nh-sm-art");
			art.style.backgroundImage = 'url("' + src + '")';
			const kal = add("nh-sm-kal");
			for (let i = 0; i < 4; i++) {
				const g = document.createElement("i");
				g.style.backgroundImage = 'url("' + src + '")';
				g.style.setProperty("--r", i * 90 + 45 + "deg");
				g.style.animationDelay = i * 0.03 + "s";
				kal.appendChild(g);
			}
		}

		// 8 字符雨（容器先建好，标题落地时再灌内容）
		const rain = add("nh-sm-rain");
		const glyphs = "死滅回遊呪霊泳者結界";
		const spawnRain = function () {
			for (let i = 0; i < qn(26); i++) {
				const s = document.createElement("span");
				s.textContent = glyphs[i % glyphs.length];
				s.style.left = rnd(i * 19 + 7) * 100 + "%";
				s.style.fontSize = 13 + rnd(i * 23 + 4) * 15 + "px";
				s.style.animationDuration = 1.15 + rnd(i * 29 + 9) * 1.0 + "s";
				s.style.animationDelay = rnd(i * 31 + 6) * 0.55 + "s";
				rain.appendChild(s);
			}
		};

		// 9 标题冲击
		setTimeout(function () {
			try {
				const imp = add("nh-sm-impact");
				imp.style.width = "280px";
				imp.style.height = "280px";
				const t = add("nh-sm-title");
				t.textContent = "死灭回游";
				const sub = add("nh-sm-sub");
				sub.textContent = "CULLING GAME";
				root.style.animation = "nhSmShake .5s linear";
				spawnRain();
			} catch (e) {}
		}, 600);

		// 10 泳者登録
		setTimeout(function () {
			try {
				self.sound("shimie_register", 0.7);
				const hud = add("nh-sm-hud");
				hud.innerHTML = "<b>0</b><em>SWIMMER REGISTERED</em><div class='nh-sm-bar'><i></i></div>";
				const num = hud.querySelector("b");
				const bar = hud.querySelector(".nh-sm-bar i");
				const t0 = Date.now();
				const dur = 880;
				const tick = function () {
					const k = Math.min(1, (Date.now() - t0) / dur);
					const v = Math.floor(1000 * (1 - Math.pow(1 - k, 3)));
					if (num) num.textContent = String(v);
					if (bar) bar.style.width = (k * 100).toFixed(1) + "%";
					if (k < 1) requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			} catch (e) {}
		}, 1020);

		// 收束
		setTimeout(function () {
			try {
				root.style.animation = "nhSmOut .55s ease-in forwards";
			} catch (e) {}
		}, TOTAL - 560);
		kill(root, TOTAL);
	},

	/* ---------------- 夺舍：碎屏开场 ---------------- */
	duosheStart(player) {
		const l = topLayer();
		if (!l) return;
		const TOTAL = 2100;
		const self = this;
		this.sound("duoshe_crack", 0.85);
		const root = document.createElement("div");
		root.className = "nh-ds";
		l.appendChild(root);
		const add = function (cls) {
			const d = document.createElement("div");
			d.className = cls;
			root.appendChild(d);
			return d;
		};

		add("nh-ds-bg");

		const src = charImg(player);
		if (src) {
			const art = add("nh-ds-art");
			art.style.backgroundImage = 'url("' + src + '")';
		}

		const eye = add("nh-ds-eye");
		eye.appendChild(document.createElement("i"));

		// 玻璃裂纹：18 条从中心放射
		for (let i = 0; i < qn(18); i++) {
			const c = add("nh-ds-crack");
			c.style.width = 16 + rnd(i * 13 + 3) * 48 + "vw";
			c.style.setProperty("--a", (i / 18) * 360 + rnd(i * 7 + 1) * 16 + "deg");
			c.style.animationDelay = rnd(i * 3 + 5) * 0.12 + "s";
		}

		// 两片碎屏向两侧撕开
		setTimeout(function () {
			try {
				add("nh-ds-pane l");
				add("nh-ds-pane r");
				root.style.animation = "nhDsShake .55s linear";
			} catch (e) {}
		}, 90);

		// 白闪
		setTimeout(function () {
			try {
				self.sound("duoshe_eye", 0.8);
				kill(add("nh-ds-flash"), 500);
			} catch (e) {}
		}, 560);

		// 标题
		setTimeout(function () {
			try {
				const t = add("nh-ds-title");
				t.textContent = "夺舍";
				const s = add("nh-ds-sub");
				s.textContent = "POSSESSION";
			} catch (e) {}
		}, 720);

		setTimeout(function () {
			try {
				root.style.animation = "nhDsOut .5s ease-in forwards";
			} catch (e) {}
		}, TOTAL - 520);
		kill(root, TOTAL);
	},

	/* ---------------- 座位环冲击波 + 全体座位卡震动 ---------------- */
	seatWave(origin) {
		const l = topLayer();
		if (!l) return;
		let b = box(origin);
		if (!b) {
			let r = { width: 960, height: 540 };
			try {
				r = l.getBoundingClientRect();
			} catch (e) {}
			b = { x: (r.width || 960) / 2, y: (r.height || 540) / 2 };
		}
		for (let i = 0; i < 3; i++) {
			const d = document.createElement("div");
			d.className = "nh-ds-wave";
			d.style.left = b.x + "px";
			d.style.top = b.y + "px";
			d.style.width = "120px";
			d.style.height = "120px";
			d.style.margin = "-60px 0 0 -60px";
			d.style.animationDelay = i * 0.12 + "s";
			l.appendChild(d);
			kill(d, 1500);
		}
		try {
			const list = (game.players || []).concat(game.dead || []);
			for (const p of list) {
				if (!p || !p.node) continue;
				p.classList.add("nh-ds-quake");
				setTimeout(function () {
					try {
						p.classList.remove("nh-ds-quake");
					} catch (e) {}
				}, 440);
			}
		} catch (e) {}
	},

	/* ---------------- 夺舍：抽魂 + 空间裂隙 + 座位环波纹 ---------------- */
	duosheSuck(dead, player) {
		const l = topLayer();
		if (!l) return;
		this.sound("duoshe_soul", 0.8);
		const A = box(dead);
		const B = box(player);
		if (!A) return;
		if (B) {
			const src = charImg(dead);
			if (src) {
				// 死者立绘被压扁、扭斜、抽进夺舍者胸腔
				const g = document.createElement("div");
				g.className = "nh-ds-soul";
				g.style.left = A.rect.left + "px";
				g.style.top = A.rect.top + "px";
				g.style.width = A.w + "px";
				g.style.height = A.h + "px";
				g.style.backgroundImage = 'url("' + src + '")';
				l.appendChild(g);
				g.style.transformOrigin = "top left";
				requestAnimationFrame(function () {
					requestAnimationFrame(function () {
						try {
							// 用 translate + scale 代替改 left/top/width/height，避免每帧重排
							const dx = B.x - B.w * 0.16 - A.rect.left;
							const dy = B.y - B.h * 0.28 - A.rect.top;
							const sx = A.w > 0 ? (B.w * 0.24) / A.w : 0.24;
							const sy = A.h > 0 ? (B.h * 0.24) / A.h : 0.24;
							g.style.transform =
								"translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ") skewX(26deg)";
							g.style.opacity = "0";
						} catch (e) {}
					});
				});
				kill(g, 980);
			}
			this.ring(player, { color: "rgba(194,65,63,.95)", size: 280 });
		}
		// 死亡座位处撕开一道裂隙
		const rift = document.createElement("div");
		rift.className = "nh-ds-rift";
		rift.style.left = A.x + "px";
		rift.style.top = A.y + "px";
		l.appendChild(rift);
		kill(rift, 900);
		this.spark(dead, { count: 60, color: "#9a6a7a", duration: 1000 });
		this.seatWave(dead);
	},

	/* ---------------- 夺舍：收束扫光 ---------------- */
	duosheEnd(player) {
		const l = topLayer();
		if (!l) return;
		this.sound("skill_brand", 0.7);
		const band = document.createElement("div");
		band.className = "nh-ds-band";
		l.appendChild(band);
		kill(band, 900);
		this.crack(player);
	},

	dimOn(safety) {
		try {
			_dimCount++;
			let d = null;
			const l = layer();
			if (!l) return;
			d = document.querySelector(".nh-dim");
			if (!d) {
				d = document.createElement("div");
				d.className = "nh-dim";
				l.insertBefore(d, l.firstChild);
			}
			requestAnimationFrame(function () {
				try {
					d.classList.add("on");
				} catch (e) {}
			});
			/* 安全阀：任何异常路径都不会让全屏压暗卡死 */
			const life = safety || 12000;
			setTimeout(function () {
				try {
					if (d && d.isConnected) {
						d.classList.remove("on");
						kill(d, 400);
						_dimCount = 0;
					}
				} catch (e) {}
			}, life);
		} catch (e) {}
	},

	dimOff() {
		try {
			_dimCount = Math.max(0, _dimCount - 1);
			if (_dimCount > 0) return;
			const d = document.querySelector(".nh-dim");
			if (!d) return;
			d.classList.remove("on");
			kill(d, 400);
		} catch (e) {}
	},

	hpShift(player, from, to) {
		if (to === undefined || to === null) return;
		this.float(player, "体力上限 " + from + " → " + to, { color: COL.red, size: 17 });
		const self = this;
		setTimeout(function () {
			self.ring(player, { color: COL.red, size: 190 });
		}, 120);
	},

	/* 技能名从死者座位飞到夺舍者座位 */
	chipFlow(from, to, names) {
		if (!names || !names.length) return;
		const p = box(from);
		const q = box(to);
		if (!p || !q) return;
		this.sound("skill_brand", 0.5);
		const list = names.slice(0, 6);
		const self = this;
		list.forEach(function (name, i) {
			setTimeout(function () {
				const c = mk("nh-chip");
				if (!c) return;
				c.textContent = name;
				c.style.left = p.x - 26 + "px";
				c.style.top = p.y - 8 + i * 4 + "px";
				requestAnimationFrame(function () {
					try {
						c.style.left = q.x - 26 + "px";
						c.style.top = q.y - 10 + i * 3 + "px";
						c.style.opacity = "0";
					} catch (e) {}
				});
				kill(c, 700);
			}, i * 80);
		});
	},

	/* 失去旧技能：断裂闪光 */
	crack(player) {
		const b = box(player);
		if (!b) return;
		const d = mk("nh-flash");
		if (d) {
			d.style.left = b.rect.left + "px";
			d.style.top = b.rect.top + "px";
			d.style.width = b.w + "px";
			d.style.height = b.h + "px";
			kill(d, 520);
		}
		this.ash(player, 10, "rgba(122,30,61,.9)");
	},

	/* 尸体吸收 */
	corpseAbsorb(dead, player) {
		if (!dead) return;
		this.ash(dead, 14, "rgba(120,120,120,.85)");
		this.ring(dead, { color: COL.purple, size: 150 });
		if (player) this.line(dead, player, { color: COL.purple });
	},

	/* 座次转移：残影从旧位置飞向新位置（并在内部完成 changeSeat） */
	seatTransfer(player, position) {
		if (!player) return;
		let old = null;
		let ghost = null;
		try {
			const a = anchor(player);
			if (a) {
				old = a.getBoundingClientRect();
				const bg = a.style && a.style.backgroundImage;
				if (old && old.width > 0 && bg) {
					ghost = document.createElement("div");
					ghost.className = "nh-ghost";
					ghost.style.left = old.left + "px";
					ghost.style.top = old.top + "px";
					ghost.style.width = old.width + "px";
					ghost.style.height = old.height + "px";
					ghost.style.backgroundImage = bg;
					const l = layer();
					if (l) l.appendChild(ghost);
					else ghost = null;
				}
			}
		} catch (e) {}

		try {
			player.changeSeat(position, false);
			game.arrangePlayers();
		} catch (e) {
			try {
				player.changeSeat(position, false);
				game.arrangePlayers();
			} catch (e2) {}
			if (ghost) ghost.remove();
			return;
		}

		if (!ghost || !old) return;
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				try {
					const nr = anchor(player).getBoundingClientRect();
					ghost.style.transform =
						"translate(" + (nr.left - old.left) + "px," + (nr.top - old.top) + "px) scale(.86)";
					ghost.style.opacity = "0";
				} catch (e) {}
			});
		});
		kill(ghost, 640);
	},

	/* 技能栏因夺舍多出技能时的轻提示 */
	skillGainGlow(player, count) {
		if (!count) return;
		this.float(player, "获得技能 ×" + count, { color: COL.bone, size: 14 });
		this.ring(player, { color: COL.bone, size: 120 });
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

lib.naohuaFx = fx;

export default fx;
