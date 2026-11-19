/**
 * 生成「乔鲁诺特效预览.html」：把 乔鲁诺特效.js 内联进模拟牌桌，浏览器直接看。
 * 用法：node tools/生成乔鲁诺预览.mjs
 * 打开：乔鲁诺特效预览.html?fx=awaken&freeze=1200
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
let src = fs.readFileSync(path.join(root, "乔鲁诺特效.js"), "utf8");
src = src.replace(/^\s*import\s+[\s\S]*?from\s+["']noname["'];?\s*/m, "");
src = src.replace(/export\s+default\s+fx;?/, "");
src = src.replace(/lib\.jojoFx\s*=\s*fx;?/, "lib.jojoFx = fx; window.jojoFx = fx;");

const PORTRAIT =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		"<svg xmlns='http://www.w3.org/2000/svg' width='200' height='260'>" +
			"<rect width='200' height='260' fill='#0d1a0f'/>" +
			"<circle cx='100' cy='86' r='44' fill='#e8b23a'/>" +
			"<path d='M60 78 L140 78 L100 40 Z' fill='#0d1a0f'/>" +
			"<circle cx='84' cy='88' r='6' fill='#0d1a0f'/>" +
			"<circle cx='116' cy='88' r='6' fill='#0d1a0f'/>" +
			"<rect x='56' y='144' width='88' height='122' rx='24' fill='#7be08a'/>" +
			"</svg>"
	);

const head = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>乔鲁诺·乔巴纳 · 技能特效预览</title>
<style>
	html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#08120a;font-family:"Microsoft YaHei",sans-serif}
	#arena{position:relative;width:100vw;height:100vh;
		background:radial-gradient(ellipse at 50% 45%,#12240f 0%,#0a1409 62%,#040704 100%)}
	.player{position:absolute;width:120px;height:168px}
	.player .avatar{width:120px;height:120px;border-radius:8px;background-size:cover;background-position:center;
		box-shadow:0 0 0 1px #1e3320,0 6px 18px rgba(0,0,0,.6)}
	.player .name{margin-top:6px;text-align:center;color:#d8e2ce;font-size:13px}
	.player .hp{margin-top:2px;text-align:center;color:#7be08a;font-size:12px}
	#p0{left:50%;bottom:5%;transform:translateX(-50%)}
	#p1{left:4%;bottom:20%}
	#p2{left:10%;top:8%}
	#p3{left:50%;top:3%;transform:translateX(-50%)}
	#p4{right:10%;top:8%}
	#p5{right:4%;bottom:20%}
	#hud{position:fixed;left:12px;top:12px;z-index:10;color:#7f8d78;font-size:12px;line-height:1.7;
		pointer-events:none;text-shadow:0 1px 2px #000}
	#hud b{color:#7be08a;font-weight:600}
</style>
</head>
<body>
<div id="arena"></div>
<div id="hud"></div>
<script>
	var lib = {config:{},character:{jojo_giorno:{img:"${PORTRAIT}"}},skill:{},extensions:[],assetURL:""};
	var game = {
		me:null, players:[], dead:[], phaseNumber:1,
		broadcastAll:function(fn){ var a=[].slice.call(arguments,1); try{ fn.apply(null,a); }catch(e){ console.error(e); } },
		arrangePlayers:function(){}
	};
	var ui = {fakeme:null, me:null};
	var get = {translation:function(s){return s;}, info:function(){return {};}, itemtype:function(){return 'player';}};
	var ai = {}, _status = {connectMode:false};
</script>
<script>
__FX_SOURCE__
</script>
<script>
__BOOT__
</script>
</body>
</html>`;

const boot = `(function(){
	var P = "${PORTRAIT}";
	var q = new URLSearchParams(location.search);
	window.__JOJO_AUDIO_BASE = "audio/fx/";

	var freeze = parseInt(q.get("freeze") || "0", 10);
	if (freeze > 0) {
		var rawTimeout = window.setTimeout.bind(window);
		window.setTimeout = function (fn, ms) { ms = ms || 0; if (ms > freeze) return 0; return rawTimeout(fn, ms); };
		rawTimeout(function () {
			var list = document.getAnimations ? document.getAnimations() : [];
			for (var i = 0; i < list.length; i++) { try { list[i].pause(); } catch (e) {} }
		}, freeze);
	}

	var names = ["乔鲁诺","牙","甲","乙","丙","丁"];
	var seats = [];
	for (var i = 0; i < 6; i++) {
		var el = document.createElement("div");
		el.className = "player";
		el.id = "p" + i;
		el.innerHTML = '<div class="avatar"></div><div class="name"></div><div class="hp"></div>';
		document.getElementById("arena").appendChild(el);
		var av = el.querySelector(".avatar");
		av.style.backgroundImage = 'url("' + P + '")';
		el.node = {avatar: av};
		el.storage = {};
		el.dataset = {position: String(i + 1)};
		el.name1 = "jojo_giorno";
		el.hasSkill = function(){ return true; };
		el.querySelector(".name").textContent = names[i];
		el.querySelector(".hp").textContent = "4 / 4";
		seats.push(el);
	}
	game.players = seats;
	game.me = seats[0];
	document.getElementById("hud").innerHTML =
		'<b>乔鲁诺·乔巴纳 · 特效预览</b><br>?fx=energy / bloom / distance / armor / reflect / seal / arrow / arrows / awaken / zero / draw / miss / dying<br>?freeze=毫秒（冻在某一帧）<br><b>点画面任意处重播</b>（浏览器默认静音，点一下才出声）';

	var name = q.get("fx") || "awaken";
	var a = seats[0], b = seats[1];

	function run() {
		var f = window.jojoFx;
		if (!f) { console.error("jojoFx 未加载"); return; }
		try {
			if (name === "energy") f.energy(a, 3);
			else if (name === "bloom") f.convert(a, "tao");
			else if (name === "distance") f.convert(a, "distance");
			else if (name === "armor") f.convert(a, "armor");
			else if (name === "reflect") { f.shell(a); f.reflect(a, b); }
			else if (name === "seal") f.skipDraw(b);
			else if (name === "arrow") f.arrow(b, a, "take");
			else if (name === "arrows") f.arrow(null, null, "shuffle");
			else if (name === "awaken") f.awaken(a);
			else if (name === "zero") f.requiem(a, "zero");
			else if (name === "draw") f.requiem(a, "draw");
			else if (name === "miss") f.requiem(a, "miss");
			else if (name === "dying") f.dying(a);
			else if (name === "burst") f.burst(a, {count:60});
			else f[name] ? f[name](a, b) : console.warn("未知特效:", name);
		} catch (e) { console.error(e); }
	}
	setTimeout(run, 60);
	if (freeze <= 0) document.body.addEventListener("click", function(){ setTimeout(run, 30); });
})();`;

const html = head.replace("__FX_SOURCE__", src).replace("__BOOT__", boot);
const out = path.join(root, "乔鲁诺特效预览.html");
fs.writeFileSync(out, html, "utf8");
console.log("已生成：" + out + "（" + (html.length / 1024).toFixed(1) + " KB）");
