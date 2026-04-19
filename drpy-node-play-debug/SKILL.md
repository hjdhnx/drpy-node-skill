---
name: drpy-node-play-debug
description: 适用于 drpy-node 源的播放链路排查与 lazy 修复。用户提到“播放不通”“lazy 不对”“是不是直链”“play.html 被当直链”“iframe 提取”“m3u8 提取”“parse:0/1 判断”“假播放”“站外解析”时使用。专注于判断播放结果是否真实可播，并优先修复 lazy 逻辑。
---

# drpy-node Play Debug

## 调度优先级（新增强规则）

当本地环境已安装本 Skill 时：

- 本 Skill 的优先级 **高于** drpy-node MCP 的通用调试 prompt
- 通用 MCP 调试流程仅作无本地 Skill 时的兜底说明
- 播放链排障必须优先按本 Skill 的判断顺序执行，而不是先按通用 prompt 线性试错

---

## 与其他 drpy-node skills 的边界（新增）

### 本 Skill 负责什么
- 判断播放结果是否真实可播
- 修复 lazy 逻辑
- 判断 `parse:0/1`、`jx:0/1` 是否合理
- 提取 iframe / m3u8 / 站外解析链接

### 本 Skill 不负责什么
- 不负责从零写完整源
- 不负责系统性重建首页/一级/二级规则
- 不负责仓库上传决策

### 何时交回 `drpy-node-source-workflow`
如果问题已经不只是播放链，而是：
- 一级/二级/搜索也同时异常
- 自动评估整体很差，需要重新分流
- 需要决定是否上传 / 替换 / 回滚

则应交回总控 workflow，不要在 play-debug 内越权扩散。

### 强制暂停检查点（新增）
出现以下任一情况时，必须暂停继续深挖 lazy，并明确改为交回 workflow：
- `detail` 还没稳定产出 `vod_play_from / vod_play_url`
- 当前问题已明显超出播放链，开始涉及首页 / 一级 / 搜索整体重建
- 用户目标已经变成“评估整份源是否可用 / 是否该上传”

**禁止**在这些前提不满足时，继续把问题硬解释成单纯的 lazy 故障。

---

## 新增强规则：播放链排障前，搜索处理也要分层理解
## 30 秒速查决策树（新增）

当用户一上来就说“播放不通 / lazy 不对 / play.html 被当直链”时，优先按下面顺序快速判断：

1. **先看是不是该交回 workflow**
   - 如果一级 / 二级 / 搜索也同时异常 → 不要继续在 play-debug 里深挖，先交回 `drpy-node-source-workflow`
2. **先确认 detail 真通**
   - 没有稳定产出 `vod_play_from / vod_play_url` → 先不要判 lazy
3. **再判断当前返回属于哪一类**
   - 直链媒体：`m3u8/mp4/m4a/mp3`
   - 站外解析链接
   - 网站播放页本身（如 `play.html` / 当前站播放页）
4. **最后才决定 `parse/jx`**
   - 直链媒体 → `parse:0, jx:0`
   - 站外解析链接 → `parse:0, jx:1`
   - 网站播放页本身 → 常见为 `parse:1, url:input`

### 强提醒
**不要把“拿到一个 http 链接”直接等同于“拿到直链”。**
也不要把 `play.html` 一概判错，先判断它是不是该站模板默认的 `def_lazy` 风格。

---


如果任务同时涉及搜索与播放，不要把“搜索能出几个结果”直接等同于“搜索已完整打通”。

在相关判断前，必须参考：
- `../drpy-node-source-workflow/references/references-search-strategies.md`

### 强提醒
- 原生搜索优先
- suggest / RSS 多数是验证码场景下的 fallback
- fallback 搜索通常不支持翻页

这条认知会影响你对整份源完成度的判断，但不应干扰你对播放链本身的排障。

---

## 新增 references：模板系统里的默认 lazy 逻辑

来源参考：
- `references/references-play-lazy-summary.md`

### 1. `common_lazy`
模板系统里的通用免嗅探 lazy 逻辑大致是：

```js
let html = await request(input);
let hconf = html.match(/r player_.*?=(.*?)</)[1];
let json = JSON5.parse(hconf);
let url = json.url;

if (json.encrypt == '1') {
  url = unescape(url);
} else if (json.encrypt == '2') {
  url = unescape(base64Decode(url));
}

if (/\.(m3u8|mp4|m4a|mp3)/.test(url)) {
  result = { parse: 0, jx: 0, url };
} else {
  result = url && url.startsWith('http') && tellIsJx(url)
    ? { parse: 0, jx: 1, url }
    : input;
}
```

#### 这意味着什么
- 模板默认会先抓播放页 HTML
- 然后解析 `player_*` 配置
- 会处理常见加密字段：
  - `encrypt == 1` → `unescape`
  - `encrypt == 2` → `base64Decode + unescape`
- 如果拿到的是直链媒体：
  - `m3u8/mp4/m4a/mp3`
  - 应返回：
    ```js
    { parse: 0, jx: 0, url }
    ```
