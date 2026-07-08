# 待办 / 已知问题记录

> 2026-07-08 记录。契约文档见 `docs/API_CONTRACT.md`、`docs/VOICE_TRANSCRIPT_TODO.md`。

## ⚠️ user_id 契约冲突（最高优先）

- 契约 §7 规定：**`user_id` = 邀请码**（`localStorage.stacy_invite_code`），Agent 的 Checkpointer 记忆与 Beta 门禁均按此键控。
- 但前端未提交改动中 `getUserId()` 已改为优先返回 UUID（`stacy_user_id`）。
- **若把 UUID 发给 Agent：用户在 Agent 侧的记忆会断掉，Beta Gate 开启时会被 403。**
- 处理方向：发给 Agent 的请求一律用邀请码；UUID 仅用于 Supabase 侧（logs/profiles）。是否保留 UUID 层需与 Jamie 对齐后再定。

## 前端侧待修问题

1. **`stacmoon/server.js` 静态文件路径错误** — `ROOT = __dirname` 指向 `stacmoon/` 子目录，但所有 HTML 在项目根目录，`localhost:8888` 会 404。应移到根目录或改 `ROOT = path.join(__dirname, '..')`。
2. **Agent 地址硬编码为临时隧道** — `server.js` 里的 trycloudflare 域名每次重启都变。生产 Base URL 已定为 `https://stacymoon.online`（见契约），应统一改为配置项。
3. **`ensureUserId()` upsert 写法错误** — `Prefer: resolution=merge` 不是合法值，实际是普通 INSERT，同邀请码换设备会插重复行。正确写法：URL 加 `on_conflict=code` + `Prefer: resolution=merge-duplicates`，且 `profiles.code` 需加唯一约束。
4. **Supabase 表结构待扩展**（谁有后台权限谁做）：
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

## 需与队友确认（不阻塞开发）

- **Jamie**：user_id 用邀请码还是 UUID（见上）；`reply_mode` / `channel` / `call_id` 已在 agent 侧实现 ✅。
- **Christine**：`onTurnComplete` / `onCallStart` / `onCallEnd` 生命周期何时可用；确认 `user_context.user_id` 透传。
