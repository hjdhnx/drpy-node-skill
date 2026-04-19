# drpy-node 搜索处理参考（reference）

> 适用于 drpy-node 写源时的搜索链路判断。
> 这不是主流程 Skill 本体，而是供 `drpy-node-source-create / drpy-node-source-workflow` 在处理搜索时优先参考的独立说明。

---

## 一、搜索处理总原则

搜索不要一上来只写一个 `searchUrl` 就结束。对影视站，至少要区分三类搜索：

1. **原生搜索接口 / 原生搜索页**
2. **联想搜索 / suggest JSON 接口**
3. **RSS 搜索**

### 优先级
始终按以下顺序判断：

1. 原生搜索优先
2. 原生搜索被验证码 / WAF / 验证机制破坏时，再尝试 suggest
3. suggest 不存在或不理想时，再尝试 RSS

### 关键提醒
- `suggest / RSS` 都属于 **官方搜索接口被验证机制破坏后的无奈 fallback**
- 它们通常 **不支持翻页**
- 不能把它们当成完整原生搜索能力的等价替代

## 一点五、评估搜索时的关键词策略

`evaluate_spider_source` 的搜索测试词由调用时传入的 `keyword` 决定；若不传，默认词常为 `斗罗大陆`。这并不适用于所有垂类站，尤其是动漫站、细分影视站、小众站。

### 强提醒
如果自动评估仅搜索失败，而首页 / 一级 / 二级 / 播放都正常：
- 不要立刻判定为搜索规则失效
- 不要第一时间回头重写 `searchUrl` / `搜索`
- 应优先判断是否只是评估词不适配当前站点

### 推荐动作
优先重新用更高频、更宽匹配、且更贴合站型的词验证搜索，例如：
- 通用宽匹配词：`我的`
- 动漫站常用词：`异世界`、`转生`
- 或直接取首页 / 一级真实 `vod_name` 的稳定片段

### 判定原则
如果换词后搜索恢复正常，应优先判定为：
- 评估参数问题
- 默认搜索词不适配

而不是：
- 源本身搜索规则坏了

---

---

## 一点七、旧编码搜索站（GB2312 / GBK / GB18030）

### 典型特征
- 页面 `charset` 明确为 `gb2312` / `gbk` / `gb18030`
- `searchUrl` 看起来正确，但搜索始终为空
- 浏览器手工请求旧编码关键词时又能返回真实结果

### 强提醒
**不要因为搜索为空，就轻易判定“字符串搜索不行”并直接改 async。**

对这类站，应优先检查：
1. 引擎是否支持 `encoding` / `搜索编码`
2. 当前源文件里这两个字段是否真的落盘生效
3. 搜索页是否使用独立于一级的 DOM

### 推荐排障顺序
1. 先确认 `searchUrl` 模板真实可用
2. 优先尝试：
```js
encoding: 'gb18030',
搜索编码: 'gb18030'
```
3. 回读真实源文件，必要时再看运行态 rule 摘要，确认字段不是“看起来加了，实际没生效”
4. 确认搜索页是否是独立 DOM，而不是默认继承一级
5. 再用高频词或已知命中词复测，例如：`柯南`、`名侦探`

### 零度动漫案例（已验证）
```js
searchUrl: '/search.asp?page=fypage&searchword=**&searchtype=-1',
encoding: 'gb18030',
搜索编码: 'gb18030',
搜索: '.list_1 .book-li;.book-title&&Text;.book-cover&&src;.book-desc&&Text;a.book-layout&&href'
```

### 可复用结论
对 GB2312/GBK/GB18030 系老站，当 `searchUrl` 正确但搜索始终为空时，不应轻易判定字符串搜索不可用；应先核对引擎源码确认 `搜索编码/encoding` 支持，再确认字段已真实落盘，并验证搜索页是否使用独立 DOM。

---

## 二、原生搜索接口

### 典型形式
- `/vodsearch/**----------fypage---.html`
- `/search/**...`
- POST 搜索接口
- 站内真实搜索页

### 处理原则
1. 先确认真实搜索 URL
2. 必须验证第 1 页和第 2 页
3. 确认搜索结果节点是否真实存在
4. 确认是否有验证码 / WAF / 搜索验证拦截

### 为什么优先
- 通常结果最完整
- 最接近站点真实搜索体验
- 最可能支持翻页
- 字段通常更丰富

### 常见误区
- 返回 200 就误以为搜索已通
- 实际页面是验证码页
- 在验证码页上继续抠列表节点，方向就错了

---

## 三、联想搜索 / suggest 搜索

### 典型形式
```js
/index.php/ajax/suggest?mid=1&wd=**&limit=50
```

