# drpy-node 三类典型站点开发经验总摘要

> 基于三轮完整案例沉淀：
> 1. **橘子动漫**：非模板站 + 一级签名接口 + suggest fallback + 二级 async + 原页面嗅探
> 2. **樱之空动漫**：继承模板站 + 最小覆盖 + `double:false` + `detailUrl` + 搜索页独立结构
> 3. **247看**：纯 API 驱动 SPA 站 + 全 async 函数 + MeiliSearch 搜索 + m3u8/平台混合播放

本摘要用于快速判断：面对新站时，应先归到哪一类，再使用对应参考。

---

## 一、先分站点类型，不要一开始就写规则

面对新站时，最重要的第一步不是写 `rule`，而是判断：

### A. 非模板站
特征：
- 模板识别不命中或命中很弱
- 页面结构与常见模板差异大
- 分类/搜索/详情/播放可能由自定义接口或 JS 驱动

参考：
- `references/references-non-template-signed-api-site.md`

### B. 继承模板站
特征：
- 明确命中 `mx / mxpro / 首图 / 首图2 ...`
- 页面结构仍遵循传统模板站常见 DOM 形态
- 很多问题不是“模板完全失效”，而是继承后的个别字段需要最小覆盖

参考：
- `references/references-inherited-template-minimal-override-site.md`

### C. 纯 API 驱动 SPA 站
特征：
- 模板识别不命中
- 页面源码 `<body>` 几乎为空（SPA 容器）
- 所有数据来自 `/api/xxx` 的 JSON 响应
- 无传统 HTML 列表 DOM

参考：
- `references/references-pure-api-async-site.md`

---

## 二、非模板站的核心方法论

对应案例：**橘子动漫**

### 关键判断
不要因为站点不是模板站，就把所有页面都当成 HTML 静态页。

### 最重要经验
1. **一级先判断是否由前端签名接口驱动**
   - 浏览器抓包确认真实请求
   - 不要把 `data-api` 误判成可裸 GET 的 JSON 接口

2. **签名接口先抠请求骨架，再验证公式**
   - 请求方式（GET/POST）
   - 请求头（Ajax headers）
   - 参数（time/key/token）
   - 本地 Python 验证 md5 / token 公式

3. **一级 async 优先使用引擎上下文变量**
   - `this.MY_CATE`
   - `this.MY_PAGE`
   - 不要先拆 URL

4. **`request/post` 是全局函数，不在 `this` 上**

5. **搜索要分层 fallback**
   - 原生搜索
   - suggest / 联想 JSON
   - RSS 兜底

6. **播放链不好啃时，先退回原页面嗅探保可用性**

---

## 三、纯 API 驱动 SPA 站的核心方法论

对应案例：**247看**

### 关键判断
页面源码为空不等于站点不可用。所有数据都在 JSON API 里，需要全 async 函数模式。

### 最重要经验
1. **`this.input` 是 URL 不是响应内容**
   - 必须自己 `await request(this.input)` 拿响应
   - 直接 `JSON.parse(this.input)` 会报错

2. **纯数字 vod_id 必须设 `detailUrl`**
   - 如 `detailUrl: '/api/videos/fyid'`
   - 否则引擎无法把纯数字映射成详情页 URL

3. **`request` POST 用 `body` 不是 `data`**
   - `body: JSON.stringify({...})` → JSON body ✅
   - `data: {...}` → form-data，服务端不认 ❌

4. **搜索 `searchUrl` 必须带 `**`**
   - 否则 `this.KEY` 为空，搜索无关键词
   - 外部搜索 API 可能需要 Authorization header

5. **推荐要全量聚合**
   - 不要只取 `featured`，要聚合所有推荐维度
   - 按 vod_id 去重

6. **不要重复写同名属性**
   - 如 `lazy: ''` 和 `lazy: async function()` 只保留一个

---

## 四、继承模板站的核心方法论

对应案例：**樱之空动漫**

### 关键判断
不要因为命中模板，就误以为所有页面结构都能直接继承成功。

### 最重要经验
1. **模板优先，最小覆盖**
   - 先确认模板继承链成立
   - 只覆盖真正失效的链路
   - 不要一上来推翻模板整份重写

2. **首页推荐空，优先检查 `double`**
   - 如果推荐节点真实存在
   - 且手写 `推荐` 已直接落到最终卡片层
   - `home.list` 仍为空时，优先尝试：
     ```js
     double: false
     ```

3. **detail 不通，优先检查 `detailUrl`**
   - 二级字典看起来没问题但 detail 仍返回兜底值时
   - 不要先怪二级字段，先补：
     ```js
     detailUrl
     ```

4. **搜索为空，优先检查搜索页 DOM 是否独立于一级**
   - 搜索页经常不是一级页结构的复用
   - 不要默认 `搜索: '*'` 一定成立
   - 常需要单独写 `搜索`

