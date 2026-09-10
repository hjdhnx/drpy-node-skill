/**
 * test 组命令：test / evaluate
 * 移植自 drpy-node-mcp/tools/spiderTestTools.js，去掉 MCP content[] 包装。
 *
 * - test <source> <home|category|detail|search|play> [--class-id --ids --keyword --play-url --flag --ext]
 * - evaluate <source> [--class-id --keyword --timeout]
 *
 * 双后端（Q3 验证口径：以目标网关的实际行为为准）：
 *   local  → runtime.engine() 加载 drpy-node-bundle 的 localDsCore，调用 globalThis.getEngine
 *   remote → 远端运行时 GET /api/:module（服务器真实行为，含其环境变量/插件/daemon）
 * 评分/诊断编排全部在本地 CLI 层，两种后端共用同一套逻辑。
 */
import * as runtime from '../lib/runtime.js';
import fs from '../lib/fsUtil.js';
import { resolvePath } from '../lib/pathResolver.js';
import { runtimeCall, adminFetch } from '../lib/remote.js';

/**
 * 源名宽容解析：用户/AI 常给模糊名（"360影视"）、文件名（"360影视[官].js"）、带前缀路径。
 * ① 规范化（剥 spider/js 等前缀与 .js 后缀）② 精确匹配 ③ 唯一模糊命中自动采用（结果透明标注）
 * ④ 多候选/无候选 → 命令级报错并列出候选，绝不把"名字不对"伪装成"测试失败"。
 */
