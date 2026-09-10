---
name: drpy-node-coder
description: drpy-node 爬虫源全生命周期一体化 skill——建源、诊断、修复、测试、播放调试、仓库发布，支持本地/远程多网关（远程部署的 drpy-node 远程写源、远程验证）。自带 CLI（scripts/cli.js），无需安装 MCP。用户提到"新建源/写源/做源/建源/生成源/爬虫源""修源/测试某个源/详情为空/搜索异常/源无效/低分评估/诊断/排障/规则不生效""播放不通/lazy 不对/iframe/m3u8/parse:0/1/假播放/加密链接/防盗链""上传仓库/替换上传/改标签/发布源/同步源/打标签/分享源""网关/远程服务器/远程部署/多台/往网关a和网关b/部署到服务器/连接远端/配置远程 drpy-node/初始化网关"时使用。
---

# drpy-node Coder

drpy-node 爬虫源的**建、修、测、放、传**全链路一体化 skill。自带 CLI 工具，**无需安装 MCP 服务**。

## 便携性说明（先读）

- ✅ **无需 MCP**：所有能力内置在 `scripts/cli.js`，AI 直接 `node scripts/cli.js <命令>` 调用。
- ⚠️ **cli.js 在 skill 自身目录**（`~/.zcode/skills/drpy-node-coder/scripts/cli.js`），**不在 drpy-node 仓库里**——drpy-node/scripts 下没有 cli.js。工作目录随意（CLI 通过 setup 记录的根定位找到 drpy-node），别 cd 错地方。
- ✅ **零 npm 依赖**：无需 `npm install`。`localDsCore` 测试引擎 bundle（14M，全内联 cheerio/axios/drpyS/htmlParser）+ sqlite + 编码 wasm 自带于 `scripts/vendor/`。
- ⚠️ **前置**：本机需有 `drpy-node` 项目（CLI 复用其 `req`/`pdfa`/`drpyS`/DS解密 **源码模块**——这些互相 import、非 bundle，搬不动；但 `localDsCore` 已内联进 `vendor/`，`test`/`evaluate` 不再依赖 `drpy-node-bundle` 目录）。
- 首次使用：`cd scripts && node cli.js setup <drpy-node-绝对路径> && node cli.js doctor`。
- 调用范式：`node scripts/cli.js [--root <drpy-node路径>] [--target <网关名>] <命令> [参数] [--flags]`。所有命令输出 JSON：成功 `{"ok":true,"data":...}`、失败 `{"ok":false,"error":...}`。
- **输出读取**：少数命令（test/evaluate）首次加载测试引擎时 stdout 可能有一次初始化日志，**业务 JSON 始终是 stdout 最后一行**，按最后一行 `{` 解析。Windows Git Bash 下输出里可能混入 ANSI 清屏序列（ESC`[H`2J），直接解析会失败，先 `| tr -d '\033' | grep -v '^\[H\[2J'` 清洗。
- **`data_preview` 是截断文本**（约 3KB，尾部 `... (数据已截断，共 N 字符)`），截断点可能切开 JSON 字符串——**对 preview 做 `JSON.parse` 必炸**。结构化取值只用 `item_count` / `first_item`（同样截断至 500 字符）字段，或对整行输出 grep 关键词；要完整数据请换姿势（见下文「测试实战陷阱」）。

## 网关与远程执行（local / 远程 drpy-node 多网关）

CLI 天然支持多网关：`local`（默认，本地 drpy-node）+ 任意多个远程部署的 drpy-node。

```bash
node cli.js gateway add prod http://1.2.3.4:5757 --user admin --password .. --api-pwd ..
node cli.js gateway persist prod    # 凭据固化到系统级环境变量，新会话零配置（首次配置必跑）
node cli.js gateway test prod       # 探活+版本+端点可用性（首次连接远程必跑）
node cli.js gateway use prod        # 切换默认网关（nvm use 式，持久化）
node cli.js src list --target prod  # 单次显式覆盖，不改默认
node cli.js gateway use local       # 切回本地
```

### 首连引导剧本（用户不会敲命令时必走）

用户往往只说"帮我配置/连上远端 drpy-node http://x.x.x.x:5757"，不会提 gateway 命令。AI 按此剧本**主动执行**，缺什么追问什么，不要把命令甩给用户：

1. **地址缺失先问地址**：要到 IP/域名+端口（drpy-node 默认 5757；docker 部署确认端口已映射、防火墙放行）。
2. **先试探后追问**：`gateway add <建议名> <url>`（先不带凭据）→ `gateway test <名>`，按探测结果**精准**提问，不要一次问全：
   - 401 鉴权失败 → 追问远端 `.env` 的 `API_AUTH_NAME`/`API_AUTH_CODE`，顺带确认是否有 `API_PWD`
   - runtime 404 → 告知远端 drpy-node 版本过旧需升级
   - 全 ok → 无需凭据，跳到第 4 步
