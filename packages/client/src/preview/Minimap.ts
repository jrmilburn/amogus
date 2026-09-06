import type { MapDef, Point } from '@mutiny/shared/maps';
import { pointInPolygon } from '@mutiny/shared/maps';
import { roomBounds } from '../renderer/roomThemes';
import { minimapPoint, taskDestinations } from './minimap-model';
import type { TaskAssignment } from '@mutiny/shared';
import './minimap.css';

const NS = 'http://www.w3.org/2000/svg';
function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  return node;
}
/** THESIS: know your place without exposing hidden crew.
 * OWN-WORLD: cold station chart, amber own-position beacon, labelled rooms.
 * STORY: orient, choose a corridor, fold the chart away when space is tight.
 * FIRST VIEWPORT: native Map disclosure under the top-left location; assignments flow below.
 * FORM: a compact extension of the existing map toolbar, not a second game screen.
 */
export class Minimap {
  private root = document.createElement('details');
  private marker: SVGCircleElement;
  private location = document.createElement('p');
  private rooms = new Map<string, SVGPolygonElement>();
  private observer: ResizeObserver;
  private positionObserver: MutationObserver;
  private lastRoom = '';
  private taskLayer = element('g', {});
  private taskLegend = document.createElement('p');
  private tasks: readonly TaskAssignment[] = [];
  private selected?: string;
  constructor(
    private host: HTMLDialogElement,
    private map: MapDef,
  ) {
    const title = host.querySelector<HTMLElement>('.map-toolbar > div')!;
    this.root.className = 'station-minimap';
    this.root.open = matchMedia(
      '(min-width: 900px) and (min-height: 600px)',
    ).matches;
    const summary = document.createElement('summary');
    summary.textContent = 'Station map';
    const svg = element('svg', {
      viewBox: '0 0 240 206',
      role: 'img',
      'aria-label':
        'The Hollow floor plan. Amber dot marks your location; other players are never shown.',
    });
    for (const corridor of map.corridors) {
      const p = minimapPoint(map, corridor);
      svg.append(
        element('rect', {
          x: p.x,
          y: p.y,
          width: (corridor.width / map.size.width) * 224,
          height: (corridor.height / map.size.height) * 190,
          fill: '#71888e',
        }),
      );
    }
    for (const room of map.rooms) {
      const polygon = element('polygon', {
        points: room.polygon
          .map((p) => {
            const q = minimapPoint(map, p);
            return `${q.x},${q.y}`;
          })
          .join(' '),
        fill: '#3e5864',
        stroke: '#afc4c4',
        'stroke-width': 0.8,
      });
      const tip = element('title', {});
      tip.textContent = room.name;
      polygon.append(tip);
      svg.append(polygon);
      this.rooms.set(room.id, polygon);
      const b = roomBounds(room);
      const p = minimapPoint(map, { x: b.x + b.width / 2, y: b.y });
      const label = element('text', {
        x: p.x,
        y: p.y - 4,
        'text-anchor': 'middle',
        fill: '#dde6e4',
        'font-size': 9,
        'font-family': 'Trebuchet MS, sans-serif',
      });
      label.textContent = room.name
        .replace(' House', '')
        .replace(' Lab', '')
        .replace(' Well', '');
      svg.append(label);
    }
    this.marker = element('circle', {
      r: 3.5,
      fill: '#f3c681',
      stroke: '#091219',
      'stroke-width': 1.5,
    });
    svg.append(this.taskLayer, this.marker);
    this.location.className = 'minimap-location';
    this.taskLegend.className = 'minimap-task-legend';
    this.taskLegend.hidden = true;
    this.root.append(summary, svg, this.location, this.taskLegend);
    title.append(this.root);
    host.classList.add('has-minimap');
    const measure = () => {
      const bottom = Math.ceil(
        title.getBoundingClientRect().bottom -
          host.getBoundingClientRect().top +
          12,
      );
      host.style.setProperty('--station-hud-bottom', `${bottom}px`);
    };
    this.observer = new ResizeObserver(measure);
    this.observer.observe(title);
    this.positionObserver = new MutationObserver(measure);
    this.positionObserver.observe(host, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  setTasks(tasks: readonly TaskAssignment[]) {
    if (tasks === this.tasks) return;
    this.tasks = tasks;
    if (!tasks.some((task) => task.id === this.selected && !task.completed))
      this.selected = undefined;
    this.drawTasks();
  }
  track(id: string) {
    this.selected = id;
    this.drawTasks();
    this.root.open = true;
    this.root.querySelector('summary')!.focus();
  }
  private drawTasks() {
    const destinations = taskDestinations(this.map, this.tasks);
    this.taskLayer.replaceChildren(
      ...destinations.map((task) => {
        const { x, y } = task.point;
        const mark = element('path', {
          d: `M ${x} ${y - 4} l 4 4 -4 4 -4 -4 Z`,
          fill: task.id === this.selected ? '#ffffff' : '#99ddcc',
          stroke: '#091219',
          'stroke-width': 1.5,
        });
        const title = element('title', {});
        title.textContent = `Your task · ${task.room}`;
        mark.append(title);
        return mark;
      }),
    );
    this.taskLegend.hidden = !destinations.length;
    const tracked = destinations.find((task) => task.id === this.selected);
    this.taskLegend.textContent = tracked
      ? `White diamond: ${tracked.room}. Follow the corridors to your task.`
      : 'Mint diamonds: your unfinished stations. Amber dot: you.';
  }
  update(point: Point, inVent = false, preview = false) {
    const p = minimapPoint(this.map, point);
    this.marker.setAttribute('cx', String(p.x));
    this.marker.setAttribute('cy', String(p.y));
    const room = this.map.rooms.find((r) => pointInPolygon(point, r.polygon));
    const id = room?.id ?? '';
    if (id !== this.lastRoom) {
      for (const [key, polygon] of this.rooms)
        polygon.setAttribute('fill', key === id ? '#697a60' : '#3e5864');
      this.lastRoom = id;
    }
    const text = `${preview ? 'View' : 'You'} · ${room?.name ?? 'Passage'}${inVent ? ' · In vent' : ''}`;
    if (this.location.textContent !== text) this.location.textContent = text;
  }
  destroy() {
    this.observer.disconnect();
    this.positionObserver.disconnect();
    this.root.remove();
    this.host.classList.remove('has-minimap');
    this.host.style.removeProperty('--station-hud-bottom');
  }
}
