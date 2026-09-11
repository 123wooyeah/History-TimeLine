import { TimelineChart } from './timelineChart';
import { searchPeople, searchEvents, formatYear, getAllPeople, getAllDynasties, getAllEvents, getEventById } from './dataService';
import { searchWikidataPeople, getWikidataPerson, searchWikidataEvents, getWikidataEvent } from './wikidataService';
import type { Person, SortMode, HistoricalEvent, SearchMode } from './types';
import { FIELD_COLORS, EVENT_CATEGORY_COLORS } from './types';

interface SearchSuggestion {
  id: string;
  name: string;
  field: string;
  dynasty: string;
  birth: number | null;
  death: number | null;
  source: 'local' | 'online';
  description?: string;
  itemType: 'person' | 'event';
}

type AddOptions = {
  source: 'local' | 'online';
  displayName?: string;
};

export class App {
  private chart: TimelineChart;
  private selectedPeople: Person[] = [];
  private selectedEvents: HistoricalEvent[] = [];
  private searchMode: SearchMode = 'people';
  private searchInput: HTMLInputElement;
  private suggestionsBox: HTMLDivElement;
  private tagsContainer: HTMLDivElement;
  private eventTagsContainer: HTMLDivElement;
  private sortSelect: HTMLSelectElement;
  private chartContainer: HTMLDivElement;
  private shareBtn: HTMLButtonElement;
  private exportBtn: HTMLButtonElement;
  private searchDebounceTimer: number | null = null;
  private onlineSearchToken = 0;
  private peopleTab: HTMLButtonElement;
  private eventsTab: HTMLButtonElement;

  constructor(container: HTMLElement) {
    container.innerHTML = this.renderTemplate();
    this.searchInput = container.querySelector('#search-input')!;
    this.suggestionsBox = container.querySelector('#suggestions')!;
    this.tagsContainer = container.querySelector('#tags-container')!;
    this.eventTagsContainer = container.querySelector('#event-tags-container')!;
    this.sortSelect = container.querySelector('#sort-select')!;
    this.chartContainer = container.querySelector('#chart-container')!;
    this.shareBtn = container.querySelector('#share-btn')!;
    this.exportBtn = container.querySelector('#export-btn')!;
    this.peopleTab = container.querySelector('#tab-people')!;
    this.eventsTab = container.querySelector('#tab-events')!;

    this.chart = new TimelineChart(this.chartContainer);
    this.bindEvents();
    this.renderDynastyLegend();
    this.loadFromUrl();
  }

  private renderTemplate(): string {
    return `
      <header class="app-header">
        <h1 class="app-title">历史人物&事件时间轴</h1>
        <p class="app-subtitle">输入历史人名或事件，直观对比他们所处的时代</p>
      </header>

      <div class="search-section">
        <div class="search-tabs">
          <button id="tab-people" class="search-tab active" data-mode="people">
            <span class="tab-icon">👤</span> 人物
          </button>
          <button id="tab-events" class="search-tab" data-mode="events">
            <span class="tab-icon">📅</span> 事件
          </button>
        </div>
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
              <option value="eventRelevance">智能排序（事件关联）</option>
            </select>
          </div>
          <div class="count-info">
            <span id="people-count">0</span> 位人物 · <span id="event-count">0</span> 个事件
          </div>
          <div class="action-buttons">
            <button id="share-btn" class="action-btn" title="复制分享链接">🔗 分享</button>
            <button id="export-btn" class="action-btn" title="导出为图片">📷 导出</button>
          </div>
        </div>
        <div id="tags-container" class="tags-container"></div>
        <div id="event-tags-container" class="tags-container event-tags"></div>
      </div>

      <div class="chart-section">
        <div class="dynasty-legend">
          <span class="legend-label">朝代标尺：</span>
          <div class="legend-items" id="dynasty-legend-items"></div>
        </div>
        <div class="event-legend">
          <span class="legend-label">事件类型：</span>
          <div class="legend-items" id="event-legend-items"></div>
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
          <button class="recommend-btn" data-group="important-events">重大事件</button>
          <button class="recommend-btn" data-group="clear-all">清空</button>
        </div>
      </div>

      <footer class="app-footer">
        <p>数据来源：本地人物库（${getAllPeople().length} 位）· 本地事件库（${getAllEvents().length} 个）· Wikipedia · Wikidata 在线检索</p>
      </footer>
    `;
  }