3. **带凭据重配+固化**：`gateway add <名> <url> --overwrite --user .. --password .. --api-pwd ..` → `gateway persist <名>`（一次性固化：凭据写入 Windows 用户级环境变量 + Git Bash profile，配置文件改存变量名、清掉明文；幂等可重跑）→ `gateway test` 全绿。此后**任何新终端/新会话零配置可用**，无需再 export。明文→固化的两步由 AI 连续完成，用户只需提供一次凭据。
4. **切换+验证**：`gateway use <名>` → 真实跑一条（如 `src list`）→ 向用户报告连接摘要（远端版本、源数量、网关名、当前指向）。

- **凭据**：`user`/`password`=远端 `.env` 的 `API_AUTH_NAME`/`API_AUTH_CODE`；`api_pwd`=远端 `API_PWD`。配置（`~/.drpy-node-coder/gateways.json`，不入 git）只存变量名；`gateway persist <名>` 一次性固化凭据——Windows 写用户级环境变量(注册表)+bash profile，Linux/macOS 写 `~/.bashrc`（zsh 用户自动覆盖 `.zshrc`；不创建 `.bash_profile` 以免遮蔽 `~/.profile`）。**配置完必跑 persist**，此后任何新终端/新会话零配置可用。
- **分发安全**：skill 目录无状态（凭据/配置/根定位全在 `~/.drpy-node-coder/` 与系统环境变量）。给别人发 skill 必须 `node scripts/pack.mjs` 打包（自动排除运行态残留），不要手工 zip。
- **验证口径（以网关实际服务对象为准）**：远程网关时 `test`/`evaluate`/`syntax`/`validate` 执行于远端（远端运行时真实行为，含它的环境变量/cookie/插件）；本地网关时执行于本地。`fetch`/`analyze`/`guess`/`debug`/`iframe` 是外部站点分析，永远本地执行，与网关无关。`house *` 面向仓库服务器，与网关无关。
- **远程写源**：`fs write/edit` 源目录自动走远端 `sources/upload`（带服务端语法校验）与 `sources/delete`；其余目录走 files API。写后均回读验证。
- **多网关编排**：用户说"往网关a和网关b同时写xx源/都测一遍"→ AI 循环对每个网关执行同一命令（`--target a`、`--target b`），汇总对比各网关输出（evaluate 结果自带 `target` 字段）。同一源本地写好 → 逐网关 `fs write --content-file <本地文件> --target <gw>` 部署 → 逐网关 `evaluate --target <gw>`。
- **远程源操作三规则（防 404 迷路，本地同理）**：
  1. 用户给的源名常是模糊的（"360影视"→真实文件 `360影视[官].js`）。`test`/`evaluate` 直接喂模糊名即可：CLI 自动解析真实源名，唯一命中自动采用并在 `source_resolved` 透明标注；多候选会列出候选让你选，无候选会提示先 `src list --filter`。
  2. `fs read/write`、`syntax`、`validate`、`resolved` 是文件操作，**必须带目录前缀**（`spider/js/xxx.js`、`spider/php/xxx.php`）；报"文件不存在"先检查前缀。
  3. 找源名永远用 `src list --filter 关键词`（远端 300+ 源，全量列表浪费上下文）；多引擎源（php/py/cat）远程测试加 `--do php`（`--extend` 同步透传）。
- **错误自解释**：401=凭据错（核对网关 user/password）；403 只读模式=远端 `.env` 设 `READ_ONLY_MODE=0` 后重启远端；404 无此 API=远端 drpy-node 过旧，提示升级远端。原样把这些提示转告用户，不要盲目重试。
- **远程限制**：hipy/py 源在远端改动后需远端重启服务（daemon 缓存 py module）；`restart` 命令远程走 admin API，但**不要**在常规部署流程里自动调用。

## 总控工作流（5 步闭环）

```
用户输入
  │
Step1 识别输入 ──仅 URL──→ 分析站点 → 建源路线
  │（已有源名/文件）
Step2 评估现状：syntax+validate(L1) → test 单接口(L2) → evaluate 全流程(L3)
  │
Step3 判断失败类型：A规则不通 / B评估串联 / C播放链
  │  🛑 检查点1：确认诊断结论
Step4 分流执行：本 skill 修 / 转播放调试 / 转仓库
  │
Step5 收束：evaluate 复评 → 🛑 检查点2 → 上传建议 / 结束
```

