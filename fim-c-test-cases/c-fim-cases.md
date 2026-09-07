# Costrict FIM 补全 — C 语言测试用例集

> 共 14 个用例，覆盖函数体、循环、条件、错误处理、结构体、switch、带上下文等场景。
> 直接喂给 `src/core/costrict/auto-complete/fim` 的 `preprocessPrompt(prefix, suffix, import_content, config)` 或 `requestFimCompletion`。

## 标记格式（来自 fim/types.ts 的 FIM_MARKERS）

| Preset    | begin             | hole             | end             |
| --------- | ----------------- | ---------------- | --------------- |
| starcoder | `<fim_prefix>`    | `<fim_suffix>`   | `<fim_middle>`  |
| deepseek  | `<｜fim▁begin｜>` | `<｜fim▁hole｜>` | `<｜fim▁end｜>` |
| codellama | `<PRE>`           | `<SUF>`          | `<MID>`         |
| qwen      | `<fim_prefix>`    | `<fim_suffix>`   | `<fim_middle>`  |

`buildFimPrompt` 拼接顺序：`begin + context + "\n" + prefix + hole + suffix + end`。

## 用例总览

| #   | ID                       | 分类              | 验证点                                                       |
| --- | ------------------------ | ----------------- | ------------------------------------------------------------ |
| 1   | `c-func-add`             | 函数体实现        | 基础返回, 缩进, 双向无关(纯前缀续写)                         |
| 2   | `c-func-max`             | 条件分支          | if/else 对称, 需理解 suffix 约束                             |
| 3   | `c-loop-sum-array`       | 循环体            | 循环索引使用, 需理解 suffix 的返回变量                       |
| 4   | `c-guard-null`           | 错误处理/护栏     | NULL-guard 惯用法, 早期返回                                  |
| 5   | `c-strlen`               | 循环体            | 字符串遍历, 条件边界                                         |
| 6   | `c-strcpy-do-while`      | 循环体            | do-while 结构, 多语句 body, 需理解 suffix 终止条件           |
| 7   | `c-struct-init`          | 结构体            | 结构体字段赋值, 局部变量 + 返回                              |
| 8   | `c-fact-recursive`       | 递归              | 递归基线, 需理解 suffix 的递归调用                           |
| 9   | `c-switch-months`        | switch/case       | 多 case 合并, 需理解 default 与已列分支                      |
| 10  | `c-linkedlist-node`      | 结构体 + 内存     | struct 前置上下文(context), malloc + 指针字段, NULL 初始化   |
| 11  | `c-resource-cleanup`     | 错误处理/资源释放 | 错误路径需释放资源, 需理解 suffix 中的 fclose/return         |
| 12  | `c-find-index`           | 循环 + 提前返回   | 早退返回, 嵌套控制流                                         |
| 13  | `c-validate-guard`       | 条件 + 双向约束   | 多段早退, 需理解 suffix 后续逻辑与返回类型                   |
| 14  | `c-reverse-with-context` | 带头文件上下文    | import_content 上下文注入, 反向遍历, 需理解 suffix 的 printf |

---

## 1. `c-func-add` — 函数体实现

**说明**：最简单的返回值函数，仅测试基础生成与缩进。

**验证点**：基础返回, 缩进, 双向无关(纯前缀续写)

**Prefix（光标前）**：

```c
int add(int a, int b) {
```

**Suffix（光标后）**：

````c
}```

**期望 Middle**：

```c
    return a + b;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int add(int a, int b) {
<｜fim▁hole｜>}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int add(int a, int b) {
<fim_suffix>}<fim_middle>

````


---

## 2. `c-func-max` — 条件分支

**说明**：if 分支 body 为空，需结合 else 分支推断出 a>b 时返回 a。

**验证点**：if/else 对称, 需理解 suffix 约束

**Prefix（光标前）**：

