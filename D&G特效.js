import { lib, game, ui, get, ai, _status } from "noname";

/* ============================================================================
 * D&G（Steel Ball Run）—— 技能特效层
 * ----------------------------------------------------------------------------
 * 视觉语言：
 *   虚空紫罗兰（隐匿 / 归来 / 召唤 / 同归）
 *   援手琥珀（帮助）
 *   青玉（马友友）
 *   酸绿（腐蚀）
 *
 * 约定（对齐 乔尼特效.js / 乔鲁诺特效.js / 脑花特效.js）：
 *   · 技能层只调 lib.dvgFx.play(name, args)，本文件负责一切 DOM/CSS/音频
 *   · 所有随机用 rnd()（确定性），禁用 Math.random()
 *   · 单个特效 ≤ 1.5 秒，同屏 DOM 节点 ≤ 30，音频单文件 ≤ 50 KB
 *   · 粒子/时长全部走 qlv()/qn()/qtime() 响应画质档位
 *   · 出错 console.warn，不吞成黑洞
 *
 * 纯 DOM/CSS + WAAPI，不依赖外部图片。
 * ========================================================================== */

const LAYER_ID = "dvg-fx";
const TOP_ID = "dvg-fx-top";
const STYLE_ID = "dvg-fx-style";
const CFG_KEY = "extension_脑花乔尼_dvg_fx";
const CFG_SFX = "extension_脑花乔尼_dvg_sfx";
const AUDIO_BASE = "extension/脑花乔尼/audio/fx/";

const VOID = "rgba(160,107,255,.95)"; // 虚空紫
const VOID_L = "rgba(206,174,255,1)"; // 亮紫
const AMBER = "rgba(232,184,74,.95)"; // 援手琥珀
const AMBER_L = "rgba(255,222,150,1)";
const JADE = "rgba(47,214,176,.95)"; // 马友友青玉
const JADE_L = "rgba(170,255,236,1)";
const ACID = "rgba(138,214,58,.95)"; // 腐蚀酸绿
const WHITE = "rgba(248,244,255,.98)";

