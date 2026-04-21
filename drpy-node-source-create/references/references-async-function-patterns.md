# drpy async 函数通用模式与陷阱

> 适用范围：所有使用 `async function` 编写 推荐/一级/二级/搜索/lazy 的 DS 源，不分站型。
> 这些是 drpy 引擎的通用行为，不是某个站型的特殊经验。

---

## 1. `this.input` 是 URL，不是响应内容（最重要）

### 引擎行为
当 rule 定义了 `url`/`homeUrl`/`detailUrl`/`searchUrl`，引擎会：
1. 将模板中的占位符（`fyclass`/`fypage`/`fyid`/`**`）替换为实际值
2. 生成完整的 URL 字符串
3. 注入到 `this.input`

**引擎不会自动请求这个 URL。** `this.input` 是渲染后的 URL 字符串。

### ❌ 错误写法
```js
一级: async function () {
    let data = JSON.parse(this.input);  // 报错：Unexpected token 'h', "https://xx..." is not valid JSON
}
```

### ✅ 正确写法
```js
一级: async function () {
    let data = JSON.parse(await request(this.input));
}
```

### 各函数 this.input 的来源
| 函数 | this.input 来源 |
|---|---|
| 推荐 | `homeUrl` 渲染后的 URL |
| 一级 | `url` 渲染后的 URL（fyclass/fypage 已替换） |
| 二级 | `detailUrl` 渲染后的 URL（fyid 已替换） |
| 搜索 | `searchUrl` 渲染后的 URL（**/fypage 已替换） |
| lazy | 播放链接 URL |

### 验证方法
如果 `JSON.parse(this.input)` 报错包含 URL 片段，说明 this.input 是 URL 不是响应。

---

## 2. 纯数字 vod_id 必须设 `detailUrl`

### 问题描述
一级返回的 `vod_id` 是纯数字（如 `534735`），引擎需要知道怎么把它拼成详情页 URL。

### 解决方案
```js
detailUrl: '/api/videos/fyid'
```
引擎把 `fyid` 替换为 `534735`，生成 `https://example.com/api/videos/534735`。

### 适用场景
- 一级 API/HTML 返回的 vod_id 是纯数字
- 一级返回的 vod_id 是短路径片段（如 `abc123`），需要拼接完整 URL

### 强约束
**只要一级返回的 vod_id 不是完整的详情页 URL，就必须设 `detailUrl`。**
不设的话，二级函数的 `this.input` 可能无效，详情全部失败。

---

## 3. `request` POST 必须用 `body` 不是 `data`

### drpy 的 request 函数行为
- `body`：作为原始请求体发送（JSON 字符串）
- `data`：可能被转为 form-data 格式

### ❌ 错误写法
```js
await request(url, {
    method: 'POST',
    data: { q: keyword, limit: 20 },  // 会被当成 form-data
    headers: { 'Content-Type': 'application/json' }
});
```

### ✅ 正确写法
```js
await request(url, {
    method: 'POST',
    body: JSON.stringify({ q: keyword, limit: 20 }),  // JSON body
    headers: { 'Content-Type': 'application/json' }
});
```

### 适用场景
任何需要 POST JSON 的场景，包括：
- 搜索接口（MeiliSearch、ElasticSearch 等）
- 签名接口（需要 POST JSON 参数）
- 自定义 API 调用

---

## 4. `searchUrl` 必须带 `**` 才能注入 `this.KEY`

### 引擎行为
`**` 是搜索关键词的占位符。不带 `**`，引擎不会注入 `this.KEY`。

### ✅ 正确
```js
searchUrl: '/api/search?q=**&page=fypage'
```
→ 搜索"斗罗"时，`this.KEY` = `"斗罗"`

### ❌ 错误
```js
searchUrl: '/api/search?page=fypage'
```
→ `this.KEY` 为空或 undefined

### 搜索 async 函数中可用的变量
| 变量 | 含义 |
|---|---|
| `this.KEY` | 搜索关键词 |
| `this.MY_PAGE` | 页码 |
| `this.input` | searchUrl 渲染后的完整 URL |

---

## 5. 推荐（首页）要完整聚合所有数据源

### 常见错误
只取 API 返回的 `data.featured`（5条），忽略其他推荐数据。

### 正确做法
完整分析首页 API/HTML 的响应结构，聚合所有推荐维度：
- 精选/置顶（featured/pinned）
- 最新更新（latest/recent）
- 热门趋势（trending/hot）
- 各分类推荐（categories/videos）

### 去重
按 `vod_id` 去重，避免精选和热门的交叉重复。

```js
let added = {};
function addVod(v) {
    let id = String(v.vod_id);
    if (!added[id]) {
        added[id] = true;
        items.push({ vod_name: v.vod_name, /* ... */ vod_id: id });
    }
}
```

---

## 6. async 函数用 `this.input` 拿 URL，不要手动拼

### ❌ 啰嗦
```js
一级: async function () {
    let {HOST, MY_CATE, MY_PAGE} = this;
    let url = HOST + '/api/categories/' + MY_CATE + '/videos?page=' + MY_PAGE + '&limit=24';
    let data = JSON.parse(await request(url));
}
```

### ✅ 简洁
```js
// url: '/api/categories/fyclass/videos?page=fypage&limit=24' 已在 rule 中定义
一级: async function () {
    let data = JSON.parse(await request(this.input));
}
```

### 原因
`url`/`homeUrl`/`detailUrl`/`searchUrl` 已经定义了模板，引擎会自动替换占位符生成完整 URL。
在 async 函数里再手动拼 URL 等于重复劳动。

### 例外
只有以下情况需要手动拼 URL：
- `class_parse`：没有 URL 模板，需要自己拼 `HOST + '/api/categories'`
- 搜索函数需要请求外部搜索服务（不同于主站的 API）

---

## 7. 不要在 rule 对象中写重复同名属性

### ❌ 错误
```js
var rule = {
    lazy: '',                           // 空占位
    // ... 中间大量代码 ...
    lazy: async function () { ... }     // 真正的逻辑
};
```

JS 对象同名属性后者覆盖前者，虽然功能不受影响，但：
- 代码不规范，容易被误认为 bug
- review 时浪费排查时间

### ✅ 正确
只保留真正有逻辑的那一个，删掉空占位。

---

## 8. 外部 API 可能需要额外 Header

### 场景
搜索服务可能不在主站域名下（如 MeiliSearch、ElasticSearch），需要：
- `Authorization: Bearer xxx`
- 特殊的 `Origin`/`Referer`

### 获取方式
从浏览器 Network 面板抓取，不能靠猜测。

### 验证
用 `fetch_spider_url` 直接请求外部 API，如果返回 401/403，说明需要额外认证。

---

## 排障速查表

| 症状 | 优先检查 | 适用站型 |
|---|---|---|
| `JSON.parse` 报 URL 不是 JSON | `this.input` 是 URL 不是响应 | 所有 |
| 二级全部为空 | `detailUrl` 是否设置了占位符 | 所有 |
| 搜索始终空但没报错 | 1. `searchUrl` 带 `**` 2. POST 用 `body` 3. Authorization | 所有 |
| 推荐只有几条 | 是否只取了一个推荐字段 | 所有 |
| POST 请求服务端不认 | `data` 改成 `body: JSON.stringify(...)` | 所有 |
| async 函数拿不到数据 | 先 `log(typeof this.input)` 确认类型 | 所有 |