### 适用条件
- 原生搜索页被验证码挡住
- 但站点存在官方联想搜索 JSON 接口
- 返回结构较清晰，例如：
```json
{
  "list": [
    {"id":224192,"name":"斗士归来","pic":"https://..."}
  ]
}
```

### 推荐写法
如果 JSON 字段规整，优先使用 drpy 原生简写：

```js
detailUrl: '/voddetail/fyid.html',
searchUrl: '/index.php/ajax/suggest?mid=1&wd=**&limit=50',
搜索: 'json:list;name;pic;;id'
```

### 为什么推荐这套
- 更短
- 更符合 drpy 原生风格
- 维护成本更低
- `detailUrl + id` 的责任分离更清晰

### 缺点
- 通常不支持翻页
- 结果集常有限制（如 10/20/50 条）
- 字段相对简化

### 验证标准
不能只看 `search` 出数据，必须继续确认：
1. 搜索结果返回的 `vod_id` 是否合理
2. 这个 `vod_id` 能否真正进入 `detail`

---

## 四、RSS 搜索

### 典型形式
```js
/rss.xml?wd=**
```

### 适用条件
- 原生搜索被验证码挡住
- suggest 不存在 / 不稳定 / 数据过少
- 但站点开放了 RSS 搜索接口

### 关键原则
对于 RSS 搜索，如果已有一份经验证可跑的参考代码：

# 优先做最小改动 async 化
# 不要顺手重写解析逻辑

这类 XML / RSS 接口经常存在经验性写法，乱改很容易把可跑逻辑改坏。

### 推荐参考代码（已在麦田影院站点验证可跑）
```js
搜索: async function () {
    let { input, pdfa, pdfh } = this;
    let html = await request(input);
    let items = pdfa(html, 'rss&&item');
    let d = [];
    items.forEach(it => {
        it = it.replace(/title|link|author|pubdate|description/g, 'p');
        let url = pdfh(it, 'p:eq(1)&&Text');
        d.push({
            title: pdfh(it, 'p&&Text'),
            url: url,
            desc: pdfh(it, 'p:eq(3)&&Text'),
            content: pdfh(it, 'p:eq(2)&&Text'),
            pic_url: ''
        });
    });
    return setResult(d);
}
```

### 为什么这份参考代码重要
- 它已经在真实站点（麦田影院）验证过可用
- 它保留了 RSS 解析里经验性的 `replace + p:eq(...)` 思路
- 它是“最小改动 async 化”的正例

### 不推荐做法
不要自作聪明改写成：
```js
pdfh(it, 'title&&Text')
pdfh(it, 'link&&Text')
```
这种“看起来更直观”的解析方式，除非你已经验证引擎对该 RSS 结构完全稳定。

### 缺点
- 通常不支持翻页
- 图片字段常缺失
- 结构化程度不如 suggest JSON
- 结果集通常有限

### 验证标准
同样不能只看 `search` 出结果，必须继续确认：
1. 返回的 `vod_id/url` 是否正确
2. 是否能进入 `detail`

---

## 五、搜索成功的完成标准

一个搜索方案要算“真正完成”，至少要满足：

1. `search` 能出结果
2. 返回的 `vod_id` 或 `url` 合理
3. 能从搜索结果进入 `detail`
4. 必要时还能继续接 `play`

### 关键提醒
调试 `detail` 时，必须使用搜索/一级真实返回的 `vod_id`，不要主观把它简化成纯数字 id。

---

## 六、麦田影院案例结论（已验证）

### 原生搜索
- 存在真实搜索页
- 但被验证码拦截
- 当前不可直接交付

### suggest 搜索
- 已成功
- 可接 `detail`
- 更适合作为最终 fallback 方案

推荐最终写法：
```js
detailUrl: '/voddetail/fyid.html',
searchUrl: '/index.php/ajax/suggest?mid=1&wd=**&limit=50',
搜索: 'json:list;name;pic;;id'
```

### RSS 搜索
- 已验证可用
- 可接 `detail`
- 适合作为备选 fallback
- 但在该站上仍不如 suggest 简洁、规整

### 最终建议
- 最终保留 suggest 作为首选 fallback
- RSS 作为备选 fallback 参考

---

## 七、最终决策模板

当你给一个站写搜索时，按下面的顺序决策：

1. 先找原生搜索接口/搜索页
2. 验证第 1 页 / 第 2 页 / 是否验证码
3. 原生搜索可用 → 保留原生搜索
4. 原生搜索被验证码挡住 → 尝试 suggest
5. suggest 可用 → 优先保留 suggest
6. suggest 不存在或不理想 → 再试 RSS
7. 如果采用 suggest / RSS，必须明确说明：
   - 这是 fallback
   - 通常不支持翻页
   - 不是完整原生搜索能力
