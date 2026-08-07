# 反模式：反复出现的安全灾难

这些模式在漏洞事件分析中反复出现。如果您在当前计划或代码中识别到任何模式，立即停止并修复。

## 身份验证反模式

**AP-AUTH-01：明文或可逆加密的密码**
案例：Adobe 2013（1.53 亿账户）、RockYou 2009。使用 bcrypt/scrypt/argon2 + 每用户盐值存储密码。绝不使用 MD5、SHA1 或无 KDF 的 SHA256。

**AP-AUTH-02：无速率限制的凭证填充**
案例：流媒体、零售、金融服务领域的多次漏洞事件。在认证端点强制执行速率限制、账户锁定和 CAPTCHA。

**AP-AUTH-03：JWT "alg:none" 或对称密钥混淆**
案例：无数 API 漏洞事件。在服务器端固定算法。验证每个令牌。绝不信任头部的 "alg" 声明。

**AP-AUTH-04：会话固定 / 权限变更时不轮换**
登录后、权限提升后或密码更改后重新生成会话 ID。

**AP-AUTH-05：无过期时间或无单次使用强制的魔法链接/令牌**
令牌必须过期（短 TTL）并在首次使用后失效。

## 授权反模式

**AP-AUTHZ-01：仅客户端访问控制**
案例：Parler 数据泄露 2021、无数 SPA。服务器必须强制执行每个权限检查。UI 隐藏是装饰性的，不是安全性。

**AP-AUTHZ-02：不安全的直接对象引用（IDOR）**
案例：USPS 2018（6000 万条记录）、First American Financial 2019（8.85 亿条记录）。在每个请求上验证请求用户拥有或被允许访问引用的对象。

**AP-AUTHZ-03：批量赋值 / 过度提交**
案例：GitHub 2012（Rails 批量赋值）。允许列表接受的字段。绝不将原始请求体绑定到模型。

**AP-AUTHZ-04：损坏的函数级授权**
管理端点可被普通用户发现和调用。在每个处理程序上强制执行角色检查，而不仅仅是路由表。

**AP-AUTHZ-05：通过参数篡改的权限提升**
将请求中的 `role=user` 改为 `role=admin`。绝不信任客户端提供的角色或权限值。

## 注入反模式

**AP-INJ-01：SQL 注入**
案例：Heartland 2008（1.3 亿张卡）、TalkTalk 2015。 exclusively 使用参数化查询。SQL 不使用字符串拼接。

**AP-INJ-02：通过 Shell 插值的命令注入**
案例：Shellshock（Bash CVE-2014-6271）。使用带参数数组的子进程，绝不使用 shell=True 和用户输入。

**AP-INJ-03：服务器端模板注入（SSTI）**
模板引擎（Jinja2、Twig 等）中的用户输入可执行任意代码。绝不将原始输入传递给模板渲染函数。

**AP-INJ-04：LDAP / XPath / NoSQL 注入**
与 SQLi 根本原因相同但目标不同。针对特定解释器进行参数化或清理。

**AP-INJ-05：日志注入 / CRLF 注入**
攻击者注入换行符或控制字符以伪造日志条目、毒化缓存或分割 HTTP 响应。在记录或包含在 HTTP 头之前清理或编码所有用户输入。

## 数据暴露反模式

**AP-DATA-01：源代码或版本控制中的密钥**
案例：Uber 2016（5700 万条记录，GitHub 仓库中的 AWS 密钥）。使用密钥存储。使用 trufflehog 或 gitleaks 等工具扫描仓库。

**AP-DATA-02：生产环境中的详细错误消息**
错误响应中的堆栈跟踪、SQL 查询、文件路径。使用通用的面向用户的错误；仅在服务器端记录详细信息。

**AP-DATA-03：静态数据未加密**
案例：Equifax 2017（内部系统）、无数 S3 桶暴露。加密所有静态敏感数据。

