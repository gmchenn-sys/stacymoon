// Stacy Moon — App Logic

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  appendBubble('user', text);
  input.value = '';

  const loadingId = appendLoading();

  try {
    const reply = await askStacy(text);
    removeLoading(loadingId);
    appendBubble('ai', reply);
    if (window.notifyDaughter) notifyDaughter(text, reply);
    saveLog(text, reply);
  } catch (e) {
    console.error('Stacy 请求失败:', e);
    removeLoading(loadingId);
    const fallback = '网络有点问题，稍后再试一下 🌙';
    appendBubble('ai', fallback);
    saveLog(text, fallback);
  }
}

async function saveLog(userMessage, aiReply) {
  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  // 同时写 localStorage（本地备份）和 Supabase（跨设备）
  const logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]');
  logs.push({ time: timeStr, userMessage, aiReply });
  if (logs.length > 20) logs.shift();
  localStorage.setItem('stacy_logs', JSON.stringify(logs));

  try {
    await fetch(`${window.SUPABASE_URL}/rest/v1/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_KEY,
        'Authorization': `Bearer ${window.SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_message: userMessage, ai_reply: aiReply })
    });
  } catch (e) {
    console.warn('Supabase 写入失败:', e);
  }
}

function appendBubble(role, text) {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ' + role;
  div.innerHTML = role === 'ai'
    ? `<span class="avatar">🌙</span><div class="bubble ai-bubble">${text}</div>`
    : `<div class="bubble user-bubble">${text}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

let loadingCounter = 0;
function appendLoading() {
  const id = 'loading-' + (++loadingCounter);
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.id = id;
  div.innerHTML = `<span class="avatar">🌙</span><div class="bubble ai-bubble loading-bubble">Stacy 正在回复…</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── 流式气泡（AI 边生成边显示）──────────────────────
function createStreamingBubble() {
  const box = document.getElementById('chat-box');
  const div = document.createElement('div');
  div.className = 'bubble-row ai';
  div.innerHTML = '<span class="avatar">🌙</span><div class="bubble ai-bubble"></div>';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function updateStreamingBubble(el, text) {
  const bubble = el.querySelector('.ai-bubble');
  if (bubble) bubble.textContent = text;
  const box = document.getElementById('chat-box');
  box.scrollTop = box.scrollHeight;
}

function finalizeStreamingBubble(el, text) {
  const bubble = el.querySelector('.ai-bubble');
  if (bubble) bubble.textContent = text;
}

function removeStreamingBubble(el) {
  if (el) el.remove();
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ── Web Speech API 语音对话（打电话式）────────────────────────
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let voiceActive = false;
let currentAudio = null;

// ── TTS 工具：分离请求与播放，支持预加载 ────────────

function cleanTtsText(text) {
  if (!text) return '';
  return text.replace(/[^一-龥a-zA-Z0-9，。！？、：；]/g, '').slice(0, 150);
}

async function fetchTtsBlob(text) {
  const clean = cleanTtsText(text);
  if (!clean) return null;
  try {
    const res = await fetch(`/api/tts?text=${encodeURIComponent(clean)}`);
    if (res.ok) return await res.blob();
  } catch {}
  return null;
}

async function playTtsBlob(blob) {
  if (!blob || !voiceActive) return;
  voiceBtn.classList.add('voice-speaking');
  try {
    const objUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(objUrl);
    currentAudio.volume = 1.0;
    await currentAudio.play();
    await new Promise(r => {
      currentAudio.onended = () => { URL.revokeObjectURL(objUrl); currentAudio = null; r(); };
      currentAudio.onerror = () => { URL.revokeObjectURL(objUrl); currentAudio = null; r(); };
    });
  } finally {
    voiceBtn.classList.remove('voice-speaking');
  }
}

// 兼容旧接口（打字模式 + fallback）
async function speakText(text) {
  if (!voiceActive) return;
  const clean = cleanTtsText(text);
  voiceBtn.classList.add('voice-speaking');

  let played = false;
  try {
    const blob = await fetchTtsBlob(clean);
    if (blob) {
      await playTtsBlob(blob);
      played = true;
    }
  } catch {}

  if (!played && voiceActive) {
    await new Promise(r => {
      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'zh-CN';
      utter.rate = 1.0;
      utter.volume = 1.0;
      utter.onend = () => r();
      utter.onerror = () => r();
      window.speechSynthesis.speak(utter);
    });
  }

  voiceBtn.classList.remove('voice-speaking');
}

function startRecognition() {
  console.log('[STT] startRecognition 被调用');
  if (!SpeechRecognition) {
    console.log('[STT] SpeechRecognition 不支持');
    appendBubble('ai', '当前浏览器不支持语音，请用 Chrome 打开 🌙');
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    console.log('[STT] 识别结果:', event.results[0][0].transcript);
    const text = event.results[0][0].transcript.trim();
    if (!text) return;

    // 显示用户说的话
    appendBubble('user', text);

    // 创建流式 AI 气泡（边生成边显示）
    const aiBubble = createStreamingBubble();

    // TTS 句子队列 — 预加载下一句，消除句子间停顿
    const ttsQueue = [];
    let ttsProcessing = false;

    async function drainTtsQueue() {
      if (ttsProcessing) return;
      ttsProcessing = true;

      let prefetchedBlob = null;
      while (ttsQueue.length > 0 && voiceActive) {
        const sentence = ttsQueue.shift();

        // 提前请求下一句的 TTS 音频（当前句播放时并行下载）
        const nextPrefetch = ttsQueue.length > 0
          ? fetchTtsBlob(ttsQueue[0])
          : Promise.resolve(null);

        // 播放当前句（用预加载好的 blob，跳过网络请求）
        if (prefetchedBlob) {
          await playTtsBlob(prefetchedBlob);
        } else {
          await speakText(sentence);
        }

        // 下一句已下载完毕，循环中立刻播放
        prefetchedBlob = await nextPrefetch;
      }
      ttsProcessing = false;
    }

    function enqueueTts(sentence) {
      ttsQueue.push(sentence);
      drainTtsQueue();
    }

    let streamedText = '';
    try {
      const fullReply = await askStacyStream(text,
        // onSentence — 每检测到完整句子就排队 TTS
        (sentence) => { enqueueTts(sentence); },
        // onChar — 实时更新气泡
        (char) => {
          streamedText += char;
          updateStreamingBubble(aiBubble, streamedText);
        }
      );

      finalizeStreamingBubble(aiBubble, fullReply);
      if (window.notifyDaughter) notifyDaughter(text, fullReply);
      saveLog(text, fullReply);

      // 等待 TTS 队列播放完毕
      while ((ttsQueue.length > 0 || ttsProcessing) && voiceActive) {
        await new Promise(r => setTimeout(r, 200));
      }
      // 读完自动开始听下一句
      if (voiceActive) startRecognition();
    } catch (e) {
      console.error('Stacy 请求失败:', e);
      removeStreamingBubble(aiBubble);
      const fallback = '网络有点问题，稍后再试一下 🌙';
      appendBubble('ai', fallback);
      saveLog(text, fallback);
      if (voiceActive) startRecognition();
    }
  };

  recognition.onerror = (e) => {
    console.warn('[STT] 错误:', e.error, e.message);
    if (e.error === 'no-speech' && voiceActive) {
      // 没检测到说话，继续听
      startRecognition();
    } else if (e.error === 'aborted') {
      // 用户手动停了
    } else {
      appendBubble('ai', '语音识别出了点问题，可以打字试试 🌙');
      stopVoice();
    }
  };

  recognition.start();
}

function stopVoice() {
  voiceActive = false;
  // 停止正在播放的 Audio 实例
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  // 同时取消浏览器内置 TTS（作为双重保险）
  window.speechSynthesis.cancel();
  if (recognition) { recognition.abort(); recognition = null; }
  voiceBtn.classList.remove('voice-active', 'voice-speaking');
}

voiceBtn.addEventListener('click', async () => {
  if (voiceActive) {
    stopVoice();
    appendBubble('ai', '语音已结束 🌙');
    return;
  }

  // 请求麦克风权限
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    appendBubble('ai', '需要麦克风权限才能语音对话，请在浏览器设置中允许 🌙');
    return;
  }

  voiceActive = true;
  voiceBtn.classList.add('voice-active');
  appendBubble('ai', '语音已接通，请说话吧 🌙');
  console.log('[VOICE] 点击麦克风，准备开始识别');
  startRecognition();
  console.log('[VOICE] startRecognition 已调用');
});
