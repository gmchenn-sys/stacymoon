// Stacy Moon — AI API Layer (SSE Streaming)

let conversationHistory = [];

// 最近一次流式回复的 done 元数据（intent / sources / call_id），供 saveLog 使用
let lastStreamMeta = null;
function getLastStreamMeta() { return lastStreamMeta; }

// ═══════════════════════════════════════════════════════════
// ── user_id 层 ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * getUserId() — 返回 user_id
 * 契约（docs/API_CONTRACT.md §7）：user_id = 邀请码 stacy_invite_code，
 * Agent 的记忆（Checkpointer）与 Beta 门禁均按此键控，必须跨会话稳定。
 * 注意：stacy_user_id（UUID 层）暂不作为 user_id 发送，待与 Jamie 对齐（见 docs/TODO.md）。
 */
function getUserId() {
  return localStorage.getItem('stacy_invite_code') || '';
}

function getStacyProfile() {
  try { return JSON.parse(localStorage.getItem('stacy_profile') || '{}'); }
  catch { return {}; }
}

/**
 * buildStacyProfile() — 契约 §6.1 全量字段透传（undefined 字段省略）
 * Agent 现阶段用 name/age，其余字段为路线图 P1（symptoms/exercise/medication 注入 prompt）预置。
 */
function buildStacyProfile() {
  const p = getStacyProfile();
  const profile = {
    name: p.name || undefined,
    age: p.age ? Number(p.age) : undefined,
    height: p.height ? Number(p.height) : undefined,
    weight: p.weight ? Number(p.weight) : undefined,
    period_status: p.period_status || undefined,
    symptoms: Array.isArray(p.symptoms) && p.symptoms.length ? p.symptoms : undefined,
    exercise: p.exercise || undefined,
    exercise_type: p.exercise_type || undefined,
    diet: p.diet || undefined,
    medication: p.medication || undefined,
  };
  Object.keys(profile).forEach(k => profile[k] === undefined && delete profile[k]);
  return profile;
}

/**
 * generateUUID() — 生成 v4 UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * ensureUserId() — 确保用户有永久 user_id
 * 流程：
 * 1. localStorage 有 stacy_user_id → 直接返回
 * 2. 从 profiles 表按 invite_code 查询 → 有则缓存到 localStorage
 * 3. 都没有 → 生成新 UUID，写入 profiles，缓存到 localStorage
 *
 * @param {string} inviteCode - 当前用户的邀请码
 * @returns {string} 永久 user_id (UUID)
 */
async function ensureUserId(inviteCode) {
  // 1. 已有缓存
  const cached = localStorage.getItem('stacy_user_id');
  if (cached) return cached;

  if (!inviteCode) return '';

  // 2. 从 profiles 表查询
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/profiles?code=ilike.${encodeURIComponent(inviteCode)}&select=user_id`,
      {
        headers: {
          'apikey': window.SUPABASE_KEY,
          'Authorization': `Bearer ${window.SUPABASE_KEY}`,
        }
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.length && data[0].user_id) {
        // profiles 已有 UUID → 缓存
        localStorage.setItem('stacy_user_id', data[0].user_id);
        return data[0].user_id;
      }
    }
  } catch (e) {
    console.warn('查询 profiles.user_id 失败:', e);
  }

  // 3. 生成新 UUID 并写入 profiles
  // upsert：需要 profiles.code 有唯一约束（见 docs/TODO.md 的 SQL）
  const newId = generateUUID();
  try {
    await fetch(`${window.SUPABASE_URL}/rest/v1/profiles?on_conflict=code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_KEY,
        'Authorization': `Bearer ${window.SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        code: inviteCode,
        user_id: newId,
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) {
    console.warn('写入 profiles.user_id 失败:', e);
  }

  localStorage.setItem('stacy_user_id', newId);
  return newId;
}

// ═══════════════════════════════════════════════════════════
// ── 聊天记录统一查询 ──────────────────────────────────
// ═══════════════════════════════════════════════════════════

/**
 * get_sessions_by_user(userId)
 * 统一查询入口：按 user_id 从 Supabase 拉取所有聊天记录，
 * 与 localStorage 合并去重后返回。
 *
 * - 新数据：WHERE user_id = 当前 UUID
 * - 旧数据：localStorage stacy_logs（兜底）
 */
async function get_sessions_by_user(userId) {
  if (!userId) return _mergeWithLocal([]);

  let cloudLogs = [];
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc&limit=500`,
      {
        headers: {
          'apikey': window.SUPABASE_KEY,
          'Authorization': `Bearer ${window.SUPABASE_KEY}`,
        }
      }
    );
    if (res.ok) cloudLogs = await res.json();
  } catch (e) {
    console.warn('云端聊天记录拉取失败:', e);
  }

  return _mergeWithLocal(cloudLogs);
}