- 如果拿到的是站外解析链接，且 `tellIsJx(url)` 为真：
  - 模板默认倾向：
    ```js
    { parse: 0, jx: 1, url }
    ```
- 如果都不是，模板可能直接回退为 `input`

---

### 2. `def_lazy`
模板系统默认嗅探 lazy：

```js
return { parse: 1, url: input, js: '' }
```

#### 这意味着什么
- 如果站点播放页本身可交给前端/外部解析器处理
- 默认就是：
  ```js
  parse: 1
  url: input
  ```
- 所以用户看到 `parse:1 + 网站播放页链接`，不一定是错，可能正是模板默认策略

---

### 3. `cj_lazy`
采集站 lazy 逻辑：
- 直链 `m3u8/mp4` → `parse:0`
- `parse_url` 以 `json:` 开头 → 先请求 JSON 解析接口再取 `json.url`
- 否则拼接 `rule.parse_url + input`

#### 这意味着什么
采集站排查时，不能只看最终 `url`，还要看：
- `rule.parse_url` 是否配置
- 是不是 `json:` 解析接口
- 返回 JSON 里是否真的有 `url`

---

## 播放排障时的强制判断顺序

### A. 先判断当前 lazy 更接近哪类模板默认逻辑
1. `common_lazy` 风格：
   - 播放页里有 `player_*` JSON
   - 可能有 `encrypt`
   - 可能需要解密 `json.url`
2. `def_lazy` 风格：
   - 站点播放页本身交给解析系统
   - 直接 `parse:1 + input`
3. `cj_lazy` 风格：
   - 采集站 / 解析接口 / JSON 解析链

---

### B. 再判断返回应该是直链还是解析页
#### 直链媒体
如果最终拿到的是：
- `m3u8`
- `mp4`
- `m4a`
- `mp3`

优先应返回：
```js
{ parse: 0, jx: 0, url }
```

#### 站外解析链接
如果最终拿到的是外部解析地址，而不是直链媒体：
```js
{ parse: 0, jx: 1, url }
```

#### 网站播放页本身
如果当前源策略就是把网站播放页交给解析系统：
```js
{ parse: 1, url: input }
```

---

## 新增强提醒

### 提醒 1
**不要把 `parse:1 + 网站播放页链接` 一概判成错。**
如果该站模板默认就是 `def_lazy` 风格，这可能是合理输出。

### 提醒 2
**不要把站外解析链接误判成直链。**
拿到 http 链接不等于拿到直链，先判断是不是 `m3u8/mp4` 等媒体文件。

### 提醒 3
**遇到 `player_*` 配置时，优先查 `encrypt`。**
很多站不是没链接，而是 `json.url` 还没解密。

### 提醒 4（新增）
**不要把规则越界写法先甩锅给引擎。**
如果播放链里的字段/规则写法超出 parser 明确支持边界，应先检查：
- 这是不是规范写法
- 模板/现有源是否这样写
- 是否应先修规则和说明，而不是直接要求引擎兼容

---

## 新增强规则：播放排障也遵循最小化原则

本 Skill 的默认目标不是把整份源补全到信息完美，而是：

1. 先确认 `detail` 真通
2. 先拿到真实 `vod_play_from / vod_play_url`
3. 先判断最终结果是：
   - 直链媒体
   - 站外解析链接
   - 网站播放页本身
4. 先给出正确的 `parse:0/1`、`jx:0/1` 判断

### 强约束
如果用户没有明确要求，不要在 play-debug 阶段顺带去补：
- 年份
- 地区
- 演员
- 导演
- 搜索字段美化

这些属于源整体完善项，应交回 create / workflow，而不是在播放排障里扩散。

---

## 新增硬规则：先确认 detail 真通，再判 lazy

在进入播放链排障前，必须先确认 `detail` 已经稳定产出：
- `vod_play_from`
- `vod_play_url`

如果二级详情仍然是默认占位、空线路、空列表，禁止直接把问题归因为 lazy。

### 排查顺序
1. 先确认 detail 测试使用的是一级真实返回的 `vod_id`
2. 再确认二级字典是否按引擎契约正确填写：
   - `tabs`
   - `tab_text`
   - `lists`
   - `list_text`
   - `list_url`
3. 只有在 `vod_play_from / vod_play_url` 已真实产出后，才进入 lazy / 播放页 / iframe / m3u8 的排障

---

## 新增提醒：fallback 搜索不等于完整原生搜索

如果一个源最终采用的是：
- suggest 搜索
- RSS 搜索

则在播放链排障或总控汇报时，必须明确：
- 这只是验证码场景下保住可用性的 fallback
- 通常不支持翻页
- 不能误判为完整原生搜索已经打通

- 读取模板默认 lazy 定义摘要
- 展示当前模板实际继承到的 lazy 类型

这样 AI 在判断 `parse:0/1/jx:0/1` 时，不会脱离模板默认上下文盲判。
