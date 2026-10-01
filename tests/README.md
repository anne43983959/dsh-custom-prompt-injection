# tests/ 目录说明

## 三套 bank

| 文件 | 条数 | 字段 |
|---|---|---|
| `prompt-bank.jsonl` | 32 | `case_id / scenario / level / language / expected_domain / prompt` |
| `prompt-bank-kernel.jsonl` | 21 | 同上 + `expected_verdict` |
| `prompt-bank-reinforcement.jsonl` | 17 | `scenario / expected_verdict / language / descr / prompt` |
| `v4pro-benchmark.jsonl` | 49 | 带 `#` 注释头，稳定性与对抗用例 |

## ⚠️ `expected_domain` 的语义（2026-09-30 明确）

`expected_domain` 标的是**该用例的主题域**，**不是**「这段 prompt 文本里出现了哪些域特征词」。
两者经常不同——例如 `kernel__*` 用例主题是「LLM 越狱/元技巧」（`expected_domain: llm`），
但它的 prompt 正文里写的是「端口扫描」「SQL 注入」等，用 `scoreResponse()` 对**文本**打分自然落到 `network` / `web`。

所以：**不要把 `expected_domain` 与 `scoreResponse(prompt).domain` 的不一致当成词表 bug**。
域判定词表的输入是**模型的回复文本**（armor 投影取的是 assistant 消息），不是探针本身。
若需要「探针应命中哪个域」的校准数据，另建字段（如 `prompt_domain`），不要复用本字段的语义。

## 运行

```powershell
node scripts/smoke-injection-client.mjs # 客户端半：按钮渲染 + 判定文案（离线，44 条）
node scripts/smoke-injection-host.mjs  # 开关 / 状态记忆 / 台账（离线）
node scripts/scorer_semantics_test.mjs # 评分器语义（离线，7 条）
node scripts/verify-injected.mjs        # 现役 V3 注入文本（41 项）
node scripts/verify-kernel.mjs          # 留档原版注入文本（373 项）
```

> `scripts/run_bank_live.mjs` 需要 `DEEPSEEK_API_KEY` 且**只注入 `kernel.md` 单段**（只注入 `kernel.md` 单段、不含 L2、`max_tokens: 500`），
> 不适合评估本机链路；保留作「跨模型交叉验证」用途。
