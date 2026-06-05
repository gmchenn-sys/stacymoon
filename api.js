// Stacy Moon — AI API Layer (Cloudflare Proxy)

let conversationHistory = [];

function getUserId() {
  return localStorage.getItem('stacy_invite_code') || '';
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '');
}

async function askStacy(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      user_id: getUserId()
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

// 模拟流式版本（Agent 不返回 SSE，用逐字输出模拟，保持 TTS 排队逻辑工作）
async function askStacyStream(userMessage, onSentence, onChar) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      user_id: getUserId()
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error('Agent 请求失败: ' + response.status + (err ? ' ' + err.slice(0, 100) : ''));
  }

  const data = await response.json();
  const fullText = stripMarkdown(data.response);
  if (!fullText) throw new Error('Agent 返回为空');

  // 逐字输出模拟流式
  let sentenceBuffer = '';
  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i];
    sentenceBuffer += char;
    if (onChar) onChar(char);

    // 检测句子边界：。！？换行
    const m = sentenceBuffer.match(/^(.+?[。！？\n])(.*)$/s);
    if (m) {
      const sentence = m[1].trim();
      sentenceBuffer = m[2];
      if (sentence && onSentence) onSentence(sentence);
    }

    // 每字延迟 30ms，模拟打字效果
    await new Promise(r => setTimeout(r, 30));
  }

  // 剩余尾部文字
  if (sentenceBuffer.trim() && onSentence) {
    onSentence(sentenceBuffer.trim());
  }

  conversationHistory.push({ role: "assistant", content: fullText });
  return fullText;
}
