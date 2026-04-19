---
name: drpy-node-source-workflow
description: 适用于 drpy-node 源开发、修复、调试、测试与仓库上传的总控工作流 Skill。用户提到“修源”“调试 drpy 源”“测试某个源”“详情为空”“播放不通”“搜索异常”“上传到仓库”“修复 P0 源”“评估源可用性”“DS源开发”“lazy 解析”“上传 ds 源”时使用。优先用于 drpy-node 项目中的 DS 源，负责先评估、再分流到对应子 skill（播放调试/仓库上传/新建源），最后做结果汇总与上传决策。
---

# drpy-node Source Workflow

## 调度优先级（新增强规则）

当本地环境已安装本 Skill 或相关 drpy-node 子 Skill 时：

- 本地 Skill 优先级 **高于** drpy-node MCP 的通用 prompts
- 通用 MCP prompt 只作为无本地 Skill 时的兜底流程
- 当用户只给网址、不给文件名时，总控层应主动分析站点并推导源名，不应退回通用流程等待用户补参数

### 强约束
如果本地 Skill 已覆盖场景，不允许让 MCP 通用 prompt 抢占主流程。

---

## 总控闭环（新增）

本 Skill 的默认主流程应尽量收敛为：

1. **识别输入类型**
   - 仅有网址 → 先分析站点并推导源名
   - 已有源名/源文件 → 进入修复与评估流程
2. **先评估现状**
   - `read_file`
   - `check_syntax`
   - `validate_spider`
   - `get_resolved_rule`（模板站）
   - `evaluate_spider_source`
3. **判断失败类型**
   - 规则本身不通
   - 自动串联没接上
   - 主要卡在播放链
4. **分流**
   - 新建源 → `drpy-node-source-create`
   - 播放链问题 → `drpy-node-play-debug`
   - 上传仓库 → `drpy-node-repo-upload`
5. **收束**
   - 重新评估
   - 给出是否有效结论
   - 决定是否上传 / 替换 / 回滚

### 强约束
不要把 workflow 变成“所有事都自己做完”。它的价值在于：
- 先评估
- 再分流
- 最后收束

---

## 新增强规则：搜索处理必须先看 reference

在处理搜索前，必须先阅读：
- `references/references-search-strategies.md`
- `../drpy-node-source-create/references/references-inherited-template-minimal-override-site.md`（用于所有继承模板站的最小覆盖排障，而不只限于某个模板个案）

尤其要先判断当前站点属于：
1. 原生搜索接口
2. suggest / 联想搜索 fallback
3. RSS fallback

### 强约束
不要在没有完成这一步判断前，就直接拍脑袋写 `searchUrl` 或随手决定用 RSS / suggest。

---

## 新增强规则：看到 `*` 先按“对齐一级”理解，再决定要不要覆盖

当模板字段中出现：
- `搜索: '*'`
- `推荐: '*'`
- `推荐: '.xxx;*;*;*;*;*'`
- 其他含多个 `*` 的模板摘要写法

必须先阅读：
- `references/references-template-summary.md`

### 强约束
不要在没有理解 `*` 的源码级行为前，就把它机械改写成完整手写规则。

### 当前应采用的理解
- 单个 `*`：整体继承一级
- 多个 `*`：按分号位置逐位继承一级对应槽位

---

## 新增强规则：模板继承不是黑箱

当模板站“看起来命中模板，但自动评估始终不顺”时，严禁直接大面积手写覆盖。必须按以下顺序排障：

1. 查模板默认定义（参考 `references-template-summary.md`）
2. `class_parse`
3. `double`
4. 真实分类 `url`
5. 真实搜索 `searchUrl`
6. 删除手写 `一级/搜索`，优先验证模板内置规则
7. `test_spider_interface` 拆开验证 category/detail/play
8. 最后才允许最小覆盖

### 强约束
在完成以上 1~7 之前，禁止一口气重写：
- `推荐`
- `一级`
- `搜索`
- `二级`

---

## 新增强规则：先判断是不是规则越界写法，不要先甩锅引擎

当某条规则“看起来合理，但接口里异常”时，先按以下顺序判断：

