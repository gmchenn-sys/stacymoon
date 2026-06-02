// Stacy Moon — Daughter-side Notifications

window.notifyDaughter = async function(userMessage, aiReply) {
  const code = localStorage.getItem('stacy_invite_code');
  if (!code) return;

  let webhook;
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code)}&select=feishu_webhook`,
      {
        headers: {
          'apikey': window.SUPABASE_KEY,
          'Authorization': `Bearer ${window.SUPABASE_KEY}`
        }
      }
    );
    const data = await res.json();
    if (!data.length) { console.warn('邀请码无效:', code); return; }
    webhook = data[0].feishu_webhook;
  } catch (e) {
    console.warn('邀请码查询失败:', e);
    return;
  }

  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  const content = {
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: "🌙 妈妈刚刚说了些什么" },
        template: "orange"
      },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: "**妈妈说：** " + userMessage } },
        { tag: "div", text: { tag: "lark_md", content: "**Stacy 回复：** " + aiReply } },
        { tag: "note", elements: [{ tag: "plain_text", content: "今天 " + timeStr + " · Stacy Moon 陪伴中 🌙" }] }
      ]
    }
  };

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content)
    });
  } catch(e) {
    console.log("飞书通知失败", e);
  }
};
