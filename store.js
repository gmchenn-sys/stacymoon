/**
 * store.js — 打卡数据统一读写层
 * 云端 daily_logs + 本地 stacy_daily_logs，按 date 去重合并（云端优先）
 */

const DAILY_LOGS_KEY = 'stacy_daily_logs';

function _loadLocalDailyLogs() {
  try { return JSON.parse(localStorage.getItem(DAILY_LOGS_KEY) || '[]'); }
  catch { return []; }
}

/**
 * getDailyLogs()
 * 从 Supabase daily_logs 拉取（invite_code ilike），与本地按 date 去重合并（云端优先），
 * 回写 localStorage 作缓存。无邀请码或请求失败时降级为纯 localStorage。
 * 禁区：不会用空数组覆盖非空本地数据。
 */
async function getDailyLogs() {
  const local = _loadLocalDailyLogs();
  const code = localStorage.getItem('stacy_invite_code');
  if (!code) return local;

  let cloudRows = [];
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/rest/v1/daily_logs?invite_code=ilike.${encodeURIComponent(code)}&select=*&order=date.asc&limit=200`,
      {
        headers: {
          'apikey': window.SUPABASE_KEY,
          'Authorization': `Bearer ${window.SUPABASE_KEY}`,
        }
      }
    );
    if (!res.ok) return local;
    cloudRows = await res.json();
  } catch (e) {
    console.warn('getDailyLogs 云端拉取失败:', e);
    return local;
  }

  // 按 date 去重：云端优先，本地补缺
  const byDate = new Map();
  (cloudRows || []).forEach(row => {
    if (!row || !row.date) return;
    byDate.set(row.date, {
      date: row.date,
      mood: row.mood || '',
      sleep_score: row.sleep_score || 0,
      symptoms: row.symptoms || [],
      note: row.note || '',
    });
  });
  local.forEach(row => {
    if (!row || !row.date || byDate.has(row.date)) return;
    byDate.set(row.date, row);
  });

  const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // 禁区：空数组不得覆盖非空本地
  if (merged.length === 0 && local.length > 0) return local;

  localStorage.setItem(DAILY_LOGS_KEY, JSON.stringify(merged));
  return merged;
}

/**
 * saveDailyLog(data)
 * 本地按 date upsert + POST Supabase（与原 home.html saveTodayLog/syncToSupabase 行为一致）
 */
async function saveDailyLog(data) {
  const today = new Date().toISOString().slice(0, 10);
  const logs = _loadLocalDailyLogs();
  data.date = data.date || today;
  const idx = logs.findIndex(l => l.date === data.date);
  if (idx >= 0) logs[idx] = data; else logs.push(data);
  localStorage.setItem(DAILY_LOGS_KEY, JSON.stringify(logs));

  try {
    const code = localStorage.getItem('stacy_invite_code');
    if (!code) return;
    // upsert：同一 (invite_code, date) 更新而非重复插行（需表上有唯一约束，见 docs/TODO.md 建表 SQL）
    await fetch(`${window.SUPABASE_URL}/rest/v1/daily_logs?on_conflict=invite_code,date`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        invite_code: code,
        date: data.date,
        mood: data.mood || '',
        sleep_score: data.sleep_score || 0,
        symptoms: data.symptoms || [],
        note: data.note || '',
      }),
    });
  } catch (e) {
    console.warn('Supabase sync fail:', e);
  }
}