  private bindEvents() {
    // 搜索标签切换
    this.peopleTab.addEventListener('click', () => this.setSearchMode('people'));
    this.eventsTab.addEventListener('click', () => this.setSearchMode('events'));

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

  private setSearchMode(mode: SearchMode) {
    this.searchMode = mode;
    if (mode === 'people') {
      this.peopleTab.classList.add('active');
      this.eventsTab.classList.remove('active');
      this.searchInput.placeholder = '搜索历史人物，如：李白、苏轼、孔子、牛顿…';
    } else {
      this.eventsTab.classList.add('active');
      this.peopleTab.classList.remove('active');
      this.searchInput.placeholder = '搜索历史事件，如：赤壁之战、辛亥革命、工业革命…';
    }
    this.searchInput.value = '';
    this.hideSuggestions();
    this.searchInput.focus();
  }

  private handleShare() {
    if (this.selectedPeople.length === 0 && this.selectedEvents.length === 0) {
      alert('请先添加至少一位人物或一个事件');
      return;
    }
    const peopleIds = this.selectedPeople.map((p) => p.id).join(',');
    const eventIds = this.selectedEvents.map((e) => e.id).join(',');
    const url = new URL(window.location.href);
    if (peopleIds) url.searchParams.set('people', peopleIds);
    if (eventIds) url.searchParams.set('events', eventIds);
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
    this.chart.exportAsImage('历史人物&事件时间轴.png');
  }

  private loadFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const peopleParam = urlParams.get('people');
    const eventsParam = urlParams.get('events');
    let hasParams = false;

    if (peopleParam) {
      const ids = peopleParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        hasParams = true;
        ids.forEach((id) => {
          if (id.startsWith('wd:')) {
            const entityId = id.slice(3);
            this.addPersonById(entityId, { source: 'online' });
          } else {
            this.addPersonById(id, { source: 'local' });
          }
        });
      }
    }

    if (eventsParam) {
      const ids = eventsParam.split(',').filter(Boolean);
      if (ids.length > 0) {
        hasParams = true;
        ids.forEach((id) => {
          if (id.startsWith('wd:')) {
            const entityId = id.slice(3);
            this.addEventById(entityId, { source: 'online' });
          } else {
            this.addEventById(id, { source: 'local' });
          }
        });
      }
    }

    if (!hasParams) {
      // URL 中没有参数，加载默认人物
      this.loadDefaultPeople();
    }
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