**核心原则**：先评估 → 再分流 → 再修复 → 再验证 → 最后给上传建议。不要一上来就重写。

## 模式闸门：先判断是否允许写入

| 用户模式 | 允许 | 禁止 |
|---|---|---|
| 只读/dry-run/只规划 | 读取、诊断、给方案和验证计划 | `fs write/edit`、`house upload/*` |
| 需确认后改 | 读取、诊断、输出拟改字段+验证计划 | 未确认前改源或仓库元数据 |
| 明确执行 | 按 L1/L2/L3 证据最小修复 | 跳过大改确认点、直接仓库 mutation |
| 自主全流程（"修到100""自动完成""做源并上传"） | alive check→建源→低风险修复→播放→L3=100→上传 | 坏站硬写、未达目标冒充完成、目标不明上传 |

## 任务分派表（场景 → 路线 + 首读 reference + 关键命令）

| 场景 | 路线 | 首读 reference | 关键 CLI 命令 |
|---|---|---|---|
| 仅 URL，新建源 | 建源 A/B/C/D | `references-create-checklist.md`、`references-template-system.md` | `fetch` `guess` `analyze` `template` `fs write` `syntax` `validate` `test` `evaluate` |
| 已有源评估低分 | 诊断 A/B/C | `references-workflow-triage.md`、`references-framework-internals.md` | `fs read` `resolved` `evaluate` `test` |
| detail 通但 play 异常 | 播放专项 | `references-play-lazy-summary.md` | `test <src> detail` `test <src> play` `iframe` `fetch` + Playwright（见下） |
| 上传/替换/改标签 | 仓库守门 | `references-upload-decision.md` | `house verify` `house upload` `house list` `house info` `house tags` |
| 模板继承排查 | 路线 A | `references-template-summary.md`、`references-inherited-template-minimal-override-site.md` | `guess` `resolved` |
| 纯 API/SPA 站 | 路线 C | `references-pure-api-async-site.md`、`references-api-functions.md` | `fetch` `analyze` |
| 签名接口站 | 路线 B2 | `references-non-template-signed-api-site.md` | `fetch` + 浏览器抓包 |
| 二级字典/多集 | detail 规范 | `references-detail-dict-and-multiep.md` | `debug` `test <src> detail` |
| 搜索异常 | 搜索策略 | `references-search-strategies.md`、`references-old-encoding-search-site.md` | `test <src> search` |
| async 函数陷阱 | 通用 | `references-async-function-patterns.md` | — |
| 特殊内容(漫画/小说/音乐/网盘) | 路线 D | `references-special-content.md` | — |
| 多引擎源(php/hipy/cat) | 路线 E | `references-multi-engine-sources.md` | `fetch` + curl `?do=py/php/cat&extend=`（**必须带 extend**；hipy 改源需 kill daemon）|

## 建源 30 秒路线（仅 URL 入口）

**Step 0 alive check**（自主模式不可跳过）：`fetch <url>` 确认可达；`guess <url>` 探模板；`analyze <url>` 看 HTML/SPA。遇 `broken_site`/`hard_anti_bot`/`missing_credentials` 停手。

**站型分派**（先 `guess`）：
- 命中模板 → **A 模板继承**（最小覆盖 host/url/searchUrl/class_parse，勿急重写）
- 未命中+DOM 完整 → **B1 字符串规则**（+二级字典）
- 未命中+签名接口 → **B2 async 一级/搜索**
- body 空+JSON API → **C 全 async**
- 漫画/小说/音乐/网盘 → **D 特殊内容**
- 403/登录/验证码 → **停手**

**7 条必背规则**（含 async 的源必过）：①`this.input` 是 URL 不是响应，须 `await request(this.input)` ②纯数字 vod_id 必设 `detailUrl` ③POST 用 `body` 非 `data` ④`searchUrl` 必带 `**` ⑤推荐要全量聚合去重 ⑥async 用 `this.input`/`this.MY_CATE`/`this.MY_PAGE`，勿手拼 URL ⑦不写重复同名属性。

**写入验证链**：`template` → `fs write spider/js/源名.js` → `syntax` → `validate` → `test home/category/detail/search/play` → `evaluate`。

## 诊断 L1/L2/L3 证据链

| 等级 | 命令 | 能下结论 | 不能下结论 |
|---|---|---|---|
| L1 | `syntax` + `validate` | 非语法残档、rule 结构合法，可拆测 | 可用、已修好、可上传 |
| L2 | `test <src> <iface>` 单接口 | 某接口真实通/断（须带真实上游返回值） | 全链稳定、可发布 |
| L3 | `evaluate <src>` 全流程 | 首页→一级→二级→播放→搜索串联评分 | 站点长期稳定 |

