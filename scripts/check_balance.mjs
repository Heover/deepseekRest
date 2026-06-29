/**
 * DeepSeek 余额查询 + 手机通知工具
 * 通过 GitHub Action 每日定时执行，查询 DeepSeek API 余额并通过 Server 酱3 推送通知。
 * 使用 MongoDB 记录上次余额，对比变化情况。
 *
 * 需要设置以下 GitHub Secrets / 环境变量：
 *   - DEEPSEEK_API_KEY: DeepSeek API 密钥
 *   - SERVER_UID: Server 酱3 用户 UID
 *   - SERVER_KEY: Server 酱3 SendKey
 *   - MONGODB_URI: MongoDB 连接字符串
 */

import { MongoClient } from "mongodb";

// ============================================================
// 配置
// ============================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const SERVER_UID = process.env.SERVER_UID || "";
const SERVER_KEY = process.env.SERVER_KEY || "";
const MONGODB_URI = process.env.MONGODB_URI || "";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

// ============================================================
// 工具函数
// ============================================================

function nowBeijing() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
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
// MongoDB 状态读写
// ============================================================

async function loadLastBalance(client) {
  try {
    const coll = client.db("github").collection("parameter");
    const doc = await coll.findOne({ _id: "deepseek_balance" });
    return doc ? doc.total : null;
  } catch {
    return null;
  }
}

async function saveBalance(client, total) {
  try {
    const coll = client.db("github").collection("parameter");
    await coll.updateOne(
      { _id: "deepseek_balance" },
      { $set: { total, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.log(`[WARN] 保存余额状态失败: ${e.message}`);
  }
}

// ============================================================
// 格式化消息
// ============================================================

function formatBalanceMessage(result, lastBalance) {
  if (result.error) {
    return `⚠️ DeepSeek 余额查询失败\n原因: ${result.error}`;
  }

  const data = result.data || {};
  const balanceInfos = data.balance_infos || [];

  if (!balanceInfos.length) {
    return "⚠️ 未获取到余额信息";
  }

  const info = balanceInfos[0];
  const total = parseFloat(info.total_balance || 0);

  let line = `总余额: ${total.toFixed(4)}`;

  if (lastBalance !== null) {
    const delta = total - lastBalance;
    if (Math.abs(delta) < 0.0001) {
      line += " (不变)";
    } else if (delta > 0) {
      line += ` (+${delta.toFixed(4)})`;
    } else {
      line += ` (${delta.toFixed(4)})`;
    }
  }

  if (data.is_available === false) {
    line += "\n🚫 账户余额不足，API 不可用！";
  }

  return line;
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

  // 0. 连接 MongoDB
  let client = null;
  let lastBalance = null;
  if (MONGODB_URI) {
    try {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      lastBalance = await loadLastBalance(client);
      if (lastBalance !== null) {
        console.log(`\n📋 上次余额: ${lastBalance.toFixed(4)}`);
      } else {
        console.log("\n📋 首次运行，无历史记录");
      }
    } catch (e) {
      console.log(`⚠️ MongoDB 连接失败: ${e.message}，跳过状态对比`);
    }
  }

  // 1. 查询余额
  console.log("\n[1/3] 正在查询 DeepSeek 余额...");
  const balanceResult = await fetchDeepSeekBalance();

  if (balanceResult.error) {
    console.log(`  ❌ ${balanceResult.error}`);
  } else {
    console.log("  ✅ 查询成功");
  }

  // 2. 格式化消息（含对比）
  console.log("\n[2/3] 正在格式化消息...");
  const message = formatBalanceMessage(balanceResult, lastBalance);
  console.log(message);

  // 3. 保存本次余额
  if (!balanceResult.error && client) {
    const data = balanceResult.data || {};
    const infos = data.balance_infos || [];
    if (infos.length) {
      await saveBalance(client, parseFloat(infos[0].total_balance || 0));
    }
  }

  // 4. 发送通知
  console.log("\n[3/3] 正在发送通知...");
  console.log("  → Server 酱...");
  const scResult = await sendServerChanMessage("DeepSeek 余额", message);
  if (!scResult.error) {
    console.log("  ✅ Server 酱发送成功");
  } else {
    console.log(`  ❌ Server 酱失败: ${scResult.error}`);
  }

  // 断开 MongoDB
  if (client) await client.close();

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
