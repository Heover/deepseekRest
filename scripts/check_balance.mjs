/**
 * DeepSeek 余额查询 + 手机通知工具（Node.js 零依赖版）
 * 通过 GitHub Action 每日定时执行，查询 DeepSeek API 余额并通过 Server 酱3 推送通知。
 *
 * 需要设置以下 GitHub Secrets / 环境变量：
 *   - DEEPSEEK_API_KEY: DeepSeek API 密钥
 *   - SERVER_UID: Server 酱3 用户 UID
 *   - SERVER_KEY: Server 酱3 SendKey
 */

// ============================================================
// 配置
// ============================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const SERVER_UID = process.env.SERVER_UID || "";
const SERVER_KEY = process.env.SERVER_KEY || "";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

// ============================================================
// 工具函数
// ============================================================

function nowBeijing() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function statusEmoji(percent) {
  if (percent > 50) return "🟢";
  if (percent > 20) return "🟡";
  if (percent > 5) return "🟠";
  return "🔴";
}

// ============================================================
// DeepSeek 余额查询
// ============================================================

async function fetchDeepSeekBalance() {
  if (!DEEPSEEK_API_KEY) {
    return { error: "未设置 DEEPSEEK_API_KEY 环境变量" };
  }

  try {
    const resp = await fetch(DEEPSEEK_BALANCE_URL, {
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    const rawText = await resp.text();
    console.log(`[DEBUG] DeepSeek API 原始返回: ${rawText}`);

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}`, detail: rawText };
    }

    const data = JSON.parse(rawText);
    return { success: true, data, raw: rawText };
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return { error: "请求 DeepSeek API 超时" };
    }
    return { error: `网络请求失败: ${e.message}` };
  }
}

// ============================================================
// 格式化消息
// ============================================================

function formatBalanceMessage(result) {
  const now = nowBeijing();

  if (result.error) {
    return `⚠️ DeepSeek 余额查询失败\n时间: ${now}\n原因: ${result.error}`;
  }

  const data = result.data || {};
  const balanceInfos = data.balance_infos || [];

  const lines = [`📅 ${now}`, `\nAPI 原始返回:\n${result.raw || JSON.stringify(data)}`];

  if (!balanceInfos.length) {
    lines.push("⚠️ 未获取到余额信息");
    return lines.join("\n");
  }

  for (const info of balanceInfos) {
    const currency = info.currency || "未知";
    const total = parseFloat(info.total_balance || 0);
    const toppedUp = parseFloat(info.topped_up_balance || 0);
    const granted = parseFloat(info.granted_balance || 0);
    const used = toppedUp + granted - total;

    lines.push(`\n💰 ${currency}`);
    lines.push(`总余额: ${total.toFixed(4)}`);
    lines.push(`充值余额: ${toppedUp.toFixed(4)}`);
    lines.push(`赠送余额: ${granted.toFixed(4)}`);
    lines.push(`已使用: ${used.toFixed(4)}`);
  }

  if (data.is_available === false) {
    lines.push("\n🚫 账户余额不足，API 不可用！");
  }

  return lines.join("\n");
}

// ============================================================
// Server 酱3 通知
// ============================================================

async function sendServerChanMessage(title, desp) {
  if (!SERVER_UID || !SERVER_KEY) {
    return { error: "未设置 SERVER_UID 或 SERVER_KEY" };
  }

  try {
    const url = `https://${SERVER_UID}.push.ft07.com/send/${SERVER_KEY}.send`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title, desp }),
      signal: AbortSignal.timeout(15000),
    });

    const result = await resp.json();
    console.log(`[DEBUG] Server 酱返回: ${JSON.stringify(result)}`);

    if (result.code === 0) {
      return { success: true, data: result };
    }
    return { error: result.message || "Server酱3 返回失败" };
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return { error: "Server酱3 请求超时" };
    }
    return { error: `Server酱3 请求失败: ${e.message}` };
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("=".repeat(50));
  console.log("DeepSeek 余额查询工具 (Node.js)");
  console.log("=".repeat(50));

  // 1. 查询余额
  console.log("\n[1/3] 正在查询 DeepSeek 余额...");
  const balanceResult = await fetchDeepSeekBalance();

  if (balanceResult.error) {
    console.log(`  ❌ ${balanceResult.error}`);
  } else {
    console.log("  ✅ 查询成功");
  }

  // 2. 格式化消息
  console.log("\n[2/3] 正在格式化消息...");
  const message = formatBalanceMessage(balanceResult);
  console.log(message);

  // 3. 发送通知
  console.log("\n[3/3] 正在发送通知...");
  console.log("  → Server 酱...");
  const scResult = await sendServerChanMessage("DeepSeek 余额", message);
  if (!scResult.error) {
    console.log("  ✅ Server 酱发送成功");
  } else {
    console.log(`  ❌ Server 酱失败: ${scResult.error}`);
  }

  // 最终状态
  if (balanceResult.error) {
    console.log("\n⚠️  任务完成（余额查询失败）");
    process.exit(1);
  } else {
    console.log("\n✅ 任务完成");
    process.exit(0);
  }
}

main();
