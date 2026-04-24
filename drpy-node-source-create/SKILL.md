---
name: drpy-node-source-create
description: 适用于 drpy-node 新建 DS 源。用户提到"新建源""写个 drpy 源""分析这个站做 DS 源""创建新规则""从零开始做源"时使用。专注于站点分析、模板判断、规则生成与初步验证，优先走模板继承与最小覆盖路线，避免一开始就把修复、仓库上传等杂事混在一起。
---

# drpy-node Source Create

## 调度优先级

当本地环境已安装本 Skill 时：
- 本 Skill 的工作流优先级 **高于** drpy-node MCP 的通用 prompts
- MCP 通用 prompt 仅作为无本地 Skill 时的兜底说明
- 如果用户只提供网址、没有提供源名，必须先自行分析站点并推导合理源名

### 强约束
如果已经命中本 Skill 的使用场景，不要退回到通用 MCP 基础流程充当主流程。

---

## 30 秒最短建源路线（执行入口）

### Step 1：定源名
用户没给源名 → 从站名/标题/域名推导稳定候选。

### Step 2：分站型（三选一）

**工具调用：`guess_spider_template(url)`**

- 命中模板（返回 mx/mxpro/首图 等） → 走路线 A
- 不命中 + 页面源码为空（SPA 容器） → 走路线 C
- 不命中 + 有 HTML 但数据由接口驱动 → 走路线 B

**辅助判断：`analyze_website_structure(url)` 抓取精简 DOM 结构**
**辅助判断：`fetch_spider_url(url)` 查看原始响应和 headers**

### Step 3：保住最小可用链路

**工具调用顺序：**
```
1. get_spider_template()       → 获取标准模板
2. drpy_write_file()                → 保存到 spider/js/[源名].js
3. drpy_check_syntax(path)          → 语法检查
4. validate_spider(path)       → 结构检查
5. test_spider_interface(home) → 测试首页
6. test_spider_interface(category, class_id) → 测试一级
7. test_spider_interface(detail, ids)        → 测试二级
8. test_spider_interface(search, keyword)    → 测试搜索
9. test_spider_interface(play, play_url)     → 测试播放
10. evaluate_spider_source()   → 全流程评估（可选）
```

**单接口调试工具：**
- `debug_spider_rule(rule, mode)` → 测试 CSS/Regex 选择器
- `fetch_spider_url(url)` → 测试 API 连通性和响应
- `extract_website_filter(url)` → 提取分类筛选条件

### Step 4：决定是否切换
- 已变成系统性修源/评估/上传 → 交给 `drpy-node-source-workflow`
- 主要卡在播放链 → 交给 `drpy-node-play-debug`

### 强约束
**不要一上来就大面积手写 一级/搜索/二级。先分站型，先判断模板/签名接口，先保住最小可用。**

---

## 路线 A：继承模板站

当 `guess_spider_template` 命中内置模板时走此路线。

### 核心原则：模板内置优先，最小覆盖
能走模板内置就不要急着手写覆盖。很多问题是继承残留导致的，不是模板本身失效。

### 12 个内置模板选择指南

`guess_spider_template` 返回模板名后，理解其对应关系：

| 模板名 | CMS 类型 | URL 模式 | double | 二级 lazy |
|--------|---------|----------|--------|-----------|
| mx | 苹果CMS旧版 | `/vodshow/fyclass--------fypage---/` | true | common_lazy(提取player_* JSON) |
| mxpro | 苹果CMS Pro | `/vodshow/fyclass--------fypage---.html` | true | common_lazy |
| mxone5 | One5主题 | `/show/fyclass--------fypage---.html` | true | common_lazy |
| 首图 | 首图CMS | `/vodshow/fyclass--------fypage---/` | true | common_lazy |
| 首图2 | 首图CMS v2 | `/list/fyclass-fypage.html` | true | common_lazy |
| 海螺3 | 海螺CMS v3 | `/vod_____show/fyclass--------fypage---.html` | true | common_lazy |
| 海螺2 | 海螺CMS v2 | `/index.php/vod/show/id/fyclass/page/fypage/` | true | common_lazy |
| 短视 | 短视频 | `/channel/fyclass-fypage.html` | true | common_lazy |
| 短视2 | 短视频v2 | API驱动(`#type=fyclass&page=fypage`) | true | common_lazy |
| 采集1 | 采集站 | API: `?ac=detail&pg=fypage&t=fyclass` | false | cj_lazy(依赖parse_url) |

