// Stacy Moon — 聊天页顶部「今日一览」Dashboard（T-007 IA 改版，逻辑自 home.html 移植）
// 今日关心（Agent 按天缓存）· 打卡状态 · 小任务 · 用药一行。数据只读缓存/store.js，绝不无条件写入。
(function () {
  const $ = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);

  const MOODS = [
    { emoji: '😊', label: '不错' }, { emoji: '😌', label: '平静' }, { emoji: '🥱', label: '疲惫' },
    { emoji: '😤', label: '烦躁' }, { emoji: '😢', label: '低落' }, { emoji: '😴', label: '没睡好' },
  ];
  const SYMPTOM_LABELS = { hot_flash: '潮热', night_sweat: '出汗', poor_sleep: '睡不好', mood_swing: '情绪波动', joint_pain: '关节疼', brain_fog: '脑雾' };

  const localDailyLogs = () => {
    try { return JSON.parse(localStorage.getItem('stacy_daily_logs') || '[]'); } catch { return []; }
  };
  const todayLog = () => localDailyLogs().find((l) => l && l.date === today()) || null;

  // ── 折叠状态（默认展开；语音通话时自动折叠由 voice-btn 状态驱动）──
  const dash = $('dashboard');
  const COLLAPSE_KEY = 'stacy_dash_collapsed';
  if (localStorage.getItem(COLLAPSE_KEY) !== '1') dash.classList.add('open');
  $('dash-toggle').addEventListener('click', () => {
    dash.classList.toggle('open');
    localStorage.setItem(COLLAPSE_KEY, dash.classList.contains('open') ? '' : '1');
  });

  // ── 打卡行 ──
  function renderCheckin() {
    const el = $('dash-checkin');
    const log = todayLog();
    if (log) {
      const mood = MOODS.find((m) => m.emoji === log.mood);
      const parts = [];
      if (mood) parts.push(log.mood + mood.label);
      if (log.sleep_score) parts.push('睡' + log.sleep_score + '分');
      const symp = (log.symptoms || []).filter((s) => s !== 'none').map((s) => SYMPTOM_LABELS[s] || s).join('、');
      if (symp) parts.push(symp);
      el.innerHTML = '<span class="dash-label">打卡</span><span class="dash-value">' + (parts.join(' · ') || '已记录') + '</span><a class="dash-action" href="history.html">看记录</a>';
    } else {
      el.innerHTML = '<span class="dash-label">打卡</span><span class="dash-value">今天还没记录</span><a class="dash-action" href="history.html">去打卡</a>';
    }
    el.style.display = '';
  }

  // ── 小任务行（TASK_BANK 移植精简：按症状挑选，按日期取模稳定）──
  const TASK_BANK = {
    hot_flash: [{ t: '随身带一杯冰水，慢慢喝完', icon: '🧊' }, { t: '深呼吸：吸4秒呼6秒，做5次', icon: '🫁' }],
    night_sweat: [{ t: '睡前一杯温水放床头', icon: '💧' }, { t: '睡前开窗通风10分钟', icon: '🪟' }],
    poor_sleep: [{ t: '今晚手机关在卧室外面', icon: '📱' }, { t: '睡前泡脚15分钟', icon: '🦶' }, { t: '下午4点后不喝咖啡和浓茶', icon: '☕' }],
    mood_swing: [{ t: '出门走10分钟，绕小区一圈', icon: '🚶' }, { t: '放一首最喜欢的歌闭眼听完', icon: '🎵' }],
    joint_pain: [{ t: '轻轻转动手腕脚踝各10次', icon: '🤲' }, { t: '肩膀画圈：顺5次逆5次', icon: '🔄' }],
    brain_fog: [{ t: '把最重要的1件事先做了', icon: '🎯' }, { t: '出门走15分钟看树和天空', icon: '🌳' }],
    general: [{ t: '今天喝够6杯水', icon: '🥤' }, { t: '吃1份蛋白质，鸡蛋豆浆都算', icon: '🥚' }, { t: '太阳好就出去晒10分钟', icon: '☀️' }],
  };
  const TASKS_KEY = 'stacy_task_status';
  function taskDone() {
    try { const s = JSON.parse(localStorage.getItem(TASKS_KEY) || '{}'); return s.date === today() && s.done; } catch { return false; }
  }
  function pickTask() {
    const log = todayLog();
    let pool = [];
    if (log) {
      (log.symptoms || []).forEach((s) => { if (TASK_BANK[s]) pool = pool.concat(TASK_BANK[s]); });
      if (log.sleep_score && log.sleep_score <= 2) pool = pool.concat(TASK_BANK.poor_sleep);
    }
    if (!pool.length) pool = TASK_BANK.general;
    return pool[parseInt(today().replace(/-/g, ''), 10) % pool.length];
  }
  function renderTask() {
    const el = $('dash-task');
    if (taskDone()) {
      el.innerHTML = '<span class="dash-label">小任务</span><span class="dash-value" style="color:#22c55e">✅ 今天的任务完成啦</span>';
    } else {
      const task = pickTask();
      el.innerHTML = '<span class="dash-label">小任务</span><span class="dash-value">' + task.icon + ' ' + task.t + '</span><button class="dash-action" type="button" id="dash-task-done">完成</button>';
      el.querySelector('#dash-task-done').addEventListener('click', () => {
        localStorage.setItem(TASKS_KEY, JSON.stringify({ date: today(), done: true }));
        renderTask();
      });
    }
    el.style.display = '';
  }

  // ── 用药一行 ──
  function renderMed() {
    const el = $('dash-med');
    let reminders = [];
    try { reminders = JSON.parse(localStorage.getItem('stacy_reminders') || '[]'); } catch {}
    const active = reminders.filter((r) => r && r.enabled !== false);
    el.innerHTML = '<span class="dash-label">用药</span><span class="dash-value">' + (active.length ? active.length + ' 个提醒进行中' : '设置用药提醒') + '</span><span class="dash-action">进入</span>';
    el.style.display = '';
  }

  // ── 今日关心（移植自 home.html T-006：按天缓存，命中绝不重调 Agent）──
  const BRIEF_KEY = 'stacy_daily_brief';
  let briefLoading = false;
  async function loadBrief() {
    const el = $('dash-brief');
    const log = todayLog();
    let lastChat = '';
    try {
      const logs = JSON.parse(localStorage.getItem('stacy_logs') || '[]');
      if (logs.length) lastChat = ((logs[logs.length - 1].userMessage || '') + '').slice(0, 30);
    } catch {}
    if (!log && !lastChat) { el.style.display = 'none'; return; }

    try {
      const cached = JSON.parse(localStorage.getItem(BRIEF_KEY) || 'null');
      if (cached && cached.date === today() && cached.text) {
        el.textContent = '💛 ' + cached.text; el.style.display = ''; return;
      }
    } catch {}
    if (briefLoading || typeof askStacyStream !== 'function') return;
    briefLoading = true;

    const parts = [];
    if (log) {
      const mood = MOODS.find((m) => m.emoji === log.mood);
      if (mood) parts.push('心情' + mood.label);
      if (log.sleep_score) parts.push('睡眠' + log.sleep_score + '分');
      const symp = (log.symptoms || []).filter((s) => s !== 'none').map((s) => SYMPTOM_LABELS[s] || s).join('、');
      if (symp) parts.push('症状' + symp);
    }
    let status = parts.length ? parts.join('，') : '暂无打卡';
    if (lastChat) status += '。最近聊到：' + lastChat;
    try {
      const reply = await askStacyStream('用户今日状态：' + status + '。请用一句话（30字以内）温柔地关心她或给一个当天可执行的小建议，直接说内容。');
      const text = (reply || '').trim();
      if (text) {
        localStorage.setItem(BRIEF_KEY, JSON.stringify({ date: today(), text: text }));
        el.textContent = '💛 ' + text; el.style.display = '';
      } else { el.style.display = 'none'; }
    } catch { el.style.display = 'none'; } finally { briefLoading = false; }
  }

  // ── 启动：仅登录用户渲染；语音通话开始时自动折叠 ──
  if (!localStorage.getItem('stacy_invite_code')) { dash.style.display = 'none'; return; }
  renderCheckin(); renderTask(); renderMed(); loadBrief();

  const voiceBtn = $('voice-btn');
  if (voiceBtn && window.MutationObserver) {
    new MutationObserver(() => {
      if (voiceBtn.classList.contains('voice-active')) dash.classList.remove('open');
    }).observe(voiceBtn, { attributes: true, attributeFilter: ['class'] });
  }
})();
