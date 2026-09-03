# 嵌入式 C/C++ 代码审查清单（MISRA C + CERT C）

面向 C、C++ 和嵌入式/固件代码的详细审查清单。应用 **MISRA C:2012 / C:2023**
（Required/Advisory）与 **CERT C / CERT C++** 规则，并覆盖嵌入式特有的硬件、中断与可移植性检查。

## 使用方法

1. 逐类别检查。对每项标记：`通过`、`不通过` 或 `不适用`。
2. 对每个 `不通过` 项，引用代码、说明违反的规则（如 `MISRA 9.1`、`INT34-C`、
   `[shiftTooManyBits]`）、解释风险、评定严重程度并给出修复方案。
3. **运行 cppcheck**（见上级 `review` 技能），并用本文件底部的映射表合并其发现。
4. 严重程度：**严重** = 内存破坏 / 未定义行为 / 安全漏洞；
   **重要** = 可移植性或正确性风险；**建议** = 风格/可维护性。

---

## 1. 内存安全

| #   | 检查项                                                                       | 规则 / 工具                                                                 |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.1 | 无数组/指针越界访问                                                          | ARR30-C、MISRA 18.1、`[arrayIndexOutOfBounds]`、`[bufferAccessOutOfBounds]` |
| 1.2 | 所有 `memcpy`/`memmove`/`strcpy`/`strncpy`/`sprintf`/`snprintf` 均做长度限制 | STR31-C、MISRA 21.17、`[bufferAccessOutOfBounds]`                           |
| 1.3 | `strncpy`/`strncat` 结果显式以 NUL 结尾                                      | STR32-C                                                                     |
| 1.4 | 无 use-after-free、double-free 或悬空指针                                    | MEM30-C、`[doubleFree]`、`[danglingTemporaryLifetime]`                      |
| 1.5 | 所有 `malloc`/`calloc`/`realloc` 结果均恰好释放一次，无泄漏                  | MEM35-C、`[memleak]`                                                        |
| 1.6 | ISR、实时或安全关键路径中无动态内存分配                                      | MISRA Dir 4.12、AUTOSAR                                                     |
| 1.7 | 栈使用量有界可预测；无递归（或可证明有界）                                   | MISRA 17.2、`[stackUsage]`                                                  |
| 1.8 | 栈上无变长数组（VLA）                                                        | MISRA 18.8、`[variableScope]`                                               |
| 1.9 | 避免大型局部缓冲区，优先静态/堆并显式指定大小                                | —                                                                           |

## 2. 整数与运算安全

| #    | 检查项                                                 | 规则 / 工具                                                  |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------ |
| 2.1  | 无有符号整数溢出 / 无符号回绕                          | INT30-C、INT32-C、`[integerOverflow]`                        |
| 2.2  | 无隐式窄化转换（宽类型赋给窄类型）                     | MISRA 10.3、INT31-C                                          |
| 2.3  | 移位计数在 `[0, 位宽-1]` 内且非负                      | INT34-C、MISRA 12.2、`[shiftTooManyBits]`、`[shiftNegative]` |
| 2.4  | 无除零 / 模零                                          | INT33-C、`[zerodiv]`                                         |
| 2.5  | 比较或运算中无有符号/无符号混用                        | MISRA 10.4、`[signedUnsignedMismatch]`                       |
| 2.6  | 硬件相关/协议数据使用定宽类型（`uint8_t`..`uint64_t`） | MISRA Dir 4.6                                                |
| 2.7  | 无符号常量带 `U`/`u` 后缀                              | MISRA 7.2                                                    |
| 2.8  | 不依赖 `int` 为 32 位（嵌入式中 `int` 可能为 16 位）   | MISRA Dir 4.6、`[portability]`                               |
| 2.9  | `sizeof` 不作用于带副作用的表达式                      | MISRA 13.6                                                   |
| 2.10 | 指针与整数互转应避免或说明理由                         | INT36-C、MISRA 11.4/11.6                                     |

## 3. 指针与类型安全