const CSS_TEXT = `
#dvg-fx{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:hidden}
#dvg-fx *{box-sizing:border-box;pointer-events:none}
#dvg-fx-top{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden}
#dvg-fx-top *{box-sizing:border-box;pointer-events:none}

@keyframes dvgSpin{to{transform:rotate(360deg)}}
@keyframes dvgSpinBack{to{transform:rotate(-360deg)}}
@keyframes dvgFadeIn{to{opacity:1}}

/* ================= 通用件 ================= */
.dvg-ring{position:absolute;border-radius:50%;opacity:0;
	background:conic-gradient(from 0deg,transparent 0 58%,rgba(160,107,255,.18) 72%,rgba(206,174,255,.95) 88%,#fff 93%,transparent 97%);
	-webkit-mask:radial-gradient(circle,transparent 50%,#000 53%,#000 92%,transparent 97%);
	mask:radial-gradient(circle,transparent 50%,#000 53%,#000 92%,transparent 97%);
	animation:dvgFadeIn .12s linear forwards,dvgSpin .85s linear infinite;will-change:transform}

.dvg-float{position:absolute;transform:translate(-50%,-50%);font-weight:700;white-space:nowrap;
	text-shadow:0 0 12px rgba(160,107,255,.9),0 2px 0 rgba(10,4,20,.9);
	animation:dvgFloatUp 1.05s ease-out forwards}
@keyframes dvgFloatUp{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}
	22%{opacity:1;transform:translate(-50%,-50%) scale(1)}
	100%{opacity:0;transform:translate(-50%,-165%) scale(1)}}

.dvg-burst{position:absolute;border-radius:50%;opacity:0;
	border:2px solid rgba(206,174,255,.95);
	box-shadow:0 0 18px rgba(160,107,255,.9),inset 0 0 18px rgba(160,107,255,.6);
	transform:translate(-50%,-50%) scale(.2);
	animation:dvgBurstOut .62s cubic-bezier(.15,.75,.25,1) forwards}
@keyframes dvgBurstOut{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}
	12%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(2.3)}}

.dvg-spark{position:absolute;width:6px;height:6px;border-radius:50%;opacity:0;
	background:radial-gradient(circle,#fff 0%,rgba(206,174,255,1) 40%,rgba(160,107,255,0) 74%);
	box-shadow:0 0 9px rgba(160,107,255,.95);
	animation:dvgSparkOut .85s ease-out forwards}
@keyframes dvgSparkOut{0%{opacity:0;transform:translate(0,0) scale(.3)}
	18%{opacity:1}76%{opacity:.9}
	100%{opacity:0;transform:translate(var(--dx,0),var(--dy,0)) scale(.4)}}

.dvg-dim{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity .22s ease;
	background:radial-gradient(ellipse at 50% 52%,rgba(30,10,60,.16) 0%,rgba(8,3,18,.62) 66%,rgba(2,0,6,.88) 100%)}

/* ================= 隐匿 · 暗置 ================= */
.dvg-veilcard{position:absolute;transform:translate(-50%,-50%);border-radius:8px;opacity:0;
	background:linear-gradient(150deg,rgba(28,14,52,.98),rgba(10,4,22,.99));
	border:1px solid rgba(160,107,255,.55);
	box-shadow:0 0 20px rgba(160,107,255,.55),inset 0 0 26px rgba(160,107,255,.22);
	animation:dvgVeilCard .9s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes dvgVeilCard{0%{opacity:0;transform:translate(-50%,-50%) scale(1.12) rotateY(0deg)}
	30%{opacity:1;transform:translate(-50%,-50%) scale(1) rotateY(180deg)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1) rotateY(180deg)}}

.dvg-glyphbig{position:absolute;transform:translate(-50%,-50%);font-size:68px;font-weight:900;color:${VOID_L};
	text-shadow:0 0 24px rgba(160,107,255,1),0 0 64px rgba(88,32,160,.9);opacity:0;
	animation:dvgGlyphBig 1.1s cubic-bezier(.16,1,.3,1) forwards}
@keyframes dvgGlyphBig{0%{opacity:0;transform:translate(-50%,-50%) scale(1.7);filter:blur(9px)}
	26%{opacity:1;filter:blur(0)}72%{opacity:.95}
	100%{opacity:0;transform:translate(-50%,-50%) scale(.86) rotate(-7deg);filter:blur(3px)}}

/* ================= 隐匿 · 移出 ================= */
.dvg-mist{position:absolute;transform:translate(-50%,-50%);border-radius:46%;opacity:0;
	background:radial-gradient(ellipse at 50% 100%,rgba(10,2,24,.96) 0%,rgba(46,20,80,.7) 42%,rgba(160,107,255,.14) 72%,transparent 88%);
	animation:dvgMistRise 1.2s cubic-bezier(.3,.8,.3,1) forwards}
@keyframes dvgMistRise{0%{opacity:0;transform:translate(-50%,12%) scale(.78)}
	22%{opacity:1}70%{opacity:1}
	100%{opacity:0;transform:translate(-50%,-38%) scale(1.12)}}

.dvg-shard{position:absolute;width:4px;height:4px;border-radius:1px;opacity:0;
	background:rgba(206,174,255,.95);box-shadow:0 0 7px rgba(160,107,255,.9);
	animation:dvgShardUp 1.1s ease-out forwards}
@keyframes dvgShardUp{0%{opacity:0;transform:translate(0,0) scale(.4)}
	20%{opacity:1}100%{opacity:0;transform:translate(var(--dx,0),var(--dy,-86px)) scale(.2)}}

/* ================= 归来 ================= */
.dvg-rift{position:absolute;transform:translate(-50%,-50%) rotate(-8deg);opacity:0;
	background:linear-gradient(180deg,transparent 0%,${VOID} 18%,#fff 50%,${VOID} 82%,transparent 100%);
	box-shadow:0 0 26px rgba(160,107,255,.95),0 0 74px rgba(88,32,160,.8);
	animation:dvgRiftOpen .95s cubic-bezier(.2,.9,.2,1) forwards}
@keyframes dvgRiftOpen{0%{opacity:0;transform:translate(-50%,-50%) rotate(-8deg) scaleY(.05)}
	32%{opacity:1;transform:translate(-50%,-50%) rotate(-8deg) scaleY(1)}
	76%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) rotate(-8deg) scaleY(1.08) scaleX(1.6)}}

.dvg-beam{position:absolute;transform:translate(-50%,-50%);opacity:0;
	background:linear-gradient(180deg,rgba(160,107,255,0) 0%,rgba(206,174,255,.8) 26%,#fff 52%,rgba(160,107,255,.7) 78%,rgba(160,107,255,0) 100%);
	filter:blur(4px);animation:dvgBeamUp 1.05s ease-out forwards}
@keyframes dvgBeamUp{0%{opacity:0;transform:translate(-50%,-50%) scaleY(.1)}
	22%{opacity:1;transform:translate(-50%,-50%) scaleY(1)}
	100%{opacity:0;transform:translate(-50%,-50%) scaleY(1.15)}}

.dvg-reform{position:absolute;transform:translate(-50%,-50%);border-radius:50%;opacity:0;
	background:radial-gradient(circle,rgba(206,174,255,.9) 0%,rgba(160,107,255,.45) 42%,transparent 72%);
	animation:dvgReformIn .85s cubic-bezier(.3,.8,.2,1) forwards}
@keyframes dvgReformIn{0%{opacity:0;transform:translate(-50%,-50%) scale(2.1)}
	40%{opacity:.95}100%{opacity:0;transform:translate(-50%,-50%) scale(.92)}}

.dvg-flash{position:absolute;left:0;top:0;width:100%;height:100%;mix-blend-mode:screen;
	background:radial-gradient(circle at 50% 50%,#fff 0%,rgba(232,222,255,.85) 24%,rgba(160,107,255,.3) 50%,transparent 70%);
	animation:dvgFlash .45s ease-out forwards}
@keyframes dvgFlash{0%{opacity:0}18%{opacity:1}100%{opacity:0}}

/* ================= 帮助 ================= */
.dvg-thread{position:absolute;transform-origin:0 50%;opacity:0;height:2px;
	background:linear-gradient(90deg,rgba(232,184,74,0) 0%,rgba(255,222,150,.95) 30%,#fff 52%,rgba(232,184,74,.9) 74%,rgba(232,184,74,0) 100%);
	box-shadow:0 0 11px rgba(232,184,74,.9);
	animation:dvgThread .72s ease-out forwards}
@keyframes dvgThread{0%{opacity:0;transform:scaleX(0)}
	30%{opacity:1;transform:scaleX(1)}70%{opacity:1}
	100%{opacity:0;transform:scaleX(1)}}

.dvg-glyph{position:absolute;transform:translate(-50%,-50%);font-size:30px;font-weight:900;color:${AMBER_L};
	opacity:0;text-shadow:0 0 16px rgba(232,184,74,1),0 0 40px rgba(180,120,20,.85);
	animation:dvgGlyphPop .78s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes dvgGlyphPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}
	34%{opacity:1;transform:translate(-50%,-50%) scale(1.16)}
	60%{transform:translate(-50%,-50%) scale(1)}
	100%{opacity:0;transform:translate(-50%,-50%) scale(1) translateY(-15px)}}

.dvg-aidring{position:absolute;border-radius:50%;opacity:0;border:2px solid rgba(255,222,150,.95);
	box-shadow:0 0 20px rgba(232,184,74,.95),inset 0 0 20px rgba(232,184,74,.6);
	transform:translate(-50%,-50%) scale(.25);
	animation:dvgAidRing .9s cubic-bezier(.15,.75,.25,1) forwards}
@keyframes dvgAidRing{0%{opacity:0;transform:translate(-50%,-50%) scale(.25)}
	16%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.95)}}

.dvg-aidmote{position:absolute;width:6px;height:6px;border-radius:50%;opacity:0;
	background:radial-gradient(circle,#fff 0%,rgba(255,222,150,1) 42%,rgba(232,184,74,0) 76%);
	box-shadow:0 0 9px rgba(232,184,74,.95);
	animation:dvgAidMote .95s ease-out forwards}
@keyframes dvgAidMote{0%{opacity:0;transform:translate(0,0) scale(.3)}
	20%{opacity:1}76%{opacity:.9}
	100%{opacity:0;transform:translate(var(--dx,0),var(--dy,0)) scale(.4)}}

/* ================= 召唤马友友 ================= */
.dvg-sigil{position:absolute;border-radius:50%;opacity:0;
	background:conic-gradient(from 0deg,rgba(160,107,255,0) 0deg,rgba(206,174,255,.85) 24deg,rgba(160,107,255,0) 52deg,
		rgba(160,107,255,.7) 120deg,rgba(206,174,255,.9) 138deg,rgba(160,107,255,0) 176deg,
		rgba(160,107,255,.6) 240deg,rgba(206,174,255,.85) 258deg,rgba(160,107,255,0) 300deg);
	-webkit-mask:radial-gradient(circle,transparent 52%,#000 56%,#000 88%,transparent 94%);
	mask:radial-gradient(circle,transparent 52%,#000 56%,#000 88%,transparent 94%);
	animation:dvgSigilIn .6s ease-out forwards,dvgSpin 5s linear infinite}
@keyframes dvgSigilIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(0deg)}
	100%{opacity:.95;transform:translate(-50%,-50%) scale(1) rotate(38deg)}}

.dvg-sigil2{position:absolute;border-radius:50%;opacity:0;
	background:conic-gradient(from 90deg,rgba(47,214,176,0) 0deg,rgba(47,214,176,.8) 30deg,rgba(47,214,176,0) 70deg,
		rgba(170,255,236,.9) 150deg,rgba(47,214,176,0) 200deg,rgba(47,214,176,.7) 280deg,rgba(47,214,176,0) 330deg);
	-webkit-mask:radial-gradient(circle,transparent 30%,#000 34%,#000 60%,transparent 66%);
	mask:radial-gradient(circle,transparent 30%,#000 34%,#000 60%,transparent 66%);
	animation:dvgSigilIn2 .75s ease-out forwards,dvgSpinBack 3.8s linear infinite}
@keyframes dvgSigilIn2{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}
	100%{opacity:.9;transform:translate(-50%,-50%) scale(1)}}

.dvg-bolt{position:absolute;transform:translate(-50%,0);opacity:0;width:6px;
	background:linear-gradient(180deg,rgba(255,255,255,0) 0%,#fff 30%,rgba(206,174,255,1) 62%,rgba(160,107,255,0) 100%);
	box-shadow:0 0 20px rgba(206,174,255,1),0 0 52px rgba(160,107,255,.9);
	animation:dvgBoltHit .45s ease-out forwards}
@keyframes dvgBoltHit{0%{opacity:0;transform:translate(-50%,0) scaleY(.3)}
	14%{opacity:1;transform:translate(-50%,0) scaleY(1)}
	40%{opacity:.9}100%{opacity:0}}

.dvg-pillar{position:absolute;transform:translate(-50%,0);opacity:0;
	background:linear-gradient(180deg,rgba(47,214,176,0) 0%,rgba(47,214,176,.5) 26%,rgba(248,255,252,.95) 54%,rgba(47,214,176,.5) 82%,rgba(47,214,176,0) 100%);
	filter:blur(5px);animation:dvgPillarUp 1.15s ease-out forwards}
@keyframes dvgPillarUp{0%{opacity:0;transform:translate(-50%,0) scaleY(.2)}
	18%{opacity:1;transform:translate(-50%,0) scaleY(1)}
	100%{opacity:0;transform:translate(-50%,0) scaleY(1.1)}}

/* ================= 标题 ================= */
.dvg-title{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);
	font-size:60px;font-weight:900;letter-spacing:.14em;white-space:nowrap;opacity:0;
	background:linear-gradient(180deg,#fbf7ff 0%,#dcc4ff 28%,#a06bff 54%,#5c2a9e 76%,#2a1250 100%);
	-webkit-background-clip:text;background-clip:text;
	-webkit-text-fill-color:transparent;text-fill-color:transparent;
	filter:drop-shadow(0 0 20px rgba(160,107,255,.95)) drop-shadow(0 0 54px rgba(88,32,160,.85)) drop-shadow(0 3px 0 rgba(20,6,40,.9));
	animation:dvgTitle .85s cubic-bezier(.16,1,.3,1) forwards}
@keyframes dvgTitle{0%{opacity:0;transform:translate(-50%,-50%) scale(2.3);filter:blur(12px)}
	40%{opacity:1;filter:blur(0)}62%{transform:translate(-50%,-50%) scale(.96)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.dvg-sub{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);font-size:12px;letter-spacing:.5em;
	color:rgba(226,212,255,.92);white-space:nowrap;opacity:0;
	text-shadow:0 0 13px rgba(160,107,255,.95),0 0 30px rgba(88,32,160,.8);
	animation:dvgFadeIn .45s ease-out .25s forwards}

/* ================= 同归 ================= */
.dvg-chainring{position:absolute;border-radius:50%;opacity:0;
	border:3px dashed rgba(206,174,255,.95);
	box-shadow:0 0 24px rgba(160,107,255,1),inset 0 0 30px rgba(88,32,160,.85);
	transform:translate(-50%,-50%) scale(2.4);
	animation:dvgChainIn .95s cubic-bezier(.5,0,.2,1) forwards,dvgSpin 2.4s linear infinite}
@keyframes dvgChainIn{0%{opacity:0;transform:translate(-50%,-50%) scale(2.4)}
	26%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(.35)}}

.dvg-collapse{position:absolute;border-radius:50%;opacity:0;
	background:radial-gradient(circle,rgba(10,2,22,.98) 0%,rgba(88,32,160,.85) 42%,transparent 76%);
	animation:dvgCollapse .95s cubic-bezier(.4,0,.3,1) forwards}
@keyframes dvgCollapse{0%{opacity:0;transform:translate(-50%,-50%) scale(2.6)}
	30%{opacity:.95}100%{opacity:0;transform:translate(-50%,-50%) scale(.12)}}

/* ================= 马友友 ================= */
.dvg-life{position:absolute;transform:translate(-50%,-50%);opacity:0;
	background:radial-gradient(ellipse at 50% 50%,rgba(170,255,236,.85) 0%,rgba(47,214,176,.5) 34%,rgba(47,214,176,0) 72%);
	animation:dvgLifeUp 1s ease-out forwards}
@keyframes dvgLifeUp{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}
	26%{opacity:1}100%{opacity:0;transform:translate(-50%,-88%) scale(1.1)}}

.dvg-card{position:absolute;width:24px;height:34px;border-radius:4px;opacity:0;
	background:linear-gradient(150deg,rgba(47,214,176,.95),rgba(12,60,48,.95));
	border:1px solid rgba(170,255,236,.9);
	box-shadow:0 0 12px rgba(47,214,176,.85);
	animation:dvgCardFly .82s cubic-bezier(.3,.7,.3,1) forwards}
@keyframes dvgCardFly{0%{opacity:0;transform:translate(0,0) scale(.5) rotate(-14deg)}
	20%{opacity:1}100%{opacity:0;transform:translate(var(--dx,0),var(--dy,0)) scale(1) rotate(10deg)}}

.dvg-slash{position:absolute;transform:translate(-50%,-50%) rotate(-14deg);height:6px;opacity:0;
	background:linear-gradient(90deg,transparent,rgba(206,174,255,.95) 24%,#fff 50%,rgba(160,107,255,.95) 76%,transparent);
	box-shadow:0 0 14px rgba(160,107,255,.95);
	animation:dvgSlash .6s cubic-bezier(.5,0,.2,1) forwards}
@keyframes dvgSlash{0%{opacity:0;width:0}24%{opacity:1;width:116%}
	70%{opacity:1;width:116%}100%{opacity:0;width:116%}}

.dvg-seal{position:absolute;border-radius:50%;opacity:0;
	border:3px solid rgba(206,174,255,.95);
	box-shadow:0 0 24px rgba(160,107,255,1),inset 0 0 28px rgba(160,107,255,.75);
	transform:translate(-50%,-50%) scale(.2);
	animation:dvgSealPulse 1.25s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes dvgSealPulse{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}
	18%{opacity:1;transform:translate(-50%,-50%) scale(1)}
	58%{opacity:.95;transform:translate(-50%,-50%) scale(1.08)}
	100%{opacity:0;transform:translate(-50%,-50%) scale(1.28)}}

.dvg-ghost{position:absolute;width:5px;height:5px;border-radius:50%;opacity:0;
	background:rgba(226,216,255,.9);box-shadow:0 0 9px rgba(160,107,255,.9);
	animation:dvgGhostRise 1.2s ease-out forwards}
@keyframes dvgGhostRise{0%{opacity:0;transform:translate(0,36px) scale(.4)}
	22%{opacity:.95}100%{opacity:0;transform:translate(var(--dx,0),-124px) scale(.3)}}

/* ================= 腐蚀 ================= */
.dvg-corrosion{position:absolute;transform:translate(-50%,-50%);border-radius:50%;opacity:0;
	background:radial-gradient(ellipse at 50% 88%,rgba(138,214,58,.5) 0%,rgba(74,116,26,.34) 34%,rgba(40,52,10,.16) 62%,transparent 82%);
	animation:dvgCorrode 1.35s ease-out forwards}
@keyframes dvgCorrode{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}
	22%{opacity:1}74%{opacity:.85}
	100%{opacity:0;transform:translate(-50%,-50%) scale(1.22)}}

.dvg-bubble{position:absolute;width:8px;height:8px;border-radius:50%;opacity:0;
	background:radial-gradient(circle,rgba(200,255,140,.95) 0%,rgba(138,214,58,.8) 44%,rgba(74,116,26,0) 76%);
	box-shadow:0 0 9px rgba(138,214,58,.8);
	animation:dvgBubbleUp 1.2s ease-out forwards}
@keyframes dvgBubbleUp{0%{opacity:0;transform:translate(0,0) scale(.3)}
	18%{opacity:1}78%{opacity:.8}
	100%{opacity:0;transform:translate(var(--dx,0),var(--dy,-96px)) scale(.5)}}

.dvg-wave{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;mix-blend-mode:screen;
	background:radial-gradient(ellipse at 50% 62%,rgba(138,214,58,.34) 0%,rgba(74,116,26,.16) 44%,transparent 76%);
	animation:dvgWave 1.15s ease-out forwards}
@keyframes dvgWave{0%{opacity:0;transform:scale(1.08)}26%{opacity:1}100%{opacity:0;transform:scale(1)}}

/* ================= 画质档位：CSS 变量 ================= */
#dvg-fx,#dvg-fx-top{
	--f-title:drop-shadow(0 0 20px rgba(160,107,255,.95)) drop-shadow(0 0 54px rgba(88,32,160,.85)) drop-shadow(0 3px 0 rgba(20,6,40,.9));
	--f-glyph:drop-shadow(0 0 24px rgba(160,107,255,1)) drop-shadow(0 0 64px rgba(88,32,160,.9));
	--f-beam:blur(4px);
	--f-pillar:blur(5px);
	--f-rift:drop-shadow(0 0 26px rgba(160,107,255,.95));
	--f-life:drop-shadow(0 0 16px rgba(47,214,176,.9));
	--blend:screen;
}
#dvg-fx.fx-lv4,#dvg-fx-top.fx-lv4{
	--f-title:drop-shadow(0 0 16px rgba(160,107,255,.9)) drop-shadow(0 3px 0 rgba(20,6,40,.9));
	--f-glyph:drop-shadow(0 0 16px rgba(160,107,255,.95));
	--f-life:drop-shadow(0 0 10px rgba(47,214,176,.85));
}
#dvg-fx.fx-lv3,#dvg-fx-top.fx-lv3{
	--f-title:drop-shadow(0 0 14px rgba(160,107,255,.9)) drop-shadow(0 3px 0 rgba(20,6,40,.9));
	--f-glyph:drop-shadow(0 0 12px rgba(160,107,255,.9));
	--f-beam:blur(3px);
	--f-pillar:blur(4px);
	--f-rift:drop-shadow(0 0 16px rgba(160,107,255,.9));
	--f-life:none;
	--blend:normal;
}
#dvg-fx.fx-lv2,#dvg-fx-top.fx-lv2{
	--f-title:drop-shadow(0 0 9px rgba(160,107,255,.8));
	--f-glyph:none;
	--f-beam:none;
	--f-pillar:blur(3px);
	--f-rift:none;
	--f-life:none;
	--blend:normal;
}
#dvg-fx.fx-lv1,#dvg-fx-top.fx-lv1{
	--f-title:none;--f-glyph:none;--f-beam:none;--f-pillar:none;
	--f-rift:none;--f-life:none;--blend:normal;
}
/* 1 档：锥形+遮罩的圆环换成纯边框，省掉遮罩合成 */
#dvg-fx.fx-lv1 .dvg-ring{background:none;border:2px solid rgba(206,174,255,.9);-webkit-mask:none;mask:none}
/* 1~2 档：标题不做模糊入场 */
#dvg-fx.fx-lv1 .dvg-title,#dvg-fx.fx-lv2 .dvg-title,
#dvg-fx-top.fx-lv1 .dvg-title,#dvg-fx-top.fx-lv2 .dvg-title{animation:dvgTitleLite .85s ease forwards}
@keyframes dvgTitleLite{0%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}
	100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
/* 低档清洗：1 档关滤镜与混合（阴影保留 —— 「帐」「护盾」类元素靠它成形） */
#dvg-fx.fx-lv1 *,#dvg-fx-top.fx-lv1 *{filter:none!important;mix-blend-mode:normal!important;text-shadow:none!important}
#dvg-fx.fx-lv2 *,#dvg-fx-top.fx-lv2 *{mix-blend-mode:normal!important}
`;