1. 这条写法是否真的在模板/现有规范里被当作标准写法使用？
2. 这条写法是否超出了 parser 已明确支持的边界？
3. 是不是应该先修规则写法与 MCP/skill 约束，而不是直接要求引擎兼容？

### 一个已验证案例
类似：
```js
img&&data-original||img&&src
```

看起来像“合理 fallback”，但如果模板/规范并未把它当标准写法，就不应先要求引擎背锅。

### 正确态度
**先尊重引擎设定，再要求更宽容的兼容。**

---

## P1：模板内置优先，不要过早覆盖

### 一个关键原则
**能走模板内置，就不要急着手写覆盖。**

尤其是：
- 一级不通时，不要第一反应就手写 `一级`
- 搜索不通时，不要第一反应就手写 `搜索`
- 应优先检查是不是：
  - `class_parse` 残留
  - `double` 错误
  - `url/searchUrl` 误判
  - 手写覆盖反而打乱模板链

---

## P2：评估器失败后的标准分流

如果 `evaluate_spider_source` 分数很低，总控层必须先判断是哪一类失败：

### 类型 A：规则本身不通
表现：
- 单独 `test_spider_interface(category/detail/play)` 也失败
- 真实网页节点或 URL 本身错误

### 类型 B：自动评估没串起来
表现：
- 单接口测试可用
- 但 `evaluate_spider_source` 仍跳过或串联失败

#### 对 B 类必须优先检查
- 首页 `class` 是否为空
- `class_parse` 是否覆盖
- `double` 是否导致推荐为空
- 分类 `url` / 搜索 `searchUrl` 是否真实
- 是否因为手写 `一级/搜索` 反而扰乱模板内置链路

---

## 新增硬规则：detail 测试输入与二级字典契约

### 1. detail 测试必须使用一级真实返回的 `vod_id`
总控层在验证 `detail` 时，禁止把 `vod_id` 主观简化成：
- 纯数字 id
- 手推详情 id
- 仅分类页中看起来像 id 的片段

正确顺序必须是：
1. 先跑 `test_spider_interface(category)`
2. 从一级真实结果中提取 `vod_id`
3. 用这个真实 `vod_id` 跑 `test_spider_interface(detail)`

### 2. 二级字典的 `desc` 五段有固定槽位语义
当站点适合字典二级时，`desc` 默认应按以下固定位置理解：
- 第1段 → `vod_remarks`
- 第2段 → `vod_year`
- 第3段 → `vod_area`
- 第4段 → `vod_actor`
- 第5段 → `vod_director`

不要把 `desc` 当成任意拼接信息串。

### 3. `lists` 只是选集容器，不是最终播放字符串
总控层应记住：
- `lists` 负责定位当前线路下的选集项
- 每一集标题和链接默认由 `list_text` / `list_url` 提取
- `lists` 支持 `#id` / `#idv`

### 4. 默认先走二级最小化原则
对大多数影视站，二级先保证以下最小可用项即可：
- 标题
- 描述/备注
- 详情
- 图片
- 线路
- 列表

如果用户没要求，不要默认一开始就强行把年份、地区、演员、导演全部补满。


### A. 先查 `class_parse`
如果首页 `class` 为空，而规则里明明写了 `class_name/class_url`，应优先检查模板是否残留 `class_parse` 覆盖了分类输出。

#### 处理动作
显式尝试：
```js
class_parse: ''
```

---

### B. 再查推荐 `double`
如果首页真实存在推荐卡片节点，但 `home.list` 为空，应优先检查模板默认推荐是否按双层逻辑处理。

#### 处理动作
对于单层推荐站点，优先补：
```js
double: false
```

---

### C. 再查分类 `url`
如果一级始终不通，不要只盯选择器。必须先验证分类 URL 是否是真实分类模板，而不是首页导航表层链接。

#### 强约束
必须用真实分类页和翻页结构验证：
- 第 1 页
- 第 2 页
- `fyclass`
- `fypage`

---

### D. 最后再判断是否要手写一级
如果：
- `class_parse` 已处理
- `double` 已处理
- 真实分类 URL 已确认
- 模板原生一级仍不通

这时才进入“一级最小手写覆盖”或 `async function` 接管。

---

### 一个关键原则
**不要把模板问题、分类 URL 问题、评估器串联问题，误当成单纯的一级选择器问题。**
