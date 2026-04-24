---
name: drpy-node-source-workflow
description: 适用于 drpy-node 源开发、修复、调试、测试与仓库上传的总控工作流。用户提到"修源""调试 drpy 源""测试某个源""详情为空""播放不通""搜索异常""上传到仓库""修复 P0 源""评估源可用性""DS源开发""lazy 解析""上传 ds 源""源不通""源无效""低分评估"时使用。优先用于 drpy-node 项目中的 DS 源，负责先评估、再分流到对应子 skill（播放调试/仓库上传/新建源），最后做结果汇总与上传决策。提供完整的分类排查路线（模板站/纯API站/签名接口站）和检查点确认机制。
---

# drpy-node Source Workflow

## 调度优先级

当本地环境已安装本 Skill 时：
- 本地 Skill 优先级 **高于** drpy-node MCP 的通用 prompts
- 当用户只给网址、不给文件名时，总控层应主动分析站点并推导源名

### 强约束
如果本地 Skill 已覆盖场景，不允许让 MCP 通用 prompt 抢占主流程。

---

## 总控闭环（5 步）

### Step 1：识别输入类型
- 仅有网址 → 先分析站点并推导源名
- 已有源名/源文件 → 进入修复与评估流程

### Step 2：评估现状
1. `drpy_read_file` 读取源文件
2. `drpy_check_syntax` + `validate_spider` 基础校验
3. `get_resolved_rule`（模板站适用）
4. `evaluate_spider_source` 全流程评估

### Step 3：判断失败类型

**诊断工具调用：**
```bash
# 逐接口拆分验证
test_spider_interface(source_name, "category", class_id)  # 一级
test_spider_interface(source_name, "detail", ids)          # 二级
test_spider_interface(source_name, "search", keyword)      # 搜索
test_spider_interface(source_name, "play", play_url)       # 播放
```

- **A. 规则本身不通** → 单接口 test 也失败
- **B. 评估器没串起来** → 单接口通但 evaluate 不通
- **C. 主要卡在播放链** → detail 正常但 play 异常

### 🛑 检查点 1：确认诊断结论
在进入分流前，向用户呈现诊断摘要：

```markdown
## 诊断结论
- 首页：通/不通
- 一级（category）：通/不通
- 二级（detail）：通/不通
- 搜索：通/不通
- 播放：通/不通
- 失败类型：A（规则不通）/ B（评估串联）/ C（播放链）
- 建议路线：...
- 用户确认后再进入修复
```

### Step 4：分流
| 问题类型 | 分流目标 |
|---|---|
| 新建源 | `drpy-node-source-create` |
| 播放链问题 | `drpy-node-play-debug` |
| 上传仓库 | `drpy-node-repo-upload` |
| 站型判断不清 | 按 Step 3 重新诊断 |

### Step 5：收束
- `evaluate_spider_source` 重新评估
- 给出是否有效结论
- 决定是否上传/替换/回滚（需要上传时 → `house_file(action='upload')`)

### 🛑 检查点 2：确认操作方案
在收束前向用户确认：

```markdown
## 修复结果摘要
- 已修复：...（接口和改动简述）
- 仍未通：...
- 建议上传：A（建议上传）/ B（技术上可传）/ C（暂不应上传）

用户确认后再执行上传/回滚等操作
```

### 强约束
不要把 workflow 变成"所有事都自己做完"。它的价值在于：先评估 → 再分流 → 最后收束。

---

## 通用排查 Checklist（优先执行，跨所有站型）

以下排查项对模板站/签名接口站/纯 API 站都适用。只要源中有 async function，就必须先过这个清单。

完整参考：`../drpy-node-source-create/references/references-async-function-patterns.md`

| 优先级 | 检查项 | 症状 |
|---|---|---|
| **P0** | `this.input` 是 URL 不是响应 | `JSON.parse(this.input)` 报错含 URL |
| **P0** | `detailUrl` 是否设置 | 二级全部为空 |
| **P0** | POST 用 `body` 不是 `data` | 搜索/一级 POST 请求服务端不认 |
| **P0** | `searchUrl` 带 `**` | `this.KEY` 为空 |
| **P1** | 推荐完整聚合 | 推荐只有几条 |
| **P1** | 不手动拼 URL | 代码冗余且易出错 |
| **P2** | 不写重复属性 | 维护混淆 |

### 强约束
不要因为"这是模板站"就跳过这些检查。只要源中有 async function，就必须先过通用清单。

---

## 模板站排查路线

当站点命中内置模板但评估不顺时，严禁直接大面积手写覆盖。

### 排查顺序（按此顺序逐项检查）
1. 查模板默认定义 → `references/references-template-summary.md`
2. `class_parse` 是否残留覆盖？→ 补 `class_parse: ''`
3. `double` 是否导致推荐空？→ 补 `double: false`
4. 真实分类 `url` → 必须验证真实分类页和翻页
5. 真实搜索 `searchUrl`
6. 删除手写 一级/搜索，优先验证模板内置规则
7. `test_spider_interface` 拆开验证各接口
8. 最后才允许最小覆盖

### 强禁止
未完成 1~7 之前，禁止一口气重写 推荐/一级/搜索/二级。

### 关键原则
**不要把模板问题、分类 URL 问题、评估器串联问题，误当成单纯的一级选择器问题。**