**AP-DATA-04：日志、分析或 URL 中的 PII**
案例：Facebook 2019（密码明文记录）。结构化日志并脱敏敏感字段。绝不记录令牌、密码、社保号或信用卡号。

**AP-DATA-05：暴露的云存储（S3 桶、GCS、Azure Blobs）**
案例：Capital One 2019 等无数案例。默认拒绝公共访问。审计桶策略。

## 密码学反模式

**AP-CRYPTO-01：自己实现加密**
绝不实现自定义加密、哈希或密钥交换。使用 NaCl/libsodium、OpenSSL 或平台提供的库。

**AP-CRYPTO-02：使用已弃用的算法**
MD5、SHA1、RC4、DES、3DES、ECB 模式。使用 AES-256-GCM、SHA-256+、ChaCha20-Poly1305。

**AP-CRYPTO-03：硬编码加密密钥或 IV**
密钥必须随机生成，存储在密钥管理器中，并可轮换。

**AP-CRYPTO-04：禁用 TLS 验证**
`verify=False`、`NODE_TLS_REJECT_UNAUTHORIZED=0`、`InsecureSkipVerify: true`。绝不在生产中禁用。修复证书。

**AP-CRYPTO-05：用于安全目的的可预测随机值**
使用 `Math.random()`、`random.random()` 或 `rand()` 生成令牌、nonce 或密钥。使用 CSPRNG：`secrets`（Python）、`crypto.randomBytes`（Node）、`SecureRandom`（Java/Ruby）。

## 基础设施反模式

**AP-INFRA-01：数据库直接暴露到互联网**
案例：Meow 攻击 2020（数千个无保护数据库被清除）。数据库在私有子网后面，仅通过应用层或堡垒机访问。

**AP-INFRA-02：以 root 运行 / 过度的容器权限**
案例：容器逃逸漏洞。以非 root 运行，删除功能，在可能的情况下使用只读文件系统。

**AP-INFRA-03：无网络分段**
案例：Target 2013（HVAC 供应商跳转到 POS 网络）。按信任级别分段。区域之间使用防火墙。

**AP-INFRA-04：生产环境中的调试端点**
`/debug`、`/actuator`、`/phpinfo`、`DJANGO_DEBUG=True`。删除或通过 VPN + 认证保护。

**AP-INFRA-05：通配符 CORS**
带凭证的 `Access-Control-Allow-Origin: *`。明确枚举允许的源。

## 供应链反模式

**AP-SUPPLY-01：未固定依赖**
版本范围允许恶意更新。在锁文件中固定确切版本。

**AP-SUPPLY-02：域名抢注 / 依赖混淆**
案例：ua-parser-js 2021、event-stream 2018。验证包名。对内部包使用限定范围的注册表。

**AP-SUPPLY-03：含已知 CVE 的过时依赖**
案例：Equifax 2017（Apache Struts CVE-2017-5638）。CI 中的自动化扫描。立即修补严重 CVE。

## 逻辑与设计反模式

**AP-LOGIC-01：TOCTOU 竞态条件**
检查时间与使用时间。使用原子操作、数据库事务或文件锁定。

**AP-LOGIC-02：无限制的资源消耗**
无分页、无请求大小限制、无超时。无界正则表达式的 ReDoS。始终限制循环、查询和分配。

**AP-LOGIC-03：不安全的反序列化**
案例：Apache Commons（Java）、pickle（Python）、YAML.load（Ruby/Python）。绝不使用完整对象实例化反序列化不受信任的数据。使用安全加载器和允许列表类型。

**AP-LOGIC-04：开放重定向**
`?redirect=https://evil.com` 用于钓鱼。针对内部路径的允许列表验证重定向目标。

**AP-LOGIC-05：状态变更操作缺少幂等性**
重放的请求导致重复收费、重复写入。对关键变更使用幂等键。

**AP-LOGIC-06：仅信任客户端验证**
所有客户端检查都可被绕过。服务器必须独立验证一切。