/* ---------------------------------------------------------------- 运行时状态 */

let _styleDone = false;
const _sfxCache = {};
let _lastPlay = {};

function cfg(key, dflt) {
	try {
		const v = lib.config[key];
		return v === undefined ? dflt : v;
	} catch (e) {
		return dflt;
	}
}

/* ============================================================================
 * 画质档位（1~5，默认 3）—— 与其它三个特效文件共用同一个键
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

/* ---------------------------------------------------------------- 基础设施 */

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
	} catch (e) {
		console.warn("[dvgFx] 注入样式失败", e);
	}
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

/** 确定性伪随机：联机各端结果一致（禁用 Math.random） */
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

/** 音频：文件不存在时静默跳过（onerror 吞掉，绝不抛错、不卡流程） */
function playSfx(name, vol) {
	try {
		if (!name || typeof Audio !== "function") return;
		if (cfg(CFG_SFX, true) === false) return;
		if (lib.config.volume === 0) return;
		let base = _sfxCache[name];
		if (!base) {
			const override = typeof window !== "undefined" && window.__DVG_AUDIO_BASE;
			base = new Audio((override || (lib.assetURL || "") + AUDIO_BASE) + name + ".mp3");
			base.preload = "auto";
			base.addEventListener("error", function () {}, { once: true });
			_sfxCache[name] = base;
		}
		const node = base.cloneNode();
		node.volume = Math.max(0, Math.min(1, vol === undefined ? 0.75 : vol));
		const p = node.play();
		if (p && p.catch) p.catch(function () {});
	} catch (e) {}
}

