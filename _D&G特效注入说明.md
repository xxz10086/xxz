# D&G 特效注入说明（给执行注入的 AI）

> 本文档自包含，你不需要任何前置上下文。
> 读完按「第二节 执行步骤」照做即可，全程 4 条命令。

---

## 一、现在的状态

**特效层已经全部写好并验证过，唯一没做的是把它接进技能文件**（因为原规范要求「需要技能侧配合要先说，不要直接改」，所以留给你执行）。

| 文件 | 状态 | 说明 |
|---|---|---|
| `D&G特效.js` | ✅ 已创建 | 26 个方法，语法通过，纯 DOM/CSS + WAAPI |
| `audio/fx/dvg_*.mp3` | ✅ 已就位 | 16 个，已做「去头静音 + RMS 归一」，最大 19.6 KB |
| `audio/CREDITS.md` | ✅ 已更新 | 新增 `## D&G（Steel Ball Run）` 章节 16 条署名 |
| `tools/注入dvg特效.mjs` | ✅ 已创建 | 注入器（幂等 / dry-run / 自动备份 / 可回滚 / 自检） |
| `dvg.js` | ⬜ **未改动** | 等你的 `--apply`，目前 0 处特效调用 |

当前实测状态：

```
自检：FX 方法 19/19 全部有实现，音效 16/16 全部存在
锚点：20/20 全部命中
```

---

## 二、执行步骤

### 2.1 进目录

```bash
cd F:\Games\noname\extension\脑花乔尼
```

### 2.2 三条命令

```bash
# ① 自检：确认 D&G特效.js 的方法和音效都在
node tools\注入dvg特效.mjs --check

# ② 预演：确认 20 个锚点全部命中（不写文件）
node tools\注入dvg特效.mjs

# ③ 写入（自动备份 dvg.js.fxbak）
node tools\注入dvg特效.mjs --apply
```

预期输出：

```
✔ ① 文件头
✔ ② dvg_skill_hidden.content 开头
...
✔ ⑳ dvg_skill_discard_to_mayouyou 日志前

命中 20/20

✔ 已写入 ...\dvg.js
  86334 字节 / 2157 行
✔ 备份 ...\dvg.js.fxbak
```

### 2.3 验证语法

⚠️ `dvg.js` 是 ESM，`node --check dvg.js` 会按 CJS 解析而报错。**必须复制成 `.mjs` 再查**：

```powershell
$t = Join-Path $env:TEMP 'chk'; New-Item -ItemType Directory -Force -Path $t | Out-Null
Copy-Item 'dvg.js' "$t\dvg.mjs" -Force
node --check "$t\dvg.mjs"
if ($LASTEXITCODE -eq 0) { "✔ 语法通过" } else { "✘ 语法错误" }
Remove-Item $t -Recurse -Force
```

然后再跑一次自检：

```bash
node tools\注入dvg特效.mjs --check
```

---

## 三、游戏内验收清单

用 D&G 开一局（建议 2~3 人，方便逐个触发）：

| # | 操作 | 应该看到 |
|---|---|---|
| 1 | 开局 | **武将牌暗置** → 一张紫色未知牌翻面盖住头像 + 「隐」字 |
| 2 | 接着 | **黑雾自下吞没** → 碎片上升 → 座位空出 |
| 3 | 下一轮 | **虚空裂隙撕开** → 紫光柱 → 粒子重组 → 白闪 → 「再登场」 |
| 4 | 帮助询问 | 每个目标一条**琥珀金线** + 「？」；接受则**援手环** + 「被帮助」，拒绝则灰字「拒绝」 |
| 5 | 询问结束 | **召唤马友友**：法阵 → 落雷 → 青玉光柱 → 冲击环 → 「马友友」 |
| 6 | 马友友回合开始 | 青玉生命光 + 「回满」 |
| 7 | 马友友受伤 | 卡牌飞入 + 「+2 张」 |
| 8 | 马友友出牌/弃牌阶段 | 阶段名浮现 → **被斜线划掉** → 「→ 摸两张」 |
| 9 | 马友友濒死 | 白闪 + 不灭烙印环 + 逆流粒子 + 「不死」 |
| 10 | 马友友被要求响应 | 灰字「放弃响应」 |
| 11 | 每轮开始 | 每个被帮助者**酸绿腐蚀蔓延** + 「腐蚀 +1」；最后全屏绿波 + 「腐蚀发作 ×N」 |
| 12 | 腐蚀 ≥5 时的回合结束 | 「腐蚀 -N」+ 气泡 |
| 13 | 被帮助者取用马友友的牌 | 卡牌光影 + 「取用」 |
| 14 | 被帮助者回合结束 / 弃牌 | 卡牌飞向马友友 + 「交给马友友」 |
| 15 | D&G 死亡（场上有马友友） | **同归**：引力坍缩 + 虚线环 + 「同归」大字 |
| 16 | 画质档位切 1 | 立刻变朴素（无滤镜/无遮罩/粒子 20%），不报错 |
| 17 | 关闭「技能特效」总开关 | 所有特效消失，技能结算完全正常 |

**第 17 条最重要** —— 它验证了特效层异常不会影响结算。

