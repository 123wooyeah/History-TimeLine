import { TimelineChart } from './timelineChart';
import { searchPeople, formatYear, getAllPeople, getAllDynasties } from './dataService';
import { searchWikidataPeople, getWikidataPerson } from './wikidataService';
import type { Person, SortMode } from './types';
import { FIELD_COLORS } from './types';

interface SearchSuggestion {
  id: string;
  name: string;
  field: string;
  dynasty: string;
  birth: number | null;
  death: number | null;
  source: 'local' | 'online';
  description?: string;
}

type AddPersonOptions = {
  source: 'local' | 'online';
  displayName?: string;
};

export class App {
  private chart: TimelineChart;
  private selectedPeople: Person[] = [];
  private searchInput: HTMLInputElement;
  private suggestionsBox: HTMLDivElement;
  private tagsContainer: HTMLDivElement;
  private sortSelect: HTMLSelectElement;
  private chartContainer: HTMLDivElement;
  private shareBtn: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private searchDebounceTimer: number | null = null;
  private onlineSearchToken = 0;

  constructor(container: HTMLElement) {
    container.innerHTML = this.renderTemplate();
    this.searchInput = container.querySelector('#search-input')!;
    this.suggestionsBox = container.querySelector('#suggestions')!;
    this.tagsContainer = container.querySelector('#tags-container')!;
    this.sortSelect = container.querySelector('#sort-select')!;
    this.chartContainer = container.querySelector('#chart-container')!;
    this.shareBtn = container.querySelector('#share-btn')!;
    this.exportBtn = container.querySelector('#export-btn')!;

    this.chart = new TimelineChart(this.chartContainer);
    this.bindEvents();
    this.renderDynastyLegend();
    this.loadFromUrl();
  }

  private renderTemplate(): string {
    return `
      <header class="app-header">
        <h1 class="app-title">历史人物时间轴</h1>
        <p class="app-subtitle">输入历史人名，直观对比他们所处的时代</p>
      </header>

      <div class="search-section">
        <div class="search-box-wrapper">
          <input
            type="text"
            id="search-input"
            class="search-input"
            placeholder="搜索历史人物，如：李白、苏轼、孔子、牛顿…"
            autocomplete="off"
          />
          <div id="suggestions" class="suggestions-box"></div>
        </div>
        <div class="controls-row">
          <div class="sort-control">
            <label for="sort-select">排序：</label>
            <select id="sort-select" class="sort-select">
              <option value="default">默认顺序</option>
              <option value="birth">按生年</option>
              <option value="death">按卒年</option>
              <option value="dynasty">按朝代</option>
              <option value="field">按领域</option>
            </select>
          </div>
          <div class="count-info">
            已添加 <span id="people-count">0</span> 位人物
          </div>
          <div class="action-buttons">
            <button id="share-btn" class="action-btn" title="复制分享链接">🔗 分享</button>
            <button id="export-btn" class="action-btn" title="导出为图片">📷 导出</button>
          </div>
        </div>
        <div id="tags-container" class="tags-container"></div>
      </div>

      <div class="chart-section">
        <div class="dynasty-legend">
          <span class="legend-label">朝代标尺：</span>
          <div class="legend-items" id="dynasty-legend-items"></div>
        </div>
        <div id="chart-container" class="chart-container"></div>
      </div>

      <div class="recommend-section">
        <h3>推荐组合</h3>
        <div class="recommend-buttons">
          <button class="recommend-btn" data-group="tang-poets">唐代诗人</button>
          <button class="recommend-btn" data-group="song-writers">宋代文人</button>
          <button class="recommend-btn" data-group="sanchinese">三苏</button>
          <button class="recommend-btn" data-group="thinkers">先秦诸子</button>
          <button class="recommend-btn" data-group="three-kingdoms">三国人物</button>
          <button class="recommend-btn" data-group="emperors">千古帝王</button>
          <button class="recommend-btn" data-group="world-scientists">世界科学家</button>
          <button class="recommend-btn" data-group="clear-all">清空</button>
        </div>
      </div>

      <footer class="app-footer">
        <p>数据来源：本地人物库（${getAllPeople().length} 位）· Wikidata 在线检索</p>
      </footer>
    `;
  }

