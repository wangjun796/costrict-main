# Embedded C/C++ Code Review Checklist (MISRA C + CERT C)

Detailed review checklist for C, C++ and embedded/firmware code. Applies **MISRA C:2012 /
C:2023** (Required/Advisory) and **CERT C / CERT C++** rules, plus embedded-specific hardware,
interrupt and portability checks.

## How to use

1. Work category by category. Mark each item: `PASS`, `FAIL`, or `N/A` (not applicable).
2. For every `FAIL`, quote the code, state the violated rule (e.g. `MISRA 9.1`, `INT34-C`,
   `[shiftTooManyBits]`), explain the risk, rate severity, and give a fix.
3. **Run cppcheck** over the sources (see the parent `review` skill) and merge its findings using
   the mapping table at the bottom of this file.
4. Severity: **Critical** = memory corruption / undefined behavior / security breach;
   **Important** = portability or correctness risk; **Suggestion** = style/maintainability.

---

## 1. Memory safety

| #   | Check                                                                             | Rule / tool                                                                 |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.1 | No out-of-bounds array/pointer access                                             | ARR30-C, MISRA 18.1, `[arrayIndexOutOfBounds]`, `[bufferAccessOutOfBounds]` |
| 1.2 | All `memcpy`/`memmove`/`strcpy`/`strncpy`/`sprintf`/`snprintf` are length-bounded | STR31-C, MISRA 21.17, `[bufferAccessOutOfBounds]`                           |
| 1.3 | `strncpy`/`strncat` results are explicitly NUL-terminated                         | STR32-C                                                                     |
| 1.4 | No use-after-free, double-free, or dangling pointer                               | MEM30-C, `[doubleFree]`, `[danglingTemporaryLifetime]`                      |
| 1.5 | All `malloc`/`calloc`/`realloc` results are freed exactly once; no leaks          | MEM35-C, `[memleak]`                                                        |
| 1.6 | No dynamic allocation in ISRs, real-time or safety-critical paths                 | MISRA Dir 4.12, AUTOSAR                                                     |
| 1.7 | Stack usage is bounded and predictable; no recursion (or provably bounded)        | MISRA 17.2, `[stackUsage]`                                                  |
| 1.8 | No variable-length arrays (VLA) on the stack                                      | MISRA 18.8, `[variableScope]`                                               |
| 1.9 | Large local buffers avoided; prefer static/heap with explicit size                | —                                                                           |

## 2. Integer & arithmetic safety

| #    | Check                                                                              | Rule / tool                                                  |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 2.1  | No signed integer overflow / unsigned wraparound                                   | INT30-C, INT32-C, `[integerOverflow]`                        |
| 2.2  | No implicit narrowing conversions (assigning wider to narrower type)               | MISRA 10.3, INT31-C, `[arithOperationsOnVoidPointer]`        |
| 2.3  | Shift count is within `[0, width-1]` and non-negative                              | INT34-C, MISRA 12.2, `[shiftTooManyBits]`, `[shiftNegative]` |
| 2.4  | No division by zero / modulo zero                                                  | INT33-C, `[zerodiv]`                                         |
| 2.5  | No signed/unsigned mixing in comparisons or arithmetic                             | MISRA 10.4, `[signedUnsignedMismatch]`                       |
| 2.6  | Fixed-width types (`uint8_t`..`uint64_t`) used for hardware-facing / protocol data | MISRA Dir 4.6                                                |
| 2.7  | Unsigned constants carry `U`/`u` suffix                                            | MISRA 7.2                                                    |
| 2.8  | No reliance on `int` being 32-bit (embedded `int` may be 16-bit)                   | MISRA Dir 4.6, `[portability]`                               |
| 2.9  | `sizeof` never applied to an expression with side effects                          | MISRA 13.6                                                   |
| 2.10 | Conversions between pointers and integers avoided or justified                     | INT36-C, MISRA 11.4/11.6                                     |

