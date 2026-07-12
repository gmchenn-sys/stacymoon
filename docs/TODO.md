# 待办 / 已知问题记录

> 2026-07-08 记录。契约文档见 `docs/API_CONTRACT.md`、`docs/VOICE_TRANSCRIPT_TODO.md`。

## ✅ user_id 契约冲突（已决策 2026-07-08）

- 契约 §7 规定：**`user_id` = 邀请码**（`localStorage.stacy_invite_code`），Agent 的 Checkpointer 记忆与 Beta 门禁均按此键控。
- **决策：demo 阶段统一用邀请码**，`getUserId()` 已改回返回邀请码，前端所有发往 Agent / Supabase 的 user_id 一致。
- UUID 层（`ensureUserId` / `stacy_user_id`）代码保留但不参与 user_id，将来有多设备/换码需求时再启用迁移。

## 前端侧待修问题

1. ✅ **`stacmoon/server.js` 静态文件路径错误** — `ROOT = __dirname` 指向 `stacmoon/` 子目录，但所有 HTML 在项目根目录，`localhost:8888` 会 404。应移到根目录或改 `ROOT = path.join(__dirname, '..')`。（已移至根目录 `server.js`）
2. ✅ **Agent 地址硬编码为临时隧道** — `server.js` 里的 trycloudflare 域名每次重启都变。生产 Base URL 已定为 `https://stacymoon.online`（见契约），应统一改为配置项。（已改为 `AGENT_BASE_URL` 环境变量，默认 `https://stacymoon.online`）
3. ✅ **`ensureUserId()` upsert 写法错误** — `Prefer: resolution=merge` 不是合法值，实际是普通 INSERT，同邀请码换设备会插重复行。（已改为 `on_conflict=code` + `resolution=merge-duplicates`，`profiles.code` 唯一约束已加）
4. ✅ **Supabase 表结构待扩展** —（2026-07-08 已在后台执行迁移 SQL，新列已验证生效）：
   - `logs` 加列：`user_id`、`channel`（默认 `'text'`）、`call_id`、`intent`、`sources`
   - `profiles` 加列：`user_id`；`code` 加唯一约束

   参考 SQL：

   ```sql
   alter table logs add column if not exists user_id text;
   alter table logs add column if not exists channel text default 'text';
   alter table logs add column if not exists call_id text;
   alter table logs add column if not exists intent text;
   alter table logs add column if not exists sources jsonb;
   alter table profiles add column if not exists user_id text;
   alter table profiles add constraint profiles_code_unique unique (code);
   ```

5. 🔴 **`daily_logs` 表不存在（2026-07-12 控制台 404 实锤）** — home.html 自 6 月起的云端打卡同步一直静默失败，T-002 的 store.js 靠本地降级兜着。需在 Supabase SQL Editor 执行建表（含唯一约束，store.js 已按 upsert 写好）：

   ```sql
   create table if not exists public.daily_logs (
     id bigint generated always as identity primary key,
     invite_code text not null,
     date date not null,
     mood text default '',
     sleep_score int default 0,
     symptoms jsonb default '[]'::jsonb,
     note text default '',
     created_at timestamptz default now(),
     unique (invite_code, date)
   );
   ```

## 需与队友确认（不阻塞开发）

- ~~**Jamie**：user_id 用邀请码还是 UUID~~（已决策：demo 阶段用邀请码）；`reply_mode` / `channel` / `call_id` 已在 agent 侧实现 ✅。
- **Christine**：确认 `docs/VOICE_WS_EVENTS.md` 字幕事件协议；语音管道下发文本帧后按 `VOICE_TRANSCRIPT_TODO.md` 验收清单真机联调。
