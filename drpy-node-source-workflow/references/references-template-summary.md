# drpy-node 模板继承参考（提炼自 libs_drpy/template.js）

来源：`E:\gitwork\drpy-node\libs_drpy\template.js`
时间：2026-04-18 14:22 CST
用途：给 drpy-node 写源 skill 提供模板继承上下文，避免 AI 在不知道模板默认值的情况下盲改规则。

---

## 一、为什么这份参考是必需的

很多写源问题不是“站点节点没找到”，而是：
- 模板默认 `class_parse` 覆盖了 `class_name/class_url`
- 模板默认 `double: true` 导致推荐按双层结构处理
- 模板自带 `推荐/一级/搜索/二级` 默认规则与站点真实结构冲突
- AI 不知道模板继承后的最终规则长什么样，只能盲猜

所以：
**drpy-node 写源 skill 必须持有模板默认定义摘要，至少要知道常用模板继承后默认有哪些关键字段。**

---

## 二、模板继承必须优先关注的字段

### 1. `class_parse`
模板自带 `class_parse` 时，可能覆盖手写：
```js
class_name
class_url
```

### 2. `double`
模板常自带：
```js
double: true
```
这会影响首页推荐是否按双层结构解析。

### 3. 默认 `推荐 / 一级 / 搜索 / 二级`
如果站点本身就很贴模板，优先考虑走模板内置。

### 4. 默认 `url / searchUrl`
模板给出的默认分类与搜索路径只是一种常见形态，不等于当前站点真实路径。
必须继续用真实网页与翻页结构验证。

---

## 三、常用模板关键定义摘要

## 新增说明：模板摘要里 `*` 的真实语义（按源码行为总结）

在 drpy-node 引擎里，`*` 在推荐 / 搜索 / 字符串槽位中的含义，不应只从“模板摘要”表面理解，而应以源码真实行为为准。

### 1. `推荐: '*'` / `搜索: '*'` 的真实语义
根据 `libs/drpysParser.js` 中的：
```js
let p = moduleObject[method] === '*' && moduleObject['一级'] ? moduleObject['一级'] : moduleObject[method];
```
可知：

- 当 `推荐: '*'` 且存在 `一级` 时
  - **推荐直接继承一级**
- 当 `搜索: '*'` 且存在 `一级` 时
  - **搜索直接继承一级**

#### 这意味着什么
- 这里的 `*` 不是“空着不写”
- 也不是笼统的“走模板默认值”
- 更准确地说：
  # 它表示“直接对齐一级规则”

### 2. 多个 `*` 的真实语义：按位继承一级
根据 `libs/drpysParser.js` 中的：
```js
function getPP(p, pn, pp, ppn) {
    return p[pn] === '*' && pp.length > ppn ? pp[ppn] : p[pn]
}
```
可知：

如果某个字符串规则按 `;` 拆分后，某一位写成 `*`，则：
- 该位置会继承 `一级` 对应位置的槽位值

### 3. 典型例子
```js
推荐: '.cbox_list;*;*;*;*;*'
```
它的真实含义更接近：
- 第 1 位：使用当前手写的列表容器 `.cbox_list`
- 后续每一位：按位置逐位继承 `一级` 对应槽位

#### 这意味着什么
- 它不是“随便写几个星号”
- 而是：
  # 只覆盖你想改的位置，其余位置与一级严格对齐

### 4. 实务规则
当你看到：
- `推荐: '*'`
- `搜索: '*'`
- `'.xxx;*;*;*;*;*'`

优先应理解为：
1. 它在和 `一级` 对齐
2. 它在复用一级整体或一级对应槽位
3. 只有确认这种对齐关系不满足站点结构时，才考虑手写完整覆盖

### 5. 强提醒
不要再把这里的 `*` 解释成纯“模板抽象占位”。
更准确的说法应是：
- **单个 `*`：整体继承一级**
- **多个 `*`：按分号位置逐位继承一级**

---

## 1. `mx`
```js
url: '/vodshow/fyclass--------fypage---/'
searchUrl: '/vodsearch/**----------fypage---/'
class_parse: '.top_nav li;a&&Text;a&&href;.*/(.*?)/'
double: true
推荐: '.cbox_list;*;*;*;*;*'
一级: 'ul.vodlist li;a&&title;a&&data-original;.pic_text&&Text;a&&href'
搜索: '*'
```

### 风险点
- 有 `class_parse`
- `double: true`
- 推荐和一级默认结构偏苹果 CMS 老版

---

