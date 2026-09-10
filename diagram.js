(function (root) {
  'use strict';
  const D = root.DiagramData, M = root.DiagramModel;
  const NS = 'http://www.w3.org/2000/svg';
  const FONT = '"Yu Gothic", "YuGothic", sans-serif';
  // A4横を5px/mmで表した固定座標系。SVGもPNGも常に297:210。
  const PAGE_WIDTH = 1485, PAGE_HEIGHT = 1050, PAD = 70;
  const DEFAULT_NODE_SIZE = 140, MIN_NODE_SIZE = 104, MIN_GAP = 18;
  const COLORS = { ink: '#082b3c', text: '#111111', member: '#49b51c' };
  function svgEl(tag, attrs = {}, content) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (content !== undefined) el.textContent = content;
    return el;
  }
  function chunks(value, size) {
    const chars = Array.from(value);
    return Array.from({ length: Math.ceil(chars.length / size) }, (_, i) => chars.slice(i * size, (i + 1) * size).join(''));
  }
  function multiText(parent, text, x, y, size, maxChars, attrs = {}) {
    const el = svgEl('text', { x, y, 'font-size': size, ...attrs });
    chunks(text, maxChars).forEach((line, i) => el.append(svgEl('tspan', { x, dy: i ? size * 1.45 : 0 }, line)));
    parent.append(el);
    return el;
  }
  function isStraightEdge(edge, nodes) {
    const middle = nodes.filter(n => n.lane === 'middle').map(n => n.id);
    return middle.includes(edge.from) && middle.includes(edge.to) && Math.abs(middle.indexOf(edge.from) - middle.indexOf(edge.to)) === 1 && ['black-solid', 'red-solid-arrow', 'red-dashed-arrow', 'black-multiple'].includes(edge.type);
  }
  function calculateNodeLayout(state) {
    const orgs = M.visibleOrganizations(state);
    const upperOthers = orgs.filter(o => o.lane === 'upper');
    const middle = orgs.filter(o => o.lane === 'middle');
    const lower = orgs.filter(o => o.lane === 'lower');
    const edges = M.visibleEdges(state);
    const width = PAGE_WIDTH, height = PAGE_HEIGHT;
    const titleChars = Math.floor((width - PAD * 2) / 32);
    const titleLines = Math.max(1, chunks(M.buildDiagramTitle(state), titleChars).length);
    const projectNameChars = Math.floor((width - PAD * 2 - 80) / 17);
    const projectNameLines = Math.max(1, chunks(state.project.projectName, projectNameChars).length);
    // 番号行との間に十分な行間を取り、案件名が続き文字に見えないようにする。
    const projectNameY = 155 + titleLines * 52 + 42;
    const headerBottom = projectNameY + projectNameLines * 24;
    const upperY = Math.max(300, headerBottom + 24);
    const middleCenter = 725;
    const lowerY = 885;
    const available = width - PAD * 2;
    const count = Math.max(1, middle.length);
    const nodeSize = Math.max(MIN_NODE_SIZE, Math.min(DEFAULT_NODE_SIZE, (available - MIN_GAP * (count - 1)) / count));
    const middleGap = count > 1 ? Math.max(MIN_GAP, (available - nodeSize * count) / (count - 1)) : 0;
    const start = count > 1 ? PAD : (width - nodeSize) / 2;
    const nodes = [{ id: 'g', name: 'G', role: '', member: true, lane: 'upper', shape: 'rect', x: width / 2 - 105, y: upperY, width: 210, height: 120 }];

    middle.forEach((o, i) => {
      const round = o.shape === 'ellipse';
      const role = o.id === 'org1' ? (state.project.orderType === '公共' ? '発注者' : state.project.orderType === '民間' ? '施主' : o.role) : o.role;
      const nodeHeight = round ? nodeSize : o.id === 'org1' ? Math.min(180, nodeSize + 40) : Math.min(112, nodeSize);
      nodes.push({ ...o, role, shape: round ? 'ellipse' : 'rect', x: start + i * (nodeSize + middleGap), y: middleCenter - nodeHeight / 2, width: nodeSize, height: nodeHeight });
    });

    const org1 = nodes.find(n => n.id === 'org1');
    const upperWidth = 145, upperHeight = 90, upperGap = 22;
    let upperStart = org1 ? org1.x + org1.width / 2 - upperWidth / 2 : PAD;
    const upperBlockWidth = upperOthers.length * upperWidth + Math.max(0, upperOthers.length - 1) * upperGap;
    upperStart = Math.max(PAD, Math.min(upperStart, nodes[0].x - upperBlockWidth - 34));
    upperOthers.sort((a, b) => (a.id === 'consultant' ? -1 : b.id === 'consultant' ? 1 : a.id === 'designer' ? -1 : b.id === 'designer' ? 1 : 0));
    upperOthers.forEach((o, i) => nodes.push({ ...o, shape: o.shape || 'rect', x: upperStart + i * (upperWidth + upperGap), y: upperY + 15, width: upperWidth, height: upperHeight }));

    const lowerWidth = Math.min(150, available / Math.max(1, lower.length));
    const lowerGap = lower.length > 1 ? Math.max(18, (available - lowerWidth * lower.length) / (lower.length - 1)) : 0;
    lower.forEach((o, i) => nodes.push({ ...o, shape: o.shape || 'rect', x: lower.length > 1 ? PAD + i * (lowerWidth + lowerGap) : (width - lowerWidth) / 2, y: lowerY, width: lowerWidth, height: 88 }));

    return { nodes, edges, width, height, pageRatio: 297 / 210, titleChars, titleLines, projectNameY, projectNameChars, routeBounds: { left: 18, right: width - 18, top: headerBottom + 8, bottom: height - 18 } };
  }
  // 指定方向の矩形・楕円の外周座標。円形への接続も枠線上で止める。
  function boundary(node, dx, dy) {
    const rx = node.width / 2, ry = node.height / 2;
    const factor = node.shape === 'ellipse' ? 1 / Math.hypot(dx / rx, dy / ry) : 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
    return [node.x + rx + dx * factor, node.y + ry + dy * factor];
  }
  function verticalPort(node, shift, bottom) {
    const rx = node.width / 2, ry = node.height / 2;
    return [node.x + rx + shift, node.y + ry + (bottom ? 1 : -1) * (node.shape === 'ellipse' ? ry * Math.sqrt(1 - (shift / rx) ** 2) : ry)];
  }
  function renderDiagram(state, onNode, onBlank, onEdge = () => {}) {
    const layout = calculateNodeLayout(state);
    const routes = root.DiagramRouting.planRoutes(layout);
    const svg = svgEl('svg', { xmlns: NS, viewBox: `0 0 ${layout.width} ${layout.height}`, width: layout.width, height: layout.height, role: 'img', 'aria-label': '成果体系図', 'font-family': FONT });
    svg.append(svgEl('rect', { width: layout.width, height: layout.height, fill: '#fff' }));
    const defs = svgEl('defs');
    D.edgeTypes.filter(t => t.arrow).forEach(t => {
      const marker = svgEl('marker', { id: `arrow-${t.id}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 10, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
      marker.append(svgEl('path', { d: 'M 1 1 L 9 5 L 1 9', fill: 'none', stroke: t.color, 'stroke-width': 1.7 })); defs.append(marker);
    });
    svg.append(defs);
    svg.append(svgEl('text', { x: PAD, y: 108, 'font-size': 20, 'font-weight': 700, fill: COLORS.text }, '【成果体系図】'));
    multiText(svg, M.buildDiagramTitle(state), PAD, 158, 36, layout.titleChars, { 'font-weight': 400, fill: COLORS.text });
    const numberY = 155 + layout.titleLines * 52;
    let x = PAD;
    for (const [caption, value] of [['マイナンバー', state.project.myNumber], ['レコード番号', state.project.recordNumber]]) {
      if (!value) continue;
      svg.append(svgEl('text', { x, y: numberY, 'font-size': 14, fill: COLORS.text }, caption));
      x += 106;
      svg.append(svgEl('text', { x, y: numberY, 'font-size': 16, fill: COLORS.text }, value));
      x += Math.max(120, value.length * 16 + 35);
    }
    svg.append(svgEl('text', { x: PAD, y: layout.projectNameY, 'font-size': 14, fill: COLORS.text }, '案件名'));
    multiText(svg, state.project.projectName, PAD + 80, layout.projectNameY, 17, layout.projectNameChars, { fill: COLORS.text, 'data-project-name': '' });
    const labelLayer = svgEl('g', { class: 'edge-label-layer' });
    routes.forEach(route => {
      const edge = route.edge;
      const type = D.edgeTypes.find(t => t.id === edge.type);
      const group = svgEl('g', { class: 'diagram-edge', 'data-edge-id': edge.id, role: 'button', tabindex: 0, 'aria-label': `${edge.label || type.name}：線を編集` });
      const attrs = { d: route.d, fill: 'none', stroke: type.color, 'stroke-width': 1.8, 'stroke-linejoin': 'miter' };
      if (type.dashed) attrs['stroke-dasharray'] = '6 5';
      if (type.arrow) attrs['marker-end'] = `url(#arrow-${type.id})`;
      if (type.id === 'black-multiple') {
        group.append(svgEl('path', { ...attrs, 'stroke-width': 9 }));
        group.append(svgEl('path', { ...attrs, stroke: '#fff', 'stroke-width': 7 }));
        group.append(svgEl('path', { ...attrs, 'stroke-width': 3 }));
      } else group.append(svgEl('path', attrs));
      group.append(svgEl('path', { d: route.d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, 'pointer-events': 'stroke', class: 'edge-hit-area' }));
      if (route.label) {
        const label = route.label;
        const labelGroup = svgEl('g', { class: 'diagram-edge-label', role: 'button', tabindex: 0, 'aria-label': `${edge.label}：線を編集` });
        labelGroup.append(svgEl('rect', { x: label.x - 2, y: label.y - 1, width: label.width + 4, height: label.height + 2, rx: 2, fill: '#fff', opacity: label.masked ? .98 : .9 }));
        const text = svgEl('text', { x: label.xText, y: label.yText, 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle', fill: type.color, 'data-edge-label': edge.id });
        label.lines.forEach((line, i) => text.append(svgEl('tspan', { x: label.xText, dy: i ? 18 : 0 }, line)));
        labelGroup.append(text);
        labelGroup.addEventListener('click', event => { event.stopPropagation(); onEdge(edge.id); });
        labelGroup.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdge(edge.id); } });
        labelLayer.append(labelGroup);
      }
      group.addEventListener('click', event => { event.stopPropagation(); onEdge(edge.id); });
      group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdge(edge.id); } });
      svg.append(group);
    });
    layout.nodes.forEach(node => {
      const selected = state.ui.connectionMode?.from === node.id;
      const group = svgEl('g', { class: 'diagram-node', 'data-node-id': node.id, role: 'button', tabindex: 0, 'aria-label': `${node.role} ${node.name}：関係線を接続`, 'aria-pressed': String(selected) });
      group.append(svgEl('title', {}, `${node.role} ${node.name}`));
      const geometry = node.shape === 'ellipse' ? { cx: node.x + node.width / 2, cy: node.y + node.height / 2, rx: node.width / 2, ry: node.height / 2 } : { x: node.x, y: node.y, width: node.width, height: node.height };
      group.append(svgEl(node.shape, { ...geometry, fill: selected ? '#dcf3e8' : '#fff', stroke: node.member ? COLORS.member : COLORS.ink, 'stroke-width': selected ? 3 : 1.5 }));
      const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
      if (node.id === 'g') group.append(svgEl('text', { x: cx, y: cy + 12, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 400, fill: COLORS.text }, 'G'));
      else {
        const size = 13;
        const maxChars = Math.max(4, Math.floor((node.width - 24) / size));
        const lines = chunks(node.name, maxChars);
        const textTop = cy - (lines.length * size * 1.45) / 2;
        group.append(svgEl('text', { x: cx, y: textTop, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.text }, node.role));
        const nameText = multiText(group, node.name, cx, textTop + 20, size, maxChars, { 'text-anchor': 'middle', 'font-weight': 400, fill: COLORS.text, 'data-org-name': node.id });
        Array.from(nameText.children).forEach((span, i) => {
          const y = textTop + 20 + i * size * 1.45;
          const dy = Math.max(Math.abs(y - cy), Math.abs(y - size - cy));
          const available = node.shape === 'ellipse' ? node.width * Math.sqrt(Math.max(.1, 1 - (dy / (node.height / 2)) ** 2)) - 20 : node.width - 20;
          if (Array.from(lines[i]).length * size > available) { span.setAttribute('textLength', available); span.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
        });
      }
      group.addEventListener('click', e => { e.stopPropagation(); onNode(node.id); });
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNode(node.id); } });
      svg.append(group);
    });
    // 線と組織より後に描くことで、最終配置でも白抜きラベルが隠れない。
    svg.append(labelLayer);
    if (state.ui.connectionMode) svg.append(svgEl('path', { 'data-connection-preview': '', fill: 'none', stroke: '#9239d3', 'stroke-width': 2, 'stroke-dasharray': '7 4', 'pointer-events': 'none', visibility: 'hidden' }));
    svg.addEventListener('click', onBlank);
    return { svg, layout, routes };
  }
  async function exportPng(state, scale) {
    await document.fonts.ready;
    const cleanState = { ...state, ui: { ...state.ui, connectionMode: null } };
    const { svg, layout } = renderDiagram(cleanState, () => {}, () => {});
    const width = Math.ceil(layout.width * scale), height = Math.ceil(layout.height * scale);
    if (width * height > 64000000 || Math.max(width, height) > 16000) throw new Error('図が大きすぎます。倍率を下げるか、関係線を減らしてください。');
    const source = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(source);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('図の画像変換に失敗しました。')); image.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('このブラウザでは画像出力を利用できません。');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNGの生成に失敗しました。');
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = downloadUrl; link.download = `成果体系図${state.project.recordNumber ? `_${state.project.recordNumber.replace(/[<>:\x22/\\|?*\x00-\x1f]/g, '_')}` : ''}.png`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    } finally { URL.revokeObjectURL(url); }
  }
  function renderLineSample(type) {
    const svg = svgEl('svg', { viewBox: '0 0 130 28', width: 130, height: 28, 'aria-hidden': 'true' });
    const attrs = { d: 'M 8 14 L 119 14', fill: 'none', stroke: type.color, 'stroke-width': 2 };
    if (type.dashed) attrs['stroke-dasharray'] = '6 5';
    if (type.id === 'black-multiple') {
      svg.append(svgEl('path', { ...attrs, 'stroke-width': 9 }), svgEl('path', { ...attrs, stroke: '#fff', 'stroke-width': 7 }), svgEl('path', { ...attrs, 'stroke-width': 3 }));
    } else svg.append(svgEl('path', attrs));
    if (type.arrow) svg.append(svgEl('path', { d: 'M 110 8 L 120 14 L 110 20', fill: 'none', stroke: type.color, 'stroke-width': 2 }));
    return svg;
  }
  root.DiagramRenderer = { calculateNodeLayout, renderDiagram, exportPng, boundary, renderLineSample };
})(globalThis);
