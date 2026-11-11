(() => {
  'use strict';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function svg(tag, attributes = {}, text) {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function display(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return Array.isArray(value) ? value.map(display).join(' · ') : Object.entries(value).map(([key, item]) => `${key}: ${display(item)}`).join(' · ');
    return String(value);
  }
  function bindingValue(knowledge, definition, node) {
    if (!knowledge || !node.bind) return undefined;
    const path = definition.bindings[node.bind];
    if (!path) return undefined;
    let current = knowledge;
    for (const key of path.split('.')) {
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
      current = current[key];
    }
    return current;
  }
  function hasContent(value) {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.some(hasContent);
    if (typeof value === 'object') return Object.values(value).some(hasContent);
    return true;
  }
  function hasRenderableContent(knowledge, definition) {
    const visit = node => hasContent(bindingValue(knowledge, definition, node)) || !!node.children?.some(visit);
    return visit(definition.root);
  }
  function diagram(value, direction) {
    const graph = object(value);
    const nodes = Array.isArray(graph.nodes) ? graph.nodes.map(object) : [];
    const edges = Array.isArray(graph.edges) ? graph.edges.map(object) : [];
    if (!nodes.length) return element('p', '暂无关系节点', 'muted');
    const horizontal = direction !== 'vertical';
    const columns = horizontal ? Math.min(3, nodes.length) : 1;
    const positions = new Map(nodes.map((node, index) => [String(node.id), { x: 20 + index % columns * 220, y: 24 + Math.floor(index / columns) * 120 }]));
    const width = columns * 220 + 20, height = Math.ceil(nodes.length / columns) * 120 + 24;
    const container = element('div', undefined, 'view-diagram');
    const image = svg('svg', { role: 'img', 'aria-label': '关系图', width, height, viewBox: `0 0 ${width} ${height}` });
    for (const edge of edges) {
      const from = positions.get(String(edge.from)), to = positions.get(String(edge.to));
      if (!from || !to) continue;
      const x1 = horizontal ? from.x + 180 : from.x + 90, y1 = horizontal ? from.y + 28 : from.y + 56;
      const x2 = horizontal ? to.x : to.x + 90, y2 = horizontal ? to.y + 28 : to.y;
      const angle = Math.atan2(y2 - y1, x2 - x1), size = 7;
      const group = svg('g');
      group.append(svg('path', { class: 'view-diagram__edge', d: `M${x1},${y1} L${x2},${y2}` }),
        svg('path', { class: 'view-diagram__arrow', d: `M${x2},${y2} L${x2 - size * Math.cos(angle - .5)},${y2 - size * Math.sin(angle - .5)} L${x2 - size * Math.cos(angle + .5)},${y2 - size * Math.sin(angle + .5)} Z` }),
        svg('text', { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 - 6 }, typeof edge.label === 'string' ? edge.label.slice(0, 24) : ''));
      image.append(group);
    }
    nodes.forEach((node, index) => {
      const x = 20 + index % columns * 220, y = 24 + Math.floor(index / columns) * 120;
      const title = display(node.name ?? node.label ?? node.id), group = svg('g');
      group.append(svg('title', {}, title + (node.path ? ` · ${display(node.path)}` : '')),
        svg('rect', { x, y, width: 180, height: 56, rx: 6 }),
        svg('text', { x: x + 12, y: y + 24 }, title.length > 19 ? `${title.slice(0, 18)}…` : title));
      if (node.path) group.append(svg('text', { class: 'view-diagram__path', x: x + 12, y: y + 43 }, display(node.path).slice(0, 24)));
      image.append(group);
    });
    container.append(image);
    return container;
  }
  function renderDocument(snapshot) {
    const { knowledge, definition } = snapshot;
    function render(node) {
      const props = node.props, value = bindingValue(knowledge, definition, node);
      const section = element('section', undefined, `view-node view-node--${node.type} view-node--${props?.variant ?? 'default'}`);
      if (props?.title) section.append(element('h3', props.title));
      if (['stack', 'grid', 'section'].includes(node.type)) section.append(...(node.children ?? []).map(render));
      else if (!hasContent(value)) section.append(element('p', '暂无内容', 'muted'));
      else if (node.type === 'diagram') section.append(diagram(value, props?.direction));
      else if (node.type === 'table') {
        const rows = Array.isArray(value) ? value : [];
        const columns = props?.columns ?? Object.keys(object(rows[0])).slice(0, 8);
        const scroll = element('div', undefined, 'view-table-scroll'), table = element('table'), head = element('thead'), header = element('tr'), body = element('tbody');
        header.append(...columns.map(column => element('th', column))); head.append(header);
        for (const row of rows) { const line = element('tr'); line.append(...columns.map(column => element('td', display(object(row)[column])))); body.append(line); }
        table.append(head, body); scroll.append(table); section.append(scroll);
      } else if (node.type === 'list' || node.type === 'timeline') {
        const list = element('ul'); list.append(...(Array.isArray(value) ? value : [value]).map(item => element('li', display(item)))); section.append(list);
      } else section.append(element('p', node.type === 'empty' ? '暂无内容' : display(value), node.type === 'empty' ? 'muted' : undefined));
      return section;
    }
    const result = document.createDocumentFragment();
    if (knowledge?.example) result.append(element('p', '示例数据', 'view-example'));
    result.append(render(definition.root));
    return result;
  }
  window.WorkbenchDocument = Object.freeze({ renderDocument, hasRenderableContent });
})();