| #   | 检查项                                      | 规则 / 工具                                             |
| --- | ------------------------------------------- | ------------------------------------------------------- |
| 3.1 | 每个指针解引用前均检查 NULL                 | EXP34-C、`[nullPointer]`、`[nullPointerRedundantCheck]` |
| 3.2 | 不读取未初始化内存（上电时 RAM 内容不确定） | EXP33-C、MISRA 9.1、`[uninitvar]`                       |
| 3.3 | 无 `void*` 运算或隐式指针类型双关           | MISRA 18.1                                              |
| 3.4 | 无丢弃 `const`/`volatile` 的强制转换        | MISRA 11.8、`[constVariable]`                           |
| 3.5 | 不比较指向不同对象的指针                    | EXP36-C                                                 |
| 3.6 | 指针释放或越界后不再使用                    | MEM30-C、`[danglingLifetime]`                           |
| 3.7 | 用于类型双关的 union 应避免或显式说明       | MISRA 19.1                                              |

## 4. 未定义行为与实现定义行为

| #   | 检查项                                                           | 规则 / 工具            |
| --- | ---------------------------------------------------------------- | ---------------------- |
| 4.1 | 无未定义移位/运算（移位超宽、负移位、有符号溢出）                | INT32/34-C、MISRA 12.2 |
| 4.2 | 同一表达式中不出现对同一变量的无序修改与读取                     | MISRA 13.2             |
| 4.3 | 不依赖函数实参的求值顺序                                         | MISRA 13.5             |
| 4.4 | 不假设 `char` 的有符号性（显式用 `signed char`/`unsigned char`） | MISRA 8.10             |
| 4.5 | 不假设字节序/对齐（使用显式（反）序列化）                        | `[portability]`        |
| 4.6 | 不依赖实现定义的位域布局                                         | MISRA 6.1、Dir 1.1     |

## 5. 并发、中断与实时性

| #   | 检查项                                                          | 规则 / 工具               |
| --- | --------------------------------------------------------------- | ------------------------- |
| 5.1 | ISR 与主循环共享的变量用 `volatile` 且受保护（原子操作/临界区） | CON32-C、`[threadsafety]` |
| 5.2 | ISR 尽量短且非阻塞；ISR 内不使用 `printf`/`malloc`/`free`/锁    | —                         |
| 5.3 | 共享全局/MMIO 无数据竞争                                        | CON32-C、`[threadsafety]` |
| 5.4 | 无死锁（锁顺序一致）；不在持有锁时做阻塞调用                    | CON33-C、CON35-C          |
| 5.5 | 无优先级反转（低优先级任务持有高优先级所需资源）                | —                         |
| 5.6 | MMIO/寄存器的读-改-写为原子操作且 `volatile`                    | MISRA Dir 4.1             |
| 5.7 | 中断使能/禁止成对；共享数据原子访问（如 `atomic_*`）            | CON35-C                   |

## 6. 资源管理

| #   | 检查项                                                     | 规则 / 工具                                   |
| --- | ---------------------------------------------------------- | --------------------------------------------- |
| 6.1 | 所有打开的文件/套接字/信号量/互斥锁/描述符在所有路径上关闭 | FIO34-C、MISRA 22.1、`[leakReturnValNotUsed]` |
| 6.2 | 无重复关闭或关闭不属于自己的资源                           | FIO30-C                                       |
| 6.3 | `errno` 仅在设置它的调用之后读取，且不被覆盖               | MISRA 21.8                                    |
| 6.4 | 不使用 `atof`/`atoi`/`atol`（无错误检测）                  | MISRA 21.7                                    |

## 7. 函数与控制流

