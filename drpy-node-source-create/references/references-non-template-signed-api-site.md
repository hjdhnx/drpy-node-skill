# 橘子动漫（mgnacg）开发经验总结

> 适用于这类 **非模板站 + 一级数据接口签名 + 详情资源列表静态 + 搜索验证码拦截但 suggest 可用** 的场景。

---

## 一、站点类型判断

### 结论
- **不是内置模板站**
- 不应先尝试 `模板: 'xxx'`
- 适合：
  - 首页推荐：HTML 解析
  - 一级：签名接口 `async function`
  - 二级：`async function`
  - 播放：先原页面嗅探
  - 搜索：suggest fallback

### 关键特征
- 详情页链接是 `/media/{id}/`
- 播放页链接是 `/bangumi/{id-sid-nid}/`
- 分类页本身虽然有列表展示，但真实一级数据由 JS 发起接口请求
- 搜索原生页会被验证码拦截

---

## 二、一级不要只看 HTML，先判断是否由前端接口驱动

### 错误思路
看到分类页能展示列表，就直接写普通 HTML 一级，或裸写 `url + 一级: 'json:...'`。

### 正确思路
先抓浏览器网络请求，确认分类页是否真实调用接口。

本案例中，分类页真实发起：

```txt
POST /index.php/api/vod
```

请求体包含：

```txt
type=1&class=&area=&lang=&version=&state=&letter=&page=1&time=1776567486&key=...
```

### 结论
如果页面真实用 JS 请求接口渲染列表：
- 一级应优先考虑 `async function`
- 不要想当然地把 `data-api` 当成可裸 GET 的开放 JSON 接口

---

## 三、不要把真实 POST 接口误判成“可裸 GET 的 json:url”

### 本案例踩坑
最初尝试：

```js
url: '/index.php/api/vod?type=fyclass&page=fypage&...'
一级: 'json:list;name;pic;state;id'
```

### 实际结果
直接 GET 该 URL 返回的是：

```txt
本模板作者QQ为：602524950|906259831，无其他联系方式
```

而不是 JSON。

### 经验
当页面里出现 `data-api="/index.php/api/vod"` 时：
- **不要默认它就是可裸 GET 的 JSON 接口**
- 要先确认：
  - 浏览器到底是 GET 还是 POST
  - 是否带签名参数
  - 是否带 Ajax 请求头

---

## 四、浏览器抓包非常关键：先查真实请求，再写规则

### 本案例抓包后确认
真实请求是：

```txt
POST https://www.mgnacg.com/index.php/api/vod
```

关键请求头：

