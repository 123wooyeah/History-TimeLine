import type { Person, HistoricalEvent } from './types';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const CACHE_KEY = 'wikidata_people_cache_v1';
const EVENT_CACHE_KEY = 'wikidata_events_cache_v1';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天

let jsonpCounter = 0;

function jsonp<T>(url: string, timeoutMs: number = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `wd_cb_${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement('script');

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('请求超时'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete (window as any)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    (window as any)[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('网络错误'));
    };

    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function getCache(): Record<string, { person: Person; timestamp: number }> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setCache(id: string, person: Person) {
  try {
    const cache = getCache();
    cache[id] = { person, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function getCachedPerson(id: string): Person | null {
  const cache = getCache();
  const entry = cache[id];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.person;
  }
  return null;
}

// 搜索人物（返回 Wikidata 实体列表）
export async function searchWikidataPeople(keyword: string): Promise<Array<{ id: string; label: string; description: string }>> {
  if (!keyword.trim()) return [];

  try {
    const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(keyword)}&language=zh&format=json&limit=20&type=item`;
    const data: any = await jsonp(url, 8000);
    if (!data || !data.search) return [];

    // 过滤非人物结果：排除明显是概念、理论、物体的描述
    const nonPersonKeywords = ['方程', '理论', '效应', '概念', '原理', '定律', '公式', '常数',
      '行星', '恒星', '星系', '粒子', '元素', '化合物', '算法', '协议', '标准',
      '单位', '量纲', '函数', '方程', '悖论', '猜想', '假设', '定理', '引理',
      '虫洞', '黑洞', '白洞', '奇点', '辐射', '射线', '波长', '频率',
      '小说', '诗歌', '戏剧', '电影', '歌曲', '专辑', '画作', '雕塑',
      '建筑', '桥梁', '铁路', '公路', '城市', '国家', '河流', '山脉',
      '岛屿', '湖泊', '沙漠', '海洋', '海峡', '半岛', '高原', '平原',
      '公司', '组织', '机构', '政党', '军队', '学校', '大学', '学院',
      '运动', '游戏', '比赛', '节日', '假期', '事件', '战争', '革命',
      '项目', '计划', '工程', '系统', '软件', '硬件', '设备', '机器',
      '药物', '疾病', '病毒', '细菌', '基因', '细胞', '组织', '器官',
      '时期', '时代', '朝代', '世纪', '年代', '王朝', '帝国', '王国',
      '制度', '主义', '思想', '学派', '宗教', '神话', '传说', '寓言',
      'language', 'equation', 'theory', 'effect', 'concept', 'principle',
      'planet', 'star', 'galaxy', 'particle', 'element', 'compound',
      'algorithm', 'protocol', 'standard', 'unit', 'function', 'paradox',
      'conjecture', 'hypothesis', 'theorem', 'radiation', 'ray',
      'wormhole', 'black hole', 'singularity', 'wavelength', 'frequency',
      'novel', 'poem', 'film', 'movie', 'song', 'album', 'painting',
      'building', 'bridge', 'railway', 'highway', 'city', 'country',
      'river', 'mountain', 'island', 'lake', 'desert', 'ocean',
      'company', 'organization', 'institution', 'party', 'army',
      'university', 'college', 'school', 'sport', 'game', 'festival',
      'holiday', 'event', 'war', 'revolution', 'project', 'plan',
      'software', 'hardware', 'device', 'machine', 'drug', 'disease',
      'virus', 'bacteria', 'gene', 'cell', 'empire', 'kingdom',
      'dynasty', 'century', 'era', 'period', 'religion', 'mythology',
      'letter', 'document', 'manuscript', 'treatise', 'essay', 'speech',
      'declaration', 'constitution', 'law', 'treaty', 'agreement',
      'manifesto', 'pamphlet', 'book', 'textbook', 'dictionary',
      'encyclopedia', 'journal', 'magazine', 'newspaper',
      // 地点建筑类
      'residence', 'former residence', 'birthplace', 'memorial', 'museum',
      '故居', '纪念馆', '出生地', '遗址', '陵墓', '祠堂', '庙宇'];

    const results = data.search.filter((item: any) => {
      const desc = (item.description || '').toLowerCase();
      const label = (item.label || '').toLowerCase();

      // 标签层面的强过滤：明显是作品/文集/地点的直接排除
      const labelNonPersonPatterns = [
        /^poetry of /i, /^works of /i, /^collected /i, /^complete /i,
        /^selected /i, /^the .* of /i, /^poems of /i, /^writings of /i,
        /^songs of /i, /^paintings of /i, /^novel /i, /^play /i,
        /.*'s former residence/i, /.*'s residence/i, /.*'s birthplace/i,
        /.*'s memorial/i, /.*'s museum/i, /.*故居/i, /.*纪念馆/i,
        /.*陵墓/i, /.*祠堂/i, /.*遗址/i,
        /诗/, /词/, /曲/, /赋/, /记/, /传/, /论/, /经/, /集/,
        /全集/, /选集/, /文集/, /诗选/, /词选/, /诗集/, /语录/
      ];
      for (const pattern of labelNonPersonPatterns) {
        if (pattern.test(item.label || '')) return false;
      }

      // 如果描述中包含非人物关键词，排除
      for (const kw of nonPersonKeywords) {
        if (desc.includes(kw.toLowerCase())) {
          // 但如果描述中同时含有人物相关词，保留
          if (isPersonDescription(desc)) {
            return true;
          }
          return false;
        }
      }

      // 描述中含作品/文集类关键词且不含人物身份词的排除
      const workKeywords = ['poetry', 'poems', 'poetic', 'works', 'collection', 'collected',
        'anthology', 'literary work', 'body of work', 'oeuvre', 'writings',
        '作品集', '诗集', '文集', '诗选', '全集', '选集'];
      for (const kw of workKeywords) {
        if (desc.includes(kw.toLowerCase()) && !isPersonDescription(desc)) {
          return false;
        }
      }

      // 标签中含中文且2-4字的更可能是人物（简单启发式）
      const hasChinese = /[\u4e00-\u9fa5]/.test(item.label || '');
      if (hasChinese && label.length >= 2 && label.length <= 4) return true;

      // 有描述且描述中含明显人物特征的保留
      if (isPersonDescription(desc)) return true;

      return false;
    });

    // 按人物相关度排序：有明确人物身份词的排前面
    results.sort((a: any, b: any) => {
      const aDesc = (a.description || '').toLowerCase();
      const bDesc = (b.description || '').toLowerCase();
      const aScore = personScore(aDesc);
      const bScore = personScore(bDesc);
      return bScore - aScore;
    });

    return results.slice(0, 5).map((item: any) => ({
      id: item.id,
      label: item.label || '',
      description: item.description || '',
    }));
  } catch (e) {
    console.warn('Wikidata 搜索失败:', e);
    return [];
  }
}

