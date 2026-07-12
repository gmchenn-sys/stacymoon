# Stacy Moon — 项目速查

## 默认协作模式（Claude Code 主会话，会话开始即生效）

本项目默认以多 Agent 流水线工作，无需用户每次声明：

- **你 = architect**：agmsg 团队 **`stacymoon`**（勿用 studio，那是别的项目的，会串台）。会话开始时 SessionStart 钩子会给出 Monitor 指令，照做即开实时收信。角色注册已存在，无需重新 join。
- **coder = cursor-agent**：有任务卡才拉起，勿空跑。唯一可靠派卡方式：`spawn.sh cursor coder --project <本目录> --team stacymoon --fresh --boot-prompt "<完整工单>"`（cursor 回合制收信，闲置收不到消息；boot prompt 里不要让它先查收件箱）。每张卡拉新进程前先 `pkill -f cursor-agent`。
- **协作规矩**：任务卡在 `tasks/T-xxx.md`（目标/验收命令/涉及文件/禁区）；三重完成=验收命令过+git commit+agmsg 汇报；**禁止 git add -A**（只 add 卡上涉及文件）；验收只认 git diff 和验收命令实际输出；coder 空转 20 分钟（挂后台监视器盯提交）→ 重试一次 → 再挂 architect 接管。完整规矩参考 `~/Desktop/协作/CLAUDE.md`（注意其中团队名 studio 不适用本项目）。
- **对外沟通**：涉及队友（Jamie/Christine）的事发 Slack `#app-develop-stuff`（经用户 Chrome，发前草稿给用户确认）；push 后在 Slack 同步一条带文件路径的指路消息。

## 协作契约（必读）

- `docs/API_CONTRACT.md` — Agent 接口契约 v1.0（主入口 `POST https://stacymoon.online/chat/stream`，SSE：thinking → token → done）
- `docs/VOICE_TRANSCRIPT_TODO.md` — 语音字幕 × 聊天历史协作任务
- `docs/VOICE_WS_EVENTS.md` — 语音 WS 字幕事件协议（前端提案，待 Christine 确认）
- `docs/TODO.md` — 已知问题与待办（含 Supabase 迁移 SQL）
- **`user_id` = 邀请码 `stacy_invite_code`**（契约 §7），不要发 UUID 给 Agent

## 项目结构

**核心用户流程页面（有导航）**
- `index.html` — 聊天页（引用 style.css + app.js + api.js + notify.js + supabase.js）
- `home.html` — 首页（独立 style），含 A-/A+ 字号按钮
- `history.html` — 每日打卡
- `weekly.html` — 周报
- `reminder.html` — 用药提醒
- `chat_history.html` — 聊天历史
- `onboarding.html` — 首次建档
- `profile.html` — 档案编辑
- `report.html` — 健康报告

**独立/管理页（无导航）**
- `admin.html` — 邀请码管理
- `daughter.html` — 亲属查看端
- `OVERVIEW.html` — 项目文档页

## 数据存储

**Supabase 表**（2026-07-08 已迁移，加了契约扩展字段）
- `invite_codes` — 邀请码（`code TEXT / used BOOL`）
- `logs` — 聊天记录（`user_message TEXT / ai_reply TEXT / created_at TIMESTAMPTZ / user_id TEXT / channel TEXT 默认'text' / call_id TEXT / intent TEXT / sources JSONB`）
- `profiles` — 档案（`code TEXT 唯一约束 / profile JSONB / user_id TEXT`）

**localStorage 关键 key**
- `stacy_logs` — 当前聊天记录数组（{time, created_at, userMessage, aiReply, channel, call_id, intent}，最多 20 条）
- `stacy_daily_logs` — 每日打卡记录数组（{date, mood, sleep_score, symptoms, note}；经 store.js 读写）
- `stacy_invite_code` — 已核验的邀请码
- `stacy_profile` — 用户档案 JSON（{name, age, symptoms, ...}）
- `stacy_font_scale` — 全局字号缩放系数（默认 1，范围 0.8–1.3）
- `stacy_daughter_code` — 亲属端绑定的妈妈邀请码（T-001）
- `stacy_checkin_prompt_dismissed` — 聊天→打卡建议气泡当日免打扰标记（T-005）
- `stacy_daily_brief` — 首页"今日关心"按天缓存 {date, text}（T-006，命中缓存绝不重调 Agent）

**Supabase 补充**：`daily_logs` 表（`invite_code / date / mood / sleep_score / symptoms / note`，无唯一约束，读取端按 date 去重）。

**统一数据层 `store.js`**（2026-07-11，T-002）：打卡数据唯一读写入口——`getDailyLogs()`（云端+本地按 date 合并、云端优先、失败降级本地、空数组不覆盖非空本地）、`saveDailyLog(data)`。home/history/report/weekly 四页均走它，**新页面禁止直读 `stacy_daily_logs`**。

**缓存击穿约定**：index.html 的 `api.js` / `app.js` 带 `?v=N`，改动这两个文件必须同步 +1。

## 字号缩放机制

每个 HTML 页面的 `<head>` 最顶部有一段阻塞脚本：

```javascript
(function(){
  var s = parseFloat(localStorage.getItem('stacy_font_scale')) || 1;
  document.documentElement.style.fontSize = (16 * s) + 'px';
})();
```

项目约 81% 的 font-size 使用 `rem` 单位，相对于 html 根字号解析。用户在 `home.html` 通过 A-/A+ 按钮调节缩放系数，跨所有页面生效。

## 已知坑点

- **邀请码比较大小写**：邀请码存的是用户输入原值，查询时用到 `ilike`，如果本地比较需要用 `toUpperCase()` 统一
- **周报自然周筛选**：`weekly.html` 按自然周（周一至周日）聚合打卡数据，不能用 `new Date().getDay()` 的周日＝0 直接算
- **`escHtml` 必须定义在恢复历史的 IIFE 之前**：页面初始化恢复聊天记录时调用了 `escHtml`，该函数定义如果放在 IIFE 后面会导致渲染空白
- **聊天页字体**：`.bubble` 无显式 font-size，字体大小依赖 html 根字号继承，测试时确认正常即可
- **种子数据保护**：`weekly.html` 在 `stacy_daily_logs` < 5 条时会生成种子数据。`stacy_logs` 和 `stacy_daily_logs` 的写入均有"仅在数组为空时才写入"的守卫。禁止在任何页面无条件 `setItem('stacy_logs', ...)` 或 `setItem('stacy_daily_logs', ...)`。
