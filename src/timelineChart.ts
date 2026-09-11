import * as echarts from 'echarts';
import type { Person, Dynasty, SortMode, HistoricalEvent } from './types';
import { FIELD_COLORS, EVENT_CATEGORY_COLORS } from './types';
import { formatYear, getAllDynasties } from './dataService';

export class TimelineChart {
  private chart: echarts.ECharts;
  private people: Person[] = [];
  private events: HistoricalEvent[] = [];
  private dynasties: Dynasty[] = [];
  private sortMode: SortMode = 'default';

  constructor(container: HTMLElement) {
    this.chart = echarts.init(container, null, { renderer: 'svg' });
    this.dynasties = getAllDynasties();
    window.addEventListener('resize', () => this.chart.resize());
  }

  setPeople(people: Person[]) {
    this.people = [...people];
    this.sortPeople();
    this.render();
  }

  setEvents(events: HistoricalEvent[]) {
    this.events = [...events];
    this.render();
  }

  setSortMode(mode: SortMode) {
    this.sortMode = mode;
    this.sortPeople();
    this.render();
  }

  exportAsImage(filename: string = 'timeline.png') {
    const dataUrl = this.chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#1a1612',
    });
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  private sortPeople() {
    switch (this.sortMode) {
      case 'birth':
        this.people.sort((a, b) => a.birth - b.birth);
        break;
      case 'death':
        this.people.sort((a, b) => (a.death ?? 9999) - (b.death ?? 9999));
        break;
      case 'dynasty':
        this.people.sort((a, b) => a.dynasty.localeCompare(b.dynasty));
        break;
      case 'field':
        this.people.sort((a, b) => a.field.localeCompare(b.field));
        break;
      case 'eventRelevance':
        this.sortPeopleByEventRelevance();
        break;
      default:
        break;
    }
  }

  // 按事件关联度排序：让与同一事件相关的人物排在一起
  // 算法：
  // 1. 按事件起始年份排序事件
  // 2. 为每个人物找到关联度最高的事件（主事件）
  // 3. 人物按其主事件的时间排序，同事件相关人物聚在一起
  // 4. 无关联事件的人物按生年排在最后
  private sortPeopleByEventRelevance() {
    if (this.events.length === 0) {
      // 没有事件时退化为按生年排序
      this.people.sort((a, b) => a.birth - b.birth);
      return;
    }

    const sortedEvents = [...this.events].sort((a, b) => a.startYear - b.startYear);

    // 计算人物与事件的关联度
    const getRelevance = (person: Person, event: HistoricalEvent): number => {
      const personDeath = person.death ?? new Date().getFullYear();
      const eventEnd = event.endYear ?? event.startYear;

      // 事件完全在人物生命期内 → 最高关联度 100
      if (event.startYear >= person.birth && eventEnd <= personDeath) {
        return 100;
      }

      // 事件部分重叠于人物生命期 → 80
      const overlapStart = Math.max(person.birth, event.startYear);
      const overlapEnd = Math.min(personDeath, eventEnd);
      if (overlapStart <= overlapEnd) {
        const overlapDuration = overlapEnd - overlapStart + 1;
        const eventDuration = eventEnd - event.startYear + 1;
        return 60 + 20 * Math.min(1, overlapDuration / eventDuration);
      }

      // 事件在人物出生前 30 年内（人物可能早年经历）→ 30
      if (eventEnd <= person.birth && person.birth - eventEnd <= 30) {
        return 30;
      }

      // 事件在人物去世后 30 年内（人物晚年影响延续）→ 20
      if (event.startYear >= personDeath && event.startYear - personDeath <= 30) {
        return 20;
      }

      // 事件与人物时代接近（100年内）→ 10
      const minDist = Math.min(
        Math.abs(person.birth - event.startYear),
        Math.abs(personDeath - eventEnd),
        Math.abs(person.birth - eventEnd),
        Math.abs(personDeath - event.startYear)
      );
      if (minDist <= 100) {
        return 10 - minDist / 20; // 10 ~ 5 分
      }

      return 0;
    };

    // 为每个人物找到主事件（关联度最高的事件）及分数
    const personMainEvent = new Map<string, { eventIndex: number; score: number; eventYear: number }>();

    for (const person of this.people) {
      let bestScore = 0;
      let bestEventIdx = -1;
      let bestEventYear = 99999;

      for (let i = 0; i < sortedEvents.length; i++) {
        const score = getRelevance(person, sortedEvents[i]);
        if (score > bestScore) {
          bestScore = score;
          bestEventIdx = i;
          bestEventYear = sortedEvents[i].startYear;
        }
      }

      personMainEvent.set(person.id, {
        eventIndex: bestEventIdx,
        score: bestScore,
        eventYear: bestEventYear,
      });
    }

    // 排序：
    // 1. 有主事件的人物排在前面，按主事件时间排序
    // 2. 同一事件组内，按关联度从高到低排序
    // 3. 无关联事件的人物按生年排在最后
    this.people.sort((a, b) => {
      const aInfo = personMainEvent.get(a.id)!;
      const bInfo = personMainEvent.get(b.id)!;

      const aHasEvent = aInfo.eventIndex >= 0 && aInfo.score > 0;
      const bHasEvent = bInfo.eventIndex >= 0 && bInfo.score > 0;

      if (aHasEvent && !bHasEvent) return -1;
      if (!aHasEvent && bHasEvent) return 1;
      if (!aHasEvent && !bHasEvent) return a.birth - b.birth;

      // 都有主事件：先按事件时间排序，同事件按关联度排序
      if (aInfo.eventIndex !== bInfo.eventIndex) {
        return aInfo.eventYear - bInfo.eventYear;
      }
      // 同一事件：关联度高的排前面
      if (aInfo.score !== bInfo.score) {
        return bInfo.score - aInfo.score;
      }
      // 关联度相同：按生年排序
      return a.birth - b.birth;
    });
  }

  private getPersonColor(person: Person): string {
    return FIELD_COLORS[person.field] || '#8b5a2b';
  }

  private getEventColor(event: HistoricalEvent): string {
    return EVENT_CATEGORY_COLORS[event.category] || '#7f8c8d';
  }

  private render() {
    const yCategories = this.people.map((p) => p.name);
    const barData = this.people.map((p, index) => {
      const death = p.death ?? new Date().getFullYear();
      return {
        value: [index, p.birth, death],
        itemStyle: {
          color: this.getPersonColor(p),
          borderRadius: [4, 4, 4, 4],
        },
      };
    });

    // 计算时间范围
    let minYear = -2100;
    let maxYear = new Date().getFullYear();
    if (this.people.length > 0) {
      const births = this.people.map((p) => p.birth);
      const deaths = this.people.map((p) => p.death ?? new Date().getFullYear());
      minYear = Math.min(...births) - 100;
      maxYear = Math.max(...deaths) + 50;
    }
    // 考虑事件的时间范围
    if (this.events.length > 0) {
      const eventStarts = this.events.map((e) => e.startYear);
      const eventEnds = this.events.map((e) => e.endYear ?? e.startYear);
      minYear = Math.min(minYear, ...eventStarts) - 50;
      maxYear = Math.max(maxYear, ...eventEnds) + 50;
    }

    // 保存供 renderItem 使用
    const minYearRef = minYear;
    const maxYearRef = maxYear;

    // 计算事件标签布局：贪心算法，逐行放置，避免重叠
    // 由于 renderItem 中无法直接共享状态进行布局计算，我们使用一个闭包变量
    // 在每次 setOption 时重置
    const labelRows: Array<Array<{ xStart: number; xEnd: number }>> = [];
    const maxLabelRows = 6; // 最多 6 行标签
    const labelH = 16;
    const labelGap = 2;
    const labelPaddingX = 8;
    const approxCharWidth = 12;
    const minGap = 4; // 标签之间最小间距

    // 计算每个事件的标签 x 位置（基于年份估算像素位置的近似值）
    // 实际精确位置在 renderItem 中计算，但为了布局计算，我们用比例估算
    const chartWidth = this.chart.getWidth() - 140; // 减去左右边距
    const yearRange = maxYear - minYear;
    const xOffset = 100; // grid left

    const getLabelX = (year: number): number => {
      return xOffset + ((year - minYear) / yearRange) * chartWidth;
    };

    const getLabelWidth = (name: string): number => {
      const maxLen = 10;
      const displayName = name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name;
      return displayName.length * approxCharWidth + labelPaddingX * 2;
    };

    // 按起始年份排序事件，用于贪心布局
    const sortedEvents = [...this.events].sort((a, b) => a.startYear - b.startYear);
    const eventLayoutMap = new Map<string, number>(); // eventId -> row index

    for (const event of sortedEvents) {
      const centerX = getLabelX(event.startYear);
      const labelW = getLabelWidth(event.name);
      const xStart = centerX - labelW / 2;
      const xEnd = centerX + labelW / 2;

      // 找到第一个可以放下的行
      let placedRow = -1;
      for (let row = 0; row < maxLabelRows; row++) {
        if (!labelRows[row]) {
          labelRows[row] = [];
        }
        const rowItems = labelRows[row];
        let canPlace = true;
        for (const item of rowItems) {
          if (xEnd + minGap > item.xStart && xStart - minGap < item.xEnd) {
            canPlace = false;
            break;
          }
        }
        if (canPlace) {
          placedRow = row;
          rowItems.push({ xStart, xEnd });
          break;
        }
      }

      if (placedRow === -1) {
        // 所有行都放不下，放到最后一行（可能重叠）
        placedRow = maxLabelRows - 1;
      }

      eventLayoutMap.set(event.id, placedRow);
    }

    // 计算实际需要的行数和 grid top
    // 布局（从上到下）：
    //   顶部边距 → 事件标签区 → 引导线+朝代带 → grid(人物区)
    const actualRows = Math.min(labelRows.length, maxLabelRows) || 1;
    const labelsTotalH = actualRows * labelH + (actualRows - 1) * labelGap;
    const labelTopMargin = 10;
    const dynastyBandH = 14; // 朝代带高度（细条）
    const dynastyBandGapTop = 6; // 朝代带到标签底部的间距
    const dynastyBandGapBottom = 6; // 朝代带到 grid 顶部的间距
    const guideLineH = dynastyBandGapTop + dynastyBandH + dynastyBandGapBottom; // 引导线区域高度
    const gridTop = labelTopMargin + labelsTotalH + guideLineH; // grid 从人物区开始

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        appendToBody: true,
        trigger: 'item',
        enterable: true,
        backgroundColor: '#2a2218',
        borderColor: '#4a3d2a',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#e8dfd0',
        },
        extraCssText: 'box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); border-radius: 8px;',
        hideDelay: 300,
        formatter: (params: any) => {
          if (params.seriesName === '人物') {
            const person = this.people[params.dataIndex];
            if (!person) return '';
            const birthStr = person.birthUnknown ? '生年不详' : formatYear(person.birth, person.birthApprox);
            const deathStr = person.death
              ? (person.deathUnknown ? '卒年不详' : formatYear(person.death, person.deathApprox))
              : '至今';
            const showLifespan = !person.birthUnknown && !person.deathUnknown && person.death !== null;
            const lifespan = showLifespan ? Math.abs(person.death! - person.birth) : 0;
            return `
              <div style="padding:4px 2px;max-width:280px;">
                <div style="font-weight:700;font-size:15px;color:#e8c490;margin-bottom:6px;">
                  ${person.name}
                  <span style="font-size:12px;color:#8b7f6a;font-weight:normal;margin-left:6px;">${person.field} · ${person.dynasty}</span>
                </div>
                <div style="font-size:13px;color:#c8bfa8;line-height:1.6;">
                  ${birthStr} — ${deathStr}
                  ${showLifespan ? `<span style="color:#6b5f4a;margin-left:6px;">(${lifespan}岁)</span>` : ''}
                </div>
                <div style="font-size:12px;color:#8b7f6a;margin-top:6px;line-height:1.5;">
                  ${person.description}
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #3a3020;">
                  <a href="https://zh.wikipedia.org/wiki/${encodeURIComponent(person.name)}" target="_blank" rel="noopener" style="font-size:12px;color:#d4a56a;text-decoration:none;">📖 查看 Wikipedia 百科 →</a>
                </div>
              </div>
            `;
          } else if (params.seriesName === '朝代带') {
            const dynasty = params.data?.dynastyInfo;
            if (!dynasty) return '';
            const startStr = formatYear(dynasty.start, false);
            const endStr = formatYear(dynasty.end, false);
            const duration = dynasty.end - dynasty.start;
            return `
              <div style="padding:4px 2px;min-width:160px;">
                <div style="font-weight:700;font-size:15px;color:${dynasty.color};margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                  <span style="display:inline-block;width:12px;height:12px;background:${dynasty.color};border-radius:2px;opacity:0.7;"></span>
                  ${dynasty.name}
                </div>
                <div style="font-size:13px;color:#c8bfa8;line-height:1.6;">
                  ${startStr} — ${endStr}
                </div>
                <div style="font-size:12px;color:#8b7f6a;margin-top:4px;">
                  历时约 ${duration} 年
                </div>
                ${dynasty.description ? `<div style="font-size:12px;color:#8b7f6a;margin-top:6px;line-height:1.5;">${dynasty.description}</div>` : ''}
              </div>
            `;
          } else if (params.seriesName === '事件' || params.seriesName === '事件标记') {
            const event = params.data?.eventInfo;
            if (!event) return '';
            const color = this.getEventColor(event);
            const endStr = event.endYear && event.endYear !== event.startYear
              ? formatYear(event.endYear, event.endApprox)
              : null;
            const duration = event.endYear && event.endYear !== event.startYear
              ? event.endYear - event.startYear
              : null;
            return `
              <div style="padding:4px 2px;max-width:280px;">
                <div style="font-weight:700;font-size:15px;color:${color};margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                  <span style="display:inline-block;width:10px;height:10px;background:${color};transform:rotate(45deg);"></span>
                  ${event.name}
                  <span style="font-size:12px;color:#8b7f6a;font-weight:normal;">${event.category}</span>
                </div>
                <div style="font-size:13px;color:#c8bfa8;line-height:1.6;">
                  ${formatYear(event.startYear, event.startApprox)}
                  ${endStr ? ` — ${endStr}` : ''}
                  ${duration ? `<span style="color:#6b5f4a;margin-left:6px;">(历时${duration}年)</span>` : ''}
                </div>
                ${event.location ? `<div style="font-size:12px;color:#8b7f6a;margin-top:4px;">地点：${event.location}</div>` : ''}
                <div style="font-size:12px;color:#8b7f6a;margin-top:6px;line-height:1.5;">
                  ${event.description}
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #3a3020;">
                  <a href="https://zh.wikipedia.org/wiki/${encodeURIComponent(event.name)}" target="_blank" rel="noopener" style="font-size:12px;color:#d4a56a;text-decoration:none;">📖 查看 Wikipedia 百科 →</a>
                </div>
              </div>
            `;
          }
          return '';
        },
      },
      grid: {
        left: 100,
        right: 40,
        top: gridTop,
        bottom: 50,
        containLabel: false,
      },
      axisPointer: {
        type: 'line',
        snap: true,
        lineStyle: {
          color: 'transparent',
        },
        label: {
          show: false,
        },
        triggerEmphasis: true,
        triggerTooltip: true,
        z: 0,
      },
      xAxis: {
        type: 'value',
        min: minYear,
        max: maxYear,
        position: 'bottom',
        axisLine: { lineStyle: { color: '#3d3428' } },
        axisTick: { lineStyle: { color: '#3d3428' } },
        axisLabel: {
          color: '#8b7f6a',
          fontSize: 12,
          formatter: (value: number) => {
            if (value < 0) return `前${Math.abs(value)}`;
            return `${value}`;
          },
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#2d261c', type: 'dashed' },
        },
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#e8dfd0',
          fontSize: 13,
          fontWeight: 500,
          fontFamily: '"Noto Serif SC", "Songti SC", serif',
        },
        splitLine: {
          show: true,
          lineStyle: { color: '#2d261c', type: 'solid' },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 10,
          height: 20,
          borderColor: '#3d3428',
          fillerColor: 'rgba(212, 165, 106, 0.15)',
          handleStyle: { color: '#d4a56a' },
          textStyle: { color: '#8b7f6a', fontSize: 11 },
          backgroundColor: '#262019',
          dataBackground: {
            lineStyle: { color: '#3d3428' },
            areaStyle: { color: '#2d261c' },
          },
          selectedDataBackground: {
            lineStyle: { color: '#d4a56a' },
            areaStyle: { color: 'rgba(212, 165, 106, 0.15)' },
          },
        },
      ],
      series: [
        {
          name: '朝代带',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const dynasty = this.dynasties[params.dataIndex];
            const startX = api.coord([api.value(0), 0])[0];
            const endX = api.coord([api.value(1), 0])[0];
            // 朝代带是顶部的细条，位于事件标签和 grid（人物区）之间
            const bandY = labelTopMargin + labelsTotalH + dynastyBandGapTop;
            const bandH = dynastyBandH;
            return {
              type: 'rect',
              shape: {
                x: startX,
                y: bandY,
                width: endX - startX,
                height: bandH,
              },
              style: {
                fill: dynasty.color + '30',
                stroke: dynasty.color,
                lineWidth: 1,
              },
              styleEmphasis: {
                fill: dynasty.color + '55',
                stroke: dynasty.color,
                lineWidth: 1.5,
              },
              silent: false,
            };
          },
          data: this.dynasties.map((d) => ({
            value: [d.start, d.end],
            name: d.name,
            itemStyle: { color: d.color },
            dynastyInfo: d,
          })),
          z: 1,
          silent: false,
          tooltip: {
            show: true,
          },
        },
        {
          name: '事件标记',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const event = this.events[params.dataIndex];
            if (!event) return { type: 'group', children: [] };
            const color = this.getEventColor(event);
            const startX = api.coord([event.startYear, 0])[0];
            const isDurationEvent = event.endYear && event.endYear !== event.startYear;

            // 获取预计算的行号
            const row = eventLayoutMap.get(event.id) ?? 0;

            // 布局参数
            const labelPaddingY = 2;
            // 菱形在 grid 顶部（人物区最顶端）
            const diamondY = gridTop + 2;
            // 人物区域底部 y 坐标
            const bottomY = this.people.length > 0
              ? api.coord([0, this.people.length - 0.5])[1]
              : diamondY + 50;

            // 标签 y 坐标（基于行号，从 labelTopMargin 开始）
            const labelY = labelTopMargin + row * (labelH + labelGap);

            const children: any[] = [];

            // 事件名称标签（水平文字，在朝代带上方）
            const maxLabelLen = 10;
            const labelText = event.name.length > maxLabelLen
              ? event.name.slice(0, maxLabelLen - 1) + '…'
              : event.name;

            const labelW = labelText.length * approxCharWidth + labelPaddingX * 2;

            // 标签背景
            children.push({
              type: 'rect',
              shape: {
                x: startX - labelW / 2,
                y: labelY - labelPaddingY,
                width: labelW,
                height: labelH,
              },
              style: {
                fill: color + '28',
                stroke: color + '70',
                lineWidth: 1,
                r: 3,
              },
              styleEmphasis: {
                fill: color + '45',
                stroke: color,
                lineWidth: 1.5,
              },
            });

            // 标签文字
            children.push({
              type: 'text',
              x: startX,
              y: labelY + labelH / 2 - 1,
              style: {
                text: labelText,
                fill: '#e8dfd0',
                fontSize: 11,
                fontWeight: 500,
                textAlign: 'center',
                textVerticalAlign: 'middle',
                fontFamily: '"Noto Serif SC", "Songti SC", serif',
              },
            });

            // 标签到朝代带顶部的引导线（连接标签和菱形标记）
            const lineStartY = labelY + labelH + labelPaddingY;
            children.push({
              type: 'line',
              shape: {
                x1: startX,
                y1: lineStartY,
                x2: startX,
                y2: diamondY - 8,
              },
              style: {
                stroke: color + '50',
                lineWidth: 1,
                lineDash: [2, 2],
              },
            });

            // 菱形标记（在朝代带下方、人物区域顶部）
            const diamondSize = 8;
            children.push({
              type: 'polygon',
              shape: {
                points: [
                  [startX, diamondY - diamondSize],
                  [startX + diamondSize / 2, diamondY - diamondSize / 2],
                  [startX, diamondY],
                  [startX - diamondSize / 2, diamondY - diamondSize / 2],
                ],
              },
              style: {
                fill: color,
                stroke: '#1a1612',
                lineWidth: 1.5,
              },
              styleEmphasis: {
                scaleX: 1.3,
                scaleY: 1.3,
                lineWidth: 2,
              },
            });

            // 垂直线（从菱形向下穿过人物区域，与人物生命条视觉对应）
            children.push({
              type: 'line',
              shape: {
                x1: startX,
                y1: diamondY,
                x2: startX,
                y2: bottomY,
              },
              style: {
                stroke: color,
                lineWidth: 1.5,
                lineDash: [4, 3],
                opacity: 0.45,
              },
              styleEmphasis: {
                lineWidth: 2.5,
                opacity: 0.85,
                lineDash: [],
              },
            });

            // 如果是持续事件，在菱形下方绘制横向范围带
            if (isDurationEvent && event.endYear) {
              const endX = api.coord([event.endYear, 0])[0];
              const rangeY = diamondY + 5;
              const rangeH = 4;
              children.push({
                type: 'rect',
                shape: {
                  x: Math.min(startX, endX),
                  y: rangeY - rangeH / 2,
                  width: Math.abs(endX - startX),
                  height: rangeH,
                },
                style: {
                  fill: color + '35',
                  stroke: color,
                  lineWidth: 1,
                  r: 2,
                },
                styleEmphasis: {
                  fill: color + '60',
                  lineWidth: 1.5,
                },
              });
            }

            return {
              type: 'group',
              children,
            };
          },
          data: this.events.map((e) => ({
            value: [e.startYear, 0],
            name: e.name,
            eventInfo: e,
          })),
          z: 4,
          silent: false,
          tooltip: {
            show: true,
          },
        },
        {
          name: '人物',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = api.size([0, 1])[1] * 0.5;
            const person = this.people[params.dataIndex];
            const color = this.getPersonColor(person);

            // 计算时间轴范围（用于不详延伸），通过闭包访问 render 作用域的 minYear/maxYear
            const xMin = minYearRef;
            const xMax = maxYearRef;
            const minCoord = api.coord([xMin, categoryIndex]);
            const maxCoord = api.coord([xMax, categoryIndex]);

            const rectShape = {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(end[0] - start[0], 2),
              height: height,
            };

            const children: any[] = [];

            // 生年不详：从时间轴左端画虚线到去世年
            if (person.birthUnknown && person.death) {
              const dashRect = {
                x: minCoord[0],
                y: start[1] - height / 2,
                width: end[0] - minCoord[0],
                height: height,
              };
              children.push({
                type: 'rect',
                shape: dashRect,
                style: {
                  fill: 'transparent',
                  stroke: color,
                  lineWidth: 1.5,
                  lineDash: [5, 4],
                  opacity: 0.6,
                },
                styleEmphasis: {
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                  opacity: 1,
                },
              });
              // 已知部分（去世端点）用实心短条
              const solidRect = {
                x: end[0] - 8,
                y: start[1] - height / 2,
                width: 8,
                height: height,
              };
              children.push({
                type: 'rect',
                shape: solidRect,
                style: {
                  fill: color,
                  opacity: 0.82,
                  stroke: color,
                  lineWidth: 1.5,
                },
                styleEmphasis: {
                  fill: color,
                  opacity: 1,
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                },
              });
            }
            // 卒年不详：从出生年画虚线到时间轴右端
            else if (person.deathUnknown && person.birth) {
              const dashRect = {
                x: start[0],
                y: start[1] - height / 2,
                width: maxCoord[0] - start[0],
                height: height,
              };
              children.push({
                type: 'rect',
                shape: dashRect,
                style: {
                  fill: 'transparent',
                  stroke: color,
                  lineWidth: 1.5,
                  lineDash: [5, 4],
                  opacity: 0.6,
                },
                styleEmphasis: {
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                  opacity: 1,
                },
              });
              // 已知部分（出生端点）用实心短条
              const solidRect = {
                x: start[0],
                y: start[1] - height / 2,
                width: 8,
                height: height,
              };
              children.push({
                type: 'rect',
                shape: solidRect,
                style: {
                  fill: color,
                  opacity: 0.82,
                  stroke: color,
                  lineWidth: 1.5,
                },
                styleEmphasis: {
                  fill: color,
                  opacity: 1,
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                },
              });
            }
            // 都不详：整条虚线
            else if (person.birthUnknown && person.deathUnknown) {
              const dashRect = {
                x: minCoord[0],
                y: start[1] - height / 2,
                width: maxCoord[0] - minCoord[0],
                height: height,
              };
              children.push({
                type: 'rect',
                shape: dashRect,
                style: {
                  fill: 'transparent',
                  stroke: color,
                  lineWidth: 1.5,
                  lineDash: [5, 4],
                  opacity: 0.6,
                },
                styleEmphasis: {
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                  opacity: 1,
                },
              });
            }
            // 正常：完整实线条
            else {
              children.push({
                type: 'rect',
                shape: rectShape,
                style: {
                  fill: color,
                  opacity: 0.82,
                  stroke: color,
                  lineWidth: 1.5,
                  lineDash: [],
                },
                styleEmphasis: {
                  fill: color,
                  opacity: 1,
                  stroke: '#ffffff',
                  lineWidth: 2.5,
                  shadowBlur: 0,
                },
              });
            }

            // 年龄文字
            if (!person.birthUnknown && !person.deathUnknown && person.death) {
              children.push({
                type: 'text',
                x: rectShape.x + rectShape.width + 6,
                y: rectShape.y + rectShape.height / 2,
                style: {
                  text: `${Math.abs(person.death - person.birth)}岁`,
                  fill: '#8b7f6a',
                  fontSize: 11,
                  textAlign: 'left',
                  textVerticalAlign: 'middle',
                },
              });
            }

            return {
              type: 'group',
              children,
            };
          },
          encode: {
            x: [1, 2],
            y: 0,
          },
          data: barData,
          z: 3,
        },
      ],
    };

    this.chart.setOption(option, true);
  }

  resize() {
    this.chart.resize();
  }

  dispose() {
    this.chart.dispose();
  }

  getInstance() {
    return this.chart;
  }
}