/* ---------------------------------------------------------------- 特效主体 */

const fx = {
	get on() {
		return cfg(CFG_KEY, true) !== false;
	},

	play(name, args) {
		try {
			if (!this.on) return;
			// 节流：同一玩家 + 同一特效 150ms 内只播一次
			const p = args && args[0];
			let key = name;
			if (p && p.node) {
				key += "|" + (p.name1 || "") + "|" + (p.name2 || "") + "|" + (p.dataset ? p.dataset.position : "");
			}
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
			console.warn("[dvgFx] 未实现的特效名：" + name);
		} catch (e) {
			console.warn("[dvgFx] " + name + " 播放失败", e);
		}
	},

	sound(name, vol) {
		playSfx(name, vol);
	},

	/* ================= 通用件 ================= */

	ring(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const size = opt.size || Math.max(80, Math.min(200, b.w * 1.2));
		const d = mk("dvg-ring");
		if (!d) return;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = size + "px";
		d.style.height = size + "px";
		d.style.transform = "translate(-50%,-50%)";
		kill(d, opt.life || 880);
	},

	float(player, text, opt) {
		if (!text) return;
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const d = mk("dvg-float");
		if (!d) return;
		d.textContent = text;
		d.style.left = b.x + "px";
		d.style.top = b.y + (opt.dy || -b.h * 0.2) + "px";
		d.style.fontSize = (opt.size || 15) + "px";
		d.style.color = opt.color || "#e8dcff";
		kill(d, 1150);
	},

	spark(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const n = qn(Math.max(1, Math.min(120, opt.count || 30)));
		const spread = opt.spread || 86;
		const color = opt.color || "rgba(206,174,255,1)";
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-spark");
			if (!d) break;
			const a = (i / n) * Math.PI * 2 + rnd(i * 3.3) * 0.6;
			const dist = spread * (0.4 + rnd(i * 7.1) * 0.9);
			d.style.left = b.x + "px";
			d.style.top = b.y + "px";
			d.style.setProperty("--dx", (Math.cos(a) * dist).toFixed(0) + "px");
			d.style.setProperty("--dy", (Math.sin(a) * dist).toFixed(0) + "px");
			if (opt.color) {
				d.style.background = "radial-gradient(circle,#fff 0%," + color + " 40%,transparent 74%)";
			}
			d.style.animationDelay = (rnd(i * 5.7) * 0.14).toFixed(2) + "s";
			kill(d, 1150);
		}
	},

	burst(player, opt) {
		opt = opt || {};
		const b = box(player);
		if (!b) return;
		const d = mk("dvg-burst");
		if (!d) return;
		const s = opt.size || 120;
		d.style.left = b.x + "px";
		d.style.top = b.y + "px";
		d.style.width = s + "px";
		d.style.height = s + "px";
		kill(d, 760);
	},

	/* ================= 隐匿 · 暗置武将牌 ================= */

	hiddenStart(player) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_hide", 0.7);
		const l = layer();
		if (!l) return;
		// 一张"未知武将"背面牌盖住头像
		const card = mk("dvg-veilcard", l);
		if (card) {
			card.style.left = b.x + "px";
			card.style.top = b.y + "px";
			card.style.width = b.w + "px";
			card.style.height = b.h + "px";
			card.style.animationDuration = qtime(900) + "ms";
			kill(card, 1100);
		}
		setTimeout(
			function () {
				try {
					const g = mk("dvg-glyphbig", l);
					if (!g) return;
					g.textContent = "隐";
					g.style.left = b.x + "px";
					g.style.top = b.y - b.h * 0.42 + "px";
					g.style.fontSize = "52px";
					g.style.animationDuration = qtime(1100) + "ms";
					kill(g, 1300);
				} catch (e) {
					console.warn("[dvgFx] hiddenStart 文字失败", e);
				}
			},
			qtime(220)
		);
	},

	/* ================= 隐匿 · 移出游戏 ================= */

	hiddenOut(player) {
		const b = box(player);
		const l = topLayer();
		if (!l) return;
		this.sound("dvg_vanish", 0.85);

		const dim = mk("dvg-dim", l);
		if (dim) {
			setTimeout(function () {
				try {
					dim.style.opacity = "1";
				} catch (e) {}
			}, 20);
			setTimeout(function () {
				try {
					dim.style.opacity = "0";
				} catch (e) {}
			}, qtime(1000));
			kill(dim, qtime(1400));
		}
		if (!b) return;

		const mist = mk("dvg-mist", l);
		if (mist) {
			mist.style.left = b.x + "px";
			mist.style.top = b.y + "px";
			mist.style.width = b.w * 2 + "px";
			mist.style.height = b.h * 1.7 + "px";
			mist.style.animationDuration = qtime(1200) + "ms";
			kill(mist, 1400);
		}

		// 身体溶解成上升碎片（节点数受 qn() 控制）
		const n = qn(16);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-shard", l);
			if (!d) break;
			d.style.left = b.x + (rnd(i * 3.1) - 0.5) * b.w * 1.05 + "px";
			d.style.top = b.y + (rnd(i * 7.7) - 0.5) * b.h * 1.05 + "px";
			d.style.setProperty("--dx", ((rnd(i * 5.3) - 0.5) * 56).toFixed(0) + "px");
			d.style.setProperty("--dy", (-46 - rnd(i * 9.1) * 100).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 11.3) * 0.45).toFixed(2) + "s";
			kill(d, 1500);
		}
	},

	/* ================= 归来 ================= */

	returnBack(player) {
		const b = box(player);
		const l = topLayer();
		if (!l) return;
		this.sound("dvg_return", 0.9);

		const dim = mk("dvg-dim", l);
		if (dim) {
			setTimeout(function () {
				try {
					dim.style.opacity = "1";
				} catch (e) {}
			}, 20);
			setTimeout(function () {
				try {
					dim.style.opacity = "0";
				} catch (e) {}
			}, qtime(950));
			kill(dim, qtime(1400));
		}

		if (b) {
			const rift = mk("dvg-rift", l);
			if (rift) {
				rift.style.left = b.x + "px";
				rift.style.top = b.y + "px";
				rift.style.width = "14px";
				rift.style.height = b.h * 2.3 + "px";
				rift.style.filter = "var(--f-rift)";
				kill(rift, 1300);
			}
			const beam = mk("dvg-beam", l);
			if (beam) {
				beam.style.left = b.x + "px";
				beam.style.top = b.y + "px";
				beam.style.width = "110px";
				beam.style.height = b.h * 2.5 + "px";
				beam.style.filter = "var(--f-beam)";
				kill(beam, 1300);
			}
			const rf = mk("dvg-reform", l);
			if (rf) {
				rf.style.left = b.x + "px";
				rf.style.top = b.y + "px";
				rf.style.width = b.w * 1.9 + "px";
				rf.style.height = b.h * 1.8 + "px";
				kill(rf, 1200);
			}
		}

		// 由外向内的重组粒子
		const sc = screen();
		const cx = b ? b.x : sc.x;
		const cy = b ? b.y : sc.y;
		const n = qn(16);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-spark", l);
			if (!d) break;
			const a = rnd(i * 4.1) * Math.PI * 2;
			const dist = 110 + rnd(i * 8.3) * 170;
			d.style.left = cx + Math.cos(a) * dist + "px";
			d.style.top = cy + Math.sin(a) * dist + "px";
			d.style.setProperty("--dx", (-Math.cos(a) * dist * 0.92).toFixed(0) + "px");
			d.style.setProperty("--dy", (-Math.sin(a) * dist * 0.92).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 6.7) * 0.26).toFixed(2) + "s";
			kill(d, 1400);
		}

		setTimeout(
			function () {
				try {
					const f = mk("dvg-flash", l);
					kill(f, 600);
					playSfx("dvg_hit", 0.7);
				} catch (e) {
					console.warn("[dvgFx] returnBack 白闪失败", e);
				}
			},
			qtime(620)
		);

		setTimeout(
			function () {
				try {
					const t = mk("dvg-title", l);
					if (!t) return;
					t.textContent = "再登场";
					t.style.animationDuration = qtime(800) + "ms";
					const s = mk("dvg-sub", l);
					if (s) s.textContent = "D & G";
					kill(t, 1500);
					kill(s, 1500);
				} catch (e) {
					console.warn("[dvgFx] returnBack 标题失败", e);
				}
			},
			qtime(620)
		);
	},

	/* ================= 帮助 · 询问 ================= */

	helpAsk(player, target) {
		const a = box(player);
		const b = box(target);
		if (!a || !b) return;
		this.sound("dvg_ask", 0.5);
		const l = layer();
		if (!l) return;

		const th = mk("dvg-thread", l);
		if (th) {
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const len = Math.sqrt(dx * dx + dy * dy);
			th.style.left = a.x + "px";
			th.style.top = a.y + "px";
			th.style.width = len + "px";
			th.style.transform = "rotate(" + ((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1) + "deg)";
			kill(th, 1000);
		}

		setTimeout(
			function () {
				try {
					const g = mk("dvg-glyph", l);
					if (!g) return;
					g.textContent = "？";
					g.style.left = b.x + "px";
					g.style.top = b.y - b.h * 0.4 + "px";
					kill(g, 1000);
				} catch (e) {
					console.warn("[dvgFx] helpAsk 符文失败", e);
				}
			},
			qtime(240)
		);
	},

	/* ================= 帮助 · 接受 / 拒绝 ================= */

	helped(target) {
		const b = box(target);
		if (!b) return;
		this.sound("dvg_help", 0.75);
		const l = layer();
		if (!l) return;

		const r = mk("dvg-aidring", l);
		if (r) {
			r.style.left = b.x + "px";
			r.style.top = b.y + "px";
			r.style.width = b.w * 2.1 + "px";
			r.style.height = b.w * 2.1 + "px";
			kill(r, 1150);
		}

		const n = qn(11);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-aidmote", l);
			if (!d) break;
			const a = rnd(i * 3.9) * Math.PI * 2;
			const dist = 38 + rnd(i * 7.3) * 64;
			d.style.left = b.x + Math.cos(a) * dist + "px";
			d.style.top = b.y + Math.sin(a) * dist + "px";
			d.style.setProperty("--dx", (-Math.cos(a) * dist * 0.5).toFixed(0) + "px");
			d.style.setProperty("--dy", (-Math.sin(a) * dist * 0.5 - 46).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 5.1) * 0.26).toFixed(2) + "s";
			kill(d, 1300);
		}

		this.float(target, "被帮助", { color: AMBER_L, size: 16, dy: -b.h * 0.55 });
	},

	declined(target) {
		const b = box(target);
		if (!b) return;
		this.sound("dvg_ask", 0.35);
		this.float(target, "拒绝", { color: "rgba(170,170,180,.9)", size: 14, dy: -b.h * 0.5 });
	},

	/* ================= 召唤马友友（大特效，压着 1.5 秒上限） ================= */

	summon(player) {
		const l = topLayer();
		if (!l) return;
		const sc = screen();
		const b = box(player);
		const cx = b ? b.x : sc.x;
		const cy = sc.y + 30;

		this.sound("dvg_summon", 0.95);

		const dim = mk("dvg-dim", l);
		if (dim) {
			setTimeout(function () {
				try {
					dim.style.opacity = "1";
				} catch (e) {}
			}, 20);
			setTimeout(function () {
				try {
					dim.style.opacity = "0";
				} catch (e) {}
			}, qtime(1150));
			kill(dim, qtime(1500));
		}

		// 召唤阵：双层逆向旋转
		const size = Math.min(sc.w, sc.h) * 0.6;
		const s1 = mk("dvg-sigil", l);
		if (s1) {
			s1.style.left = cx + "px";
			s1.style.top = cy + "px";
			s1.style.width = size + "px";
			s1.style.height = size + "px";
			kill(s1, 1500);
		}
		const s2 = mk("dvg-sigil2", l);
		if (s2) {
			s2.style.left = cx + "px";
			s2.style.top = cy + "px";
			s2.style.width = size * 0.92 + "px";
			s2.style.height = size * 0.92 + "px";
			kill(s2, 1500);
		}

		// 落雷劈在阵心
		setTimeout(
			function () {
				try {
					playSfx("dvg_stomp", 0.85);
					const bolt = mk("dvg-bolt", l);
					if (bolt) {
						bolt.style.left = cx + "px";
						bolt.style.top = "-4%";
						bolt.style.height = cy + sc.h * 0.04 + "px";
						kill(bolt, 800);
					}
					const f = mk("dvg-flash", l);
					kill(f, 600);
				} catch (e) {
					console.warn("[dvgFx] summon 落雷失败", e);
				}
			},
			qtime(460)
		);

		// 青玉光柱
		setTimeout(
			function () {
				try {
					const p = mk("dvg-pillar", l);
					if (p) {
						p.style.left = cx + "px";
						p.style.top = cy - sc.h * 0.5 + "px";
						p.style.width = "24vmin";
						p.style.height = sc.h * 0.88 + "px";
						p.style.filter = "var(--f-pillar)";
						kill(p, 1500);
					}
				} catch (e) {
					console.warn("[dvgFx] summon 光柱失败", e);
				}
			},
			qtime(600)
		);

		// 冲击环 + 粒子
		setTimeout(
			function () {
				try {
					playSfx("dvg_hit", 0.75);
					for (let k = 0; k < 3; k++) {
						(function (kk) {
							setTimeout(
								function () {
									try {
										const r = mk("dvg-burst", l);
										if (!r) return;
										const s = 150 + kk * 80;
										r.style.left = cx + "px";
										r.style.top = cy + "px";
										r.style.width = s + "px";
										r.style.height = s + "px";
										r.style.borderColor = JADE;
										kill(r, 900);
									} catch (e) {}
								},
								kk * 90
							);
						})(k);
					}
					const n = qn(12);
					for (let i = 0; i < n; i++) {
						const d = mk("dvg-spark", l);
						if (!d) break;
						const a = rnd(i * 3.7) * Math.PI * 2;
						const dist = 80 + rnd(i * 9.7) * 200;
						d.style.left = cx + Math.cos(a) * dist + "px";
						d.style.top = cy + Math.sin(a) * dist + "px";
						d.style.setProperty("--dx", (-Math.cos(a) * dist * 0.9).toFixed(0) + "px");
						d.style.setProperty("--dy", (-Math.sin(a) * dist * 0.9 - 54).toFixed(0) + "px");
						d.style.background =
							"radial-gradient(circle,#fff 0%,rgba(170,255,236,1) 40%,rgba(47,214,176,0) 74%)";
						d.style.animationDelay = (rnd(i * 5.9) * 0.3).toFixed(2) + "s";
						kill(d, 1500);
					}
				} catch (e) {
					console.warn("[dvgFx] summon 冲击失败", e);
				}
			},
			qtime(660)
		);

		// 标题
		setTimeout(
			function () {
				try {
					const t = mk("dvg-title", l);
					if (!t) return;
					t.textContent = "马友友";
					t.style.animationDuration = qtime(800) + "ms";
					const s = mk("dvg-sub", l);
					if (s) s.textContent = "M A Y O U Y O U";
					kill(t, 1500);
					kill(s, 1500);
				} catch (e) {
					console.warn("[dvgFx] summon 标题失败", e);
				}
			},
			qtime(620)
		);
	},

	/* ================= 马友友消失 ================= */

	mayouyouGone(player) {
		const b = box(player);
		this.sound("dvg_gone", 0.7);
		const l = layer();
		if (!l || !b) return;
		const w = mk("dvg-reform", l);
		if (w) {
			w.style.left = b.x + "px";
			w.style.top = b.y + "px";
			w.style.width = b.w * 1.9 + "px";
			w.style.height = b.h * 1.7 + "px";
			w.style.background =
				"radial-gradient(circle,rgba(170,255,236,.85) 0%,rgba(47,214,176,.4) 42%,transparent 72%)";
			kill(w, 1200);
		}
		const n = qn(12);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-shard", l);
			if (!d) break;
			d.style.left = b.x + (rnd(i * 3.1) - 0.5) * b.w + "px";
			d.style.top = b.y + (rnd(i * 7.7) - 0.5) * b.h + "px";
			d.style.background = "rgba(170,255,236,.95)";
			d.style.setProperty("--dy", (-70 - rnd(i * 9.1) * 80).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 11.3) * 0.35).toFixed(2) + "s";
			kill(d, 1400);
		}
		this.float(player, "消散", { color: JADE_L, size: 14, dy: -b.h * 0.5 });
	},

	/* ================= 同归（D&G 死亡带走马友友） ================= */

	takedown(player) {
		this.sound("dvg_takedown", 0.95);
		const l = topLayer();
		if (!l) return;
		const b = box(player);

		const dim = mk("dvg-dim", l);
		if (dim) {
			setTimeout(function () {
				try {
					dim.style.opacity = "1";
				} catch (e) {}
			}, 20);
			kill(dim, qtime(1500));
		}

		const sc = screen();
		const cx = b ? b.x : sc.x;
		const cy = b ? b.y : sc.y;

		// 引力坍缩：虚线环收缩 + 中心黑紫吞噬
		const ring = mk("dvg-chainring", l);
		if (ring) {
			const size = Math.max(sc.w, sc.h) * 0.9;
			ring.style.left = cx + "px";
			ring.style.top = cy + "px";
			ring.style.width = size + "px";
			ring.style.height = size + "px";
			kill(ring, 1300);
		}
		const col = mk("dvg-collapse", l);
		if (col) {
			col.style.left = cx + "px";
			col.style.top = cy + "px";
			col.style.width = sc.w * 0.5 + "px";
			col.style.height = sc.w * 0.5 + "px";
			kill(col, 1300);
		}

		// 被拽走的碎光
		const n = qn(14);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-spark", l);
			if (!d) break;
			const a = rnd(i * 4.3) * Math.PI * 2;
			const dist = 140 + rnd(i * 8.1) * 190;
			d.style.left = cx + Math.cos(a) * dist + "px";
			d.style.top = cy + Math.sin(a) * dist + "px";
			d.style.setProperty("--dx", (-Math.cos(a) * dist * 0.95).toFixed(0) + "px");
			d.style.setProperty("--dy", (-Math.sin(a) * dist * 0.95).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 6.1) * 0.22).toFixed(2) + "s";
			kill(d, 1400);
		}

		setTimeout(
			function () {
				try {
					const f = mk("dvg-flash", l);
					kill(f, 600);
				} catch (e) {}
			},
			qtime(560)
		);

		setTimeout(
			function () {
				try {
					const t = mk("dvg-title", l);
					if (!t) return;
					t.textContent = "同归";
					t.style.fontSize = "72px";
					t.style.animationDuration = qtime(800) + "ms";
					const s = mk("dvg-sub", l);
					if (s) s.textContent = "TAKE  DOWN";
					kill(t, 1500);
					kill(s, 1500);
				} catch (e) {
					console.warn("[dvgFx] takedown 标题失败", e);
				}
			},
			qtime(600)
		);
	},

	/* ================= 马友友 · 回满 ================= */

	heal(player) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_heal", 0.6);
		const l = layer();
		if (!l) return;
		const d = mk("dvg-life", l);
		if (d) {
			d.style.left = b.x + "px";
			d.style.top = b.y + "px";
			d.style.width = b.w * 1.8 + "px";
			d.style.height = b.h * 1.45 + "px";
			d.style.filter = "var(--f-life)";
			kill(d, 1200);
		}
		this.float(player, "回满", { color: JADE_L, size: 16, dy: -b.h * 0.5 });
	},

	/* ================= 马友友 · 受伤摸牌 ================= */

	damageDraw(player, n) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_draw", 0.5);
		const l = layer();
		if (!l) return;
		const cnt = qn(Math.max(1, Math.min(6, n || 2)));
		for (let i = 0; i < cnt; i++) {
			const d = mk("dvg-card", l);
			if (!d) break;
			d.style.left = b.x - 112 + rnd(i * 3.3) * 36 + "px";
			d.style.top = b.y - 36 + i * 6 + "px";
			d.style.setProperty("--dx", (112 + rnd(i * 7.7) * 46).toFixed(0) + "px");
			d.style.setProperty("--dy", (26 + i * 9).toFixed(0) + "px");
			d.style.animationDelay = (i * 0.11).toFixed(2) + "s";
			kill(d, 1300);
		}
		this.float(player, "+2 张", { color: JADE_L, size: 15, dy: -b.h * 0.45 });
	},

	/* ================= 马友友 · 跳过阶段 ================= */

	skipPhase(player, isUse) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_skip", 0.5);
		const l = layer();
		if (!l) return;
		const label = isUse ? "出牌阶段" : "弃牌阶段";

		const t = mk("dvg-float", l);
		if (t) {
			t.textContent = label;
			t.style.left = b.x + "px";
			t.style.top = b.y - b.h * 0.3 + "px";
			t.style.fontSize = "17px";
			t.style.animationDuration = qtime(1050) + "ms";
			kill(t, 1300);
		}
		const sl = mk("dvg-slash", l);
		if (sl) {
			sl.style.left = b.x + "px";
			sl.style.top = b.y - b.h * 0.3 + "px";
			kill(sl, 900);
		}
		this.float(player, "→ 摸两张", { color: JADE_L, size: 13, dy: -b.h * 0.05 });
	},

	/* ================= 马友友 · 不死 ================= */

	immortal(player) {
		const b = box(player);
		this.sound("dvg_immortal", 0.9);
		const l = topLayer();
		if (!l) return;

		const f = mk("dvg-flash", l);
		kill(f, 600);
		if (!b) return;

		const seal = mk("dvg-seal", l);
		if (seal) {
			seal.style.left = b.x + "px";
			seal.style.top = b.y + b.h * 0.45 + "px";
			seal.style.width = b.w * 1.7 + "px";
			seal.style.height = b.w * 0.6 + "px";
			kill(seal, 1500);
		}

		const n = qn(13);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-ghost", l);
			if (!d) break;
			d.style.left = b.x + (rnd(i * 3.1) - 0.5) * b.w * 1.35 + "px";
			d.style.top = b.y + b.h * 0.5 + "px";
			d.style.setProperty("--dx", ((rnd(i * 7.3) - 0.5) * 64).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 5.1) * 0.42).toFixed(2) + "s";
			kill(d, 1600);
		}

		setTimeout(
			function () {
				try {
					const t = mk("dvg-title", l);
					if (!t) return;
					t.textContent = "不死";
					t.style.fontSize = "72px";
					t.style.top = "40%";
					t.style.animationDuration = qtime(750) + "ms";
					kill(t, 1450);
				} catch (e) {
					console.warn("[dvgFx] immortal 标题失败", e);
				}
			},
			qtime(180)
		);
	},

	/* ================= 马友友 · 放弃响应 ================= */

	noreply(player) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_skip", 0.35);
		this.float(player, "放弃响应", { color: "rgba(190,190,205,.9)", size: 13, dy: -b.h * 0.45 });
	},

	/* ================= 腐蚀 · 获得 ================= */

	corruptGain(player, count) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_corrupt", 0.6);
		const l = layer();
		if (!l) return;

		const c = mk("dvg-corrosion", l);
		if (c) {
			c.style.left = b.x + "px";
			c.style.top = b.y + b.h * 0.25 + "px";
			c.style.width = b.w * 1.9 + "px";
			c.style.height = b.h * 1.15 + "px";
			kill(c, 1600);
		}

		const n = qn(9);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-bubble", l);
			if (!d) break;
			d.style.left = b.x + (rnd(i * 3.7) - 0.5) * b.w * 1.35 + "px";
			d.style.top = b.y + b.h * 0.4 + "px";
			d.style.setProperty("--dx", ((rnd(i * 7.9) - 0.5) * 46).toFixed(0) + "px");
			d.style.setProperty("--dy", (-80 - rnd(i * 5.3) * 56).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 11.7) * 0.4).toFixed(2) + "s";
			kill(d, 1600);
		}

		this.float(player, "腐蚀 +" + (count || 1), { color: ACID, size: 16, dy: -b.h * 0.55 });
	},

	/* ================= 腐蚀 · 每轮发作（全场） ================= */

	corruptWave(count) {
		this.sound("dvg_corrupt", 0.55);
		const l = layer();
		if (!l) return;
		const w = mk("dvg-wave", l);
		if (w) kill(w, 1300);
		const sc = screen();
		this.float({ node: { avatar: { getBoundingClientRect: () => ({ left: sc.x - 1, top: sc.y - 1, width: 2, height: 2 }) } } }, "腐蚀发作 ×" + (count || 1), {
			color: ACID,
			size: 19,
			dy: -sc.h * 0.18,
		});
	},

	/* ================= 腐蚀 · 流失体力 ================= */

	corruptDamage(player, times) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_corrupt", 0.7);
		const l = layer();
		if (!l) return;
		const c = mk("dvg-corrosion", l);
		if (c) {
			c.style.left = b.x + "px";
			c.style.top = b.y + b.h * 0.2 + "px";
			c.style.width = b.w * 1.8 + "px";
			c.style.height = b.h * 1.1 + "px";
			kill(c, 1400);
		}
		const n = qn(10);
		for (let i = 0; i < n; i++) {
			const d = mk("dvg-bubble", l);
			if (!d) break;
			d.style.left = b.x + (rnd(i * 3.9) - 0.5) * b.w * 1.2 + "px";
			d.style.top = b.y + b.h * 0.35 + "px";
			d.style.setProperty("--dy", (-70 - rnd(i * 5.7) * 60).toFixed(0) + "px");
			d.style.animationDelay = (rnd(i * 9.3) * 0.35).toFixed(2) + "s";
			kill(d, 1500);
		}
		this.float(player, "腐蚀 -" + (times || 1), { color: ACID, size: 17, dy: -b.h * 0.55 });
	},

	/* ================= 取用马友友的牌 ================= */

	useCard(player, card) {
		const b = box(player);
		if (!b) return;
		this.sound("dvg_card", 0.55);
		const l = layer();
		if (!l) return;
		const n = qn(3);
		for (let i = 0; i < n; i++) {
			(function (k) {
				setTimeout(function () {
					try {
						const d = mk("dvg-card", l);
						if (!d) return;
						d.style.left = b.x - 90 + "px";
						d.style.top = b.y - 26 + "px";
						d.style.setProperty("--dx", (86 + rnd(k * 5.1) * 26).toFixed(0) + "px");
						d.style.setProperty("--dy", (18 + k * 7).toFixed(0) + "px");
						d.style.animationDuration = qtime(740) + "ms";
						kill(d, 1050);
					} catch (e) {
						console.warn("[dvgFx] useCard 卡牌失败", e);
					}
				}, k * 80);
			})(i);
		}
		this.float(player, "取用", { color: JADE_L, size: 14, dy: -b.h * 0.5 });
	},

	/* ================= 交付 / 转移：牌飞向马友友 ================= */

	give(from, to, count) {
		const a = box(from);
		const b = box(to);
		if (!a || !b) return;
		this.sound("dvg_card", 0.5);
		const l = layer();
		if (!l) return;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const cnt = qn(Math.max(1, Math.min(5, count || 1)));
		for (let i = 0; i < cnt; i++) {
			(function (k) {
				setTimeout(function () {
					try {
						const d = mk("dvg-card", l);
						if (!d) return;
						d.style.left = a.x + "px";
						d.style.top = a.y + "px";
						d.style.setProperty("--dx", dx.toFixed(0) + "px");
						d.style.setProperty("--dy", dy.toFixed(0) + "px");
						d.style.animationDuration = qtime(760) + "ms";
						kill(d, 1100);
					} catch (e) {
						console.warn("[dvgFx] give 卡牌失败", e);
					}
				}, k * 100);
			})(i);
		}
		this.float(from, "交给马友友" + (count > 1 ? " ×" + count : ""), {
			color: JADE_L,
			size: 13,
			dy: -a.h * 0.5,
		});
	},
};

/* ---------------------------------------------------------------- 导出 */

// 供技能层的 FXWait 读取（低档缩短演出等待）
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

lib.dvgFx = fx;

export default fx;
