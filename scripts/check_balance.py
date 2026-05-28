"""
DeepSeek 余额查询 + QQ 通知工具
通过 GitHub Action 每日定时执行，查询 DeepSeek API 余额并推送到 QQ。

需要设置以下 GitHub Secrets / 环境变量：
  - DEEPSEEK_API_KEY: DeepSeek API 密钥
  - QMSG_KEY: Qmsg 酱的 KEY（从 https://qmsg.zendee.cn 获取）
  - QMSG_QQ: 接收消息的 QQ 号（可选，默认为 Qmsg 酱后台配置的默认号码）
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

# ============================================================
# 配置
# ============================================================

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
QMSG_KEY = os.environ.get("QMSG_KEY", "")
QMSG_QQ = os.environ.get("QMSG_QQ", "")  # 可选，指定接收 QQ 号

# DeepSeek API 端点
DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance"

# Qmsg 酱 API 端点
QMSG_SEND_URL = "https://qmsg.zendee.cn/api/v2/send"

# 北京时区
TZ_BEIJING = timezone(timedelta(hours=8))

# ============================================================
# 颜色/Emoji 辅助
# ============================================================

def status_emoji(percent: float) -> str:
    """根据余额百分比返回对应的 emoji"""
    if percent > 50:
        return "🟢"
    elif percent > 20:
        return "🟡"
    elif percent > 5:
        return "🟠"
    else:
        return "🔴"


# ============================================================
# DeepSeek 余额查询
# ============================================================

def fetch_deepseek_balance() -> dict:
    """查询 DeepSeek 账户余额，返回结构化数据"""
    if not DEEPSEEK_API_KEY:
        return {"error": "未设置 DEEPSEEK_API_KEY 环境变量"}

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.get(DEEPSEEK_BALANCE_URL, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        # DeepSeek 余额接口返回格式:
        # {
        #   "is_available": true,
        #   "balance_infos": [
        #     {"currency": "CNY", "total_balance": "100.00", "topped_up_balance": "100.00", "granted_balance": "0.00"}
        #   ]
        # }
        return {"success": True, "data": data}

    except requests.exceptions.Timeout:
        return {"error": "请求 DeepSeek API 超时"}
    except requests.exceptions.HTTPError as e:
        return {"error": f"HTTP 错误: {e.response.status_code}", "detail": str(e)}
    except requests.exceptions.RequestException as e:
        return {"error": f"网络请求失败: {str(e)}"}
    except json.JSONDecodeError:
        return {"error": "API 返回数据解析失败"}


# ============================================================
# 格式化消息
# ============================================================

def format_balance_message(result: dict) -> str:
    """将查询结果格式化为可读的消息"""
    now = datetime.now(TZ_BEIJING).strftime("%Y-%m-%d %H:%M:%S")

    if "error" in result:
        return (
            f"⚠️ DeepSeek 余额查询失败\n"
            f"时间: {now}\n"
            f"原因: {result['error']}"
        )

    data = result.get("data", {})

    lines = [
        f"💰 DeepSeek 余额日报",
        f"📅 {now}",
        f"{'─' * 20}",
    ]

    balance_infos = data.get("balance_infos", [])
    if not balance_infos:
        lines.append("⚠️ 未获取到余额信息")
        lines.append(f"原始返回: {json.dumps(data, ensure_ascii=False)}")
        return "\n".join(lines)

    for info in balance_infos:
        currency = info.get("currency", "未知")
        total = float(info.get("total_balance", 0))
        topped_up = float(info.get("topped_up_balance", 0))
        granted = float(info.get("granted_balance", 0))
        used = topped_up + granted - total  # 推算已使用额度

        lines.append(f"币种: {currency}")
        lines.append(f"总余额: {total:.4f}")
        lines.append(f"  充值余额: {topped_up:.4f}")
        lines.append(f"  赠送余额: {granted:.4f}")

        if topped_up > 0:
            remaining_percent = (total / topped_up * 100) if topped_up > 0 else 0
            emoji = status_emoji(remaining_percent)
            lines.append(f"  已使用: {used:.4f}")
            lines.append(f"  剩余比例: {emoji} {remaining_percent:.1f}%")

    is_available = data.get("is_available", True)
    if not is_available:
        lines.append("\n🚫 账户余额不足，API 不可用！")

    return "\n".join(lines)


# ============================================================
# QQ 通知（通过 Qmsg 酱）
# ============================================================

def send_qq_message(message: str) -> dict:
    """通过 Qmsg 酱发送消息到 QQ"""
    if not QMSG_KEY:
        return {"error": "未设置 QMSG_KEY 环境变量"}

    payload = {
        "msg": message,
    }
    if QMSG_QQ:
        payload["qq"] = QMSG_QQ

    try:
        resp = requests.post(
            f"{QMSG_SEND_URL}/{QMSG_KEY}",
            data=payload,
            timeout=15,
        )
        resp.raise_for_status()
        result = resp.json()

        if result.get("success"):
            return {"success": True, "data": result}
        else:
            return {"error": result.get("reason", "Qmsg 返回失败")}

    except requests.exceptions.Timeout:
        return {"error": "发送 QQ 消息超时"}
    except requests.exceptions.RequestException as e:
        return {"error": f"发送 QQ 消息失败: {str(e)}"}


# ============================================================
# 备选通知：Server 酱（如果 Qmsg 失败，可通过 Server 酱发微信）
# ============================================================

def send_serverchan_message(title: str, message: str) -> dict:
    """通过 Server 酱发送消息到微信（备选方案）"""
    sckey = os.environ.get("SERVERCHAN_KEY", "")
    if not sckey:
        return {"error": "未设置 SERVERCHAN_KEY"}

    try:
        resp = requests.post(
            f"https://sctapi.ftqq.com/{sckey}.send",
            data={"title": title, "desp": message},
            timeout=15,
        )
        resp.raise_for_status()
        return {"success": True, "data": resp.json()}
    except Exception as e:
        return {"error": str(e)}


# ============================================================
# 主流程
# ============================================================

def main():
    print("=" * 50)
    print("DeepSeek 余额查询工具")
    print("=" * 50)

    # 1. 查询余额
    print("\n[1/3] 正在查询 DeepSeek 余额...")
    balance_result = fetch_deepseek_balance()

    if "error" in balance_result:
        print(f"  ❌ {balance_result['error']}")
    else:
        print(f"  ✅ 查询成功")

    # 2. 格式化消息
    print("\n[2/3] 正在格式化消息...")
    message = format_balance_message(balance_result)
    print(message)

    # 3. 发送 QQ 通知
    print("\n[3/3] 正在发送 QQ 通知...")
    qq_result = send_qq_message(message)

    if "error" in qq_result:
        print(f"  ❌ QQ 通知失败: {qq_result['error']}")

        # 备选：Server 酱
        sc_result = send_serverchan_message("DeepSeek 余额", message)
        if "error" in sc_result:
            print(f"  ❌ 备选通知也失败: {sc_result['error']}")
        else:
            print(f"  ℹ️  已通过 Server 酱发送到微信")
    else:
        print(f"  ✅ QQ 通知发送成功")

    # 最终状态
    if "error" in balance_result:
        print("\n⚠️  任务完成（余额查询失败）")
        sys.exit(1)
    else:
        print("\n✅ 任务完成")
        sys.exit(0)


if __name__ == "__main__":
    main()