// 内部：云端 + 本地合并去重
function _mergeWithLocal(cloudLogs) {
  let localLogs = [];
  try { localLogs = JSON.parse(localStorage.getItem('stacy_logs') || '[]'); } catch {}

  // 云端记录标准化
  const cloud = cloudLogs.map(l => ({
    userMessage: l.user_message || '',
    aiReply: l.ai_reply || '',
    created_at: l.created_at ? l.created_at.slice(0, 10) : '',
    time: l.created_at ? new Date(l.created_at).getHours() + ':' + String(new Date(l.created_at).getMinutes()).padStart(2, '0') : '',
    channel: l.channel || 'text',
    call_id: l.call_id || null,
    intent: l.intent || null,
    _source: 'cloud'
  }));

  // 本地记录标准化
  const local = localLogs.map(l => ({
    userMessage: l.userMessage || l.user_message || '',
    aiReply: l.aiReply || l.ai_reply || '',
    created_at: l.created_at || '',
    time: l.time || '',
    channel: l.channel || 'text',
    call_id: l.call_id || null,
    intent: l.intent || null,
    _source: 'local'
  }));

  // 合并去重：以 userMessage+created_at 为键
  const seen = new Set();
  const merged = [];
  [...cloud, ...local].forEach(l => {
    const key = l.userMessage + '|' + l.created_at;
    if (!l.userMessage || seen.has(key)) return;
    seen.add(key);
    merged.push(l);
  });

  // 按时间排序
  merged.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
    return (a.time || '').localeCompare(b.time || '');
  });

  return merged;
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '');
}

// ── SSE 流式版本（走 /chat/stream，server-sent events）─────────
// 契约：docs/API_CONTRACT.md §3。事件序列 thinking → evidence? → token → done
async function askStacyStream(userMessage, onSentence, onChar) {
  conversationHistory.push({ role: "user", content: userMessage });
  lastStreamMeta = null;

  const response = await fetch('https://stacymoon.online/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      user_id: getUserId(),
      reply_mode: "text",
      channel: "text",
      stacy_profile: buildStacyProfile()
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error('Agent 请求失败: ' + response.status + (err ? ' ' + err.slice(0, 100) : ''));
  }

  // ── SSE 解析：{"type":"token","content":"..."} 和 {"type":"done","response":"..."} ──
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let sentenceBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 支持 "data: {...}" 格式
      let jsonStr = trimmed;
      if (trimmed.startsWith('data: ')) {
        jsonStr = trimmed.slice(6).trim();
      }

      if (jsonStr === '[DONE]') break;
      if (!jsonStr.startsWith('{')) continue;

      try {
        const parsed = JSON.parse(jsonStr);

        if (parsed.type === 'token' && parsed.content) {
          const token = parsed.content;
          fullText += token;
          if (onChar) onChar(token);

          sentenceBuffer += token;
          const m = sentenceBuffer.match(/^(.+?[。！？\n])(.*)$/s);
          if (m) {
            const sentence = m[1].trim();
            sentenceBuffer = m[2];
            if (sentence && onSentence) onSentence(sentence);
          }
        } else if (parsed.type === 'done') {
          // 保存元数据供 saveLog 写入 Supabase（intent / sources / call_id / channel）
          lastStreamMeta = {
            intent: parsed.intent || null,
            sources: parsed.sources || null,
            channel: parsed.channel || 'text',
            call_id: parsed.call_id || null
          };
          const reply = parsed.response || fullText;
          // 剩余尾部文字
          if (sentenceBuffer.trim() && onSentence) {
            onSentence(sentenceBuffer.trim());
          }
          const cleaned = stripMarkdown(reply);
          conversationHistory.push({ role: "assistant", content: cleaned });
          return cleaned;
        }
      } catch {}
    }
  }

  // 兜底：stream 结束了但没收到 done 事件
  if (fullText) {
    if (sentenceBuffer.trim() && onSentence) {
      onSentence(sentenceBuffer.trim());
    }
    const cleaned = stripMarkdown(fullText);
    conversationHistory.push({ role: "assistant", content: cleaned });
    return cleaned;
  }

  throw new Error('Agent 返回为空');
}