## 2. `mxpro`
```js
url: '/vodshow/fyclass--------fypage---.html'
searchUrl: '/vodsearch/**----------fypage---.html'
class_parse: '.navbar-items li:gt(0):lt(10);a&&Text;a&&href;/(\\d+)'
double: true
推荐: '.tab-list.active;a.module-poster-item.module-item;.module-poster-item-title&&Text;.lazyload&&data-original;.module-item-note&&Text;a&&href'
一级: 'body a.module-poster-item.module-item;a&&title;.lazyload&&data-original;.module-item-note&&Text;a&&href'
搜索: 'body .module-item;.module-card-item-title&&Text;.lazyload&&data-original;.module-item-note&&Text;a&&href;.module-info-item-content&&Text'
```

### 风险点
- `class_parse` 优先级很高
- `double: true`
- 首页/分类常见 `module-poster-item`
- 搜索常见 `module-card-item` 或 `body .module-item`

### 已验证经验
- 首页 class 空时，优先检查并尝试：
```js
class_parse: ''
```
- 首页推荐 list 空时，优先检查并尝试：
```js
double: false
```

---

## 3. `首图`
```js
url: '/vodshow/fyclass--------fypage---/'
searchUrl: '/vodsearch/**----------fypage---.html'
class_parse: '.myui-header__menu li.hidden-sm:gt(0):lt(7);a&&Text;a&&href;/(\\d+).html'
double: true
推荐: 'ul.myui-vodlist.clearfix;li;a&&title;a&&data-original;.pic-text&&Text;a&&href'
一级: '.myui-vodlist li;a&&title;a&&data-original;.pic-text&&Text;a&&href'
搜索: '#searchList li;a&&title;.lazyload&&data-original;.pic-text&&Text;a&&href;.detail&&Text'
```

### 风险点
- `class_parse` 残留
- `double: true`
- 推荐常是单层，但模板默认仍可能按双层逻辑处理

---

## 4. `首图2`
```js
url: '/list/fyclass-fypage.html'
searchUrl: '/vodsearch/**----------fypage---.html'
class_parse: '.stui-header__menu li:gt(0):lt(7);a&&Text;a&&href;.*/(.*?).html'
double: true
推荐: 'ul.stui-vodlist.clearfix;li;a&&title;.lazyload&&data-original;.pic-text&&Text;a&&href'
一级: '.stui-vodlist li;a&&title;a&&data-original;.pic-text&&Text;a&&href'
搜索: 'ul.stui-vodlist__media,ul.stui-vodlist,#searchList li;a&&title;.lazyload&&data-original;.pic-text&&Text;a&&href;.detail&&Text'
```

### 风险点
- `class_parse` 残留
- `double: true`
- 分类真实 url 很可能不是模板默认 `/list/...`
- 搜索有时应优先走模板内置，不要急着手写

### 已验证经验
某些首图系站：
- 一级去掉手写 `一级` 反而恢复正常
- 搜索去掉手写 `搜索` + 保留真实 `searchUrl` 反而恢复正常

---

## 四、从 template.js 提炼出的写源纪律

### 纪律 1：模板继承后先看模板默认值，再决定要不要覆盖
优先核查：
- `class_parse`
- `double`
- 默认 `推荐`
- 默认 `一级`
- 默认 `搜索`
- 默认 `url/searchUrl`

---

### 纪律 2：能走模板内置，优先走模板内置
特别是：
- `mxpro`
- `首图`
- `首图2`

很多时候：
- 手写 `一级` 反而把模板内置链打坏
- 手写 `搜索` 反而把真实搜索页打坏

---

### 纪律 3：`url/searchUrl` 不能迷信模板默认值
模板默认值只是“常见站”的样子。
当前站真实分类模板必须用：
- 分类第一页
- 分类第二页
- 搜索第一页
- 翻页结构

去确认。

---

## 五、对 skill 的直接要求

### drpy-node-source-create 必须具备
- 模板默认字段意识
- 不再把模板继承当作“黑箱”
- 写源前先核查模板关键字段

### drpy-node-source-workflow 必须具备
- 模板继承排障顺序
- 优先验证模板内置
- 再决定是否最小覆盖

---

## 六、后续 MCP 工具建议

如果能增强 MCP，建议提供：

### 能力 1：获取模板继承展开后的最终 rule
例如输入：
- 模板名
- 当前手写字段

输出：
- 继承展开后的完整 rule

这样 AI 才能看到：
- 最终 `class_parse` 是什么
- 最终 `double` 是什么
- 最终 `推荐/一级/搜索` 实际是什么

### 能力 2：获取模板定义摘要
例如直接返回：
- `mx`
- `mxpro`
- `首图`
- `首图2`
等模板的关键字段表

这样 skill 就不需要盲猜模板默认值。
