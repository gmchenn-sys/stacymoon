# Stacy Moon — 项目速查

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

**Supabase 表**
- `invite_codes` — 邀请码（`code TEXT / used BOOL`）
- `logs` — 聊天记录（`user_message TEXT / ai_reply TEXT / created_at TIMESTAMPTZ`）
- `profiles` — 档案（`code TEXT / profile JSONB`）

**localStorage 关键 key**
- `stacy_logs` — 当前聊天记录数组（{time, created_at, userMessage, aiReply}，最多 20 条）
- `stacy_daily_logs` — 每日打卡记录数组（{date, mood, sleep_score, symptoms, note}）
- `stacy_invite_code` — 已核验的邀请码
- `stacy_profile` — 用户档案 JSON（{name, age, symptoms, ...}）
- `stacy_font_scale` — 全局字号缩放系数（默认 1，范围 0.8–1.3）

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
