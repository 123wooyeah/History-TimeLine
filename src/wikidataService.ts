import type { Person } from './types';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const CACHE_KEY = 'wikidata_people_cache_v1';
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

    if (birthClaim?.time) {
      const parsed = parseWikidataYear(birthClaim.time);
      if (parsed) {
        birthYear = parsed.year;
        // 精度低于年（如世纪、千年）标记为约
        birthApprox = (birthClaim.precision ?? 11) < 9;
      } else {
        console.warn('无法解析出生日期:', birthClaim.time, entityId);
      }
    }

    if (deathClaim?.time) {
      const parsed = parseWikidataYear(deathClaim.time);
      if (parsed) {
        deathYear = parsed.year;
        deathApprox = (deathClaim.precision ?? 11) < 9;
      }
    }

    if (birthYear === null) {
      console.warn('无法获取出生年份:', entityId, name);
      return null;
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