| #   | 检查项                                                              | 规则 / 工具                          |
| --- | ------------------------------------------------------------------- | ------------------------------------ |
| 7.1 | 无递归                                                              | MISRA 17.2                           |
| 7.2 | 函数有原型且声明唯一                                                | MISRA 8.2/8.3                        |
| 7.3 | 返回值均被检查或显式忽略                                            | MISRA 17.7、`[leakReturnValNotUsed]` |
| 7.4 | 不应修改入参的函数参数加 `const`                                    | MISRA 17.8                           |
| 7.5 | `goto` 受限（同一函数、仅向前、不跳入代码块）                       | MISRA 15.2/15.3                      |
| 7.6 | `switch` 结构完整：每个分支有 `break`（或注释说明）、存在 `default` | MISRA 16.1–16.7                      |
| 7.7 | 循环有界                                                            | NASA JPL 规则 1                      |
| 7.8 | 无死代码或不可达代码                                                | MISRA 2.1/2.2、`[unreachableCode]`   |

## 8. 预处理与可移植性

| #   | 检查项                                                         | 规则 / 工具                      |
| --- | -------------------------------------------------------------- | -------------------------------- |
| 8.1 | 头文件有 include 保护                                          | MISRA Dir 4.10                   |
| 8.2 | 宏参数加括号且不被多次求值                                     | MISRA 20.7、`[macroSideEffects]` |
| 8.3 | 宏不遮蔽关键字或标准标识符                                     | MISRA 20.4、21.1/21.2            |
| 8.4 | 无未加保护的非标准扩展                                         | MISRA 1.1/1.2                    |
| 8.5 | 使用定宽整数类型（`stdint.h`）而非 `int`/`long` 保证可移植位宽 | MISRA Dir 4.6                    |

## 9. 硬件与嵌入式专项

| #   | 检查项                                                | 规则 / 工具   |
| --- | ----------------------------------------------------- | ------------- |
| 9.1 | MMIO 与外设寄存器访问使用 `volatile`                  | MISRA Dir 4.1 |
| 9.2 | 看门狗在所有路径上正确喂狗（不提前、不漏喂）          | —             |
| 9.3 | 读写多字节值时显式处理字节序                          | —             |
| 9.4 | 结构体打包/对齐与硬件 ABI 一致（packed 结构体有理由） | MISRA 6.1     |
| 9.5 | 设备驱动中无超时的阻塞等待                            | —             |
| 9.6 | 外设初始化与去初始化/错误路径完整                     | —             |
| 9.7 | 启动代码在使用前初始化 `.bss`/`.data` 与栈            | —             |

---

## cppcheck 编号 → CERT/MISRA 映射

| cppcheck 编号                                      | CERT / MISRA        | 含义         |
| -------------------------------------------------- | ------------------- | ------------ |
| `bufferAccessOutOfBounds`、`arrayIndexOutOfBounds` | ARR30-C、MISRA 18.1 | 越界访问     |
| `shiftTooManyBits`、`shiftNegative`                | INT34-C、MISRA 12.2 | 非法移位     |
| `uninitvar`、`uninitdata`、`uninitMemberVar`       | EXP33-C、MISRA 9.1  | 未初始化读取 |
| `nullPointer`、`nullPointerRedundantCheck`         | EXP34-C             | 空指针解引用 |
| `integerOverflow`                                  | INT32-C             | 有符号溢出   |
| `unsignedLessThanZero`、`signedUnsignedMismatch`   | MISRA 10.1/10.4     | 符号混淆     |
| `memleak`、`memleakOnRealloc`                      | MEM35-C、MISRA 22.1 | 内存泄漏     |
| `doubleFree`、`deallocret`                         | MEM30/34-C          | 释放误用     |
| `zerodiv`、`divideByZero`                          | INT33-C             | 除零         |
| `constStatement`、`constVariable`                  | MISRA 8.9           | const 性     |
| `unreachableCode`                                  | MISRA 2.1           | 死代码       |
| `missingIncludeSystem`                             | —                   | 噪声；抑制   |
| `unusedFunction`、`unusedStructMember`             | MISRA 8.7/8.9       | 未使用符号   |

> cppcheck 为辅助工具——上报前务必逐条对照源码核实。开源版 cppcheck 通过核心检查与
> `addons/misra.py` 插件（完整合规需专有规则文本）实现**部分** MISRA C:2012 规则覆盖。
