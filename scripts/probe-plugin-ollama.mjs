#!/usr/bin/env node
/**
 * 复刻 Costrict 插件对 Ollama 的实际请求，做「独立模型层验证」。
 *
 * 目的：把插件发出的请求格式单独抽出来打给 Ollama，验证
 *   1) 延迟是否远超插件默认 3000ms 超时（这是 "Ollama request cancelled" 的元凶）
 *   2) 插件当前用的 /api/generate + suffix（无 raw）能否正确做 FIM 填充
 *   3) 替代方案 /v1/completions + 内嵌 FIM 标记 是否更好
 *
 * 运行：node scripts/probe-plugin-ollama.mjs
 */
import { performance } from "node:perf_hooks"

const BASE = process.env.OLLAMA_URL?.replace(/\/+$/, "") || "http://127.0.0.1:11434"
const MODEL = process.env.OLLAMA_MODEL || "starcoder2:3b"

// 插件默认取值（来自 fim/completionEngine.ts getCompletionModelConfig）
const PLUGIN = {
  maxOutputTokens: 256, // config.fim.maxOutputTokens 默认
  timeoutMs: 3000, // config.fim.timeoutMs 默认 —— 关键！
  temperature: 0.1,
  topP: 0.95,
  topK: 50,
  stop: ["<|endoftext|>"], // buildStopSequences 默认加的 EOS
}

async function postOllama(path, body, timeoutMs = 0) {
  const ctrl = new AbortController()
  // timeoutMs <= 0 表示"不设超时"（调试/慢模型）。注意 setTimeout(...,0) 会立即触发，
  // 所以只在 timeoutMs > 0 时才挂定时器。
  const t = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  const started = performance.now()
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const elapsed = Math.round(performance.now() - started)
    const text = await r.text()
    if (!r.ok) return { ok: false, status: r.status, elapsed, text: text.slice(0, 300) }
    return { ok: true, elapsed, data: JSON.parse(text) }
  } catch (e) {
    const elapsed = Math.round(performance.now() - started)
    return { ok: false, elapsed, err: e.name === "AbortError" ? `TIMEOUT after ${timeoutMs}ms` : e.message }
  } finally {
    if (t) clearTimeout(t)
  }
}

function show(title, res, field = "response") {
  console.log(`\n--- ${title} ---`)
  if (!res.ok) {
    console.log(`  ✗ fail: ${res.err || res.status} (elapsed ${res.elapsed}ms)`)
    if (res.text) console.log(`    ${res.text}`)
    return
  }
  const out = res.data[field] ?? ""
  console.log(`  ✓ elapsed ${res.elapsed}ms | eval_count=${res.data.eval_count} | done=${res.data.done}`)
  console.log(`  ↳ ${JSON.stringify(out.slice(0, 200))}`)
}

async function main() {
  console.log(`Ollama=${BASE} model=${MODEL}`)
  console.log(`插件默认：maxOutputTokens=${PLUGIN.maxOutputTokens} timeoutMs=${PLUGIN.timeoutMs}`)

  // 一个典型「光标在代码中间」的 FIM 场景
  const prefix = "def add(a, b):\n    "
  const suffix = "\n\nresult = add(2, 3)"

  // ① 复刻你那个能通过的 Python 测试（前缀续写 + raw=true），但用插件的 num_predict=256 看延迟
  console.log("\n==================================================")
  console.log("[1] 纯前缀续写（你的测试同款，raw=true），但用插件 num_predict=256")
  show(
    "raw=true / num_predict=256 / 无超时",
    await postOllama(
      "/api/generate",
      { model: MODEL, prompt: prefix, stream: false, raw: true, options: { temperature: 0, num_predict: PLUGIN.maxOutputTokens } },
      0,
    ),
  )

  // ② 复刻插件当前 Ollama 分支的真实请求（无 raw、带 suffix、带 stop）
  console.log("\n==================================================")
  console.log("[2] 插件当前路径：/api/generate + suffix + stop，无 raw")
  show(
    "raw=false（插件现状） / suffix 注入 / 无超时",
    await postOllama(
      "/api/generate",
      {
        model: MODEL,
        prompt: prefix,
        suffix,
        stream: false,
        options: {
          num_predict: PLUGIN.maxOutputTokens,
          stop: PLUGIN.stop,
          temperature: PLUGIN.temperature,
          top_p: PLUGIN.topP,
          top_k: PLUGIN.topK,
        },
      },
      0,
    ),
  )

  // ②b 同一请求，但加上 raw=true 对比
  show(
    "raw=true / suffix 注入 / 无超时",
    await postOllama(
      "/api/generate",
      {
        model: MODEL,
        prompt: prefix,
        suffix,
        stream: false,
        raw: true,
        options: {
          num_predict: PLUGIN.maxOutputTokens,
          stop: PLUGIN.stop,
          temperature: PLUGIN.temperature,
          top_p: PLUGIN.topP,
          top_k: PLUGIN.topK,
        },
      },
      0,
    ),
  )

  // ③ 复刻插件默认 3000ms 超时 —— 看是否必然被取消
  console.log("\n==================================================")
  console.log("[3] 用插件默认 3000ms 超时打一次（证明会被 cancel）")
  show(
    "raw=false / timeout=3000ms（插件默认）",
    await postOllama(
      "/api/generate",
      { model: MODEL, prompt: prefix, suffix, stream: false, options: { num_predict: PLUGIN.maxOutputTokens, stop: PLUGIN.stop, temperature: PLUGIN.temperature } },
      PLUGIN.timeoutMs,
    ),
  )

  // ④ 替代方案：OpenAI 兼容 /v1/completions + 内嵌 starcoder FIM 标记
  console.log("\n==================================================")
  console.log("[4] 替代方案：/v1/completions + 内嵌 <fim_*> 标记")
  const fimPrompt = `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`
  show(
    "openai /v1/completions / 无超时",
    await postOllama(
      "/v1/completions",
      { model: MODEL, prompt: fimPrompt, max_tokens: 96, temperature: PLUGIN.temperature, stop: PLUGIN.stop },
      0,
    ),
    "choices",
  )

  console.log("\n==================================================")
  console.log("结论提示：若 [1]/[2] 延迟 > 3000ms，则插件默认超时就是 'Ollama request cancelled' 的根因；")
  console.log("把设置里 fim.timeoutMs 设为 0，并建议给 Ollama 分支加 raw:true。")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