**结论必须带等级**，例"L2 显示 detail 通、play 断"，不要说成"整个源不通"。单接口测试必须用上游真实返回值（category→vod_id→detail→play_url），不要手推 ID。

**evaluate 丢分映射**：首页20+一级20丢 → `class_parse` 未命中；仅首页20丢 → `double` 不匹配；搜索10丢 → 已按源名后缀选默认词(漫画->海贼王/小说->修仙/短剧->离婚/音频->故事)，仍丢则换词查 `searchUrl`；二级25丢 → `detailUrl`/二级字典；播放25丢 → 先看 `test detail` 的 `play_url_diagnosis`：detail 有数据但 `vod_play_url` 空属二级选择器/detailUrl 问题(非 play 层)，按 hint 修二级；仅当 detail 完整且 play 真失败才转 Playwright 嗅探。常见误判：detail 返回列表项(只有 vod_id/vod_name/vod_pic)而非完整详情 = 缺 `detailUrl`。

## 播放调试（Playwright 复用指引）

CLI 提供 `test <src> play`、`iframe <url>`、`fetch <url>`。**浏览器嗅探能力不在 CLI 内**——需要嗅探 JS 运行时生成的 m3u8/签名时，使用你已连接的 **Playwright MCP**：

1. `browser_navigate(play_url)` 打开播放页
2. `browser_network_requests(filter='m3u8|mp4|api|play|url')` 看运行时请求
3. 需点播放按钮则 `browser_snapshot` 找按钮→点击→再看网络
4. 提取真实媒体 URL 或签名 API，回写 lazy

lazy 三类型：**common_lazy**（播放页有 player_* JSON，先查 encrypt）/ **def_lazy**（`{parse:1,url:input}` 嗅探）/ **cj_lazy**（parse_url）。**假通过识别**：`play` success≠真实可播，返回 url 仍是 play.html/API/普通页时继续验扩展名/content-type/网络请求。

## 仓库发布守门

上传前必跑：`house verify` + `syntax` + `validate` + 源 metadata 自洽。给出 **A/B/C 档 + L1/L2/L3 证据**：
- **A 建议上传**：至少 L2，最终版/自主要求 L3=100
- **B 技术可传不建议**：L1/L2，用户坚持才传
- **C 暂不传**：触红线（语法错/结构无效/metadata 不一致/详情空/播放假通过/特殊内容无对应协议）

**上传**：`house upload <path> --tags <逗号分隔> --is-public true --auto-replace true`（默认同名自动替换）。上传后 `house info <cid>` 核验 file_id/cid/tags/is_public 一致。

**标签规则**：不脑补、不因文件名带 `[优]` 就加 `优`，严格按用户明确要求；用户没说则从简。

## 强约束 / 停手边界

- **坏站/反爬/缺凭据** → 停手回报，不绕过（`broken_site`/`hard_anti_bot`/`missing_credentials`）。
- **高风险重写**（模板改全 async、删大段规则、引签名/登录态）→ 必须先给方案等确认。
- **仓库 mutation**（upload/replace/tags/toggle）→ 必须 `house verify` + 目标确认 + `info` 核验。
- **DS 加密源**：用 `fs read`（自动解密），勿用 IDE Edit 直接改加密文件。
- **hipy 源改动**：改 `spider/py/*.py` 或 `base/spider.py` 后必须 kill `t4_daemon` 重载（daemon 缓存 module），否则改动不生效；ds/cat 改了直接生效无此问题。见 `references-multi-engine-sources.md`。
- **大改确认点**：删手写规则、改 detail 线路逻辑、跨多 flag 的 lazy 重写 → 停手确认。
- **路径安全**：所有文件操作限定在 drpy-node 项目内（isSafePath 强制）。

## 自主全流程 handoff packet

当用户要求"自动完成/修到100/做源并上传"时，贯穿建→修→测→传全程：

```text
autonomous: true
target_score: 100
upload_preauthorized: true/false
tags/is_public: 用户明确值或空
source_name/path: ...
blocker_type: none/broken_site/hard_anti_bot/missing_credentials/high_risk_change/ambiguous_upload/score_below_target/detail_unstable
autonomous_next: continue_evaluate/return_workflow/stop_for_user
```

自主循环：`alive check → 建源 → L1/L2/L3 → 按丢分最小修复 → play（detail 稳定时）→ L3=100 → house upload → info 核验`。低风险不停手只记录；遇 high_risk/目标歧义/凭据缺失必须停手确认。