  private bindEvents() {
    this.searchInput.addEventListener('input', () => this.handleSearchInput());
    this.searchInput.addEventListener('focus', () => this.handleSearchInput());
    this.searchInput.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('click', (e) => {
      if (!this.searchInput.contains(e.target as Node) &&
          !this.suggestionsBox.contains(e.target as Node)) {
        this.hideSuggestions();
      }
    });

    this.sortSelect.addEventListener('change', () => {
      this.chart.setSortMode(this.sortSelect.value as SortMode);
    });

    // 推荐按钮
    document.querySelectorAll('.recommend-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = (btn as HTMLElement).dataset.group;
        if (group) this.loadRecommendGroup(group);
      });
    });

    // 分享按钮
    this.shareBtn.addEventListener('click', () => this.handleShare());

    // 导出按钮
    this.exportBtn.addEventListener('click', () => this.handleExport());
  }

  private handleShare() {
    if (this.selectedPeople.length === 0) {
      alert('请先添加至少一位人物');
      return;
    }
    const ids = this.selectedPeople.map((p) => p.id).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('people', ids);
    const shareUrl = url.toString();

    navigator.clipboard.writeText(shareUrl).then(() => {
      const originalText = this.shareBtn.textContent;
      this.shareBtn.textContent = '✓ 已复制';
      setTimeout(() => {
        this.shareBtn.textContent = originalText;
      }, 1500);
    }).catch(() => {
      // 降级：用 prompt 显示
      prompt('复制以下链接分享：', shareUrl);
    });
  }

  private handleExport() {
    this.chart.exportAsImage('历史人物时间轴.png');
  }

  private loadFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const peopleParam = urlParams.get('people');
    if (peopleParam) {
      const ids = peopleParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        // 异步加载所有人物
        ids.forEach((id) => {
          if (id.startsWith('wd:')) {
            // 在线人物
            const entityId = id.slice(3);
            this.addPersonById(entityId, { source: 'online' });
          } else {
            // 本地人物
            this.addPersonById(id, { source: 'local' });
          }
        });
        return;
      }
    }
    // URL 中没有参数，加载默认人物
    this.loadDefaultPeople();
  }

  private handleSearchInput() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      this.hideSuggestions();
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      return;
    }

    // 先显示本地结果
    const localResults = searchPeople(keyword).slice(0, 5);
    this.renderSuggestions(localResults.map((p) => ({
      id: p.id,
      name: p.name,
      field: p.field,
      dynasty: p.dynasty,
      birth: p.birth,
      death: p.death,
      source: 'local' as const,
      description: p.description,
    })), false);

    // 防抖在线搜索
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    const token = ++this.onlineSearchToken;
    this.searchDebounceTimer = window.setTimeout(async () => {
      const onlineResults = await searchWikidataPeople(keyword);
      // 忽略过期请求
      if (token !== this.onlineSearchToken) return;

      // 过滤掉本地已有的结果（按名称去重）
      const localNames = new Set(localResults.map((p) => p.name));
      const uniqueOnline = onlineResults.filter((r) => !localNames.has(r.label));

      // 转换为统一格式
      const onlineSuggestions: SearchSuggestion[] = uniqueOnline.slice(0, 5).map((r) => ({
        id: r.id,
        name: r.label,
        field: '在线检索',
        dynasty: r.description || 'Wikidata',
        birth: null,
        death: null,
        source: 'online' as const,
        description: r.description,
      }));

      const allSuggestions = [
        ...localResults.map((p) => ({
          id: p.id,
          name: p.name,
          field: p.field,
          dynasty: p.dynasty,
          birth: p.birth,
          death: p.death,
          source: 'local' as const,
          description: p.description,
        })),
        ...onlineSuggestions,
      ];

      if (allSuggestions.length === 0) {
        this.suggestionsBox.innerHTML = '<div class="suggestion-empty">未找到相关人物</div>';
        this.showSuggestions();
        return;
      }

      this.renderSuggestions(allSuggestions, true);
    }, 400);
  }

  private renderSuggestions(suggestions: SearchSuggestion[], hasOnline: boolean) {
    let html = '';
    if (suggestions.length > 0 && suggestions.some((s) => s.source === 'local')) {
      html += suggestions
        .filter((s) => s.source === 'local')
        .map((s) => this.renderSuggestionItem(s))
        .join('');
    }
    if (suggestions.some((s) => s.source === 'online')) {
      html += '<div class="suggestion-divider"><span>在线搜索</span></div>';
      html += suggestions
        .filter((s) => s.source === 'online')
        .map((s) => this.renderSuggestionItem(s))
        .join('');
    }
    if (suggestions.length === 0) {
      html = '<div class="suggestion-empty">未找到相关人物</div>';
    } else if (!hasOnline && suggestions.every((s) => s.source === 'local')) {
      html += '<div class="suggestion-loading">正在搜索 Wikidata…</div>';
    }

    this.suggestionsBox.innerHTML = html;

    // 绑定点击事件
    this.suggestionsBox.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = (item as HTMLElement).dataset.id;
        const source = (item as HTMLElement).dataset.source;
        const name = (item as HTMLElement).dataset.name;
        if (id) this.addPersonById(id, { source: source as 'local' | 'online', displayName: name });
        this.searchInput.value = '';
        this.hideSuggestions();
        this.searchInput.focus();
      });
    });

    this.showSuggestions();
  }

  private renderSuggestionItem(s: SearchSuggestion): string {
    const isSelected = this.selectedPeople.some((sp) => sp.id === s.id || (s.source === 'online' && sp.id === `wd:${s.id}`));
    const color = s.source === 'local'
      ? (FIELD_COLORS[s.field] || '#8b5a2b')
      : '#d4a56a';
    const deathStr = s.death ? formatYear(s.death, false) : '—';
    const birthStr = s.birth ? formatYear(s.birth, false) : '加载中…';
    const sourceBadge = s.source === 'online'
      ? '<span class="sugg-source">在线</span>'
      : '';
    return `
      <div class="suggestion-item ${isSelected ? 'selected' : ''}" data-id="${s.id}" data-source="${s.source}" data-name="${s.name}">
        <div class="sugg-main">
          <span class="sugg-name">${s.name}</span>
          ${sourceBadge}
          <span class="sugg-field" style="background:${color}20;color:${color};">${s.field}</span>
        </div>
        <div class="sugg-sub">
          ${s.dynasty} · ${s.birth ? birthStr : '点击加载详细信息'} ${s.death ? '— ' + deathStr : ''}
        </div>
      </div>
    `;
  }

  private handleKeydown(e: KeyboardEvent) {
    const items = this.suggestionsBox.querySelectorAll('.suggestion-item:not(.selected)');
    let activeIndex = -1;
    items.forEach((item, i) => {
      if (item.classList.contains('active')) activeIndex = i;
    });

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        const next = (activeIndex + 1) % items.length;
        items.forEach((i) => i.classList.remove('active'));
        items[next].classList.add('active');
        items[next].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        const prev = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
        items.forEach((i) => i.classList.remove('active'));
        items[prev].classList.add('active');
        items[prev].scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = this.suggestionsBox.querySelector('.suggestion-item.active:not(.selected)');
      const first = this.suggestionsBox.querySelector('.suggestion-item:not(.selected)');
      const target = active || first;
      if (target) {
        const id = (target as HTMLElement).dataset.id;
        const source = (target as HTMLElement).dataset.source;
        const name = (target as HTMLElement).dataset.name;
        if (id) this.addPersonById(id, { source: source as 'local' | 'online', displayName: name });
        this.searchInput.value = '';
        this.hideSuggestions();
      }
    } else if (e.key === 'Escape') {
      this.hideSuggestions();
    }
  }

  private showSuggestions() {
    this.suggestionsBox.style.display = 'block';
  }

  private hideSuggestions() {
    this.suggestionsBox.style.display = 'none';
  }

  private async addPersonById(id: string, options: string | AddPersonOptions = 'local') {
    // 兼容旧调用方式
    const opts: AddPersonOptions = typeof options === 'string'
      ? { source: options as 'local' | 'online' }
      : options;
    const source = opts.source;
    const displayName = opts.displayName;

    // 检查是否已存在
    const fullId = source === 'online' ? `wd:${id}` : id;
    if (this.selectedPeople.some((p) => p.id === fullId)) return;

    if (source === 'local') {
      const person = getAllPeople().find((p) => p.id === id);
      if (person) {
        this.selectedPeople.push(person);
        this.updateTags();
        this.chart.setPeople(this.selectedPeople);
        this.updateCount();
      }
    } else {
      // 在线人物：先显示加载状态，再异步获取详细信息
      const loadingName = displayName || '加载中…';
      const tempPerson: Person = {
        id: fullId,
        name: loadingName,
        aliases: [],
        birth: 0,
        death: 0,
        birthApprox: false,
        deathApprox: false,
        dynasty: '加载中…',
        country: '',
        field: '在线检索',
        description: '正在从 Wikidata 加载人物信息…',
      };
      this.selectedPeople.push(tempPerson);
      this.updateTags();
      this.chart.setPeople(this.selectedPeople);
      this.updateCount();

      // 异步加载详细信息
      const person = await getWikidataPerson(id);
      if (person) {
        // 替换临时人物
        const idx = this.selectedPeople.findIndex((p) => p.id === fullId);
        if (idx !== -1) {
          this.selectedPeople[idx] = person;
          this.updateTags();
          this.chart.setPeople(this.selectedPeople);
        }
      } else {
        // 加载失败，移除并提示
        this.selectedPeople = this.selectedPeople.filter((p) => p.id !== fullId);
        this.updateTags();
        this.chart.setPeople(this.selectedPeople);
        this.updateCount();
        this.showToast(`加载「${loadingName}」失败，请检查网络或换个关键词试试`);
      }
    }
  }

  private showToast(message: string) {
    // 创建 toast 提示
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #2a2218;
      color: #e8dfd0;
      padding: 10px 20px;
      border-radius: 8px;
      border: 1px solid #c0392b;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      font-size: 14px;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s, top 0.3s;
      pointer-events: none;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.top = '30px';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.top = '20px';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  private removePerson(id: string) {
    this.selectedPeople = this.selectedPeople.filter((p) => p.id !== id);
    this.updateTags();
    this.chart.setPeople(this.selectedPeople);
    this.updateCount();
  }

  private updateTags() {
    this.tagsContainer.innerHTML = this.selectedPeople
      .map((p) => {
        const color = FIELD_COLORS[p.field] || '#8b5a2b';
        return `
          <span class="person-tag" style="border-color:${color}40;background:${color}15;">
            <span class="tag-color" style="background:${color};"></span>
            <span class="tag-name">${p.name}</span>
            <span class="tag-remove" data-id="${p.id}" title="移除">×</span>
          </span>
        `;
      })
      .join('');

    this.tagsContainer.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.removePerson(id);
      });
    });
  }

  private updateCount() {
    const countEl = document.getElementById('people-count');
    if (countEl) countEl.textContent = String(this.selectedPeople.length);
  }

  private renderDynastyLegend() {
    const legendEl = document.getElementById('dynasty-legend-items');
    if (!legendEl) return;
    const dynasties = getAllDynasties();
    // 只显示主要朝代
    const mainDynasties = dynasties.filter((d) =>
      ['夏', '商', '西周', '春秋', '战国', '秦', '西汉', '东汉', '三国', '西晋', '东晋', '南北朝', '隋', '唐', '五代十国', '北宋', '南宋', '元', '明', '清', '民国', '现代'].includes(d.name)
    );
    legendEl.innerHTML = mainDynasties
      .map(
        (d) => `
        <span class="legend-item" title="${d.name}: ${d.start < 0 ? '前' + Math.abs(d.start) : d.start} — ${d.end < 0 ? '前' + Math.abs(d.end) : d.end}">
          <span class="legend-dot" style="background:${d.color};"></span>
          ${d.name}
        </span>
      `
      )
      .join('');
  }

  private loadDefaultPeople() {
    const defaultIds = ['confucius', 'libai', 'dufu', 'sushi', 'tangtaizong', 'qinshihuang'];
    defaultIds.forEach((id) => this.addPersonById(id));
  }

  private loadRecommendGroup(group: string) {
    const groups: Record<string, string[]> = {
      'tang-poets': ['libai', 'dufu', 'baijuyi', 'wangwei', 'hanyu', 'liuzongyuan'],
      'song-writers': ['sushi', 'liqingzhao', 'xinqiji', 'luyou', 'wanganshi', 'ouyangxiu'],
      'sanchinese': ['sushi', 'ouyangxiu', 'wanganshi'],
      'thinkers': ['confucius', 'laozi', 'zhuangzi', 'mencius', 'mozi', 'hanfeizi', 'xunzi'],
      'three-kingdoms': ['caocao', 'liubei', 'zhugeliang', 'sunquan', 'guanyu', 'zhuangfei'],
      'emperors': ['qinshihuang', 'liubang', 'wudi', 'tangtaizong', 'songtaizu', 'kangxi', 'qianlong'],
      'world-scientists': ['newton', 'darwin', 'einstein', 'galileo', 'lishichang', 'qianxuesen', 'yuanlongping'],
    };

    if (group === 'clear-all') {
      this.selectedPeople = [];
      this.updateTags();
      this.chart.setPeople([]);
      this.updateCount();
      return;
    }

    const ids = groups[group];
    if (ids) {
      this.selectedPeople = [];
      ids.forEach((id) => {
        const person = getAllPeople().find((p) => p.id === id);
        if (person) this.selectedPeople.push(person);
      });
      this.updateTags();
      this.chart.setPeople(this.selectedPeople);
      this.updateCount();
    }
  }

  resize() {
    this.chart.resize();
  }
}
