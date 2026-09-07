import json, io

with open(r"E:\costrict\costrict-main\fim-c-test-cases\c-fim-cases.json", encoding="utf-8") as f:
    data = json.load(f)

presets = data["presets"]
P = {"deepseek": presets["deepseek"], "starcoder": presets["starcoder"]}

def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def assemble(prefix, suffix, context, m):
    ctx = (context + "\n") if context else ""
    return m["begin"] + ctx + prefix + m["hole"] + suffix + m["end"]

out = io.StringIO()
out.write("# Costrict FIM 补全 — C 语言测试用例集\n\n")
out.write("> 共 %d 个用例，覆盖函数体、循环、条件、错误处理、结构体、switch、带上下文等场景。\n" % len(data["cases"]))
out.write("> 直接喂给 `src/core/costrict/auto-complete/fim` 的 `preprocessPrompt(prefix, suffix, import_content, config)` 或 `requestFimCompletion`。\n\n")
out.write("## 标记格式（来自 fim/types.ts 的 FIM_MARKERS）\n\n")
out.write("| Preset | begin | hole | end |\n|---|---|---|---|\n")
for k in ("starcoder", "deepseek", "codellama", "qwen"):
    mm = presets[k]
    out.write("| %s | `%s` | `%s` | `%s` |\n" % (k, mm["begin"], mm["hole"], mm["end"]))
out.write("\n`buildFimPrompt` 拼接顺序：`begin + context + \"\\n\" + prefix + hole + suffix + end`。\n\n")

out.write("## 用例总览\n\n")
out.write("| # | ID | 分类 | 验证点 |\n|---|---|---|---|\n")
for i, c in enumerate(data["cases"], 1):
    out.write("| %d | `%s` | %s | %s |\n" % (i, c["id"], c["category"], ", ".join(c["validates"])))

for i, c in enumerate(data["cases"], 1):
    out.write("\n---\n\n## %d. `%s` — %s\n\n" % (i, c["id"], c["category"]))
    out.write("**说明**：%s\n\n" % c["description"])
    out.write("**验证点**：%s\n\n" % ", ".join(c["validates"]))
    if c["context"]:
        out.write("**上下文 (import_content)**：\n\n```c\n%s\n```\n\n" % c["context"])
    out.write("**Prefix（光标前）**：\n\n```c\n%s```\n\n" % c["prefix"])
    out.write("**Suffix（光标后）**：\n\n```c\n%s```\n\n" % c["suffix"])
    out.write("**期望 Middle**：\n\n```c\n%s```\n\n" % c["expectedMiddle"])
    out.write("**拼好的 FIM Prompt**\n\n")
    out.write("_deepseek preset_：\n\n```\n%s\n```\n\n" % assemble(c["prefix"], c["suffix"], c["context"], P["deepseek"]))
    out.write("_starcoder / qwen preset_：\n\n```\n%s\n```\n\n" % assemble(c["prefix"], c["suffix"], c["context"], P["starcoder"]))

with open(r"E:\costrict\costrict-main\fim-c-test-cases\c-fim-cases.md", "w", encoding="utf-8") as f:
    f.write(out.getvalue())
print("OK, bytes:", len(out.getvalue().encode("utf-8")))