## CLI 速查（高频；完整清单见 references-cli-commands.md）

```bash
node cli.js [--root <path>] doctor                          # 自检(含网关概览)
node cli.js gateway add|list|use|test|remove <..>           # 多网关管理(见网关章节)
node cli.js src list                                        # 列源
node cli.js fetch <url> [--method POST --header k=v --data] # 抓取(用 drpy req)
node cli.js analyze <url> | guess <url>                     # 清洗DOM | 探模板
node cli.js debug --rule 'a&&href' --mode pdfh --url <url>  # 规则调试(pdfa/pdfh/pd)
node cli.js fs read <path> | fs write <path> --content ...  # 读写(.js自动DS解密; --target 远程)
node cli.js fs edit <path> replace_text --search .. --replacement ..  # 编辑(JS语法校验)
node cli.js syntax <path> | validate <path> | resolved <path>
node cli.js test <src> <home|category|detail|search|play> [--class-id/--ids/--keyword/--play-url/--flag --ext]
node cli.js evaluate <src> [--keyword 斗罗大陆]              # 全流程评分(满分100; 远程打远端运行时)
node cli.js house verify | house upload <path> --tags .. | house info <cid>
```

参数约定：位置参数在前，flags 在后（`--flag value` / `--flag=value` / `--header k=v` 可重复）。大文本用 `--content-file` 或 stdin。

## 测试实战陷阱（真实踩坑，先读再测）

1. **`test category --ext` 必须 Base64 编码的 JSON，明文会静默失效**（最高频坑）。引擎对 `ext` 参数做 `JSON.parse(base64Decode(ext))`，明文 JSON 解析失败后**静默回退空筛选**——返回 `success:true` + 正常条数的**默认列表**，看起来一切正常，极易误判成「源的筛选坏了」。正确姿势与验证方法：
   ```bash
   B64=$(echo -n '{"itype":"1"}' | base64 -w0)
   node cli.js test <src> category --class-id tv --ext "$B64"
   ```
   **验证筛选生效必须对比 `first_item` 是否随 ext 变化**（无筛选基线先跑一次），只看 `success`/`item_count` 会被静默失效骗过。
2. **`data_preview`/`first_item` 是截断文本，禁止 `JSON.parse`**（见「输出读取」）。解析预览必炸；要结构化数据换姿势。
3. **`test home` 无法用于验证 filters 内容**：filters 是 preview 的大头，截断后 grep 不可靠。替代姿势：vm 加载源文件直接检查 `rule.filter`（明文对象可直接读；gzip 串先解压），或跑 `evaluate` 看首页评分。
4. **`debug-source.mjs` 不注入请求级 this 变量**（`MY_CATE`/`MY_PAGE`/`MY_FL` 桩里没有，只有 `requestHost`/`hostUrl`/`orId`）。适合调二级/lazy（依赖 input/orId）；**测一级筛选必失效**——源里 `this.MY_FL` 恒为 undefined，静默走默认分支。带筛选的一级测试一律用 `test category --ext`（base64）。
5. **CLI 输出可能混 ANSI 清屏序列**（Windows Git Bash 实测 ESC`[H`2J 前缀），解析前先清洗（命令见「输出读取」）。
6. **curl 直连服务端 `/api` 验证时必须带 `pwd`**：`.env` 配置了 `API_PWD` 时，无 pwd 请求返回 403 `{"error":"Forbidden: Invalid or missing pwd"}`——宽松解析（如 `j.list||[]`）会把 403 误判成「接口返回空列表」的假故障，白白排查半天（真实案例：误以为服务端引擎全挂，实际只是没带 pwd）。排查顺序：先确认鉴权（`grep API_PWD .env`），再怀疑数据。注意 `.env` 可能是 `KEY = value` **等号带空格**的写法，`grep ^KEY=` 匹配不上该行、`cut -d= -f2` 取出的值也带杂质，取值后务必 trim。带 pwd 后解析响应仍要先看 `error` 字段再读 `list`。
7. **debug-source.mjs 的 request 桩不支持 POST**（固定 GET 形态）：源方法内用 `request(url, {method:'POST', body})` 调接口的（如腾讯 PageService/getMVLPage 系），debug-source 下静默拿不到数据返回空——不是源坏了。POST 型源方法用 CLI `test`/`evaluate`（真实引擎链路）验证。

## Reference 使用规则

references/ 落地深度内容（建源清单/模板系统/async 陷阱/play lazy/上传决策/框架机制等）。主文件不重复 reference 内容，按「任务分派表」首读对应 reference。reference 不可达时不中断，按本文件内置规则最小排查并标注。
