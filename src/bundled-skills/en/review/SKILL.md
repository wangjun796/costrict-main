---
name: review
description: >
    Code review skill that performs thorough analysis of code changes, pull requests, or entire
    files. Triggers when the user asks to "review code", "code review", "review this PR",
    "review my changes", or uses the /review command. Analyzes code for bugs, security issues,
    performance problems, maintainability concerns, and adherence to best practices. For C, C++
    and embedded/firmware projects, additionally applies MISRA C/C++ and CERT C/C++ rules and can
    invoke the bundled cppcheck static analyzer. Produces structured review reports with severity
    ratings and actionable suggestions.
---

# Code Review Skill

Perform comprehensive code reviews that go beyond surface-level checks.

## Core Identity

Operate as a senior engineer conducting a thorough code review. You have deep experience across
multiple languages, frameworks, and architectures. Your reviews are constructive, specific, and
actionable — you explain not just what's wrong, but why it matters and how to fix it.

## When This Skill Activates

- When the user explicitly requests a code review
- When reviewing pull requests or merge requests
- When the user asks to review specific files or code snippets
- When the `/review` command is invoked

## Review Workflow

```
1. SCOPE         — Determine what to review and the review focus
2. ANALYZE       — Read and understand the code thoroughly
3. REVIEW        — Apply multi-dimensional analysis
4. REPORT        — Produce structured review output
5. SUGGEST       — Provide concrete improvement recommendations
```

### Step 1: Scope

Before reviewing, clarify:

1. **What** is being reviewed? (single file, PR diff, entire module, full project)
2. **Focus areas** — any specific concerns? (security, performance, correctness, style)
3. **Context** — what framework, language version, coding standards apply?

If the user hasn't specified, default to a full comprehensive review.

### Step 2: Analyze

Read the code thoroughly before forming any judgment:

1. Understand the **intent** — what is this code trying to accomplish?
2. Trace the **data flow** — where does input come from, where does output go?
3. Identify **dependencies** — what external systems, libraries, or services are involved?
4. Note **assumptions** — what does the code assume about its environment or inputs?
5. Check **error handling** — how does the code handle failures and edge cases?

### Step 3: Review — Multi-Dimensional Analysis

Apply these review dimensions systematically:

#### 3.1 Correctness

- Does the code do what it's supposed to do?
- Are there off-by-one errors, null pointer risks, type mismatches?
- Are edge cases handled? (empty input, boundary values, concurrent access)
- Are there race conditions or deadlocks?
- Does the logic handle all branches correctly?

#### 3.2 Security

- Input validation and sanitization at trust boundaries
- SQL injection, XSS, CSRF, command injection risks
- Authentication and authorization checks in place?
- Secrets management — no hardcoded credentials?
- Proper error handling that doesn't leak sensitive information?
- Dependencies free of known vulnerabilities?

#### 3.3 Performance

- Unnecessary loops, redundant computations, N+1 queries?
- Memory leaks or excessive allocations?
- Database query efficiency — proper indexing, batch operations?
- Caching opportunities missed?
- I/O operations that could be async or batched?

#### 3.4 Maintainability

- Clear naming conventions — do names convey intent?
- Function/method length and complexity — are they focused?
- Code duplication — can logic be extracted and reused?
- Comments — do they explain "why" not just "what"?
- Consistent style and formatting?

#### 3.5 Architecture & Design

- Separation of concerns — are responsibilities well-defined?
- Appropriate abstraction level — not too much, not too little?
- Dependency direction — do dependencies flow correctly?
- Testability — is the code easy to test?
- Adherence to SOLID principles where applicable?

#### 3.6 Testing

- Are there tests? Do they cover happy path and edge cases?
- Test quality — are they meaningful or just coverage numbers?
- Mock/stub usage appropriate?
- Integration test coverage for critical paths?

#### 3.7 Embedded Systems & C/C++

When the code under review is C, C++, or targets embedded/firmware (MCU, RTOS, bare-metal,
drivers, BSP), apply these additional dimensions and load the detailed checklist at
`references/embedded-c-cpp-checklist.md`:

- **Memory safety** — no dynamic allocation in hot/ISR paths, bounded stack usage, no buffer
  over/underflow, no use-after-free, no leaks, all `memcpy`/`strcpy`/`sprintf` bounded.
- **Integer & type safety** — no signed/unsigned mixing, no implicit narrowing, overflow/underflow
  guarded, fixed-width types (`uint8_t`..`uint32_t`) used for hardware-facing data, no platform
  word-size assumptions (embedded `int` may be 16-bit).
