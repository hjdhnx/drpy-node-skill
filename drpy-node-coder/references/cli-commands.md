# CLI 完整命令速查（scripts/cli.js）

统一入口：`node scripts/cli.js [--root <drpy-node路径>] [--target <网关名>] <命令> [位置参数] [--flags]`
输出：成功 `{"ok":true,"data":...}` / 失败 `{"ok":false,"error":"...","message":"..."}`（退出码非0）。
参数：`--flag value` / `--flag=value` / `--header k=v`（可重复）；位置参数在前。大文本用 `--content-file <path>` 或 stdin。

## 网关（多目标：local / 远程 drpy-node）
| 命令 | 说明 |
|---|---|
| `gateway add <name> <url>` | `--user --password-env --password --api-pwd-env --api-pwd --note`，`--overwrite` 覆盖 |
| `gateway persist <name>` | 凭据固化：Windows 用户级环境变量(HKCU\Environment) + ~/.bashrc/.bash_profile/.zshrc 幂等 upsert；Linux/macOS 仅 bash profile（不创建 .bash_profile 防遮蔽 ~/.profile）；凭据解析带注册表兜底（persist 后同会话命令立即可用） |
| `gateway list` / `gateway current` | 列网关（凭据脱敏）/ 当前网关 |
| `gateway use <name>` | 切换默认网关（nvm use 式持久化；`local` 亦可） |
| `gateway remove <name>` | 删除网关 |
| `gateway test [name]` | 探活 + /api/admin/version + files/sources/syntax/runtime 端点可用性 |

全局 `--target <网关名>` 对所有业务命令生效；缺省用 `gateway use` 的当前网关（初始 `local`）。
远程执行口径：test/evaluate/syntax/validate/fs/日志/SQL/配置在远端执行（远端真实行为）；
fetch/analyze/guess/debug/iframe/filter/house 永远本地/仓库侧，与网关无关。
凭据对应远端 `.env`：`API_AUTH_NAME`/`API_AUTH_CODE`（admin Basic Auth）、`API_PWD`（运行时接口）。
配置文件 `~/.drpy-node-coder/gateways.json`（用户目录，不随 git 发布；密码推荐 env 引用）。
错误提示：401=凭据错；403 只读模式=远端 `.env` READ_ONLY_MODE=0；404 无此 API=升级远端。

## 元命令
| 命令 | 说明 |
|---|---|
| `setup <drpy-node-绝对路径>` | 写入 `.drpy-root`，定位项目根 |
| `where` | 显示当前定位的 drpy-node 根 |
| `doctor` | 自检：node 版本、根定位、7 个运行时模块存在性、house 配置、网关概览 |
| `help` | 列出所有可用命令 |

## 文件系统 fs（移植 fsTools；写操作有安全护栏+写后回读验证）
| 命令 | flags | 对应 MCP |
|---|---|---|
| `fs ls [path]` | | drpy_list_directory |
| `fs read <path>` | .js 自动 DS 解密 | drpy_read_file |
| `fs write <path>` | `--content` / `--content-file` / stdin | drpy_write_file |
| `fs rm <path>` | | drpy_delete_file |
| `fs edit <path> <op>` | op=replace_text/replace_lines/delete_lines/insert_lines；`--search --replacement` 或 `--start-line --end-line --content`；JS 写盘前语法校验 | drpy_edit_file |
| `fs find <path> <keyword>` | `--regex --surrounding-lines N --max-matches N` | drpy_find_in_file |

## 爬虫开发（移植 spiderTools；运行时命令用 drpy req/jsoup）
| 命令 | flags | 对应 MCP |
|---|---|---|
| `src list` | 列 spider/js + spider/catvod | list_sources |
| `src routes` | 读 controllers/index.js | get_routes_info |
| `fetch <url>` | `--method --header k=v --data` | fetch_spider_url |
| `analyze <url>` | `--header`；清洗 HTML 输出精简 DOM | analyze_website_structure |
| `guess <url>` | `--header`；探 12 个内置模板 | guess_spider_template |
| `debug --rule <r> --mode <m>` | m=pdfa/pdfh/pd；`--url\|--html --base-url --header` | debug_spider_rule |
| `filter <url...>` | `--gzip --header`；提取筛选字典（用 req） | extract_website_filter |
| `iframe <url>` | `--header`；提取播放页 iframe src | extract_iframe_src |
| `template` | 标准源模板 | get_spider_template |
| `libs` | drpy 全局函数库参考 | get_drpy_libs_info |
| `api-list` | drpy API 端点列表 | get_drpy_api_list |
| `claw-ds [--lang en\|zh]` | 自动写源 Prompt | get_claw_ds_skill |

