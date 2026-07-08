# 语音 WebSocket 字幕事件协议（前端 ⇄ 语音管道）

> 前端提案 v0.1 · 2026-07-08 · 待 Christine 确认
> 背景见 `docs/VOICE_TRANSCRIPT_TODO.md` Phase 1/2。

## 通道

复用现有音频 WebSocket（`POST /voice/session` 返回的 `ws_url`）：

- **二进制帧** = bot PCM 音频（现状不变）
- **文本帧** = JSON 字幕事件（新增，本协议）

前端已实现：`typeof e.data === 'string'` 时按本协议解析，其余帧继续走音频播放，对旧管道完全兼容（不发文本帧就没有字幕，其他功能不受影响）。

## call_id

前端在 `POST /voice/session` 请求体中携带（顶层与 `user_context` 内各一份）：

```json
{ "call_id": "<uuid>", "user_context": { "user_id": "...", "call_id": "<uuid>", "profile": {}, "today_log": {} } }
```

语音管道调 Agent `/chat/stream` 时请透传该 `call_id`（以及 `reply_mode=voice`、`channel=voice`），保证 history API 可按通话筛选。

## 事件（服务端 → 前端）

| type | 字段 | 说明 | 前端行为 |
|------|------|------|----------|
| `call_start` | `call_id` | 通话建立 | 记录 call_id（覆盖前端生成的） |
| `user_transcript` | `text`, `final`(bool) | STT 字幕 | interim 半透明灰色；final 转正常样式 |
| `token` / `bot_token` | `content` | Agent 增量文本（可直接转发 Agent SSE 的 token） | assistant 气泡逐字追加 |
| `done` / `turn_complete` | `response`/`bot_text`, `user_text?`, `intent?`, `sources?`, `call_id?` | 一轮结束（可直接转发 Agent SSE 的 done） | 定稿气泡 + `saveLog`（channel=voice, call_id） |
| `call_end` | `call_id?` | 通话结束 | 兜底落库未完成 turn |
| `error` | `detail` | 出错 | console 告警 |

最省事的做法：Christine 把 Agent SSE 的 `token` / `done` 事件原样转发成 WS 文本帧，再加 `user_transcript`（interim/final）和 `call_start`/`call_end` 三类自有事件即可。

## 落库（前端负责，主路径）

每轮 `done`/`turn_complete` 后前端写 Supabase `logs` 一行：
`user_message`（STT final）+ `ai_reply`（done.response）+ `user_id` + `channel='voice'` + `call_id` + `intent` + `sources`。

**interim 一律不落库。** 挂断/断线时前端会把已有 final/token 内容兜底落库一次。

## 验收对照（VOICE_TRANSCRIPT_TODO）

- 通话中：user interim/final + assistant 逐字，全程可见 ✅（前端已就绪，等文本帧）
- 挂断后：聊天页与聊天历史页可见本次通话记录，带 🎙 标记，刷新仍在 ✅
- 对账：`GET /v1/conversations/{user_id}/messages?call_id=xxx` 与 Supabase 内容一致（P1，未接）