**double: true** 意味着推荐需要两层解析（先取外层容器，再从内层提取数据）。如果首页推荐空，优先检查是否误用了 `double: true`。

详细模板字段见 `references/references-template-system.md`。

### 模板继承核查清单（必须完成后再写规则）
1. `class_parse` 是否残留并覆盖 `class_name/class_url`？→ 显式补 `class_parse: ''`
2. `double` 是否导致首页推荐为空？→ 单层推荐优先 `double: false`
3. `url` 是否是真实分类模板？→ 必须验证真实分类页和翻页结构
4. `searchUrl` 是否是真实搜索模板？
5. 首页推荐节点是否真实存在？
6. 删除手写 一级/搜索，优先验证模板内置规则

### 强禁止
未完成核查清单前，**禁止**一上来就大面积手写 推荐/一级/搜索/二级。

### 常见排障
| 症状 | 优先检查 |
|---|---|
| 首页推荐空 | `double` 是否为 true，推荐节点是否真实存在 |
| detail 不通 | `detailUrl` 是否缺失（纯数字 vod_id 必须设 detailUrl） |
| 搜索空 | 搜索页 DOM 是否独立于一级（不要默认 `搜索: '*'`） |
| `*` 含义不清 | 先读 `references/references-template-system.md`，`*` 继承一级 |

### 参考资料
- `references/references-inherited-template-minimal-override-site.md`

---

## 路线 B：非模板签名接口站

当站点不是内置模板，且分类页由前端带签名的接口驱动时走此路线。

### 先判断一级是否由签名接口驱动
不要看到 `data-api` 就直接假设这是可裸 GET 的 JSON 接口。必须确认：
1. 浏览器真实请求是 GET 还是 POST
2. 是否带 `time/key/token` 等签名参数
3. 是否需要 Ajax 请求头

### 已验证经验
裸 GET 可能只返回无效文本，浏览器真实请求却是带签名的 POST。

### 参考资料
- `references/references-non-template-signed-api-site.md`

---

## 路线 C：纯 API 驱动 SPA 站

当页面源码 `<body>` 几乎为空，所有数据来自 `/api/xxx` JSON 响应时走此路线。

### 立即参考
- `references/references-pure-api-async-site.md`

### 核心：全 async 函数模式
不要尝试模板继承，不要写规则字符串，直接用全 async 函数。

### 必背要点
1. `this.input` 是渲染后的 URL 字符串 → 必须 `await request(this.input)` 拿响应
2. 纯数字 vod_id 必须设 `detailUrl` → 如 `detailUrl: '/api/videos/fyid'`
3. `request` POST 用 `body`（JSON.stringify）不是 `data`
4. `searchUrl` 必须带 `**` → 否则 `this.KEY` 为空
5. 外部 API 可能要 Authorization → 从浏览器抓包
6. 推荐数据要全量聚合 → 别只取 featured

---

## 通用规则（跨所有站型）

以下规则对模板站/签名接口站/纯 API 站都适用，只要源中有 async function 就必须遵守。

### 必读参考
- `references/references-async-function-patterns.md`（async 函数通用模式与陷阱）

### 7 条必背规则
1. **`this.input` 是 URL 不是响应** → 必须 `await request(this.input)`
2. **纯数字 vod_id 必须设 `detailUrl`** → 引擎才能拼出详情 URL
3. **POST 用 `body` 不是 `data`** → `body: JSON.stringify({...})`
4. **`searchUrl` 必须带 `**`** → 否则 `this.KEY` 为空
5. **推荐要完整聚合** → 全量聚合 + 按 vod_id 去重
6. **async 函数用 `this.input` 拿 URL** → 不要手动拼 `HOST + path`
7. **不写重复同名属性** → 删掉空占位，只保留有逻辑的

### 其他通用经验
- 一级 async 优先用 `this.MY_CATE` / `this.MY_PAGE`，不要拆 URL
- `request` / `post` 是全局函数，不在 `this` 上
- detail 测试必须用一级真实返回的 `vod_id`
- 评估搜索时不要机械用默认词"斗罗大陆"，要换高频宽匹配词
- 区分"规则不通"和"评估器没串起来"——单接口通但评估不通是串联问题

