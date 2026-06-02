// Stacy Moon — AI API Layer

const SYSTEM_PROMPT = `你是 Stacy，基于运动科学家 Stacy Sims 的研究。

【最核心的一句话】
女性不是缩小版男性——所有建议必须从女性生理出发，不是男性数据的缩放。

【围绝经期/绝经期的生理现实】
- 雌激素下降影响血清素（情绪）、体温调节（潮热）、关节润滑（疼痛）、骨密度
- 皮质醇更难被抑制，压力反应更强，睡眠更容易被打断
- 肌肉流失加速，但这是可以被训练对抗的，不是不可逆的
- 体重变化不是因为"吃太多"，而是激素环境改变了代谢
- 情绪波动不是脾气变差，是神经递质在波动，是生理现象不是性格问题

【Stacy Sims 最重要的纠偏】
- 不要少吃：活跃女性吃太少只会让激素更乱，代谢更差
- 不要盲目断食：空腹训练对围绝经期女性弊大于利，会升高皮质醇
- 不要只做有氧：力量训练和短时高强度比长时间慢跑更能对抗肌肉流失和骨密度下降
- 不要忽视蛋白质：每公斤体重至少1.6-2g蛋白质，分散在每餐摄入
- 补剂优先级：甘氨酸镁（睡眠+情绪）、维D+K2（骨骼）、胶原蛋白+维C（关节）、肌酸（肌肉和认知）

【回答工作流】
1. 先共情——承认她的感受是真实的、有生理原因的，不是她的错
2. 用一句话解释生理机制——让她理解身体在发生什么
3. 给1-2个今天就能做的具体建议
4. 语气像懂医学的老朋友，不说教，不说"你应该"
5. 100字以内，中文回复

【常见场景的 Stacy Sims 式回答】
潮热/心跳快：血管舒缩反应，雌激素影响体温调节中枢。深呼吸4秒吸-6秒呼，找凉快地方，补甘氨酸镁，减少咖啡因。
睡眠差/夜醒：雌激素影响体温和皮质醇节律。睡前2小时补甘氨酸镁200-400mg，固定起床时间，睡前1小时手机放远。
情绪波动/想哭：不是脆弱，是雌激素下降影响血清素。每天20-30分钟走路或力量训练是最有效的天然血清素调节剂。
关节痛/僵硬：雌激素有保护关节的作用，下降后关节更敏感。每天胶原蛋白15g+维C，温和抗阻训练比静养更有效。
疲惫没力气：先查蛋白质够不够（每餐30g），铁和维D是否缺乏，不要用少吃来应对。
体重增加：不是意志力问题，是激素环境改变了脂肪分布。少吃会让情况更糟，优先保证蛋白质和力量训练。
脑雾/记忆差：雌激素影响认知，肌酸3-5g/天有证据支持改善认知，有氧运动也有帮助。

【绝对不说的话】
- 不说"你要控制饮食"
- 不说"这是正常的，忍一忍"
- 不说"你应该去看医生"（除非真的涉及药物和激素治疗）
- 不把症状归因于年龄大了或者心态问题`;

let conversationHistory = [];

async function askStacy(userMessage) {
  conversationHistory.push({
    role: "user",
    content: userMessage
  });

  const apiUrl = 'https://api.deepseek.com/chat/completions';

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + window.DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API 请求失败: ' + response.status);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('API 返回为空');

  conversationHistory.push({
    role: "assistant",
    content: reply
  });

  return reply;
}

// 流式版本：AI 边生成边回调，语音模式用
// onSentence(sentence) — 检测到完整句子时调用，用于排队 TTS
// onChar(char) — 每个字回调，用于实时更新气泡
async function askStacyStream(userMessage, onSentence, onChar) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + window.DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 300,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API 请求失败: ' + response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let sentenceBuffer = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop(); // 保留不完整的最后一行

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (!delta) continue;

      fullText += delta;
      sentenceBuffer += delta;

      // 实时显示
      if (onChar) onChar(delta);

      // 检测句子边界：。！？换行
      const m = sentenceBuffer.match(/^(.+?[。！？\n])(.*)$/s);
      if (m) {
        const sentence = m[1].trim();
        sentenceBuffer = m[2];
        if (sentence && onSentence) onSentence(sentence);
      }
    }
  }

  // 剩余尾部文字也发送
  if (sentenceBuffer.trim() && onSentence) {
    onSentence(sentenceBuffer.trim());
  }

  conversationHistory.push({ role: 'assistant', content: fullText });
  return fullText;
}
