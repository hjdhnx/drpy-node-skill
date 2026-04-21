# 播放 lazy 模板默认逻辑摘要

> 来源：drpy-node 引擎模板系统中的内置 lazy 逻辑。
> 用于排查时判断当前源的 lazy 行为是否符合模板默认策略。

---

## 1. common_lazy（通用免嗅探）

模板系统通用免嗅探 lazy 的核心逻辑：

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

### 行为解读
| 条件 | 返回 | 说明 |
|---|---|---|
| 解析到 m3u8/mp4/m4a/mp3 | `{parse:0, jx:0, url}` | 直链，无需解析 |
| 解析到站外解析链接 + tellIsJx | `{parse:0, jx:1, url}` | 站外解析器处理 |
| 都不满足 | `input`（回退原链接） | 交给默认嗅探 |

### 加密处理
| encrypt 值 | 处理方式 |
|---|---|
| `'1'` | `unescape(url)` |
| `'2'` | `base64Decode(url)` → `unescape()` |

---

## 2. def_lazy（默认嗅探）

```js
return { parse: 1, url: input, js: '' }
```

### 行为解读
- 站点播放页本身交给前端/外部解析器处理
- `parse:1 + 网站播放页链接` 不一定是错，可能正是模板默认策略

---

## 3. cj_lazy（采集站）

### 逻辑
- 直链 m3u8/mp4 → `parse:0`
- `parse_url` 以 `json:` 开头 → 先请求 JSON 解析接口再取 `json.url`
- 否则拼接 `rule.parse_url + input`

### 排查要点
- 检查 `rule.parse_url` 是否配置
- 检查是否走 `json:` 解析接口
- 检查返回 JSON 里是否真的有 `url` 字段

---

## 快速判断对照表

| 播放页特征 | 推荐策略 |
|---|---|
| 页面有 `player_*` JSON 配置 | common_lazy：解析 player 配置 |
| 播放页直接交给解析系统 | def_lazy：`parse:1` |
| 采集站/解析接口 | cj_lazy：检查 parse_url |
