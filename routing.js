(function (root) {
  'use strict';
  const rank = type => ({ 'black-solid': 0, 'black-multiple': 0, 'red-solid-arrow': 1, 'red-dashed-arrow': 2, 'blue-dashed-arrow': 3 }[type] ?? 4);
  const pairKey = e => [e.from, e.to].sort().join('|');
  const compare = (a, b) => rank(a.type) - rank(b.type) || a.id.localeCompare(b.id);
  const segments = points => points.slice(1).map((b, i) => ({ a: points[i], b }));
  const horizontal = s => Math.abs(s.a[1] - s.b[1]) < 1e-7;
  const range = (s, axis) => [Math.min(s.a[axis], s.b[axis]), Math.max(s.a[axis], s.b[axis])];
  function overlaps(a, b) {
    if (horizontal(a) !== horizontal(b)) return false;
    const axis = horizontal(a) ? 0 : 1, fixed = 1 - axis;
    const [a0, a1] = range(a, axis), [b0, b1] = range(b, axis);
    return Math.abs(a.a[fixed] - b.a[fixed]) < 6 && Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;
  }
  function crosses(a, b) {
    if (horizontal(a) === horizontal(b)) return false;
    const h = horizontal(a) ? a : b, v = horizontal(a) ? b : a;
    const [x0, x1] = range(h, 0), [y0, y1] = range(v, 1);
    return v.a[0] > x0 + .01 && v.a[0] < x1 - .01 && h.a[1] > y0 + .01 && h.a[1] < y1 - .01;
  }
  function hitsBox(s, box, pad = 0) {
    const x0 = box.x - pad, x1 = box.x + box.width + pad, y0 = box.y - pad, y1 = box.y + box.height + pad;
    const [sx0, sx1] = range(s, 0), [sy0, sy1] = range(s, 1);
    return horizontal(s) ? s.a[1] > y0 && s.a[1] < y1 && sx1 > x0 && sx0 < x1 : s.a[0] > x0 && s.a[0] < x1 && sy1 > y0 && sy0 < y1;
  }
  function compact(points) {
    const result = [];
    for (const p of points) {
      if (result.length && Math.hypot(p[0] - result.at(-1)[0], p[1] - result.at(-1)[1]) < 1e-7) continue;
      result.push(p);
    }
    return result;
  }
  function straight(edge, layout) {
    const ids = layout.nodes.filter(n => n.lane === 'middle').map(n => n.id);
    return rank(edge.type) < 3 && ids.includes(edge.from) && ids.includes(edge.to) && Math.abs(ids.indexOf(edge.from) - ids.indexOf(edge.to)) === 1;
  }
  function planRoutes(layout) {
    const nodes = Object.fromEntries(layout.nodes.map(n => [n.id, n]));
    const center = n => [n.x + n.width / 2, n.y + n.height / 2];
    const sourceOrder = new Map(layout.edges.map((edge, i) => [edge.id, i]));
    const middleBlue = edge => edge.type === 'blue-dashed-arrow' && nodes[edge.from]?.lane === 'middle' && nodes[edge.to]?.lane === 'middle';
    const edges = [...layout.edges].sort((a, b) => Number(straight(b, layout)) - Number(straight(a, layout)) || pairKey(a).localeCompare(pairKey(b)) || (middleBlue(a) && middleBlue(b) ? sourceOrder.get(a.id) - sourceOrder.get(b.id) : compare(a, b)));
    const faces = new Map(), groups = new Map(), ports = new Map();
    // 組織の各面の接続口を共有させない。相手位置順で並べて交差を減らす。
    function face(n, other) {
      if (n.lane === other.lane) return 'bottom';
      if (center(n)[1] > center(other)[1]) return 'top';
      const [cx] = center(n), [ox] = center(other);
      const blocked = layout.nodes.some(o => o.id !== n.id && o.lane === n.lane && Math.min(cx, ox) < o.x + o.width && Math.max(cx, ox) > o.x);
      return Math.abs(ox - cx) > n.width / 2 + 45 && !blocked ? (ox < cx ? 'left' : 'right') : 'bottom';
    }
    for (const e of edges.filter(e => !straight(e, layout))) for (const id of [e.from, e.to]) {
      const other = nodes[id === e.from ? e.to : e.from], side = face(nodes[id], other), key = `${id}:${side}`;
      faces.set(`${e.id}:${id}`, side);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ edge: e, other });
    }
    for (const [key, group] of groups) {
      const split = key.lastIndexOf(':'), id = key.slice(0, split), side = key.slice(split + 1), n = nodes[id], [cx, cy] = center(n);
      group.sort((a, b) => {
        const ax = center(a.other)[0], bx = center(b.other)[0];
        if (side === 'left' || side === 'right') return Math.abs(bx - cx) - Math.abs(ax - cx) || compare(a.edge, b.edge);
        return ax - bx || (side === 'top' && ax < cx ? -1 : 1) * compare(a.edge, b.edge);
      });
      group.forEach(({ edge }, i) => {
        const vertical = side === 'top' || side === 'bottom';
        const span = (vertical ? n.width : n.height) * .72;
        // 微小な辺ごとの差も付け、別組織上の接続口と同一軸になるのを避ける。
        const offset = (i - (group.length - 1) / 2) * Math.min(vertical ? 24 : 44, span / Math.max(1, group.length - 1)) + (edges.indexOf(edge) + 1) * .013;
        const rx = n.width / 2, ry = n.height / 2;
        const x = vertical ? cx + offset : cx + (side === 'right' ? 1 : -1) * (n.shape === 'ellipse' ? rx * Math.sqrt(1 - (offset / ry) ** 2) : rx);
        const y = vertical ? cy + (side === 'bottom' ? 1 : -1) * (n.shape === 'ellipse' ? ry * Math.sqrt(1 - (offset / rx) ** 2) : ry) : cy + offset;
        const stub = vertical ? [x, side === 'bottom' ? n.y + n.height + 16 : n.y - 16] : [side === 'right' ? n.x + n.width + 16 : n.x - 16, y];
        ports.set(`${edge.id}:${id}`, { point: [x, y], stub, side });
      });
    }
    const planned = [], used = [];
    const bounds = layout.routeBounds || { left: 18, right: layout.width - 18, top: 18, bottom: layout.height - 18 };
    const top = bounds.top, bottom = bounds.bottom;
    for (const edge of edges) {
      const a = nodes[edge.from], b = nodes[edge.to], [ax, ay] = center(a), [bx] = center(b);
      let points;
      if (straight(edge, layout)) {
        const bundle = edges.filter(e => straight(e, layout) && pairKey(e) === pairKey(edge)).sort(compare);
        const slot = bundle.findIndex(e => e.id === edge.id), step = Math.min(30, Math.min(a.height, b.height) * .68 / Math.max(1, bundle.length - 1));
        const offset = (slot - (bundle.length - 1) / 2) * step;
        const port = (n, sign) => [center(n)[0] + sign * (n.shape === 'ellipse' ? n.width / 2 * Math.sqrt(1 - (offset / (n.height / 2)) ** 2) : n.width / 2), ay + offset];
        points = [port(a, Math.sign(bx - ax)), port(b, Math.sign(ax - bx))];
      } else {
        const pa = ports.get(`${edge.id}:${a.id}`), pb = ports.get(`${edge.id}:${b.id}`);
        const s = pa.stub, t = pb.stub, candidates = [];
        const add = middle => candidates.push(compact([pa.point, ...middle, pb.point]));
        // 最短のL字と、両端の接続口から出る直交ルート。
        if (a.lane !== b.lane) {
          add([[pb.point[0], pa.point[1]]]); add([[pa.point[0], pb.point[1]]]);
          add([s, [s[0], t[1]], t]); add([s, [t[0], s[1]], t]);
        }
        const bundle = edges.filter(e => pairKey(e) === pairKey(edge)).sort((a, b) => middleBlue(a) && middleBlue(b) ? sourceOrder.get(a.id) - sourceOrder.get(b.id) : compare(a, b)), slot = bundle.findIndex(e => e.id === edge.id);
        const sameLane = a.lane === b.lane;
        // 同じ上段の組織間では黒を最も外側に、見積を内側に並べる。
        let preferredY = sameLane ? Math.max(a.y + a.height, b.y + b.height) + 34 + (bundle.length - 1 - slot) * 32 : (s[1] + t[1]) / 2 + slot * 28;
        if (middleBlue(edge)) {
          const blueBundle = bundle.filter(middleBlue);
          const blueSlot = blueBundle.findIndex(e => e.id === edge.id);
          const labelBand = e => e.label ? Math.max(38, Math.ceil(Array.from(e.label).length / 14) * 18 + 16) : 24;
          preferredY = Math.max(a.y + a.height, b.y + b.height) + 24 + blueBundle.slice(0, blueSlot).reduce((sum, e) => sum + labelBand(e), 0);
        }
        const laneYs = [];
        for (let y = top + 14; y <= bottom - 14; y += 22.017) laneYs.push(y);
        laneYs.sort((a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY));
        for (const y of [preferredY, ...laneYs]) add([s, [s[0], y], [t[0], y], t]);
        const railXs = [(s[0] + t[0]) / 2];
        for (let x = bounds.right - 10; x >= bounds.left + 10; x -= 24.019) railXs.push(x);
        railXs.sort((a, b) => Math.abs(a - (s[0] + t[0]) / 2) - Math.abs(b - (s[0] + t[0]) / 2));
        for (const x of railXs) add([s, [x, s[1]], [x, t[1]], t]);
        // 混雑時はA4内の外周レールを使う。座標系自体は拡張しない。
        for (let i = 0; i < 28; i++) {
          for (const railX of [bounds.right - 8 - i * 20.023, bounds.left + 8 + i * 20.029]) {
            const yOptionsA = [Math.max(top + 8, a.y - 22 - i * .17), Math.min(bottom - 8, a.y + a.height + 22 + i * .19)];
            const yOptionsB = [Math.max(top + 8, b.y - 22 - i * .13), Math.min(bottom - 8, b.y + b.height + 22 + i * .23)];
            for (const ya of yOptionsA) for (const yb of yOptionsB) add([s, [s[0], ya], [railX, ya], [railX, yb], [t[0], yb], t]);
          }
        }
        let best = Infinity;
        for (const candidate of candidates) {
          const ss = segments(candidate);
          const outward = (start, next, side) => side === 'top' ? next[1] < start[1] && Math.abs(next[0] - start[0]) < 1e-6 : side === 'bottom' ? next[1] > start[1] && Math.abs(next[0] - start[0]) < 1e-6 : side === 'left' ? next[0] < start[0] && Math.abs(next[1] - start[1]) < 1e-6 : next[0] > start[0] && Math.abs(next[1] - start[1]) < 1e-6;
          if (ss.length < 1 || !outward(candidate[0], candidate[1], pa.side) || !outward(candidate.at(-1), candidate.at(-2), pb.side)) continue;
          if (candidate.some(p => !p.every(Number.isFinite) || p[0] < bounds.left || p[0] > bounds.right || p[1] < bounds.top || p[1] > bounds.bottom)) continue;
          if (ss.some(z => !horizontal(z) && Math.abs(z.a[0] - z.b[0]) > 1e-6)) continue;
          if (ss.some((z, i) => layout.nodes.some(n => !(i === 0 && n.id === a.id) && !(i === ss.length - 1 && n.id === b.id) && hitsBox(z, n, 3)))) continue;
          if (ss.some((z, i) => ss.slice(i + 1).some(other => overlaps(z, other))) || ss.some(z => used.some(other => overlaps(z, other)))) continue;
          const crossings = ss.reduce((sum, z) => sum + used.filter(other => crosses(z, other)).length, 0);
          const length = ss.reduce((sum, z) => sum + Math.abs(z.a[0] - z.b[0]) + Math.abs(z.a[1] - z.b[1]), 0);
          const orderCost = sameLane ? Math.min(...ss.filter(horizontal).map(z => Math.abs(z.a[1] - preferredY))) * (middleBlue(edge) ? 80 : 12) : 0;
          const cost = crossings * 3000 + length + candidate.length * 12 + orderCost;
          if (cost < best) { best = cost; points = candidate; }
        }
        if (!points) throw new Error('線が混み合い、重ならない経路を確保できません。組織や線の表示を調整してください。');
      }
      const item = { edge, points, segments: segments(points), d: points.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ') };
      used.push(...item.segments); planned.push(item);
    }
    // 全線を確定してから、線・組織・既存ラベルと重ならない領域を探す。
    const boxes = [], labels = [];
    const widthOf = text => Array.from(text).reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 7.5 : 12.5), 0);
    const wrap = (text, width) => {
      const lines = []; let line = '';
      for (const c of Array.from(text)) { if (line && widthOf(line + c) > width) { lines.push(line); line = ''; } line += c; }
      if (line) lines.push(line); return lines;
    };
    const labelBoxStatus = box => {
      if (box.x < bounds.left || box.x + box.width > bounds.right || box.y < bounds.top || box.y + box.height > bounds.bottom) return false;
      if (layout.nodes.some(n => box.x < n.x + n.width + 6 && box.x + box.width > n.x - 6 && box.y < n.y + n.height + 6 && box.y + box.height > n.y - 6)) return false;
      if (boxes.some(b => box.x < b.x + b.width + 6 && box.x + box.width > b.x - 6 && box.y < b.y + b.height + 6 && box.y + box.height > b.y - 6)) return false;
      return { masked: used.some(s => hitsBox(s, box, 5)) };
    };
    for (const item of planned.filter(p => p.edge.label)) {
      const candidates = [];
      const horizontalSpans = item.segments.filter(s => horizontal(s) && Math.abs(s.a[0] - s.b[0]) > 10).sort((a, b) => Math.abs(b.a[0] - b.b[0]) - Math.abs(a.a[0] - a.b[0]));
      const isMiddleBlue = middleBlue(item.edge);
      const below = item.edge.type === 'red-dashed-arrow' || isMiddleBlue;
      horizontalSpans.forEach((span, spanIndex) => {
        const length = Math.abs(span.a[0] - span.b[0]), mid = (span.a[0] + span.b[0]) / 2;
        const wrapWidths = [...new Set([Math.max(12, length - 6), Math.min(220, Math.max(70, length - 18)), 150, 110, 80])];
        for (const wrapWidth of wrapWidths) {
          const lines = wrap(item.edge.label, wrapWidth);
          const width = Math.max(...lines.map(widthOf)) + (wrapWidth < 70 ? 4 : 10), height = lines.length * 18 + 6;
          for (const extraY of [0, 12, 24, 36, 48, 60]) for (const dx of [0, -18, 18, -36, 36, -54, 54, -72, 72]) {
            const y = below ? span.a[1] + 5 + extraY : span.a[1] - 5 - height - extraY;
            const box = { x: mid + dx - width / 2, y, width, height };
            const status = labelBoxStatus(box);
            if (status) candidates.push({ ...box, lines, xText: box.x + width / 2, yText: box.y + 16, masked: status.masked, score: (status.masked ? 100000 : 0) + extraY * 20 + Math.abs(dx) + spanIndex * 9 + lines.length * 2 });
          }
        }
      });
      // 縦線だけの短い経路でも、線の左右すぐそばから候補を探す。
      item.segments.filter(s => !horizontal(s) && Math.abs(s.a[1] - s.b[1]) > 24).forEach((span, spanIndex) => {
        for (const wrapWidth of [150, 110, 80]) {
          const lines = wrap(item.edge.label, wrapWidth);
          const width = Math.max(...lines.map(widthOf)) + 10, height = lines.length * 18 + 6;
          const mid = (span.a[1] + span.b[1]) / 2;
          for (const gap of [5, 17, 29, 41]) for (const side of [-1, 1]) for (const dy of [0, -18, 18, -36, 36]) {
            const box = { x: side < 0 ? span.a[0] - gap - width : span.a[0] + gap, y: mid + dy - height / 2, width, height };
            const status = labelBoxStatus(box);
            if (status) candidates.push({ ...box, lines, xText: box.x + width / 2, yText: box.y + 16, masked: status.masked, score: (status.masked ? 100000 : 0) + (gap - 5) * 20 + Math.abs(dy) + spanIndex * 9 + lines.length * 2 + 4 });
          }
        }
      });
      let placed = candidates.sort((a, b) => a.score - b.score)[0];
      if (!placed) {
        // 最終手段も描画を止めない。短く改行し、対応線の中央へ白抜きで重ねる。
        const span = item.segments.sort((a, b) => (Math.abs(b.a[0] - b.b[0]) + Math.abs(b.a[1] - b.b[1])) - (Math.abs(a.a[0] - a.b[0]) + Math.abs(a.a[1] - a.b[1])))[0];
        const lines = wrap(item.edge.label, 70), width = Math.max(...lines.map(widthOf)) + 10, height = lines.length * 18 + 6;
        const isHorizontal = horizontal(span), midX = (span.a[0] + span.b[0]) / 2, midY = (span.a[1] + span.b[1]) / 2;
        const x = Math.max(bounds.left, Math.min(bounds.right - width, isHorizontal ? midX - width / 2 : span.a[0] + 5));
        const y = Math.max(bounds.top, Math.min(bounds.bottom - height, isHorizontal ? (below ? span.a[1] + 5 : span.a[1] - height - 5) : midY - height / 2));
        placed = { x, y, width, height, lines, xText: x + width / 2, yText: y + 16, masked: true };
      }
      delete placed.score;
      boxes.push(placed); labels.push(placed); item.label = placed;
    }
    return planned;
  }
  root.DiagramRouting = { planRoutes, segments, overlaps, crosses, hitsBox, rank };
})(globalThis);