    if (this.searchMode === 'people') {
      this.handlePeopleSearch(keyword);
    } else {
      this.handleEventSearch(keyword);
    }
  }

  private handlePeopleSearch(keyword: string) {
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
      itemType: 'person' as const,
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
        itemType: 'person' as const,
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
          itemType: 'person' as const,
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

  private handleEventSearch(keyword: string) {
    // 先显示本地结果
    const localResults = searchEvents(keyword).slice(0, 5);
    this.renderSuggestions(localResults.map((e) => ({
      id: e.id,
      name: e.name,
      field: e.category,
      dynasty: e.location || '历史事件',
      birth: e.startYear,
      death: e.endYear,
      source: 'local' as const,
      description: e.description,
      itemType: 'event' as const,
    })), false);

    // 防抖在线搜索
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    const token = ++this.onlineSearchToken;
    this.searchDebounceTimer = window.setTimeout(async () => {
      const onlineResults = await searchWikidataEvents(keyword);
      // 忽略过期请求
      if (token !== this.onlineSearchToken) return;

      // 过滤掉本地已有的结果（按名称去重）
      const localNames = new Set(localResults.map((e) => e.name));
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
        itemType: 'event' as const,
      }));

      const allSuggestions = [
        ...localResults.map((e) => ({
          id: e.id,
          name: e.name,
          field: e.category,
          dynasty: e.location || '历史事件',
          birth: e.startYear,
          death: e.endYear,
          source: 'local' as const,
          description: e.description,
          itemType: 'event' as const,
        })),
        ...onlineSuggestions,
      ];

      if (allSuggestions.length === 0) {
        this.suggestionsBox.innerHTML = '<div class="suggestion-empty">未找到相关事件</div>';
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
      const emptyText = this.searchMode === 'people' ? '未找到相关人物' : '未找到相关事件';
      html = `<div class="suggestion-empty">${emptyText}</div>`;
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
        const itemType = (item as HTMLElement).dataset.type as 'person' | 'event';
        if (!id) return;
        if (itemType === 'event') {
          this.addEventById(id, { source: source as 'local' | 'online', displayName: name });
        } else {
          this.addPersonById(id, { source: source as 'local' | 'online', displayName: name });
        }
        this.searchInput.value = '';
        this.hideSuggestions();
        this.searchInput.focus();
      });
    });

    this.showSuggestions();
  }

  private renderSuggestionItem(s: SearchSuggestion): string {
    const isSelected = s.itemType === 'person'
      ? this.selectedPeople.some((sp) => sp.id === s.id || (s.source === 'online' && sp.id === `wd:${s.id}`))
      : this.selectedEvents.some((se) => se.id === s.id || (s.source === 'online' && se.id === `wd:${s.id}`));

    const colorMap = s.itemType === 'event' ? EVENT_CATEGORY_COLORS : FIELD_COLORS;
    const color = s.source === 'local'
      ? (colorMap[s.field] || '#8b5a2b')
      : '#d4a56a';

    const isEvent = s.itemType === 'event';
    const deathStr = s.death ? formatYear(s.death, false) : (isEvent ? '—' : '—');
    const birthStr = s.birth ? formatYear(s.birth, false) : '点击加载详细信息';
    const sourceBadge = s.source === 'online'
      ? '<span class="sugg-source">在线</span>'
      : '';

    const icon = isEvent ? '◆' : '';
    const subLabel = isEvent ? (s.birth ? '时间' : '点击加载详细信息') : (s.birth ? '' : '');

    return `
      <div class="suggestion-item ${isSelected ? 'selected' : ''}" data-id="${s.id}" data-source="${s.source}" data-name="${s.name}" data-type="${s.itemType}">
        <div class="sugg-main">
          <span class="sugg-name">${icon} ${s.name}</span>
          ${sourceBadge}
          <span class="sugg-field" style="background:${color}20;color:${color};">${s.field}</span>
        </div>
        <div class="sugg-sub">
          ${s.dynasty} · ${s.birth ? birthStr : subLabel} ${s.death ? '— ' + deathStr : ''}
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
        const itemType = (target as HTMLElement).dataset.type as 'person' | 'event';
        if (id) {
          if (itemType === 'event') {
            this.addEventById(id, { source: source as 'local' | 'online', displayName: name });
          } else {
            this.addPersonById(id, { source: source as 'local' | 'online', displayName: name });
          }
        }
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

  private async addPersonById(id: string, options: string | AddOptions = 'local') {
    const opts: AddOptions = typeof options === 'string'
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
        birthUnknown: false,
        deathUnknown: false,
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

  private async addEventById(id: string, options: string | AddOptions = 'local') {
    const opts: AddOptions = typeof options === 'string'
      ? { source: options as 'local' | 'online' }
      : options;
    const source = opts.source;
    const displayName = opts.displayName;

    // 检查是否已存在
    const fullId = source === 'online' ? `wd:${id}` : id;
    if (this.selectedEvents.some((e) => e.id === fullId)) return;

    const isFirstEvent = this.selectedEvents.length === 0;

    if (source === 'local') {
      const event = getEventById(id);
      if (event) {
        this.selectedEvents.push(event);
        this.updateEventTags();
        this.chart.setEvents(this.selectedEvents);
        this.updateCount();

        // 添加第一个事件时，自动切换到智能排序
        if (isFirstEvent && this.sortSelect.value === 'default') {
          this.sortSelect.value = 'eventRelevance';
          this.chart.setSortMode('eventRelevance');
        }
      }
    } else {
      // 在线事件：先显示加载状态，再异步获取详细信息
      const loadingName = displayName || '加载中…';
      const tempEvent: HistoricalEvent = {
        id: fullId,
        name: loadingName,
        aliases: [],
        startYear: 0,
        endYear: 0,
        startApprox: false,
        endApprox: false,
        startUnknown: false,
        endUnknown: false,
        category: '在线检索',
        location: '',
        description: '正在从 Wikidata 加载事件信息…',
      };
      this.selectedEvents.push(tempEvent);
      this.updateEventTags();
      this.chart.setEvents(this.selectedEvents);
      this.updateCount();

      // 异步加载详细信息
      const event = await getWikidataEvent(id);
      if (event) {
        // 替换临时事件
        const idx = this.selectedEvents.findIndex((e) => e.id === fullId);
        if (idx !== -1) {
          this.selectedEvents[idx] = event;
          this.updateEventTags();
          this.chart.setEvents(this.selectedEvents);
        }
      } else {
        // 加载失败，移除并提示
        this.selectedEvents = this.selectedEvents.filter((e) => e.id !== fullId);
        this.updateEventTags();
        this.chart.setEvents(this.selectedEvents);
        this.updateCount();
        this.showToast(`加载「${loadingName}」失败，请检查网络或换个关键词试试`);
      }
    }
  }

  private showToast(message: string) {
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

  private removeEvent(id: string) {
    this.selectedEvents = this.selectedEvents.filter((e) => e.id !== id);
    this.updateEventTags();
    this.chart.setEvents(this.selectedEvents);
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
            <span class="tag-remove" data-id="${p.id}" data-type="person" title="移除">×</span>
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

  private updateEventTags() {
    this.eventTagsContainer.innerHTML = this.selectedEvents
      .map((e) => {
        const color = EVENT_CATEGORY_COLORS[e.category] || '#7f8c8d';
        return `
          <span class="event-tag" style="border-color:${color}40;background:${color}15;">
            <span class="tag-diamond" style="background:${color};"></span>
            <span class="tag-name">${e.name}</span>
            <span class="tag-remove" data-id="${e.id}" data-type="event" title="移除">×</span>
          </span>
        `;
      })
      .join('');

    this.eventTagsContainer.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.removeEvent(id);
      });
    });
  }

  private updateCount() {
    const peopleCountEl = document.getElementById('people-count');
    const eventCountEl = document.getElementById('event-count');
    if (peopleCountEl) peopleCountEl.textContent = String(this.selectedPeople.length);
    if (eventCountEl) eventCountEl.textContent = String(this.selectedEvents.length);
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

    // 事件类型图例
    const eventLegendEl = document.getElementById('event-legend-items');
    if (!eventLegendEl) return;
    const categories = Object.keys(EVENT_CATEGORY_COLORS);
    eventLegendEl.innerHTML = categories
      .map(
        (c) => `
        <span class="legend-item" title="${c}事件">
          <span class="legend-diamond" style="background:${EVENT_CATEGORY_COLORS[c]};"></span>
          ${c}
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
    const groups: Record<string, { people: string[]; events: string[] }> = {
      'tang-poets': { people: ['libai', 'dufu', 'baijuyi', 'wangwei', 'hanyu', 'liuzongyuan'], events: [] },
      'song-writers': { people: ['sushi', 'liqingzhao', 'xinqiji', 'luyou', 'wanganshi', 'ouyangxiu'], events: [] },
      'sanchinese': { people: ['sushi', 'ouyangxiu', 'wanganshi'], events: [] },
      'thinkers': { people: ['confucius', 'laozi', 'zhuangzi', 'mencius', 'mozi', 'hanfeizi', 'xunzi'], events: [] },
      'three-kingdoms': { people: ['caocao', 'liubei', 'zhugeliang', 'sunquan', 'guanyu', 'zhuangfei'], events: ['battle-of-red-cliffs', 'three-kingdoms-period'] },
      'emperors': { people: ['qinshihuang', 'liubang', 'wudi', 'tangtaizong', 'songtaizu', 'kangxi', 'qianlong'], events: ['qin-unification', 'han-wudi-enthronement', 'zhenguan-era'] },
      'world-scientists': { people: ['newton', 'darwin', 'einstein', 'galileo', 'lishuchang', 'qianxuesen', 'yuanlongping'], events: ['industrial-revolution', 'renaissance'] },
      'important-events': { people: ['confucius', 'qinshihuang', 'tangtaizong', 'sunzhongshan', 'songtaizu'], events: [
        'spring-autumn-period', 'warring-states-period', 'qin-unification',
        'han-wudi-enthronement', 'silk-road-opening', 'yellow-turban-rebellion',
        'battle-of-red-cliffs', 'three-kingdoms-period', 'sui-dynasty-unification',
        'grand-canal-construction', 'tang-dynasty-founding', 'zhenguan-era',
        'an-shi-rebellion', 'song-dynasty-founding', 'jingkang-incident',
        'yuan-dynasty-founding', 'ming-dynasty-founding', 'zheng-he-voyages',
        'qing-dynasty-founding', 'opium-war-1', 'taiping-rebellion',
        'jiawu-war', 'hundred-days-reform', 'revolution-of-1911',
        'republic-of-china-founding', 'may-fourth-movement', 'ccp-founding',
        'long-march', 'sino-japanese-war-2', 'founding-of-prc',
        'reform-and-opening', 'beijing-olympics'
      ]},
    };

    if (group === 'clear-all') {
      this.selectedPeople = [];
      this.selectedEvents = [];
      this.updateTags();
      this.updateEventTags();
      this.chart.setPeople([]);
      this.chart.setEvents([]);
      this.updateCount();
      return;
    }

    const groupData = groups[group];
    if (groupData) {
      this.selectedPeople = [];
      this.selectedEvents = [];
      groupData.people.forEach((id) => {
        const person = getAllPeople().find((p) => p.id === id);
        if (person) this.selectedPeople.push(person);
      });
      groupData.events.forEach((id) => {
        const event = getEventById(id);
        if (event) this.selectedEvents.push(event);
      });
      this.updateTags();
      this.updateEventTags();
      this.chart.setPeople(this.selectedPeople);
      this.chart.setEvents(this.selectedEvents);
      this.updateCount();

      // 如果组合包含事件，自动切换到智能排序
      if (groupData.events.length > 0) {
        this.sortSelect.value = 'eventRelevance';
        this.chart.setSortMode('eventRelevance');
      } else {
        this.sortSelect.value = 'default';
        this.chart.setSortMode('default');
      }
    }
  }

  resize() {
    this.chart.resize();
  }
}