```txt
X-Requested-With: XMLHttpRequest
Accept: application/json, text/javascript, */*; q=0.01
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

### 经验
当接口返回异常文本 / 非法请求时：
- 不要继续盲猜规则字符串
- 先上浏览器抓包确认：
  - 方法（GET/POST）
  - 请求头
  - 请求体
  - 是否带 time/key/token/cookie

---

## 五、签名接口不要只盯 key，先验证公式骨架

### 本案例最终确认
前端 `ecscript.js` 中存在：

```js
Md5(x) => hex_md5('DS' + x + EC.Pop.Uid)
```

分类接口中的 key 真实为：

```txt
key = md5('DS' + time + Uid)
```

### 已实锤信息
- `time`：当前秒级时间戳
- `Uid`：来自 `EC.Pop.Uid`
- `key`：`md5('DS' + time + Uid)`

### 经验
遇到签名接口时：
1. 先抓一组真实请求样本
2. 从前端 JS 中找 `md5 / hex_md5 / key / time`
3. 再用本地 Python 验证签名公式
4. 公式一旦命中，就不要继续猜 URL 结构，直接转向实现

---

## 六、页面上下文变量比 URL 正则更可靠

### 本案例一级 async 正确入口
分类和页码应优先直接使用：

```js
this.MY_CATE
this.MY_PAGE
```

而不是先去 `input.match(...)` 里猜。

### 经验
在 `一级: async function () {}` 中：
- 分类 ID 优先用 `this.MY_CATE`
- 页码优先用 `this.MY_PAGE`
- 不要先把简单问题复杂化成 URL 正则拆参

---

## 七、全局函数和 this 上下文要分清

### 本案例踩坑
把 `request` 从 `this` 里解构，导致：

```txt
request is not a function
```

### 正确认知
在 drpy async function 中：
- `request` / `post` 是**全局可直接调用函数**
- `MY_CATE` / `MY_PAGE` / `input` 等才是从 `this` 上拿

### 经验
不要写：

```js
let { request } = this;
```

应写：

```js
let { MY_CATE, MY_PAGE } = this;
let html = await request(url);
```

---

## 八、二级列表和详情信息分离时，优先上 `二级 async function`

### 本案例
详情页 `/media/{id}/` 中：
- 标题、图片、简介在静态 HTML
- 资源列表也在静态 HTML
- 但结构较复杂，不适合一开始就硬写普通二级字典

### 最终做法
使用：

```js
二级: async function () { ... }
```

自行拼装：
- `vod_name`
- `vod_pic`
- `vod_content`
- `vod_play_from`
- `vod_play_url`

### 经验
以下场景优先考虑 `二级 async`：
- 详情元信息与资源列表结构分离
- 线路与选集块不是简单的固定字典格式
- 需要过滤某些无效线路（如“已下线”）

---

## 九、播放链搞不定时，先退回原页面嗅探，不要死磕

### 本案例
播放页 `/bangumi/...` 虽然能抓到：

```js
var player_aaaa = {..., encrypt: 2, url: '...'}
```

但进一步解密时出现 UTF-8 / 非标准编码问题。

### 最终选择
先退回：

```js
lazy: async function () {
  let { input } = this;
  return { parse: 1, jx: 0, url: input };
}
```

### 经验
当播放页：
- 能确定是页面可播
- 但真实解密逻辑成本很高
- 且当前目标是先做完整可用源

应优先：
- 退回原页面嗅探
- 先保住可用性
- 不要因为死磕 lazy 影响整个源交付

---

## 十、搜索要分层判断：原生被验证码拦截时，优先 suggest

### 本案例
原生搜索页：
- 存在
- 但进入就要求验证码

suggest 接口：

```txt
/index.php/ajax/suggest?mid=1&wd=**&limit=50
```

可正常返回 JSON：
- `id`
- `name`
- `pic`

### 最终方案

```js
searchUrl: '/index.php/ajax/suggest?mid=1&wd=**&limit=50',
detailUrl: '/media/fyid/',
搜索: 'json:list;name;pic;;id'
```

### 经验
搜索优先级应判断为：
1. 原生搜索（若被验证码拦截则放弃）
2. suggest / 联想 JSON fallback（优先）
3. RSS fallback（备选）

---

## 十一、最终可复用的实现组合

本类站点最终可复用组合：

- 首页推荐：HTML 解析
- 一级：签名 POST 接口 `async function`
- 二级：`async function`
- 播放：原页面嗅探 `parse:1`
- 搜索：suggest JSON fallback

---

## 十二、写源阶段的工作顺序建议

面对类似站点时，建议顺序：

1. 判断是否非模板站
2. 浏览器抓包确认一级数据来源
3. 若一级为签名接口，先抠请求方式和 key 公式
4. 一级优先用 `MY_CATE + MY_PAGE`
5. 详情结构复杂时直接上 `二级 async`
6. 播放链难啃时先退回原页面嗅探
7. 搜索若验证码拦截，则优先 suggest

---

## 十三、最重要的教训

### 不要把问题想简单，也不要把方案写复杂
- 不能把签名接口误当裸 JSON
- 也不要在已经有 `MY_CATE / MY_PAGE` 时，还去手写 URL 正则拆参数
- 不能把 `request` 当成 `this.request`
- 也不要在播放解密成本高时执意死磕，影响整源交付

### 最优策略
**先用最小但正确的方式打通全链路，再做局部精修。**
