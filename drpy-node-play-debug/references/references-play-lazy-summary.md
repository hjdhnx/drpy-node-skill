# drpy-node Play Debug 专项参考

时间：2026-04-18 14:27 CST
用途：专门服务于播放链路与 lazy 诊断，帮助区分直链、站外解析、模板默认解析页策略。

---

## 1. lazy 类型三分法

### A. `common_lazy`
特征：
- 播放页存在 `player_*` JSON
- 可能带 `encrypt`
- 需要先解密 `json.url`

### B. `def_lazy`
特征：
- 模板默认直接：
```js
{ parse: 1, url: input }
```
- 网站播放页本身交给解析系统

### C. `cj_lazy`
特征：
- 采集站 / 解析接口 / `parse_url`
- 可能有 `json:` 解析接口

---

## 2. parse / jx 判断表

| 最终拿到的 URL 类型 | 建议返回 |
|---|---|
| 直链 `m3u8/mp4/m4a/mp3` | `{ parse:0, jx:0, url }` |
| 站外解析链接 | `{ parse:0, jx:1, url }` |
| 网站播放页本身 | `{ parse:1, url: input }` |

---

## 3. 播放专项强纪律

### 纪律 A
不要把 `parse:1 + 网站播放页链接` 一概判成错。

### 纪律 B
不要把任意 `http` 链接误判成直链。

### 纪律 C
遇到 `player_*` 配置，先查 `encrypt`。
