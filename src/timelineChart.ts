import * as echarts from 'echarts';
import type { Person, Dynasty, SortMode } from './types';
import { FIELD_COLORS } from './types';
import { formatYear, getAllDynasties } from './dataService';

export class TimelineChart {
  private chart: echarts.ECharts;
  private people: Person[] = [];
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
      default:
        break;
    }
  }

  private getColor(person: Person): string {
    return FIELD_COLORS[person.field] || '#8b5a2b';
  }

  private render() {
    const yCategories = this.people.map((p) => p.name);
    const barData = this.people.map((p, index) => {
      const death = p.death ?? new Date().getFullYear();
      return {
        value: [index, p.birth, death],
        itemStyle: {
          color: this.getColor(p),
          borderRadius: [4, 4, 4, 4],
        },
      };
    });

    // 朝代标记在 custom series 中渲染

    // 计算时间范围
    let minYear = -2100;
    let maxYear = new Date().getFullYear();
    if (this.people.length > 0) {
      const births = this.people.map((p) => p.birth);
      const deaths = this.people.map((p) => p.death ?? new Date().getFullYear());
      minYear = Math.min(...births) - 100;
      maxYear = Math.max(...deaths) + 50;
    }

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        appendToBody: true,
        trigger: 'item',
        backgroundColor: '#2a2218',
        borderColor: '#4a3d2a',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: {
          color: '#e8dfd0',
        },
        extraCssText: 'box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5); border-radius: 8px;',
        formatter: (params: any) => {
          if (params.seriesName === '人物') {
            const person = this.people[params.dataIndex];
            if (!person) return '';
            const deathStr = person.death
              ? formatYear(person.death, person.deathApprox)
              : '至今';
            const lifespan = person.death
              ? person.death - person.birth
              : new Date().getFullYear() - person.birth;
            return `
              <div style="padding:4px 2px;max-width:280px;">
                <div style="font-weight:700;font-size:15px;color:#e8c490;margin-bottom:6px;">
                  ${person.name}
                  <span style="font-size:12px;color:#8b7f6a;font-weight:normal;margin-left:6px;">${person.field} · ${person.dynasty}</span>
                </div>
                <div style="font-size:13px;color:#c8bfa8;line-height:1.6;">
                  ${formatYear(person.birth, person.birthApprox)} — ${deathStr}
                  <span style="color:#6b5f4a;margin-left:6px;">(${lifespan}岁)</span>
                </div>
                <div style="font-size:12px;color:#8b7f6a;margin-top:6px;line-height:1.5;">
                  ${person.description}
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
          }
          return '';
        },
      },
      grid: {
        left: 100,
        right: 40,
        top: 60,
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
            const categoryIndex = -0.5;
            const start = api.coord([api.value(0), categoryIndex]);
            const end = api.coord([api.value(1), categoryIndex]);
            const dynasty = this.dynasties[params.dataIndex];
            return {
              type: 'rect',
              shape: {
                x: start[0],
                y: 10,
                width: end[0] - start[0],
                height: 24,
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
          name: '人物',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const categoryIndex = api.value(0);
            const start = api.coord([api.value(1), categoryIndex]);
            const end = api.coord([api.value(2), categoryIndex]);
            const height = api.size([0, 1])[1] * 0.5;
            const person = this.people[params.dataIndex];
            const color = this.getColor(person);

            const rectShape = {
              x: start[0],
              y: start[1] - height / 2,
              width: Math.max(end[0] - start[0], 2),
              height: height,
            };

            return {
              type: 'group',
              children: [
                {
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
                },
                {
                  type: 'text',
                  x: rectShape.x + rectShape.width + 6,
                  y: rectShape.y + rectShape.height / 2,
                  style: {
                    text: person.death
                      ? `${person.death - person.birth}岁`
                      : `${new Date().getFullYear() - person.birth}岁`,
                    fill: '#8b7f6a',
                    fontSize: 11,
                    textAlign: 'left',
                    textVerticalAlign: 'middle',
                  },
                },
              ],
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
