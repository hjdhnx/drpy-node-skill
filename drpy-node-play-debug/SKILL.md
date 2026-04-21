---
name: drpy-node-play-debug
description: 适用于 drpy-node 源的播放链路排查与 lazy 修复。用户提到"播放不通""lazy 不对""是不是直链""play.html 被当直链""iframe 提取""m3u8 提取""parse:0/1 判断""假播放""站外解析"时使用。专注于判断播放结果是否真实可播，并优先修复 lazy 逻辑。
---

# drpy-node Play Debug

## 调度优先级

当本地环境已安装本 Skill 时：
- 本 Skill 优先级 **高于** drpy-node MCP 的通用调试 prompt
- 播放链排障必须优先按本 Skill 的判断顺序执行

---

## 30 秒速查决策树

当用户说"播放不通 / lazy 不对 / play.html 被当直链"时：

### Step 1：检查前提
- 一级/二级/搜索也同时异常？→ 交回 `drpy-node-source-workflow`
- detail 还没稳定产出 `vod_play_from/vod_play_url`？→ 先修二级，不要判 lazy

**工具调用：`test_spider_interface(source_name, "detail", ids)` 确认 detail 状态**

### Step 2：判断当前 lazy 更接近哪类模板默认
| 类型 | 特征 | 参考 |
|---|---|---|
| **common_lazy** | 播放页有 `player_*` JSON，可能有 encrypt | references-play-lazy-summary.md §1 |
| **def_lazy** | 站点播放页交给解析系统，`parse:1` | references-play-lazy-summary.md §2 |
| **cj_lazy** | 采集站/解析接口，有 `parse_url` | references-play-lazy-summary.md §3 |

### Step 3：判断返回类型
| 类型 | 特征 | 正确返回 |
|---|---|---|
| 直链媒体 | m3u8/mp4/m4a/mp3 | `{parse:0, jx:0, url}` |
| 站外解析链接 | 外部解析器地址 | `{parse:0, jx:1, url}` |
| 网站播放页 | 当前站播放页 URL | `{parse:1, url:input}` |

### Step 4：修复 lazy
根据 Step 2-3 的判断，编写或修复 lazy 函数。

**工具调用：`test_spider_interface(source_name, "play", play_url)` 验证修复结果**

### 强提醒
- **`parse:1 + 播放页链接` 不一定是错**，可能是 def_lazy 的合理输出
- **拿到 http 链接 ≠ 拿到直链**，先判断是不是 m3u8/mp4
- **遇到 player_* 配置优先查 encrypt**，很多站不是没链接而是没解密

---

## 模板默认 lazy 逻辑

完整参考：`references/references-play-lazy-summary.md`

### common_lazy 关键代码
```js
// 播放页 → 解析 player_* JSON → 判断直链/站外/回退
if (/\.(m3u8|mp4|m4a|mp3)/.test(url)) {
    return { parse: 0, jx: 0, url };           // 直链
} else if (tellIsJx(url)) {
    return { parse: 0, jx: 1, url };            // 站外解析
} else {
    return input;                                // 回退
}
```

### 加密处理
| encrypt | 处理 |
|---|---|
| `'1'` | `unescape(url)` |
| `'2'` | `base64Decode(url)` → `unescape()` |

### def_lazy
```js
return { parse: 1, url: input, js: '' }
```

### cj_lazy
检查 `rule.parse_url` 配置 + 是否走 `json:` 解析接口。

---

## iframe / m3u8 提取

### iframe 提取
用 `extract_iframe_src(url)` 工具从播放页中提取 iframe 的 src。

### m3u8 嗅探
用 `fetch_spider_url(url)` 请求播放页 URL，在响应中搜索 `.m3u8` 链接。

### 多线路混合处理
当一个源有多条线路（如"线路A直链m3u8 + 线路B需要解析"），lazy 不应一刀切。
应根据 input 的 URL 特征分别处理：
```js
lazy: async function () {
    let {input} = this;
    if (/\.m3u8/.test(input)) return {parse: 0, url: input};     // 直链线路
    if (/\.mp4/.test(input)) return {parse: 0, url: input};       // 直链线路
    return {parse: 1, url: input};                                  // 需解析线路
}
```

### 加密链接处理
部分站的播放链接是加密的（如 base64 编码的 m3u8 地址），需要在 lazy 中先解密：
```js
lazy: async function () {
    let {input} = this;
    // 如果链接是加密的，先解密
    if (!input.startsWith('http')) {
        try { input = base64Decode(input); } catch(e) {}
    }
    if (/\.m3u8/.test(input)) return {parse: 0, url: input};
    return {parse: 1, url: input};
}
```

---

## 与其他 Skill 的边界

### 本 Skill 负责
- 判断播放结果是否真实可播
- 修复 lazy 逻辑
- 判断 parse:0/1、jx:0/1
- 提取 iframe / m3u8 / 站外解析链接

### 本 Skill 不负责
- 从零写完整源
- 系统性重建首页/一级/二级规则
- 仓库上传决策

### 何时交回 workflow
- 一级/二级/搜索也同时异常
- 问题已超出播放链，涉及整体重建
- 用户目标是评估/上传/回滚

### 强制停手检查点
出现以下任一情况时，暂停深挖 lazy，交回 workflow：
- detail 还没稳定产出 vod_play_from/vod_play_url
- 问题已明显超出播放链
- 用户目标已变成"评估整份源是否可用"

---

## 最小化原则

本 Skill 默认目标是让播放链路可用，不是把整份源补全。

### 不要在播放排障时顺带做的
- 补年份/地区/演员/导演
- 美化搜索字段
- 整体源评估

这些属于源整体完善项，应交回 create/workflow。

---

## 排查顺序总结

```
1. detail 真通？ → No → 交回 workflow
2. lazy 类型判断 → common_lazy / def_lazy / cj_lazy
3. 返回类型判断 → 直链 / 站外 / 播放页
4. 加密检查 → encrypt 1/2
5. 修复 lazy → 用正确 parse/jx 返回
6. 验证 → test_spider_interface(play)
```