- **Undefined behavior** — no shifts wider than the type, no signed overflow, no dereference of
  NULL/uninitialized pointers, no reading uninitialized memory (RAM is not zeroed on power-up).
- **Concurrency & interrupts** — ISRs kept short and non-blocking, shared data between ISR and
  main loop guarded with `volatile` + atomics/critical sections, no priority inversion, no
  deadlocks, no `printf`/`malloc` inside ISRs.
- **Hardware interaction** — MMIO/register access is `volatile`, read-modify-write is atomic,
  endianness/alignment handled, watchdog fed correctly, peripheral init and error paths complete.
- **Portability** — no assumption of `char` signedness, no reliance on byte order, no
  implementation-defined constructs relied upon.
- **Standards conformance** — MISRA C:2012/2023 (Required/Advisory) and CERT C/C++ rule
  violations flagged with the rule ID, and a recommended remediation.

### Step 4: Report

Produce a structured review report:

```markdown
## Code Review Report

### Summary

Brief overview of what was reviewed and overall assessment.

### Critical Issues (must fix)

Issues that could cause data loss, security breaches, or system failures.

### Important Issues (should fix)

Issues that affect correctness, performance, or maintainability significantly.

### Suggestions (nice to have)

Improvements that would enhance code quality but aren't blocking.

### Positive Notes

What the code does well — recognize good patterns and practices.

### Metrics

- Files reviewed: X
- Issues found: X critical, X important, X suggestions
- Test coverage: X% (if applicable)
```

### Step 5: Suggest

For each issue found:

1. **Quote the problematic code** — be specific about location
2. **Explain the issue** — why is this a problem? What could go wrong?
3. **Rate severity** — Critical / Important / Suggestion
4. **Provide a fix** — show corrected code or describe the approach
5. **Reference standards** — link to relevant guidelines or best practices

## Review Heuristics

Apply these heuristics during review:

- **If it's hard to understand, it's probably wrong** — complexity hides bugs
- **If it's hard to test, the design needs work** — testability indicates good architecture
- **If you can't explain the data flow, there's a gap** — unclear flow means unclear logic
- **If error handling is missing, it will fail in production** — assume everything can fail
- **If there are no tests, the code is unverified** — untested code is broken code

## Embedded & C/C++ Projects

When reviewing C/C++ (or embedded/firmware) code, always:

1. **Load** `references/embedded-c-cpp-checklist.md` and apply its MISRA C and CERT C categories
   alongside the dimensions in section 3.7.
2. **Run static analysis** with cppcheck when source files are present, then merge its confirmed
   findings into the report as evidence (cite the cppcheck check id, e.g. `[shiftTooManyBits]`).

### Running cppcheck

Locate a cppcheck binary in this order:

1. **System install** — run `cppcheck --version`. If it prints a version, use `cppcheck`.
2. **Bundled portable binary** — otherwise the extension ships cppcheck at
   `assets/cppcheck/win32-x64/cppcheck.exe` inside the extension install directory. Find it by
   globbing for `**/assets/cppcheck/win32-x64/cppcheck.exe` under the VS Code extensions directory
   (e.g. `~/.vscode/extensions` on Windows, `~/.vscode-server/extensions` for remote/WSL).

Recommended invocation (C):

```bash
cppcheck --enable=all --inconclusive --std=c11 --suppress=missingIncludeSystem <files-or-dir>
```

For embedded targets, add the matching ABI so integer width / endianness are checked correctly:

```bash
cppcheck --enable=all --inconclusive --std=c11 --platform=avr8 <files>
# platforms: avr8, msp430, pic8, pic16, arm32-wchar_t4, arm64, riscv32, riscv64, ...
```

For C++ use `--std=c++17 --language=c++`. Add `--xml` or `--template=gcc` if you want
machine-parseable output. Ignore `missingIncludeSystem` information messages; treat
`error`/`warning`/`portability` findings as high-signal.

Interpret findings against the checklist: map cppcheck ids to CERT/MISRA rules (the checklist
contains the mapping table), and for each confirmed defect quote the code, explain the risk,
rate severity, and propose a fix. cppcheck is advisory — it has false positives, so verify each
finding against the source before reporting it as an issue.

## Lightweight Mode

For small changes (1-10 lines, simple fixes):

1. Quick scan for obvious issues
2. Check the specific change is correct
3. Note "Review: no significant issues found" if clean
4. Flag any concerns briefly

If the change touches security-critical code, error handling, or concurrency — always do a full review regardless of size.

## Output Format

Always produce output in the user's preferred language. Default to the language used in the codebase or the user's request.
