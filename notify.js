// Stacy Moon — Daughter-side Notifications (upgraded)

function getToday() { return new Date().toISOString().slice(0,10); }

function buildCheckinSection() {
  try {
    const logs = JSON.parse(localStorage.getItem('stacy_daily_logs') || '[]');
    const todayLog = logs.find(l => l.date === getToday());
    if (!todayLog) return null;

    const MOOD_MAP = { '😊':'不错', '😐':'一般', '😤':'烦躁', '😢':'低落', '😴':'很累' };
    const SYMPTOM_LABELS = { hot_flash:'潮热', night_sweat:'夜间出汗', poor_sleep:'睡不好', mood_swing:'情绪波动', joint_pain:'关节疼', brain_fog:'脑雾' };

    const lines = [];

    // 心情
    if (todayLog.mood) lines.push(`心情：${todayLog.mood} ${MOOD_MAP[todayLog.mood] || ''}`);

    // 睡眠
    if (todayLog.sleep_score) {
      lines.push(`睡眠：${'⭐'.repeat(todayLog.sleep_score)}（${todayLog.sleep_score}/5分）`);
    }

    // 症状
    const symptoms = (todayLog.symptoms || []).filter(s => s !== 'none');
    if (symptoms.length > 0) {
      const labels = symptoms.map(s => SYMPTOM_LABELS[s] || s).join(' · ');
      lines.push(`症状：${labels}`);
    }

    // 备注
    if (todayLog.note) lines.push(`备注："${todayLog.note}"`);

    if (lines.length === 0) return null;

    return [
      [{ tag: 'text', text: '\n📊 今日状态' }],
      ...lines.map(l => [{ tag: 'text', text: l }]),
      [{ tag: 'text', text: '' }],
    ];
  } catch { return null; }
}

window.notifyDaughter = async function(userMessage, aiReply) {
  const code = localStorage.getItem('stacy_invite_code');
  if (!code) return;

  let webhook;
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/invite_codes?code=ilike.${encodeURIComponent(code)}&select=feishu_webhook`,
      {
        headers: {
          'apikey': window.SUPABASE_KEY,
          'Authorization': `Bearer ${window.SUPABASE_KEY}`
        }
      }
    );
    const data = await res.json();
    if (!data.length) { console.warn('[NOTIFY] 邀请码无效:', code); return; }
    webhook = data[0].feishu_webhook;
    if (!webhook || webhook.length < 10) {
      // 没有配置飞书 webhook，跳过通知
      return;
    }
  } catch (e) {
    console.warn('[NOTIFY] 查询失败:', e);
    return;
  }

  const now = new Date();
  const dateStr = now.getMonth() + 1 + '月' + now.getDate() + '日';
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  // 用户消息截断
  const shortMsg = (userMessage || '').length > 30
    ? userMessage.slice(0, 30) + '...'
    : (userMessage || '');

  // 构建 post content
  const paragraphs = [
    // 正文
    [{ tag: 'text', text: '🌙 有人刚刚和 Stacy 说话了' }],
    [{ tag: 'text', text: '💬 她说：' }, { tag: 'text', text: shortMsg, style: ['bold'] }],
    [{ tag: 'text', text: '' }], // empty line
  ];

  // 插入打卡数据
  const checkinSection = buildCheckinSection();
  if (checkinSection) {
    paragraphs.push(...checkinSection);
  }

  // 时间
  paragraphs.push([
    { tag: 'text', text: '🕐 ' + dateStr + ' ' + timeStr + ' · Stacy Moon 陪伴中 🌙' },
  ]);

  const payload = {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: '🌙 有人刚刚和 Stacy 说话了',
          content: paragraphs,
        }
      }
    }
  };

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('[NOTIFY] 飞书已推送');
  } catch(e) {
    console.log('[NOTIFY] 飞书通知失败', e);
  }
};