---

## 四、回滚

```bash
node tools\注入dvg特效.mjs --revert
```

会从 `dvg.js.fxbak` 恢复。也可以手动 `Copy-Item dvg.js.fxbak dvg.js -Force`。

---

## 五、注入器到底改了什么

**只做加法**：新增 1 行 `import`、3 个驱动函数、20 处 `FX()` / `FXWait()` 调用。
**不删除、不重写任何既有逻辑。**

### 5.1 驱动层（插在文件头 import 之后）

完整代码就在 `tools/注入dvg特效.mjs` 的 `DRIVER` 常量里，与 `乔尼技能.js` / `乔鲁诺.js` / `脑花技能.js` **完全同构**：

- `FXOn()` — 读 `lib.dvgFx.on`
- `FX(name, ...args)` — 走 `game.broadcastAll` 广播，让每个客户端各播一遍
- `FXWait(ms, skippable)` — 演出等待，按画质档位缩放，可点击屏幕跳过

### 5.2 20 处钩子

行号是原始 2078 行版本的参考值，**以锚点文本为准**。

| # | 位置 | 插入内容 | 参考行 |
|---|---|---|---|
| ① | 文件头 | `import "./D&G特效.js"` + 驱动层 | 1 |
| ② | `dvg_skill_hidden.content` 开头 | `FX("hiddenStart", player)` | 124 |
| ③ | 暗置日志之后 | `FX("hiddenOut", player)` + `await FXWait(760, true)` | 178 |
| ④ | `dvg_skill_return.content` 末尾日志前 | `FX("returnBack", player)` | 661 |
| ⑤ | `askHelp` 询问循环内 | `FX("helpAsk", player, target)` + `await FXWait(320, true)` | 703 |
| ⑥ | `if (result.bool)` 分支 | `FX("helped", target)`；**新增 else** → `FX("declined", target)` | 733 |
| ⑦ | `summon()` 已存在检查之后 | `FX("summon", player)` + `await FXWait(1250, true)` | 751 |
| ⑧ | `killMayouyou` 日志前 | `FX("mayouyouGone", my)` | 833 |
| ⑨ | `dvg_skill_takedown.content` | `FX("takedown", player)` + `await FXWait(620, true)` | 1158 |
| ⑩ | 腐蚀分支 A 日志前 | `FX("corruptDamage", who, times)` | 1201 |
| ⑪ | 腐蚀分支 B 加腐蚀循环 | `FX("corruptGain", p, 1)` | 1231 |
| ⑫ | 腐蚀分支 B 收尾日志前 | `FX("corruptWave", count)` | 1235 |
| ⑬ | `dvg_mayouyou_heal.content` | `FX("heal", player)` | 901 |
| ⑭ | `dvg_mayouyou_damage.content` | `FX("damageDraw", player, 2)` | 926 |
| ⑮ | `dvg_mayouyou_skip.content` | `FX("skipPhase", player, isUse)` | 946 |
| ⑯ | `dvg_mayouyou_immortal.content` | `FX("immortal", player)` | 964 |
| ⑰ | `noreply` 日志前 | `FX("noreply", player)` | 1133 |
| ⑱ | `dvg_skill_use` 取用日志前 | `FX("useCard", player, card)` | 1429 |
| ⑲ | `dvg_skill_give` 日志前 | `FX("give", player, my, 1)` | 1928 |
| ⑳ | `discard_to_mayouyou` 日志前 | `FX("give", player, my, cards.length)` | 1950 |

> ⑥ 是唯一需要**新增 `else` 分支**的地方，其余全部是「插一行」。

### 5.3 如果锚点失配

注入器会**拒绝写入**并列出失配项。这说明 `dvg.js` 被人改过了。处理方式：

1. 打开 `dvg.js`，按上表的「位置」列找到对应函数
2. 手动在合适位置插 `FX(...)` 那一行
3. 再跑 `node tools\注入dvg特效.mjs --check` 确认方法对得上

---

## 六、特效层接口（`lib.dvgFx`）

技能层**只允许**通过 `lib.dvgFx.play(name, args)` 调用，不要直接操作 DOM。