5. **播放不强求直链**
   - 若去掉自定义 `lazy` 后，引擎也不能自动得到更优结果
   - 就接受原页面嗅探

---

## 五、最常见的误判类型

### 误判 1：把非模板站的签名接口当成普通 `json:url`
后果：
- GET 返回无效文本
- category 兜底无数据
- 搜索/一级误判为 parser 问题

### 误判 2：把继承模板站的问题当成“模板完全没用”
后果：
- 过早整份 async 重写
- 丢掉模板内置能力
- 问题复杂度被人为放大

### 误判 3：把 detail 失败直接归因于二级字典错误
后果：
- 死抠 title/img/tabs/lists
- 却没看到根因只是缺 `detailUrl`

### 误判 4：把纯 API 站当成模板站或签名接口站
后果：
- 尝试模板继承路线 → 完全无效
- 尝试抓 HTML DOM → 页面源码为空
- 浪费大量时间在错误路线上

### 误判 5：把搜索空直接归因于 `searchUrl` 错误
后果：
- 忽略搜索页 DOM 与一级完全不同
- 一直沿用一级结构去写 `搜索`

---

## 六、实际开发顺序建议

### 第一步：分站型
先判断：
- 纯 API 驱动 SPA 站？（页面源码为空）
- 非模板签名接口站？
- 继承模板站？

### 第二步：先修主链，不先追求漂亮
主链优先级：
1. `category`
2. `detail`
3. `search`
4. `play`
5. `home 推荐`

> 说明：首页推荐虽然重要，但很多时候一级、二级、搜索、播放更能决定“这个源是否可用”。

### 第三步：最后再做清洗优化
例如：
- 线路名去图标、去计数
- 简介去“展开全部”
- 搜索标题去分类前缀
- remarks 文本美化

---

## 七、遇到问题时优先查什么

### 首页 `home.list` 空
先查：
- 列表节点是否真实存在
- 是否命中模板
- `double`

### `category` 空 / 异常
先查：
- 分类 `url` 是否真实
- 列表定位是否命中真实容器
- 非模板站是否其实走接口

### `detail` 不通
先查：
- `vod_id` 是否来自一级真实返回
- `detailUrl` 是否缺失
- 二级字典/async 是否真的生效

### `search` 空
先查：
- `searchUrl` 是否真实
- 搜索页 DOM 是否独立于一级
- 是否应使用 suggest / RSS fallback

### `play` 不稳
先查：
- 当前是否真的必须拿直链
- 原页面嗅探是否已足够可用
- 引擎通用 lazy 是否有实际收益

---

## 八、建议长期记住的总原则

### 原则 1
**不要把模板名当成经验边界。**

### 原则 2
**不要把“评估器没串起来”误判成“规则完全不通”。**

### 原则 3
**不要一开始就追求完美直链，先保住完整可用。**

### 原则 4
**不要重写一切，优先最小覆盖。**

### 原则 5
**先分站型，再定策略。**

---

## 九、对应参考索引

### 非模板签名接口站
- `references/references-non-template-signed-api-site.md`

### 继承模板站最小覆盖
- `references/references-inherited-template-minimal-override-site.md`

### 纯 API 驱动 SPA 站
- `references/references-pure-api-async-site.md`

---

## 十、跨站型通用经验（2026-04-21 沉淀）

以下经验来自纯 API 站（247看）开发，但经提炼后发现对所有站型都适用。
完整参考：`references/references-async-function-patterns.md`

### 1. `this.input` 在 async 函数中是 URL 不是响应
- 适用于任何写了 async function 的源
- 必须 `await request(this.input)` 拿响应
- 这是 drpy 引擎的通用行为，与站型无关

### 2. 纯数字 vod_id 必须设 `detailUrl`
- 适用于所有站型（模板站也不例外）
- 只要一级返回的 vod_id 不是完整详情页 URL
- 不设 detailUrl → 二级 this.input 无效 → 详情全失败

### 3. `request` POST 用 `body` 不是 `data`
- 适用于任何需要 POST JSON 的场景
- `body: JSON.stringify({...})` ✅
- `data: {...}` → form-data ❌

### 4. `searchUrl` 必须带 `**`
- 适用于所有搜索源
- 不带 `**` → `this.KEY` 为空 → 搜索无关键词

### 5. 推荐要完整聚合
- 适用于所有站型的推荐函数
- 不要只取一个推荐数据源
- 按 vod_id 去重

### 6. async 函数用 `this.input` 拿 URL
- 不要手动拼 `HOST + path`
- URL 模板已定义的占位符，引擎会自动替换

### 7. 不要写重复同名属性
- JS 后者覆盖前者
- 删掉空占位，只保留有逻辑的

---

## 十、最终一句话总结

面对新站时，最重要的不是“会不会写规则”，而是：

**先判断它属于哪一类站，再采用对应的最小正确策略。**