```c
int max(int a, int b) {
    if (a > b) {
````

**Suffix（光标后）**：

````c
    } else {
        return b;
    }
}```

**期望 Middle**：

```c
        return a;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int max(int a, int b) {
if (a > b) {
<｜fim▁hole｜> } else {
return b;
}
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int max(int a, int b) {
if (a > b) {
<fim_suffix> } else {
return b;
}
}<fim_middle>

````


---

## 3. `c-loop-sum-array` — 循环体

**说明**：for 循环累加数组，body 为空，需结合 return total 推断累加逻辑。

**验证点**：循环索引使用, 需理解 suffix 的返回变量

**Prefix（光标前）**：

```c
int sum_array(const int *arr, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
````

**Suffix（光标后）**：

````c
    }
    return total;
}```

**期望 Middle**：

```c
        total += arr[i];```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int sum_array(const int \*arr, int n) {
int total = 0;
for (int i = 0; i < n; i++) {
<｜fim▁hole｜> }
return total;
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int sum_array(const int \*arr, int n) {
int total = 0;
for (int i = 0; i < n; i++) {
<fim_suffix> }
return total;
}<fim_middle>

````


---

## 4. `c-guard-null` — 错误处理/护栏

**说明**：NULL 入参护栏，body 为空，需返回 NULL。

**验证点**：NULL-guard 惯用法, 早期返回

**Prefix（光标前）**：

```c
char *duplicate(const char *s) {
    if (s == NULL) {
````

**Suffix（光标后）**：

````c
    }
    size_t len = strlen(s);
    char *copy = malloc(len + 1);```

**期望 Middle**：

```c
        return NULL;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>char *duplicate(const char *s) {
if (s == NULL) {
<｜fim▁hole｜> }
size_t len = strlen(s);
char \*copy = malloc(len + 1);<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>char *duplicate(const char *s) {
if (s == NULL) {
<fim_suffix> }
size_t len = strlen(s);
char \*copy = malloc(len + 1);<fim_middle>

````


---

## 5. `c-strlen` — 循环体

**说明**：while 遍历字符串直到 '\0'，body 为空。

**验证点**：字符串遍历, 条件边界

**Prefix（光标前）**：

```c
size_t my_strlen(const char *s) {
    size_t len = 0;
    while (s[len] != '\0') {
````

**Suffix（光标后）**：

````c
    }
    return len;
}```

**期望 Middle**：

```c
        len++;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>size_t my_strlen(const char \*s) {
size_t len = 0;
while (s[len] != '\0') {
<｜fim▁hole｜> }
return len;
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>size_t my_strlen(const char \*s) {
size_t len = 0;
while (s[len] != '\0') {
<fim_suffix> }
return len;
}<fim_middle>

````


---

## 6. `c-strcpy-do-while` — 循环体

**说明**：do-while 字符串拷贝，body 需同时赋值并自增，且要保证以 '\0' 结尾。

**验证点**：do-while 结构, 多语句 body, 需理解 suffix 终止条件

**Prefix（光标前）**：

```c
void my_strcpy(char *dest, const char *src) {
    int i = 0;
    do {
````

**Suffix（光标后）**：

````c
    } while (src[i] != '\0');
}```

**期望 Middle**：

```c
        dest[i] = src[i];
        i++;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>void my_strcpy(char *dest, const char *src) {
int i = 0;
do {
<｜fim▁hole｜> } while (src[i] != '\0');
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>void my_strcpy(char *dest, const char *src) {
int i = 0;
do {
<fim_suffix> } while (src[i] != '\0');
}<fim_middle>

````


---

## 7. `c-struct-init` — 结构体

**说明**：根据参数构造并初始化结构体后返回。

**验证点**：结构体字段赋值, 局部变量 + 返回

**Prefix（光标前）**：

```c
typedef struct {
    int x;
    int y;
} Point;

Point make_point(int x, int y) {
````

**Suffix（光标后）**：

````c
}```

**期望 Middle**：

```c
    Point p;
    p.x = x;
    p.y = y;
    return p;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>typedef struct {
int x;
int y;
} Point;

Point make_point(int x, int y) {
<｜fim▁hole｜>}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>typedef struct {
int x;
int y;
} Point;

Point make_point(int x, int y) {
<fim_suffix>}<fim_middle>

````


---

## 8. `c-fact-recursive` — 递归

**说明**：递归基线条件 body 为空，需返回 1。

**验证点**：递归基线, 需理解 suffix 的递归调用

**Prefix（光标前）**：

```c
long factorial(int n) {
    if (n <= 1) {
````

**Suffix（光标后）**：

````c
    }
    return n * factorial(n - 1);
}```

**期望 Middle**：

```c
        return 1;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>long factorial(int n) {
if (n <= 1) {
<｜fim▁hole｜> }
return n \* factorial(n - 1);
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>long factorial(int n) {
if (n <= 1) {
<fim_suffix> }
return n \* factorial(n - 1);
}<fim_middle>

````


---

## 9. `c-switch-months` — switch/case

**说明**：switch 中已列出 31 天月份与 2 月，需补全 30 天月份分支。

**验证点**：多 case 合并, 需理解 default 与已列分支

**Prefix（光标前）**：

```c
int days_in_month(int month) {
    switch (month) {
        case 2:
            return 28;
        case 1:
        case 3:
        case 5:
        case 7:
        case 8:
        case 10:
        case 12:
            return 31;
````

**Suffix（光标后）**：

````c
        default:
            return 30;
    }
}```

**期望 Middle**：

```c
        case 4:
        case 6:
        case 9:
        case 11:
            return 30;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int days_in_month(int month) {
switch (month) {
case 2:
return 28;
case 1:
case 3:
case 5:
case 7:
case 8:
case 10:
case 12:
return 31;
<｜fim▁hole｜> default:
return 30;
}
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int days_in_month(int month) {
switch (month) {
case 2:
return 28;
case 1:
case 3:
case 5:
case 7:
case 8:
case 10:
case 12:
return 31;
<fim_suffix> default:
return 30;
}
}<fim_middle>

````


---

## 10. `c-linkedlist-node` — 结构体 + 内存

**说明**：创建链表节点并初始化 next 为 NULL，需 malloc 与字段赋值。

**验证点**：struct 前置上下文(context), malloc + 指针字段, NULL 初始化

**上下文 (import_content)**：

```c
typedef struct Node {
    int value;
    struct Node *next;
} Node;
````

**Prefix（光标前）**：

```c
Node *create_node(int value) {
```

**Suffix（光标后）**：

````c
}```

**期望 Middle**：

```c
    Node *n = malloc(sizeof(Node));
    n->value = value;
    n->next = NULL;
    return n;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>typedef struct Node {
int value;
struct Node *next;
} Node;
Node *create_node(int value) {
<｜fim▁hole｜>}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>typedef struct Node {
int value;
struct Node *next;
} Node;
Node *create_node(int value) {
<fim_suffix>}<fim_middle>

````


---

## 11. `c-resource-cleanup` — 错误处理/资源释放

**说明**：读文件出错时需先 fclose 再返回错误码，测试双向约束与资源清理。

**验证点**：错误路径需释放资源, 需理解 suffix 中的 fclose/return

**Prefix（光标前）**：

```c
int read_config(const char *path, char *buf, size_t size) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    size_t n = fread(buf, 1, size - 1, f);
    if (n == 0 && ferror(f)) {
````

**Suffix（光标后）**：

````c
    }
    buf[n] = '\0';
    fclose(f);
    return (int)n;
}```

**期望 Middle**：

```c
        fclose(f);
        return -1;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int read_config(const char *path, char *buf, size_t size) {
FILE \*f = fopen(path, "r");
if (!f) return -1;
size_t n = fread(buf, 1, size - 1, f);
if (n == 0 && ferror(f)) {
<｜fim▁hole｜> }
buf[n] = '\0';
fclose(f);
return (int)n;
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int read_config(const char *path, char *buf, size_t size) {
FILE \*f = fopen(path, "r");
if (!f) return -1;
size_t n = fread(buf, 1, size - 1, f);
if (n == 0 && ferror(f)) {
<fim_suffix> }
buf[n] = '\0';
fclose(f);
return (int)n;
}<fim_middle>

````


---

## 12. `c-find-index` — 循环 + 提前返回

**说明**：在数组中找到目标即返回下标，body 为空。

**验证点**：早退返回, 嵌套控制流

**Prefix（光标前）**：

```c
int find_index(const int *arr, int n, int target) {
    int i = 0;
    while (i < n) {
        if (arr[i] == target) {
````

**Suffix（光标后）**：

````c
        }
        i++;
    }
    return -1;
}```

**期望 Middle**：

```c
            return i;```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>int find_index(const int \*arr, int n, int target) {
int i = 0;
while (i < n) {
if (arr[i] == target) {
<｜fim▁hole｜> }
i++;
}
return -1;
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>int find_index(const int \*arr, int n, int target) {
int i = 0;
while (i < n) {
if (arr[i] == target) {
<fim_suffix> }
i++;
}
return -1;
}<fim_middle>

````


---

## 13. `c-validate-guard` — 条件 + 双向约束

**说明**：函数含已有早退，body 需补充额外长度限制护栏。

**验证点**：多段早退, 需理解 suffix 后续逻辑与返回类型

**Prefix（光标前）**：

```c
bool is_valid(const char *s) {
    if (s == NULL || *s == '\0') {
        return false;
    }
````

**Suffix（光标后）**：

````c
    for (size_t i = 0; s[i]; i++) {
        if (!isalnum((unsigned char)s[i])) {
            return false;
        }
    }
    return true;
}```

**期望 Middle**：

```c
    if (strlen(s) > 64) {
        return false;
    }```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>bool is_valid(const char *s) {
if (s == NULL || *s == '\0') {
return false;
}
<｜fim▁hole｜> for (size_t i = 0; s[i]; i++) {
if (!isalnum((unsigned char)s[i])) {
return false;
}
}
return true;
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>bool is_valid(const char *s) {
if (s == NULL || *s == '\0') {
return false;
}
<fim_suffix> for (size_t i = 0; s[i]; i++) {
if (!isalnum((unsigned char)s[i])) {
return false;
}
}
return true;
}<fim_middle>

````


---

## 14. `c-reverse-with-context` — 带头文件上下文

**说明**：带 #include 上下文，反向打印字符串，body 为空。

**验证点**：import_content 上下文注入, 反向遍历, 需理解 suffix 的 printf

**上下文 (import_content)**：

```c
#include <stdio.h>
#include <string.h>
````

**Prefix（光标前）**：

```c
void print_reversed(const char *s) {
    int len = (int)strlen(s);
    for (int i = len - 1; i >= 0; i--) {
```

**Suffix（光标后）**：

````c
    }
    printf("\n");
}```

**期望 Middle**：

```c
        putchar(s[i]);```

**拼好的 FIM Prompt**

_deepseek preset_：

````

<｜fim▁begin｜>#include <stdio.h>
#include <string.h>
void print_reversed(const char \*s) {
int len = (int)strlen(s);
for (int i = len - 1; i >= 0; i--) {
<｜fim▁hole｜> }
printf("\n");
}<｜fim▁end｜>

```

_starcoder / qwen preset_：

```

<fim_prefix>#include <stdio.h>
#include <string.h>
void print_reversed(const char \*s) {
int len = (int)strlen(s);
for (int i = len - 1; i >= 0; i--) {
<fim_suffix> }
printf("\n");
}<fim_middle>

```

```