## 3. Pointer & type safety

| #   | Check                                                            | Rule / tool                                             |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 3.1 | Every pointer is checked for NULL before dereference             | EXP34-C, `[nullPointer]`, `[nullPointerRedundantCheck]` |
| 3.2 | No read of uninitialized memory (RAM not zeroed on power-up)     | EXP33-C, MISRA 9.1, `[uninitvar]`                       |
| 3.3 | No `void*` arithmetic or implicit pointer-type punning           | MISRA 18.1                                              |
| 3.4 | No cast that discards `const`/`volatile`                         | MISRA 11.8, `[constVariable]`                           |
| 3.5 | No pointer comparisons of pointers to different objects          | EXP36-C                                                 |
| 3.6 | No use of a pointer after it has been freed or gone out of scope | MEM30-C, `[danglingLifetime]`                           |
| 3.7 | Unions used for type punning are avoided or explicitly justified | MISRA 19.1                                              |

## 4. Undefined & implementation-defined behavior

| #   | Check                                                                                     | Rule / tool                    |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| 4.1 | No shifts/arithmetic that are undefined (shift >= width, negative shift, signed overflow) | INT32/34-C, MISRA 12.2         |
| 4.2 | No unsequenced modification and read of the same variable in one expression               | MISRA 13.2, `[unreadVariable]` |
| 4.3 | No reliance on evaluation order of function arguments                                     | MISRA 13.5                     |
| 4.4 | No assumption on `char` signedness (use `signed char`/`unsigned char` explicitly)         | MISRA 8.10                     |
| 4.5 | No assumption on byte order / alignment (use explicit (de)serialization)                  | `[portability]`                |
| 4.6 | No reliance on implementation-defined bit-field layout                                    | MISRA 6.1, Dir 1.1             |

## 5. Concurrency, interrupts & real-time

| #   | Check                                                                                               | Rule / tool               |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| 5.1 | Variables shared between ISR and main loop are `volatile` and guarded (atomics / critical sections) | CON32-C, `[threadsafety]` |
| 5.2 | ISRs are short and non-blocking; no `printf`/`malloc`/`free`/locks inside ISRs                      | —                         |
| 5.3 | No data races on shared globals/MMIO                                                                | CON32-C, `[threadsafety]` |
| 5.4 | No deadlock (lock ordering); no lock held across a blocking call                                    | CON33-C, CON35-C          |
| 5.5 | No priority inversion (low-priority task holding resource needed by high-priority)                  | —                         |
| 5.6 | Read-modify-write of MMIO/registers is atomic and `volatile`                                        | MISRA Dir 4.1             |
| 5.7 | Interrupt enable/disable is balanced; shared data accessed atomically (e.g. `atomic_*`)             | CON35-C                   |

## 6. Resource management

| #   | Check                                                                      | Rule / tool                                   |
| --- | -------------------------------------------------------------------------- | --------------------------------------------- |
| 6.1 | Every opened file/socket/semaphore/mutex/descriptor is closed on all paths | FIO34-C, MISRA 22.1, `[leakReturnValNotUsed]` |
| 6.2 | No double-close or close of unowned resource                               | FIO30-C                                       |
| 6.3 | `errno` is only read after a call that sets it, and not clobbered          | MISRA 21.8                                    |
| 6.4 | No use of `atof`/`atoi`/`atol` (no error detection)                        | MISRA 21.7                                    |

## 7. Functions & control flow