---

## 纯 API 站排查路线

当页面源码为空、所有数据走 JSON API 时，走此路线（不套用模板站 checklist）。

完整参考：`../drpy-node-source-create/references/references-pure-api-async-site.md`

### 排查顺序
1. `this.input` 是否被误当响应 → 必须 `await request(this.input)`
2. `detailUrl` 是否设置 → 纯数字 vod_id 必须设
3. 搜索 `searchUrl` 是否带 `**` → 否则 KEY 为空
4. POST 是否用了 `body` 而非 `data`
5. 外部 API 是否需要 Authorization
6. 推荐是否完整聚合

### 强约束
纯 API 站排障路线与模板站完全不同，不要混用模板站的 checklist。

---

## `*` 模板字段理解

当模板字段中出现 `搜索: '*'` 或含多个 `*` 的摘要写法时，必须先读：
- `references/references-template-summary.md`

### 当前理解
- 单个 `*`：整体继承一级
- 多个 `*`：按分号位置逐位继承一级对应槽位

### 强约束
不要在没理解 `*` 的源码级行为前，就机械改写成完整手写规则。

---

## 搜索排查

### 搜索词适配（高频误判点）
当自动评估仅搜索失败，其他接口正常时：
1. 不要立刻判定"搜索规则失效"
2. 不要急着改 `searchUrl`
3. 应先换高频宽匹配词验证（通用词 `我的`，动漫站 `异世界`，或取一级 vod_name 片段）
4. 换词后正常 → 判定为评估参数问题

### 搜索策略参考
处理搜索前必须先判断属于：
1. 原生搜索接口
2. suggest / 联想搜索 fallback
3. RSS fallback

参考：`references/references-search-strategies.md`

---

## 二级 detail 规范

完整参考：`../drpy-node-source-create/references/references-detail-dict-and-multiep.md`

### 测试输入
- detail 测试**必须**使用一级真实返回的 `vod_id`
- 禁止主观简化为纯数字 id 或手推 id
- 正确顺序：先跑 category → 取真实 vod_id → 再测 detail

### 字典槽位
- `desc` 五段有固定语义：备注;年份;地区;演员;导演

### 多集只吐 1 集
先查 `lists` 容器层级（从 ul 下沉到 li），用 `debug_spider_rule(pdfa)` 验证各层项数。不要直接切 async。

```bash
# 排查示例
debug_spider_rule(url, '.anthology-list-box ul li a', pdfa)
# 先看 ul 层返回几项 → 再看 li 层返回几项
# 若 ul 层返回1项但 li 层返回多项 → lists 容器需从 ul 下沉到 li
```
如果 CSS 层级调整后仍只有 1 集，再用 `test_spider_interface(detail)` 配合真实 vod_id 复现，确认是否 `detailUrl` 缺失或二级字典字段映射错误。详见 `references/../drpy-node-source-create/references/references-detail-dict-and-multiep.md`。

### 最小化原则
先保证 标题/描述/详情/图片/线路/列表，不强补 年份/地区/演员/导演。

---

## 评估器失败分流

| 类型 | 表现 | 处理 |
|---|---|---|
| **A. 规则不通** | 单接口 test 也失败 | 修复规则本身 |
| **B. 评估没串起来** | 单接口通，评估不通 | 检查首页 class / class_parse / double / url / searchUrl |

### B 类优先检查（顺序执行，逐项排查）
```
Step 1. 查 get_resolved_rule(path) → 看模板继承后的 class_parse/double/url 是否被覆盖
Step 2. 查首页 class 是否为空 → class_parse 是否命中（未命中 → 补 class_parse）
Step 3. 查 class_parse 是否残留覆盖 → 显式设 class_parse: ''
Step 4. 查 double 是否导致推荐为空 → 单层推荐优先 double: false
Step 5. 查分类 url / 搜索 searchUrl 是否真实
Step 6. 查手写 一级/搜索 是否反而扰乱模板内置链路（删除手写，先用模板内置）
```

### B 类深层机制理解

B 类失败的根本原因在于**评估器串联机制**与**模板继承机制**的交互：

```js
// 引擎 invokeMethod 分发逻辑 (drpyS.js)
switch (method) {
    case '推荐': injectVars = homeVodParse(...); break;  // 依赖 class + double
    case '一级': injectVars = cateParse(...); break;     // 依赖 url 模板渲染
    case '分类': injectVars = homeParse(...); break;      // 依赖 class_parse
}
```

- 首页空分类 → 后续 category 无 class_id 可用 → 全链断裂
- class_parse 未命中 → class 为空 → 评估器拿不到分类 ID
- `get_resolved_rule(path)` 可查看模板继承后的最终字段值，快速判断哪个字段被覆盖

详见 `references/references-framework-internals.md` 第七章节「调度分发机制」。

---

## parser 语法边界

当规则"看起来合理但接口异常"时：
1. 是否超出 parser 已明确支持的边界？
2. 应先修规则写法，而非要求引擎兼容
3. `||` 优先用于同一 selector 属性 fallback（`img&&data-original||src`）
4. 不要生成跨 selector fallback（`img&&data-original||img&&src`）

**先尊重引擎设定，再要求更宽容的兼容。**
