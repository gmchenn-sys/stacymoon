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

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('user-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ── Web Speech API 语音对话（打电话式）────────────────────────
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let voiceActive = false;

async function speakText(text) {
  const clean = text.replace(/[*_#`~>\-\[\]（）\(\)\n]/g, '').slice(0, 200);
  const url = `/api/tts?text=${encodeURIComponent(clean)}`;
  voiceBtn.classList.add('voice-speaking');
  return new Promise((resolve) => {
    const player = new Audio();
    player.src = url;
    const done = () => { voiceBtn.classList.remove('voice-speaking'); resolve(); };
    player.onended = done;
    player.onerror = (e) => { console.error('Audio fail:', e.target.error); done(); };
    player.addEventListener('canplaythrough', () => {
      player.play().catch(err => { console.error('Play fail:', err); done(); });
    }, { once: true });
    player.load();
  });
}

function startRecognition() {
  if (!SpeechRecognition) {
    appendBubble('ai', '当前浏览器不支持语音，请用 Chrome 打开 🌙');
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = async (event) => {
    const text = event.results[0][0].transcript.trim();
    if (!text) return;

    // 显示用户说的话
    appendBubble('user', text);

    // 显示 loading
    const loadingId = appendLoading();

    try {
      const reply = await askStacy(text);
      removeLoading(loadingId);
      appendBubble('ai', reply);
      if (window.notifyDaughter) notifyDaughter(text, reply);
      saveLog(text, reply);

      // 朗读回复
      if (voiceActive) {
        await speakText(reply);
        // 读完自动开始听下一句
        if (voiceActive) startRecognition();
      }
    } catch (e) {
      removeLoading(loadingId);
      const fallback = '网络有点问题，稍后再试一下 🌙';
      appendBubble('ai', fallback);
      saveLog(text, fallback);
      if (voiceActive && voiceActive) startRecognition();
    }
  };

  recognition.onerror = (e) => {
    console.warn('Speech error:', e.error);
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
  startRecognition();
});