| 方法 | 参数 | 表现 | 音效 |
|---|---|---|---|
| `hiddenStart` | `(player)` | 未知牌背面翻盖 + 「隐」 | `dvg_hide` |
| `hiddenOut` | `(player)` | 黑雾吞没 + 溶解碎片 | `dvg_vanish` |
| `returnBack` | `(player)` | 虚空裂隙 + 光柱 + 粒子重组 + 白闪 + 「再登场」 | `dvg_return` `dvg_hit` |
| `helpAsk` | `(player, target)` | 琥珀金线 + 「？」 | `dvg_ask` |
| `helped` | `(target)` | 援手环 + 光点 + 「被帮助」 | `dvg_help` |
| `declined` | `(target)` | 灰色「拒绝」 | `dvg_ask` |
| `summon` | `(player)` | 召唤阵 + 落雷 + 光柱 + 冲击环 + 「马友友」 | `dvg_summon` `dvg_stomp` `dvg_hit` |
| `mayouyouGone` | `(player)` | 青玉碎片消散 + 「消散」 | `dvg_gone` |
| `takedown` | `(player)` | 引力坍缩 + 虚线环 + 「同归」 | `dvg_takedown` |
| `heal` | `(player)` | 青玉生命光 + 「回满」 | `dvg_heal` |
| `damageDraw` | `(player, n)` | 卡牌虚影飞入 + 「+2 张」 | `dvg_draw` |
| `skipPhase` | `(player, isUse)` | 阶段名被划掉 + 「→ 摸两张」 | `dvg_skip` |
| `immortal` | `(player)` | 白闪 + 不烙印环 + 逆流粒子 + 「不死」 | `dvg_immortal` |
| `noreply` | `(player)` | 灰色「放弃响应」 | `dvg_skip` |
| `corruptGain` | `(player, count)` | 酸绿蔓延 + 气泡 + 「腐蚀 +N」 | `dvg_corrupt` |
| `corruptWave` | `(count)` | 全屏绿波 + 「腐蚀发作 ×N」 | `dvg_corrupt` |
| `corruptDamage` | `(player, times)` | 酸绿 + 气泡 + 「腐蚀 -N」 | `dvg_corrupt` |
| `useCard` | `(player, card)` | 卡牌光影 + 「取用」 | `dvg_card` |
| `give` | `(from, to, count)` | 卡牌飞向马友友 + 「交给马友友」 | `dvg_card` |
| `ring` / `float` / `spark` / `burst` | `(player, opt)` | 通用件 | — |

画质档位：`lib.dvgFx.level()`，等待倍率 `lib.dvgFx.timeScale()`。

---

## 七、硬性约束（改特效时必看）

| 项 | 要求 |
|---|---|
| 单个特效时长 | ≤ 1.5 秒（当前全部达标） |
| 同屏 DOM 节点 | ≤ 30（当前最高 29） |
| 音频单文件 | ≤ 50 KB（当前最大 19.6 KB） |
| `il_vento_doro.mp3` | **绝对不许动**（6.9 MB 的乔鲁诺觉醒 BGM，有意保留原音质） |
| 随机数 | **禁用 `Math.random()`**，只能用文件里的 `rnd()`（联机各端必须一致） |
| 异常 | `console.warn`，不要空 `catch` 吞成黑洞 |
| 画质档位 | 新特效的粒子数/时长必须走 `qn()` / `qtime()`，不能写死 |
| 跨端 | `FX()` 用 `game.broadcastAll` 广播，函数体不能引用模块作用域变量 —— 数据全从参数传 |

---

## 八、出问题怎么查

游戏内 **F12** 打开控制台：

```js
// 手动触发某个特效（不依赖技能）
lib.dvgFx.play("summon", [game.me]);
lib.dvgFx.play("takedown", [game.me]);
lib.dvgFx.play("corruptGain", [game.me, 3]);

// 查开关与档位
lib.config["extension_脑花乔尼_fx_all"]     // 总开关
lib.config["extension_脑花乔尼_dvg_fx"]     // D&G 特效
lib.config["extension_脑花乔尼_dvg_sfx"]    // D&G 音效
lib.config["extension_脑花乔尼_fx_level"]   // 画质 1~5

// 查图层
document.getElementById("dvg-fx")          // 普通层
document.getElementById("dvg-fx-top")      // 大特效层
```

| 症状 | 排查 |
|---|---|
| 完全没特效 | `lib.config["extension_脑花乔尼_fx_all"]` 是否为 `true`；`dvg_fx` 是否为 `true` |
| 手动播也没反应 | `lib.dvgFx` 是否存在（说明 `D&G特效.js` 没被 import）；`#dvg-fx` 节点是否存在 |
| 有画面没声音 | `dvg_sfx` / `sfx_all`；`audio/fx/dvg_*.mp3` 是否在；`lib.config.volume` |
| 特效卡顿 | 把 `fx_level` 降到 1 或 2 |
| 位置全错 | 玩家节点还没渲染完；`anchor()` 已做兜底，若仍错请检查 `player.node.avatar` |

---

## 九、以后新增角色照这个流程做

这套分工是刻意设计的：**特效 AI 不碰技能文件，注入 AI 只跑命令**。

1. **写特效** → 新建 `<角色>特效.js`，对象上加同名方法，末尾 `lib.<x>Fx = fx; export default fx;`
2. **备音效** → 丢进 `audio/fx/<前缀>_*.mp3`，跑响度归一，更新 `audio/CREDITS.md`
3. **写注入器** → 复制 `tools/注入dvg特效.mjs`，改 3 个地方：`DRIVER` 里的 `lib.dvgFx` → `lib.<x>Fx`、`HOOKS` 数组、`import "./<角色>特效.js"`
4. **交给注入 AI** → 只跑 `--check` / dry-run / `--apply` / `--revert`
5. **验收** → 用第三节那种清单逐条过，重点验「关掉总开关后结算正常」

> 这样做的原因：特效层出任何错都不该影响结算。注入器只加 `FX()` 调用，且 `FX()` 内部全部 `try/catch`，最坏情况是特效不显示，游戏照常跑。