async function resolveSourceName(ctx, raw) {
  const stripped = String(raw).replace(/^spider\/(js|js_dr2|catvod|php|py)\//i, '').replace(/\.js$/i, '');
  let names = []; // 全部源文件路径（spider/js/xxx.js 形式）
  if (ctx.target.kind === 'remote') {
    const body = await adminFetch(ctx.target, 'GET', '/api/admin/sources');
    for (const [engine, arr] of Object.entries(body)) {
      if (engine === 'disabled' || !Array.isArray(arr)) continue;
      names.push(...arr.map((f) => `spider/${engine}/${f}`));
    }
  } else {
    for (const dir of ['spider/js', 'spider/catvod']) {
      try {
        names.push(...(await fs.readdir(resolvePath(dir))).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`));
      } catch { /* 目录不存在 */ }
    }
  }
  const base = (f) => f.replace(/^spider\/[^/]+\//, '').replace(/\.js$/i, '');
  const exact = names.find((f) => base(f) === stripped);
  if (exact) return { name: base(exact), autoMatched: false };
  const hits = names.filter((f) => base(f).includes(stripped));
  if (hits.length === 1) return { name: base(hits[0]), autoMatched: true, matched_from: String(raw) };
  if (hits.length > 1) {
    throw new Error(`源名 "${raw}" 模糊命中 ${hits.length} 个，请指定其一: ${hits.map(base).join(' | ')}`);
  }
  throw new Error(`未找到源 "${raw}"。用 src list --filter 关键词 查找真实文件名`);
}

function truncateData(data, maxLen = 3000) {
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '\n... (数据已截断，共 ' + str.length + ' 字符)';
}

/**
 * 按源名后缀推断更贴切的默认搜索词，避免对漫画/小说/短剧/音频类源一律搜"斗罗大陆"必然落空。
 * 源名常见后缀：[优][官][盘][磁][漫][画][书][短][听][密]。
 * 用户显式传 --keyword 仍优先生效；传 --keyword '' 显式跳过搜索（evaluate 原逻辑保留）。
 */
function defaultKeywordFor(sourceName) {
  const m = String(sourceName).match(/\[(漫|画|书|短|听)\]/);
  if (m) {
    const map = { 漫: '海贼王', 画: '海贼王', 书: '修仙', 短: '离婚', 听: '故事' };
    if (map[m[1]]) return map[m[1]];
  }
  return '斗罗大陆';
}

/**
 * 详情有数据但 vod_play_url 为空时的根因诊断。
 * drpy 二级分两类：dict 形式（tabs/lists/tab_text）与 async function。
 * 不同失效形态对应不同根因，据此给精确 hint，避免一刀切误判。
 */
function diagnoseEmptyPlay(item) {
  const keys = new Set(Object.keys(item));
  const hasPlayFromKey = keys.has('vod_play_from');
  const hasPlayUrlKey = keys.has('vod_play_url');
  // 形态A：返回的是列表项（只有 vod_id/vod_name/vod_pic 等基础字段，无播放线路字段）
  // -> 缺 detailUrl/detail 函数，二级没真正进入详情页
  const isListItem = !hasPlayFromKey && !hasPlayUrlKey
    && (keys.has('vod_name') || keys.has('title')) && keys.has('vod_pic')
    && !keys.has('vod_content');
  // 形态B：dict 二级已执行（有 vod_play_from/vod_play_url 字段但值空）
  // -> tabs 选择器写法错（误带 &&Text）或 tabs/lists 选择器未命中 DOM
  const isDictEmpty = hasPlayFromKey && hasPlayUrlKey;

  if (isListItem) {
    return {
      status: 'empty',
      item_keys: [...keys],
      root_cause: 'likely_missing_detailUrl',
      hint: '详情返回的是列表项(item_keys 无 vod_play_from/vod_play_url 字段，仅基础字段)，二级未真正进入详情页。根因：缺 detailUrl 或 detail 函数未取详情页 HTML。建议：补 detailUrl(如 /detail/fyid.html)，确保二级能 request 详情页。',
    };
  }
  if (isDictEmpty) {
    return {
      status: 'empty',
      item_keys: [...keys],
      root_cause: 'likely_tabs_or_lists_selector',
      hint: '二级已执行(有 vod_play_from/vod_play_url 字段但值为空)。若为 dict 二级，最高频根因是 tabs 的 && 后误写 Text/Html/属性(如 tabs:\'.module-tab-item&&Text\'，Text 非 pdfa 元素选择器，pdfa 返回空导致线路循环0次)--tabs 能带 &&，但 && 后必须是元素选择器(标签 a/dt/li、.class、#id)，文本靠 tab_text(默认 body&&Text)。也需确认 tabs/lists 选择器命中站点 DOM、tab_text 在 tab 元素上能取到文本(取空会兜底线路空)。排查：cli debug --rule <tabs选择器> --mode pdfa --url 详情页，count 应>0。详见 references-detail-dict-and-multiep.md 第4节。',
    };
  }
  return {
    status: 'empty',
    item_keys: [...keys],
    root_cause: 'unknown',
    hint: '详情已返回但 vod_play_url 为空。建议 cli fetch 详情页(移动端UA) 看播放线路 DOM 结构，调整二级提取。',
  };
}

function buildTestResult(interfaceName, success, data, error, duration) {
  const result = { interface: interfaceName, success, duration_ms: duration };
  if (data !== undefined) {
    result.data_preview = truncateData(data);
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.list)) result.item_count = data.list.length;
      else if (Array.isArray(data)) result.item_count = data.length;
      if (Array.isArray(data.class)) result.class_count = data.class.length;
    }
  }
  if (error) result.error = error;
  return result;
}

async function callEngine(ctx, sourceName, query) {
  if (ctx.target.kind === 'remote') {
    // 多引擎源（php/py/cat）远程测试需透传 do/extend（与 /config 的 sites.ext 对应）
    if (ctx.flags.do) query.do = ctx.flags.do;
    if (ctx.flags.extend) query.extend = ctx.flags.extend;
    return runtimeCall(ctx.target, sourceName, query);
  }
  const engine = await runtime.engine();
  return engine(sourceName, query);
}

async function testHome(ctx, sourceName) {
  const start = performance.now();
  try {
    const data = await callEngine(ctx, sourceName, {});
    const duration = Math.round(performance.now() - start);
    const hasClasses = data && Array.isArray(data.class) && data.class.length > 0;
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!(hasClasses || hasList);
    return buildTestResult('首页(home)', success, data, success ? undefined : '返回数据中无有效分类或推荐列表', duration);
  } catch (e) {
    return buildTestResult('首页(home)', false, undefined, e.message, Math.round(performance.now() - start));
  }
}

async function testCategory(ctx, sourceName, classId, ext) {
  const start = performance.now();
  try {
    const query = { ac: 'list', t: classId };
    if (ext) {
      // 引擎要求 ext 为 Base64 的 JSON；明文 JSON（以 { 开头）会被引擎静默解析失败回退空筛选，
      // 返回不带筛选的默认列表——自动编码避免这种「假成功」。base64 字符集不含 {，此判断对合法 base64 输入无副作用。
      query.ext = ext.trimStart().startsWith('{') ? Buffer.from(ext, 'utf8').toString('base64') : ext;
    }
    const data = await callEngine(ctx, sourceName, query);
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    return {
      ...buildTestResult('一级(category)', success, data, success ? undefined : '分类列表为空', duration),
      class_id: classId,
      first_item: hasList ? truncateData(data.list[0], 500) : undefined,
    };
  } catch (e) {
    return { ...buildTestResult('一级(category)', false, undefined, e.message, Math.round(performance.now() - start)), class_id: classId };
  }
}

async function testDetail(ctx, sourceName, ids) {
  const start = performance.now();
  const idsArray = Array.isArray(ids) ? ids : typeof ids === 'string' && ids.includes(',') ? ids.split(',') : [String(ids)];
  try {
    const data = await callEngine(ctx, sourceName, { ac: 'detail', ids: idsArray });
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    let detail;
    if (hasList) {
      const item = data.list[0];
      const playUrl = item.vod_play_url || '';
      detail = {
        vod_id: item.vod_id || item.id,
        vod_name: item.vod_name || item.title,
        vod_play_from: item.vod_play_from,
        vod_play_url_count: playUrl ? playUrl.split('#').length : 0,
      };
      if (!playUrl) {
        // 根因诊断：详情已返回数据但没有播放线路。区分缺 detailUrl / tabs 误带&&Text / 选择器未命中。
        detail.play_url_diagnosis = diagnoseEmptyPlay(item);
      }
    }
    return {
      ...buildTestResult('二级(detail)', success, data, success ? undefined : '详情数据为空', duration),
      test_ids: ids,
      detail_preview: detail,
    };
  } catch (e) {
    return { ...buildTestResult('二级(detail)', false, undefined, e.message, Math.round(performance.now() - start)), test_ids: ids };
  }
}

async function testSearch(ctx, sourceName, keyword) {
  const start = performance.now();
  try {
    const data = await callEngine(ctx, sourceName, { wd: keyword });
    const duration = Math.round(performance.now() - start);
    const hasList = data && Array.isArray(data.list) && data.list.length > 0;
    const success = !!hasList;
    return { ...buildTestResult('搜索(search)', success, data, success ? undefined : '搜索结果为空', duration), keyword };
  } catch (e) {
    return { ...buildTestResult('搜索(search)', false, undefined, e.message, Math.round(performance.now() - start)), keyword };
  }
}

async function testPlay(ctx, sourceName, playUrl, flag) {
  const start = performance.now();
  try {
    const query = { play: playUrl };
    if (flag) query.flag = flag;
    const data = await callEngine(ctx, sourceName, query);
    const duration = Math.round(performance.now() - start);
    const hasUrl = data && data.url && typeof data.url === 'string' && data.url.length > 0;
    const success = !!hasUrl;
    return {
      ...buildTestResult('播放(play)', success, data, success ? undefined : '未返回有效播放地址', duration),
      play_url_preview: hasUrl ? data.url.substring(0, 200) : undefined,
    };
  } catch (e) {
    return { ...buildTestResult('播放(play)', false, undefined, e.message, Math.round(performance.now() - start)) };
  }
}

/** test <source> <home|category|detail|search|play> */
async function test(ctx) {
  const rawName = ctx.positional[0];
  const iface = ctx.positional[1];
  if (!rawName || !iface) throw new Error('用法: test <source> <home|category|detail|search|play> [...]');
  const resolved = await resolveSourceName(ctx, rawName);
  const sourceName = resolved.name;

  const result = await (async () => {
    switch (iface) {
      case 'home':
        return await testHome(ctx, sourceName);
      case 'category':
        return await testCategory(ctx, sourceName, ctx.flags['class-id'] || '1', ctx.flags.ext);
      case 'detail': {
        if (!ctx.flags.ids) throw new Error('二级测试需要 --ids（可通过先测一级获取 vod_id）');
        return await testDetail(ctx, sourceName, ctx.flags.ids);
      }
      case 'search':
        return await testSearch(ctx, sourceName, ctx.flags.keyword || '斗罗大陆');
      case 'play': {
        if (!ctx.flags['play-url']) throw new Error('播放测试需要 --play-url');
        return await testPlay(ctx, sourceName, ctx.flags['play-url'], ctx.flags.flag);
      }
      default:
        throw new Error(`未知接口: ${iface}，支持: home, category, detail, search, play`);
    }
  })();
  if (resolved.autoMatched) {
    result.source_resolved = `输入 "${resolved.matched_from}" → 实测源 "${sourceName}"`;
  }
  return result;
}

/** evaluate <source> [--class-id --keyword --timeout] */
async function evaluate(ctx) {
  const resolved = await resolveSourceName(ctx, ctx.positional[0]);
  const sourceName = resolved.name;
  const classId = ctx.flags['class-id'] || null;
  const effectiveKeyword = ctx.flags.keyword === undefined ? defaultKeywordFor(sourceName) : ctx.flags.keyword;

  const overallStart = performance.now();
  const results = {
    source_name: sourceName,
    target: ctx.target.name,
    total_duration_ms: 0,
    interfaces: {},
    evaluation: { valid: false, score: 0, details: [] },
  };
  if (resolved.autoMatched) {
    results.source_resolved = `输入 "${resolved.matched_from}" → 实测源 "${sourceName}"`;
  }

  let firstCategoryId = classId;
  let firstItemIds = null;
  let firstPlayUrl = null;
  let firstPlayFlag = null;
  let detailItem = null; // 供 play 跳过时做根因诊断

  // Step 1: Home
  let homeData = null;
  try { homeData = await callEngine(ctx, sourceName, {}); } catch (_) {}
  const homeResult = buildTestResult('首页(home)', !!(homeData && (Array.isArray(homeData.class) || Array.isArray(homeData.list))), homeData, undefined, Math.round(performance.now() - overallStart));
  if (!homeResult.success && homeData) homeResult.error = '返回数据中无有效分类或推荐列表';
  results.interfaces.home = homeResult;
  results.evaluation.details.push(homeResult.success ? '✅ 首页: 正常' : `❌ 首页: ${homeResult.error || '无数据'}`);

  if (!firstCategoryId && homeData && Array.isArray(homeData.class) && homeData.class.length > 0) {
    firstCategoryId = homeData.class[0].type_id || homeData.class[0].id || String(homeData.class[0]);
  }

  // Step 2: Category
  if (firstCategoryId) {
    const catStart = performance.now();
    let catData = null;
    try { catData = await callEngine(ctx, sourceName, { ac: 'list', t: firstCategoryId }); } catch (_) {}
    const hasList = catData && Array.isArray(catData.list) && catData.list.length > 0;
    const catResult = { ...buildTestResult('一级(category)', !!hasList, catData, hasList ? undefined : '分类列表为空', Math.round(performance.now() - catStart)), class_id: firstCategoryId, first_item: hasList ? truncateData(catData.list[0], 500) : undefined };
    results.interfaces.category = catResult;
    if (catResult.success) {
      results.evaluation.details.push(`✅ 一级: 正常 (分类ID: ${firstCategoryId}, ${catResult.item_count}条)`);
      if (hasList) {
        const firstItem = catData.list[0];
        firstItemIds = firstItem.vod_id || firstItem.id || firstItem.url;
        // 一级解析失败时常见占位项：vod_id="no_data"、vod_name 含"无数据/防无限请求"。
        // 若首项是占位，detail 串联必失败，应在一级层就标注根因，避免误判为二级问题。
        const firstName = String(firstItem.vod_name || firstItem.title || '');
        if (String(firstItemIds) === 'no_data' || /无数据|防无限/.test(firstName)) {
          catResult.success = false;
          catResult.error = `一级首项为占位(vod_id=${firstItemIds}, name=${firstName || '空'})，一级规则解析失败未取到真实列表`;
          catResult.first_item_is_placeholder = true;
          results.evaluation.details[results.evaluation.details.length - 1] = `❌ 一级: 首项占位 no_data (分类ID: ${firstCategoryId}, 表面${catResult.item_count}条实为占位)。根因在一级选择器(未命中站点列表DOM)，非二级/播放链路。建议 cli fetch 分类页(移动端UA) 看列表结构，调一级选择器。`;
          firstItemIds = null; // 阻断 detail 串联，避免误判二级
        }
      }
    } else {
      results.evaluation.details.push(`❌ 一级: ${catResult.error || '无数据'} (分类ID: ${firstCategoryId})`);
    }
  } else {
    results.interfaces.category = { interface: '一级(category)', success: false, error: '无可用分类ID，跳过', skipped: true };
    results.evaluation.details.push('⏭️ 一级: 跳过 (无分类ID)');
  }

  // Step 3: Detail
  if (firstItemIds) {
    const detailIdsArray = Array.isArray(firstItemIds) ? firstItemIds : [String(firstItemIds)];
    const detailStart = performance.now();
    let detailData = null;
    try { detailData = await callEngine(ctx, sourceName, { ac: 'detail', ids: detailIdsArray }); } catch (_) {}
    const hasDetailList = detailData && Array.isArray(detailData.list) && detailData.list.length > 0;
    const detailResult = { ...buildTestResult('二级(detail)', !!hasDetailList, detailData, hasDetailList ? undefined : '详情数据为空', Math.round(performance.now() - detailStart)), test_ids: firstItemIds };
    if (hasDetailList) {
      const item = detailData.list[0];
      const playUrl = item.vod_play_url || '';
      detailResult.detail_preview = { vod_id: item.vod_id || item.id, vod_name: item.vod_name || item.title, vod_play_from: item.vod_play_from, vod_play_url_count: playUrl ? playUrl.split('#').length : 0 };
      if (!playUrl) {
        detailResult.detail_preview.play_url_diagnosis = diagnoseEmptyPlay(item);
      }
    }
    results.interfaces.detail = detailResult;
    if (detailResult.success) {
      results.evaluation.details.push(`✅ 二级: 正常 (ID: ${firstItemIds})`);
      if (hasDetailList) {
        const item = detailData.list[0];
        detailItem = item;
        if (item.vod_play_url) {
          const urls = item.vod_play_url.split('#');
          if (urls.length > 0 && urls[0]) {
            const parts = urls[0].split('$');
            firstPlayUrl = parts.length > 1 ? parts[1] : parts[0];
          }
        }
        if (item.vod_play_from) {
          const froms = item.vod_play_from.split('$$$');
          if (froms.length > 0) firstPlayFlag = froms[0] || undefined;
        }
      }
    } else {
      results.evaluation.details.push(`❌ 二级: ${detailResult.error || '无数据'} (ID: ${firstItemIds})`);
    }
  } else {
    results.interfaces.detail = { interface: '二级(detail)', success: false, error: '无可用影片ID，跳过', skipped: true };
    results.evaluation.details.push('⏭️ 二级: 跳过 (无影片ID)');
  }

  // Step 4: Search
  if (effectiveKeyword !== '') {
    const searchResult = await testSearch(ctx, sourceName, effectiveKeyword);
    results.interfaces.search = searchResult;
    results.evaluation.details.push(searchResult.success ? `✅ 搜索: 正常 (关键词: ${effectiveKeyword}, ${searchResult.item_count}条)` : `❌ 搜索: ${searchResult.error || '无数据'} (关键词: ${effectiveKeyword})`);
  }

  // Step 5: Play
  if (firstPlayUrl) {
    const playResult = await testPlay(ctx, sourceName, firstPlayUrl, firstPlayFlag);
    results.interfaces.play = playResult;
    results.evaluation.details.push(playResult.success ? '✅ 播放: 正常 (返回有效播放地址)' : `❌ 播放: ${playResult.error || '无有效地址'}`);
  } else {
    let reason;
    const detailRes = results.interfaces.detail;
    const detailSucceeded = detailRes && detailRes.success;
    if (!detailSucceeded) {
      reason = detailRes && detailRes.skipped ? '二级详情跳过(无影片ID)，无播放URL' : '二级详情未通过，无播放URL可提取';
    } else if (detailItem) {
      reason = detailItem.vod_play_url
        ? '详情有 vod_play_url 但首条无法解析出 url'
        : '二级详情已返回但 vod_play_url 为空（播放线路选择器未命中或缺 detailUrl）';
    } else {
      reason = '二级详情为空，无播放URL';
    }
    results.interfaces.play = { interface: '播放(play)', success: false, error: reason, skipped: true };
    results.evaluation.details.push(`⏭️ 播放: 跳过 (${reason})`);
  }

  // Score
  const catOk = results.interfaces.category && results.interfaces.category.success;
  const detailOk = results.interfaces.detail && results.interfaces.detail.success;
  const playOk = results.interfaces.play && results.interfaces.play.success;
  const homeOk = results.interfaces.home && results.interfaces.home.success;
  const searchOk = results.interfaces.search && results.interfaces.search.success;
  let score = 0;
  if (homeOk) score += 20;
  if (catOk) score += 20;
  if (detailOk) score += 25;
  if (playOk) score += 25;
  if (searchOk) score += 10;
  results.evaluation.score = score;
  results.evaluation.valid = !!(catOk && detailOk && playOk);
  results.total_duration_ms = Math.round(performance.now() - overallStart);
  return results;
}

export const commands = {
  test,
  evaluate,
};
