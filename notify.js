// Stacy Moon — Daughter-side Notifications

window.FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/463e21bd-3982-4190-bae8-95af499bb743";

window.notifyDaughter = async function(userMessage, aiReply) {
  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  const content = {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: "🌙 妈妈刚刚说了些什么"
        },
        template: "orange"
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: "**妈妈说：** " + userMessage
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: "**Stacy 回复：** " + aiReply
          }
        },
        {
          tag: "note",
          elements: [{
            tag: "plain_text",
            content: "今天 " + timeStr + " · Stacy Moon 陪伴中 🌙"
          }]
        }
      ]
    }
  };

  try {
    await fetch(window.FEISHU_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content)
    });
  } catch(e) {
    console.log("飞书通知失败", e);
  }
};
