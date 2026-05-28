# DeepSeek 余额监控 + QQ 通知

通过 GitHub Action 每日自动查询 DeepSeek API 余额，并通过 **Qmsg 酱** 推送到 QQ。

## 功能

- 🕘 每日 9:00 和 18:00（北京时间）自动查询 DeepSeek 余额
- 📱 通过 Qmsg 酱推送到 QQ 消息
- 📊 显示总余额、充值余额、赠送余额、已使用额度
- 🔴🟡🟢 根据余额比例自动标记状态
- 🔄 支持手动触发
- 📬 备选方案：Server 酱推送到微信

## 快速开始

### 1. 获取必要凭证

| 凭证 | 说明 | 获取方式 |
|------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | [DeepSeek 开放平台](https://platform.deepseek.com/) → API Keys |
| `QMSG_KEY` | Qmsg 酱推送 KEY | [Qmsg 酱](https://qmsg.zendee.cn/) 注册 → 控制台 → Key |
| `QMSG_QQ`（可选） | 接收消息的 QQ 号 | 不填则使用 Qmsg 酱后台配置的默认号码 |
| `SERVERCHAN_KEY`（可选） | Server 酱 KEY | [Server 酱](https://sct.ftqq.com/) 注册获取，作为备选通知 |

### 2. 配置 GitHub Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions → New repository secret** 中添加：

```
DEEPSEEK_API_KEY    = sk-xxxxxxxxxxxxxxxx
QMSG_KEY            = xxxxxxxxxxxxxxxx
QMSG_QQ             = 123456789（可选）
SERVERCHAN_KEY      = SCTxxxxxxxxxxxxx（可选）
```

### 3. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "feat: DeepSeek 余额监控"
git remote add origin git@github.com:你的用户名/仓库名.git
git push -u origin main
```

### 4. 手动测试

在 GitHub 仓库的 **Actions** 标签页 → 选择 `DeepSeek 余额每日查询` → **Run workflow** 手动触发。

## 消息示例

```
💰 DeepSeek 余额日报
📅 2026-05-28 09:00:00
────────────────────
币种: CNY
总余额: 85.2340
  充值余额: 100.0000
  赠送余额: 0.0000
  已使用: 14.7660
  剩余比例: 🟢 85.2%
```

## 项目结构

```
deepseekRest/
├── .github/
│   └── workflows/
│       └── daily_balance.yml    # GitHub Action 工作流
├── scripts/
│   └── check_balance.py         # 余额查询 + 通知脚本
├── requirements.txt
└── README.md
```

## 常见问题

**Q: Qmsg 酱收不到消息？**
A: 确保已添加 Qmsg 酱的 QQ 机器人为好友，或在目标群中 @机器人。

**Q: 能否改用其他通知渠道？**
A: 可以的。脚本已内置 Server 酱作为备选。你也可以修改 `send_qq_message` 函数，换成 Bark、PushPlus、钉钉机器人等。

**Q: 如何修改执行时间？**
A: 编辑 `.github/workflows/daily_balance.yml` 中的 `cron` 表达式。注意 GitHub Action 的 cron 使用 UTC 时间，北京时间 = UTC + 8。