| #   | Check                                                                                          | Rule / tool                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| 7.1 | No recursion                                                                                   | MISRA 17.2                           |
| 7.2 | Functions have a prototype and a single declaration                                            | MISRA 8.2/8.3                        |
| 7.3 | Return values are always checked or explicitly ignored                                         | MISRA 17.7, `[leakReturnValNotUsed]` |
| 7.4 | Functions that should not modify their arguments take `const` parameters                       | MISRA 17.8                           |
| 7.5 | `goto` is restricted (single function, forward only, no jumps into blocks)                     | MISRA 15.2/15.3                      |
| 7.6 | `switch` statements are well-formed: every clause has `break` (or comment), a `default` exists | MISRA 16.1–16.7                      |
| 7.7 | Loops have a bounded iteration count                                                           | NASA JPL Rule 1                      |
| 7.8 | No dead or unreachable code                                                                    | MISRA 2.1/2.2, `[unreachableCode]`   |

## 8. Preprocessing & portability

| #   | Check                                                                                   | Rule / tool                      |
| --- | --------------------------------------------------------------------------------------- | -------------------------------- |
| 8.1 | Header files are include-guarded                                                        | MISRA Dir 4.10                   |
| 8.2 | Macro parameters are parenthesized and not evaluated multiple times                     | MISRA 20.7, `[macroSideEffects]` |
| 8.3 | Macros do not shadow keywords or standard identifiers                                   | MISRA 20.4, 21.1/21.2            |
| 8.4 | No reliance on non-standard extensions without guards                                   | MISRA 1.1/1.2                    |
| 8.5 | Fixed-width integer types (`stdint.h`) used instead of `int`/`long` for portable sizing | MISRA Dir 4.6                    |

## 9. Hardware & embedded-specific

| #   | Check                                                                           | Rule / tool   |
| --- | ------------------------------------------------------------------------------- | ------------- |
| 9.1 | MMIO and peripheral register access uses `volatile`                             | MISRA Dir 4.1 |
| 9.2 | Watchdog is fed correctly on all paths (not too early, not missing)             | —             |
| 9.3 | Endianness handled explicitly when reading/writing multi-byte values            | —             |
| 9.4 | Structure packing/alignment matches the hardware ABI (packed structs justified) | MISRA 6.1     |
| 9.5 | No blocking waits without timeout in device drivers                             | —             |
| 9.6 | Peripheral initialization and de-init/error paths are complete                  | —             |
| 9.7 | Boot/startup code initializes `.bss`/`.data` and stack before use               | —             |

---

## cppcheck id → CERT/MISRA mapping

| cppcheck id                                        | CERT / MISRA        | Meaning              |
| -------------------------------------------------- | ------------------- | -------------------- |
| `bufferAccessOutOfBounds`, `arrayIndexOutOfBounds` | ARR30-C, MISRA 18.1 | Out-of-bounds access |
| `shiftTooManyBits`, `shiftNegative`                | INT34-C, MISRA 12.2 | Invalid shift        |
| `uninitvar`, `uninitdata`, `uninitMemberVar`       | EXP33-C, MISRA 9.1  | Uninitialized read   |
| `nullPointer`, `nullPointerRedundantCheck`         | EXP34-C             | Null dereference     |
| `integerOverflow`                                  | INT32-C             | Signed overflow      |
| `unsignedLessThanZero`, `signedUnsignedMismatch`   | MISRA 10.1/10.4     | Sign confusion       |
| `memleak`, `memleakOnRealloc`                      | MEM35-C, MISRA 22.1 | Leak                 |
| `doubleFree`, `deallocret`                         | MEM30/34-C          | Free misuse          |
| `zerodiv`, `divideByZero`                          | INT33-C             | Division by zero     |
| `constStatement`, `constVariable`                  | MISRA 8.9           | Constness            |
| `unreachableCode`                                  | MISRA 2.1           | Dead code            |
| `missingIncludeSystem`                             | —                   | Noise; suppress      |
| `unusedFunction`, `unusedStructMember`             | MISRA 8.7/8.9       | Unused symbol        |

> cppcheck is advisory — always verify a finding against the source before reporting it.
> The open-source cppcheck covers **partial** MISRA C:2012 rules via core checks and the
> `addons/misra.py` addon (which requires the proprietary rule texts for full compliance).