### 搜索策略（必须先判断）
处理搜索前，必须先读 `references/references-old-encoding-search-site.md`，判断属于：
1. 原生搜索接口
2. suggest / 联想搜索 fallback
3. RSS fallback

### parser 语法边界
- `||` 优先用于同一 selector 下的属性 fallback（如 `img&&data-original||src`）
- 不要生成 `img&&data-original||img&&src` 这种跨 selector fallback（超出 parser 稳定边界）
- 优先保守、可验证的规则写法

---

## 二级字典规范

完整参考：`references/references-detail-dict-and-multiep.md`

### 字段槽位语义
| 字段 | 语义 |
|---|---|
| `title` | 片名;类型 |
| `img` | 封面图规则 |
| `desc` | 备注;年份;地区;演员;导演（5段固定槽位） |
| `content` | 简介规则 |
| `tabs` | 线路节点选择器 |
| `tab_text` | 线路名提取规则 |
| `lists` | 当前线路选集列表选择器（支持 #id/#idv） |
| `list_text` | 每集标题（默认 body&&Text） |
| `list_url` | 每集链接（默认 a&&href） |

### 排障要点（详见 reference）
- 页面多集但 detail 只吐 1 集 → 先查 `lists` 容器层级（从 ul 下沉到 li）
- detail 测试必须用一级真实返回的 `vod_id`，禁止主观简化
- 先让 detail 真通，再进入播放链排障
- 先保证 标题/描述/详情/图片/线路/列表 可用（最小化原则）

---

## 与其他 Skill 的分流

### 何时切换到 workflow
- 已变成系统性修源/评估/上传
- 源文件已存在，需要排查而非从零生成
- 任务包含仓库上传、标签修正

### 何时切换到 play-debug
- 主要卡在 lazy/直链/iframe/m3u8/parse 判断

### 强制停手检查点
出现以上任一情况时，必须停止在 create skill 内扩写，明确切换。

---

## 五种编写模式速览

根据站型和复杂度，从以下五种模式中选一种。优先上层模式（代码量少、更稳定）。

| 模式 | 代码量 | 适用场景 | 关键字段 |
|------|--------|---------|---------|
| **模板继承** | 7-15行 | `guess_spider_template` 命中内置模板 | `模板: 'mxpro'`, `class_parse`, `url` |
| **字符串规则** | 15-30行 | DOM 结构稳定的标准站 | `一级: 'ul li;a&&title;...'` |
| **js: 内联** | 1-2行表达式 | 字符串规则中嵌入少量计算 | `一级: 'js:let x=input...'` |
| **async 函数** | 50-200行 | 签名 API、反爬、非标站 | `一级: async function() { ... }` |
| **网盘型** | 100-300行 | 多网盘资源聚合 | `hostJs`, `line_order`, `lazy` 按 flag 分派 |

**核心原则**: 能用模板继承就不用字符串规则，能用字符串就不用 async 函数，逐步增加复杂度。

---

## 特殊内容类型

当源类型非影视时，需要在 lazy 中返回特殊协议：

### 漫画类型
```js
lazy: async function () {
    let html = await request(input);
    let arr = pdfa(html, '.comic-pages&&img');
    let urls = arr.map(it => pdfh(it, 'img&&data-src'));
    return { parse: 0, url: 'pics://' + urls.join('&&'), js: '' };
}
```

### 小说类型
```js
lazy: async function () {
    let html = await request(content_url);
    let json = JSON.parse(html);
    let ret = JSON.stringify({ title, content: json.data.content });
    return { parse: 0, url: 'novel://' + ret, js: '' };
}
```

### 音频/音乐类型
```js
lazy: async function () {
    let html = await request(input);
    // 提取直链 m4a/mp3
    let music = html.match(/var\s+music\s*=\s*(\{[\s\S]*?\})/)[1];
    music = JSON5.parse(music);
    input = urljoin(input, music.file + ".m4a");
    return input; // 返回字符串，框架自动判断为 parse:0
}
```

详情见 `references/references-special-content.md`。