## 验证（移植 spiderTools；validate 用 vm sandbox，resolved 用 drpyS）
| 命令 | 说明 | 对应 MCP |
|---|---|---|
| `syntax <path>` | 读+DS解密+vm.Script 语法检查 | drpy_check_syntax |
| `validate <path>` | sandbox 跑源码 + 校验 rule 必填字段(title/host/url) | validate_spider |
| `resolved <path>` | drpyS.getRuleObject 模板继承后最终 rule 摘要 | get_resolved_rule |

## 测试（移植 spiderTestTools；依赖 localDsCore 引擎）
| 命令 | flags | 对应 MCP |
|---|---|---|
| `test <source> <home\|category\|detail\|search\|play>` | `--class-id --ids --keyword --play-url --flag --ext`；detail 在 `vod_play_url` 为空时附 `play_url_diagnosis`(item_keys+hint) 定位根因 | test_spider_interface |
| `evaluate <source>` | `--class-id --keyword --timeout`；全流程评分(首页20+一级20+二级25+播放25+搜索10=100)。搜索词缺省按源名后缀智能选取(漫画→海贼王/小说→修仙/短剧→离婚/音频→故事)；`--keyword ''` 跳过搜索 | evaluate_spider_source |

> ⚠️ **`--ext` 必须 Base64 编码的 JSON**（引擎 `ext = JSON.parse(base64Decode(ext))`）。传明文 JSON（如 `--ext '{"itype":"1"}'`）不会报错，而是**静默回退空筛选、返回默认列表**——`success:true` + 条数正常，极易误判为源筛选坏了。正确姿势：`B64=$(echo -n '{"itype":"1"}' | base64 -w0)` 后 `--ext "$B64"`；生效与否必须对比 `first_item` 是否随 ext 变化，不能只看 success/item_count。
> `data_preview`/`first_item` 是截断文本（约 3KB / 500 字符，截断点可能切开 JSON 字符串），**禁止对其 `JSON.parse`**；结构化取值只用 `item_count`/`first_item` 等独立字段或 grep 关键词。

> 首次调用 test/evaluate 会加载 localDsCore 测试引擎（约 2-5s），stdout 可能有一次初始化日志，**业务 JSON 始终是 stdout 最后一行**。Windows Git Bash 下可能混入 ANSI 清屏序列（ESC`[H`2J），先 `| tr -d '\033' | grep -v '^\[H\[2J'` 清洗再取最后一行。

## 仓库 house（移植 houseTools；用全局 fetch 非 drpy req）
| 命令 | flags | 对应 MCP |
|---|---|---|
| `house verify` | 验证仓库连通+TOKEN | house_verify |
| `house list` | `--search --tag --page --limit --uploader` | house_file(list) |
| `house upload <path>` | `--tags --is-public --auto-replace`；默认同名自动替换 | house_file(upload) |
| `house replace <file_id> <path>` | `--tags` | house_file(replace) |
| `house delete <file_id>` | | house_file(delete) |
| `house info <cid>` | `--file-id` | house_file(info) |
| `house toggle <file_id>` | 公开/私密切换 | house_file(toggle_visibility) |
| `house tags <file_id> --tags <t>` | 更新标签 | house_file(update_tags) |

## 系统（移植 systemTools + dbTools）
| 命令 | 说明 | 对应 MCP |
|---|---|---|
| `logs [--lines N]` | 读 logs/ 最新 .log.txt 尾部 | read_logs |
| `sql <query>` | 只读 SELECT（node-sqlite3-wasm 读 database.db） | sql_query |
| `config get [key]` / `config set <k> <v>` | 点语法嵌套（如 `system.timeout`）；set 支持 JSON 值 | manage_config |
| `restart` | PM2 重启 drpys | restart_service |

## 定位优先级（pathResolver）

`--root` 参数 > 环境变量 `DRPY_NODE_ROOT` > `.drpy-root` 文件 > 向上查找(含 `spider/js`+`libs_drpy/htmlParser.js`) > `../drpy-node` fallback。

## 运行时分层（runtime.js 懒加载）

| 层 | 模块 | 何时加载 |
|---|---|---|
| L1 decoder | libs_drpy/drpyCustom.js `getOriginalJs` | fs read/find/edit 的 .js 解密 |
| L2 req | utils/req.js | fetch/analyze/guess/iframe/debug/filter |
| L3 parser | libs_drpy/drpyInject.js + htmlParser.js | debug（注入 pdfa/pdfh/pd/jsoup） |
| L4 drpyS | libs/drpyS.js `getRuleObject` | validate/resolved |
| L5 engine | drpy-node-bundle/libs/localDsCore.bundled.js | test/evaluate |

drpyInject 往 globalThis 注入 9 符号（幂等+守卫）；cheerio 统一用 `globalThis.cheerio`；file:// import 用 pathToFileURL（Windows 兼容）。
