// Stacy Moon — AI API Layer (SSE Streaming)

let conversationHistory = [];

function getUserId() {
  return localStorage.getItem('stacy_invite_code') || '';
}

function getStacyProfile() {
  try { return JSON.parse(localStorage.getItem('stacy_profile') || '{}'); }
  catch { return {}; }
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '');
}

// ── 非流式（用于文字聊天，保留完整回复）─────────
async function askStacy(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      user_id: getUserId(),
      stacy_profile: {
        name: getStacyProfile().name || undefined,
        age: getStacyProfile().age ? Number(getStacyProfile().age) : undefined,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error('Agent 请求失败: ' + response.status + (err ? ' ' + err.slice(0, 100) : ''));
  }

  const data = await response.json();
  const reply = stripMarkdown(data.response);
  if (!reply) throw new Error('Agent 返回为空');

  conversationHistory.push({ role: "assistant", content: reply });
  return reply;
}

// ── SSE 流式版本（走 /chat/stream，server-sent events）─────────
async function askStacyStream(userMessage, onSentence, onChar) {
  conversationHistory.push({ role: "user", content: userMessage });

  const profile = getStacyProfile();

  const response = await fetch('https://stacymoon.online/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      user_id: getUserId(),
      stacy_profile: {
        name: profile.name || undefined,
        age: profile.age ? Number(profile.age) : undefined,
      }
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