// 判断描述是否包含人物身份特征
function isPersonDescription(desc: string): boolean {
  const personKeywords = [
    // 中文身份词
    '学家', '学者', '家', '师', '士', '者', '帝', '王', '侯', '公', '卿',
    '皇帝', '国王', '总统', '总理', '领袖', '创始人', '元首', '主席',
    '首相', '大臣', '将军', '元帅', '上校', '中尉',
    '诗人', '作家', '画家', '书法家', '音乐家', '作曲家', '指挥家',
    '科学家', '物理学家', '化学家', '生物学家', '天文学家', '数学家',
    '哲学家', '思想家', '教育家', '政治家', '军事家', '外交家',
    '探险家', '旅行家', '发明家', '工程师', '建筑师', '医生', '医学家',
    '经济学家', '社会学家', '心理学家', '历史学家', '考古学家',
    '演员', '导演', '歌手', '舞蹈家', '运动员', '教练',
    '和尚', '道士', '神父', '牧师', '教皇', '教主',
    '人物', '名人', '贤人', '圣人', '伟人',
    // 英文身份词
    'scientist', 'physicist', 'chemist', 'biologist', 'astronomer', 'mathematician',
    'philosopher', 'writer', 'poet', 'novelist', 'playwright', 'author',
    'politician', 'statesman', 'leader', 'president', 'prime minister', 'emperor',
    'king', 'queen', 'prince', 'princess', 'duke', 'lord',
    'general', 'admiral', 'marshal', 'commander', 'soldier',
    'artist', 'painter', 'sculptor', 'architect', 'designer',
    'musician', 'composer', 'singer', 'conductor', 'dancer', 'actor',
    'explorer', 'inventor', 'engineer', 'doctor', 'physician',
    'economist', 'historian', 'archaeologist', 'psychologist', 'sociologist',
    'theologian', 'monk', 'priest', 'pope', 'bishop',
    'founder', 'entrepreneur', 'businessman', 'athlete', 'coach',
    'human being', 'person', 'figure', 'born', 'died',
  ];
  for (const kw of personKeywords) {
    if (desc.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// 给描述打分，人物特征越明确分数越高
function personScore(desc: string): number {
  let score = 0;
  const strongIndicators = ['scientist', 'physicist', 'chemist', 'biologist', 'astronomer',
    'mathematician', 'philosopher', 'politician', 'emperor', 'president', 'king',
    'general', 'poet', 'writer', 'artist', 'painter', 'composer', 'inventor',
    'explorer', 'founder', 'leader', 'architect', 'engineer', 'doctor',
    '学家', '皇帝', '总统', '首相', '将军', '诗人', '作家', '画家',
    '科学家', '哲学家', '思想家', '政治家', '军事家'];
  for (const kw of strongIndicators) {
    if (desc.includes(kw.toLowerCase())) score += 10;
  }
  const mediumIndicators = ['born', 'died', 'lived', '人物', '学者', '家', '师',
    'writer', 'artist', 'musician', 'actor', 'athlete', 'priest', 'monk'];
  for (const kw of mediumIndicators) {
    if (desc.includes(kw.toLowerCase())) score += 3;
  }
  if (/[\u4e00-\u9fa5]/.test(desc) && desc.length <= 10) score += 2; // 短中文描述更可能是人物
  return score;
}

// 解析 Wikidata 时间格式为年份
// 格式示例: +1879-03-14T00:00:00Z, -0551-01-01T00:00:00Z, +00000002023-01-01T00:00:00Z
function parseWikidataYear(timeStr: string): { year: number; approx: boolean } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  // 匹配：可选符号 + 数字年份 + 月日部分
  const match = timeStr.match(/^([+-]?)(\d{1,11})-\d{1,2}/);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const year = parseInt(match[2], 10);
  if (isNaN(year) || year === 0) return null;
  return { year: sign * year, approx: false };
}

// 从描述文本中提取生卒年（用于 Wikidata 属性数据不准确时的兜底）
// 支持格式："前332年－前257年"、"c. 332 BC – 257 BC"、"332 BC - 257 BC"、"公元前551年―公元前479年"等
function extractYearsFromDescription(desc: string): { birth: number | null; death: number | null; approx: boolean } {
  if (!desc) return { birth: null, death: null, approx: false };

  const result: { birth: number | null; death: number | null; approx: boolean } = {
    birth: null,
    death: null,
    approx: false,
  };

  const text = desc.toLowerCase();
  result.approx = text.includes('c.') || text.includes('约') || text.includes('circa') || text.includes('around');

  // 辅助：将字符串年份转为数字（支持中文"前/公元前"和英文"BC"）
  const toYear = (yearStr: string, isBC: boolean): number => {
    const y = parseInt(yearStr.replace(/[,\s]/g, ''), 10);
    if (isNaN(y)) return 0;
    return isBC ? -y : y;
  };

  // 模式1：英文格式 "c. 332 BC – 257 BC" 或 "332 BC - 257 BC"
  const enPattern = /(?:c\.?\s*)?(\d{1,4})\s*bc\s*[-–—]\s*(\d{1,4})\s*bc/i;
  let m = text.match(enPattern);
  if (m) {
    result.birth = toYear(m[1], true);
    result.death = toYear(m[2], true);
    return result;
  }

  // 模式2：英文格式 "1879–1955"（公元后）
  const enAdPattern = /(\d{3,4})\s*[-–—]\s*(\d{3,4})/;
  m = text.match(enAdPattern);
  if (m && !text.includes('bc')) {
    result.birth = toYear(m[1], false);
    result.death = toYear(m[2], false);
    return result;
  }

  // 模式3：中文格式 "公元前332年－公元前257年" 或 "前332年—前257年"
  const zhPattern = /(?:公元)?前(\d{1,4})年\s*[-—－]\s*(?:公元)?前(\d{1,4})年/;
  m = desc.match(zhPattern);
  if (m) {
    result.birth = toYear(m[1], true);
    result.death = toYear(m[2], true);
    return result;
  }

  // 模式4：中文格式 "1879年－1955年"（公元后）
  const zhAdPattern = /(\d{3,4})年\s*[-—－]\s*(\d{3,4})年/;
  m = desc.match(zhAdPattern);
  if (m && !desc.includes('前')) {
    result.birth = toYear(m[1], false);
    result.death = toYear(m[2], false);
    return result;
  }

  return result;
}

// 根据实体ID获取人物详细信息
export async function getWikidataPerson(entityId: string): Promise<Person | null> {
  // 先查缓存
  const cached = getCachedPerson(`wd:${entityId}`);
  if (cached) return cached;

  try {
    // 获取实体基本信息 + 属性
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(entityId)}&format=json&props=labels|descriptions|claims&languages=zh|en`;
    const data: any = await jsonp(url, 15000);

    // 检查 API 错误
    if (data?.error) {
      console.warn('Wikidata API 错误:', data.error);
      return null;
    }

    const entity = data?.entities?.[entityId];
    if (!entity) {
      console.warn('Wikidata 实体不存在:', entityId);
      return null;
    }
    if (entity.missing !== undefined) {
      console.warn('Wikidata 实体缺失:', entityId);
      return null;
    }

    const labels = entity.labels || {};
    const descriptions = entity.descriptions || {};
    const claims = entity.claims || {};

    const name = labels.zh?.value || labels.en?.value || entityId;
    const description = descriptions.zh?.value || descriptions.en?.value || '';

    // 验证是否为人类（P31 实例化 = Q5 人类）
    const instanceOf = claims.P31?.map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean) || [];
    const isHuman = instanceOf.includes('Q5');

    // 提取出生年 P569（取第一个有效值）
    const birthClaim = getFirstValidTimeClaim(claims.P569);
    const deathClaim = getFirstValidTimeClaim(claims.P570);

    const hasBirthDate = !!birthClaim?.time;

    // 如果不是人类且没有出生日期，跳过
    if (!isHuman && !hasBirthDate) {
      console.warn('Wikidata 实体非人类且无出生日期:', entityId, name, instanceOf);
      return null;
    }

    let birthYear: number | null = null;
    let deathYear: number | null = null;
    let birthApprox = false;
    let deathApprox = false;
    let birthUnknown = false;
    let deathUnknown = false;

    if (birthClaim?.time) {
      const parsed = parseWikidataYear(birthClaim.time);
      if (parsed) {
        birthYear = parsed.year;
        const precision = birthClaim.precision ?? 11;
        // 精度低于年（如世纪、千年）标记为约
        birthApprox = precision < 9;
        // 精度低于百年（世纪级及以下）标记为生年不详
        birthUnknown = precision < 8;
      } else {
        console.warn('无法解析出生日期:', birthClaim.time, entityId);
      }
    }

    if (deathClaim?.time) {
      const parsed = parseWikidataYear(deathClaim.time);
      if (parsed) {
        deathYear = parsed.year;
        const precision = deathClaim.precision ?? 11;
        deathApprox = precision < 9;
        deathUnknown = precision < 8;
      }
    }

    if (birthYear === null) {
      console.warn('无法获取出生年份:', entityId, name);
      return null;
    }

    // 数据校验：如果出生年晚于去世年（Wikidata 数据质量问题，如出生只有世纪级精度）
    // 尝试从描述文本中提取更准确的生卒年
    if (deathYear !== null && birthYear > deathYear) {
      console.warn(`Wikidata 生卒年异常 (${birthYear} > ${deathYear})，尝试从描述中修正:`, name);
      const extracted = extractYearsFromDescription(description);
      if (extracted.birth !== null && extracted.death !== null && extracted.birth < extracted.death) {
        birthYear = extracted.birth;
        deathYear = extracted.death;
        birthApprox = birthApprox || extracted.approx;
        deathApprox = deathApprox || extracted.approx;
        console.warn(`已修正为: ${birthYear} ~ ${deathYear}`);
      }
    }

    // 推断领域（从描述中粗略判断）
    const field = inferField(description, name);
    const dynasty = inferDynasty(description, birthYear);

    const person: Person = {
      id: `wd:${entityId}`,
      name,
      aliases: [],
      birth: birthYear,
      death: deathYear,
      birthApprox,
      deathApprox,
      birthUnknown,
      deathUnknown,
      dynasty,
      country: '',
      field,
      description: description || '（来自 Wikidata）',
    };

    // 写入缓存
    setCache(`wd:${entityId}`, person);
    return person;
  } catch (e: any) {
    console.warn('获取 Wikidata 实体失败:', entityId, e?.message || e);
    return null;
  }
}

// 从 claims 数组中获取第一个有效的时间值
function getFirstValidTimeClaim(claims: any[] | undefined): any | null {
  if (!claims || !Array.isArray(claims)) return null;
  for (const claim of claims) {
    const snak = claim.mainsnak;
    if (!snak || snak.snaktype !== 'value') continue;
    const value = snak.datavalue?.value;
    if (value?.time && typeof value.time === 'string') {
      return value;
    }
  }
  return null;
}

function inferField(description: string, name: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('哲学') || desc.includes('思想') || name.includes('子')) return '思想家';
  if (desc.includes('皇帝') || desc.includes('国王') || desc.includes('政治家') || desc.includes('总统')) return '政治家';
  if (desc.includes('将军') || desc.includes('军事')) return '军事家';
  if (desc.includes('文学') || desc.includes('诗人') || desc.includes('作家') || desc.includes('小说')) return '文学家';
  if (desc.includes('科学') || desc.includes('物理') || desc.includes('化学') || desc.includes('生物') || desc.includes('数学') || desc.includes('发明')) return '科学家';
  if (desc.includes('画') || desc.includes('艺术') || desc.includes('音乐') || desc.includes('作曲') || desc.includes('雕塑')) return '艺术家';
  if (desc.includes('历史') || desc.includes('史学')) return '史学家';
  if (desc.includes('探险') || desc.includes('航海') || desc.includes('旅行')) return '探险家';
  return '其他';
}

function inferDynasty(_description: string, birthYear: number | null): string {
  if (!birthYear) return '未知';
  if (birthYear < -2070) return '上古';
  if (birthYear < -1600) return '夏';
  if (birthYear < -1046) return '商';
  if (birthYear < -771) return '西周';
  if (birthYear < -476) return '春秋';
  if (birthYear < -221) return '战国';
  if (birthYear < -207) return '秦';
  if (birthYear < 8) return '西汉';
  if (birthYear < 25) return '新朝';
  if (birthYear < 220) return '东汉';
  if (birthYear < 280) return '三国';
  if (birthYear < 316) return '西晋';
  if (birthYear < 420) return '东晋';
  if (birthYear < 589) return '南北朝';
  if (birthYear < 618) return '隋';
  if (birthYear < 907) return '唐';
  if (birthYear < 960) return '五代十国';
  if (birthYear < 1127) return '北宋';
  if (birthYear < 1279) return '南宋';
  if (birthYear < 1368) return '元';
  if (birthYear < 1644) return '明';
  if (birthYear < 1912) return '清';
  if (birthYear < 1949) return '民国';
  return '现代';
}

// ============ 事件相关功能 ============

function getEventCache(): Record<string, { event: HistoricalEvent; timestamp: number }> {
  try {
    const raw = localStorage.getItem(EVENT_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setEventCache(id: string, event: HistoricalEvent) {
  try {
    const cache = getEventCache();
    cache[id] = { event, timestamp: Date.now() };
    localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function getCachedEvent(id: string): HistoricalEvent | null {
  const cache = getEventCache();
  const entry = cache[id];
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.event;
  }
  return null;
}

// 搜索事件（返回 Wikidata 实体列表）
export async function searchWikidataEvents(keyword: string): Promise<Array<{ id: string; label: string; description: string }>> {
  if (!keyword.trim()) return [];

  try {
    const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(keyword)}&language=zh&format=json&limit=20&type=item`;
    const data: any = await jsonp(url, 8000);
    if (!data || !data.search) return [];

    // 过滤非事件结果
    const eventKeywords = ['战争', '战役', '革命', '起义', '运动', '事件', '会议', '条约', '协定',
      '宣言', '公告', '法案', '改革', '政变', '暴动', '叛乱', '入侵', '征服',
      '建国', '灭亡', '统一', '分裂', '登基', '退位', '迁都', '变法',
      'war', 'battle', 'revolution', 'uprising', 'movement', 'event', 'conference',
      'treaty', 'agreement', 'declaration', 'act', 'reform', 'coup', 'invasion',
      'conquest', 'founding', 'establishment', 'dissolution', 'unification',
      '战争', '起义', '革命', '变法', '运动', '事变', '大战', '会战', '大捷',
      '之乱', '之变', '之役', '之治', '盛世', '新政', '维新'];

    const results = data.search.filter((item: any) => {
      const desc = (item.description || '').toLowerCase();

      // 描述中含事件关键词的保留
      for (const kw of eventKeywords) {
        if (desc.includes(kw.toLowerCase())) return true;
      }

      // 标签中含事件相关词的保留
      const labelEventPatterns = [
        /战争|战役|革命|起义|运动|事件|会议|条约|宣言|改革|政变|之乱|之变|之役|之治|新政|维新|大捷|大战|会战/,
        /war|battle|revolution|uprising|movement|treaty|conference|reform|coup/i,
      ];
      for (const pattern of labelEventPatterns) {
        if (pattern.test(item.label || '')) return true;
      }

      // 排除明显是人物的结果
      if (isPersonDescription(desc)) return false;

      return false;
    });

    return results.slice(0, 5).map((item: any) => ({
      id: item.id,
      label: item.label || '',
      description: item.description || '',
    }));
  } catch (e) {
    console.warn('Wikidata 事件搜索失败:', e);
    return [];
  }
}

// 根据实体ID获取事件详细信息
export async function getWikidataEvent(entityId: string): Promise<HistoricalEvent | null> {
  // 先查缓存
  const cached = getCachedEvent(`wd:${entityId}`);
  if (cached) return cached;

  try {
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(entityId)}&format=json&props=labels|descriptions|claims&languages=zh|en`;
    const data: any = await jsonp(url, 15000);

    if (data?.error) {
      console.warn('Wikidata API 错误:', data.error);
      return null;
    }

    const entity = data?.entities?.[entityId];
    if (!entity || entity.missing !== undefined) {
      console.warn('Wikidata 实体不存在:', entityId);
      return null;
    }

    const labels = entity.labels || {};
    const descriptions = entity.descriptions || {};
    const claims = entity.claims || {};

    const name = labels.zh?.value || labels.en?.value || entityId;
    const description = descriptions.zh?.value || descriptions.en?.value || '';

    // 提取开始时间 P580 和结束时间 P582
    const startClaim = getFirstValidTimeClaim(claims.P580);
    const endClaim = getFirstValidTimeClaim(claims.P582);

    // 如果没有开始时间，试试点时间 P585
    const pointClaim = getFirstValidTimeClaim(claims.P585);

    let startYear: number | null = null;
    let endYear: number | null = null;
    let startApprox = false;
    let endApprox = false;
    let startUnknown = false;
    let endUnknown = false;

    if (startClaim?.time) {
      const parsed = parseWikidataYear(startClaim.time);
      if (parsed) {
        startYear = parsed.year;
        const precision = startClaim.precision ?? 11;
        startApprox = precision < 9;
        startUnknown = precision < 8;
      }
    } else if (pointClaim?.time) {
      const parsed = parseWikidataYear(pointClaim.time);
      if (parsed) {
        startYear = parsed.year;
        endYear = parsed.year;
        const precision = pointClaim.precision ?? 11;
        startApprox = precision < 9;
        endApprox = precision < 9;
        startUnknown = precision < 8;
        endUnknown = precision < 8;
      }
    }

    if (endClaim?.time) {
      const parsed = parseWikidataYear(endClaim.time);
      if (parsed) {
        endYear = parsed.year;
        const precision = endClaim.precision ?? 11;
        endApprox = precision < 9;
        endUnknown = precision < 8;
      }
    }

    if (startYear === null) {
      console.warn('无法获取事件年份:', entityId, name);
      return null;
    }

    // 数据校验：如果结束年早于开始年，尝试从描述文本中修正
    if (endYear !== null && startYear > endYear) {
      console.warn(`Wikidata 事件年份异常 (${startYear} > ${endYear})，尝试从描述中修正:`, name);
      const extracted = extractYearsFromDescription(description);
      if (extracted.birth !== null && extracted.death !== null && extracted.birth < extracted.death) {
        startYear = extracted.birth;
        endYear = extracted.death;
        startApprox = startApprox || extracted.approx;
        endApprox = endApprox || extracted.approx;
        console.warn(`已修正为: ${startYear} ~ ${endYear}`);
      }
    }

    // 推断事件类别
    const category = inferEventCategory(description, name);

    // 提取地点（P276 位置 或 P17 国家）
    let location = '';
    const locationClaim = claims.P276?.[0]?.mainsnak?.datavalue?.value;
    const countryClaim = claims.P17?.[0]?.mainsnak?.datavalue?.value;
    if (locationClaim?.id) {
      // 简单处理，后续可优化为获取地点名称
      location = '';
    } else if (countryClaim?.id) {
      location = '';
    }

    const event: HistoricalEvent = {
      id: `wd:${entityId}`,
      name,
      aliases: [],
      startYear,
      endYear,
      startApprox,
      endApprox,
      startUnknown,
      endUnknown,
      category,
      location,
      description: description || '（来自 Wikidata）',
    };

    // 写入缓存
    setEventCache(`wd:${entityId}`, event);
    return event;
  } catch (e: any) {
    console.warn('获取 Wikidata 事件失败:', entityId, e?.message || e);
    return null;
  }
}

function inferEventCategory(description: string, name: string): string {
  const desc = description.toLowerCase();
  const n = name.toLowerCase();
  if (desc.includes('战争') || desc.includes('战役') || n.includes('战') || desc.includes('war') || desc.includes('battle')) return '战争';
  if (desc.includes('革命') || desc.includes('起义') || desc.includes('revolution') || desc.includes('uprising')) return '革命';
  if (desc.includes('政治') || desc.includes('政变') || desc.includes('登基') || desc.includes('建国') || desc.includes('建立') || desc.includes('political') || desc.includes('coup')) return '政治';
  if (desc.includes('文化') || desc.includes('艺术') || desc.includes('运动') || desc.includes('culture') || desc.includes('renaissance')) return '文化';
  if (desc.includes('科学') || desc.includes('技术') || desc.includes('发明') || desc.includes('science') || desc.includes('technology')) return '科技';
  if (desc.includes('外交') || desc.includes('条约') || desc.includes('出使') || desc.includes('diplomacy') || desc.includes('treaty')) return '外交';
  if (desc.includes('经济') || desc.includes('改革') || desc.includes('economy') || desc.includes('reform')) return '经济';
  if (desc.includes('社会') || desc.includes('运动') || desc.includes('society')) return '社会';
  return '其他';
}
