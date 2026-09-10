(function () {
  'use strict';
  const D = DiagramData, M = DiagramModel, R = DiagramRenderer;
  let state = M.createState();
  let edgeDraft = null;
  let pointer = null;
  const $ = id => document.getElementById(id);
  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => key === 'class' ? node.className = value : node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function option(select, value, title) { select.append(el('option', { value }, title)); }
  function normalizeOption(o) { return typeof o === 'string' ? { value: o, label: o } : o; }
  function notice(text) { return el('p', { class: 'notice' }, text); }
  function say(text, error = false) { $('message').textContent = text; $('message').style.color = error ? '#b02a2a' : '#176c4d'; }
  function renderQuestions() {
    $('sections').replaceChildren();
    D.sections.forEach((title, i) => {
      const button = el('button', { 'aria-current': state.ui.currentSection === i ? 'step' : 'false' }, `${i + 1} ${title}`);
      button.onclick = () => { state.ui.currentSection = i; state.ui.showAllQuestions = false; renderQuestions(); $('questions').scrollTop = 0; };
      $('sections').append(button);
    });
    $('questions').replaceChildren();
    D.sections.forEach((title, section) => {
      if (!state.ui.showAllQuestions && section !== state.ui.currentSection) return;
      const container = el('section', { class: 'question-section' });
      container.append(el('h3', { class: 'section-title' }, title));
      if (section === 1) container.append(notice('この設問群は作図自動化の判断に使います。現在は回答を保持し、対応ルールが確定した項目から図へ反映します。'));
      D.questions.filter(q => q.section === section).forEach(q => {
        const field = el('label', { class: 'field', 'data-question': q.id });
        const heading = el('span', { class: 'field-heading' });
        if (q.number) heading.append(el('span', { class: 'question-number' }, q.number));
        heading.append(document.createTextNode(q.title)); field.append(heading);
        let input;
        if (q.type === 'select') {
          input = el('select', { id: `input-${q.id}` }); option(input, '', '選択してください');
          q.options.map(normalizeOption).forEach(o => option(input, String(o.value), o.label));
        } else input = el('input', { id: `input-${q.id}`, type: 'text', maxlength: q.type === 'integer' ? '20' : '120' });
        input.value = state.ui.invalidNumbers[q.id] ?? state.project[q.id] ?? '';
        const warning = el('span', { class: 'number-warning', role: 'status' }, '整数以外が含まれています。このまま入力・表示・出力できます。');
        warning.hidden = q.type !== 'integer' || !input.value || /^[+-]?[0-9]+$/.test(input.value);
        input.addEventListener(q.type === 'select' ? 'change' : 'input', () => {
          warning.hidden = q.type !== 'integer' || !input.value || /^[+-]?[0-9]+$/.test(input.value);
          delete state.ui.invalidNumbers[q.id];
          input.setCustomValidity('');
          const selected = q.options?.map(normalizeOption).find(o => String(o.value) === input.value);
          state.project[q.id] = q.type === 'select' ? (selected?.value ?? (q.options.some(o => typeof o.value === 'boolean') ? null : '')) : input.value;
          updateConditionalQuestions(); redraw();
        });
        field.append(input); if (q.type === 'integer') field.append(warning); if (q.help) field.append(el('span', { class: 'help' }, q.help));
        container.append(field);
      });
      if (section === 2) renderOrganizations(container);
      $('questions').append(container);
    });
    updateConditionalQuestions();
    $('show-all').textContent = state.ui.showAllQuestions ? 'セクション表示に戻る' : 'すべて表示';
    $('previous').disabled = state.ui.showAllQuestions || state.ui.currentSection === 0;
    $('next').disabled = state.ui.showAllQuestions || state.ui.currentSection === D.sections.length - 1;
    $('section-progress').textContent = state.ui.showAllQuestions ? '全項目を表示中' : `${state.ui.currentSection + 1} / ${D.sections.length}`;
  }
  function updateConditionalQuestions() {
    D.questions.forEach(q => { const field = document.querySelector(`[data-question="${q.id}"]`); if (field) field.hidden = Boolean(q.visibleWhen && state.project[q.visibleWhen.field] !== q.visibleWhen.equals); });
  }
  function renderOrganizations(container) {
    container.append(notice('組織名を入力すると表示がONになります。会員をONにすると緑枠になります。'));
    D.organizations.forEach(def => {
      const org = state.organizations[def.id];
      const card = el('div', { class: 'org-card' });
      const top = el('div', { class: 'org-top' }); top.append(el('strong', {}, def.role));
      const visibleLabel = el('label'); const visible = el('input', { type: 'checkbox', 'aria-label': `${def.role}を表示` }); visible.checked = org.visible;
      visibleLabel.append(visible, ' 表示');
      const memberLabel = el('label'); const member = el('input', { type: 'checkbox', 'aria-label': `${def.role}は会員` }); member.checked = org.member;
      memberLabel.append(member, ' 会員'); top.append(visibleLabel, memberLabel); card.append(top);
      const name = el('input', { type: 'text', maxlength: 60, placeholder: '組織名を入力', 'aria-label': `${def.role}の組織名` }); name.value = org.name;
      name.addEventListener('input', () => {
        org.name = name.value;
        if (org.name.trim()) { org.visible = true; visible.checked = true; }
        redraw();
      });
      visible.onchange = () => { org.visible = visible.checked; redraw(); };
      member.onchange = () => {
        org.member = member.checked;
        redraw();
      };
      const shapeField = el('fieldset', { class: 'org-shape-field' });
      shapeField.append(el('legend', {}, '組織枠'));
      for (const [value, text] of [['rect', '四角枠'], ['ellipse', '丸枠']]) {
        const shapeLabel = el('label');
        const shape = el('input', { type: 'radio', name: `shape-${def.id}`, value, 'aria-label': `${def.role}を${text}` });
        shape.checked = org.shape === value;
        shape.onchange = () => { if (shape.checked) { org.shape = value; redraw(); } };
        shapeLabel.append(shape, ` ${text}`); shapeField.append(shapeLabel);
      }
      card.append(name, shapeField);
      container.append(card);
    });
  }
  function nodeName(id) { if (id === 'g') return 'G'; const org = state.organizations[id]; return `${org.role}：${org.name}`; }
  function cancelConnection() { state.ui.connectionMode = null; redraw(); }
  function chooseNode(id) {
    const current = state.ui.connectionMode;
    if (!current) { state.ui.connectionMode = { from: id }; redraw(); }
    else if (current.from === id) cancelConnection();
    else { current.to = id; openEdgeDialog({ from: current.from, to: id, type: 'black-solid', labelType: 'none', label: '', autoGenerated: false }); }
  }
  function redraw() {
    const ids = new Set(['g', ...M.visibleOrganizations(state).map(o => o.id)]);
    if (state.ui.connectionMode && !ids.has(state.ui.connectionMode.from)) state.ui.connectionMode = null;
    let rendered;
    try { rendered = R.renderDiagram(state, chooseNode, cancelConnection, editEdge); }
    catch (error) { $('diagram').replaceChildren(notice(error.message)); renderEdgeList(); say(error.message, true); return; }
    const { svg, layout } = rendered;
    $('diagram').replaceChildren(svg);
    const nameArea = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    nameArea.setAttribute('x', 166); nameArea.setAttribute('y', layout.projectNameY - 23); nameArea.setAttribute('width', layout.width - 252); nameArea.setAttribute('height', 35);
    const nameInput = el('input', { type: 'text', maxlength: 120, class: 'diagram-project-input', 'aria-label': '図の案件名', placeholder: '案件名を入力' }); nameInput.value = state.project.projectName;
    nameInput.addEventListener('click', event => event.stopPropagation());
    nameInput.addEventListener('input', () => { state.project.projectName = nameInput.value; const input = $('input-projectName'); if (input) input.value = nameInput.value; });
    nameInput.addEventListener('change', redraw);
    nameArea.append(nameInput); nameArea.addEventListener('click', event => event.stopPropagation());
    svg.querySelector('[data-project-name]').setAttribute('visibility', 'hidden'); svg.append(nameArea);
    $('connection-status').textContent = state.ui.connectionMode ? `${nodeName(state.ui.connectionMode.from)} → 接続先を選択してください` : '';
    $('connection-bar').hidden = !state.ui.connectionMode;
    updatePointer();
    renderEdgeList();
  }
  function renderEdgeList() {
    const automatic = M.autoEdges(state);
    const visibleIds = new Set(M.visibleEdges(state).map(e => e.id));
    $('edge-count').textContent = `自動 ${automatic.length} / 手動 ${state.edges.length}`;
    $('edge-list').replaceChildren();
    if (!automatic.length && !state.edges.length) $('edge-list').append(el('p', { class: 'empty' }, '組織情報を入力すると施工体制の線を自動で接続します。営業・見積・支払の線は、図の組織をクリックして追加できます。'));
    [...automatic, ...state.edges].forEach(edge => {
      const row = el('div', { class: 'edge-row' });
      const text = el('div', {}, `${nodeName(edge.from)} ${D.edgeTypes.find(t => t.id === edge.type).arrow ? '→' : '―'} ${nodeName(edge.to)}`);
      text.append(el('small', {}, `${D.edgeTypes.find(t => t.id === edge.type).name}${edge.label ? ` / ${edge.label}` : ' / ラベルなし'}${visibleIds.has(edge.id) ? '' : ' / 接続先が非表示のため図では非表示'}`));
      row.append(text);
      const actions = el('div', { class: 'edge-actions' });
      if (edge.autoGenerated) actions.append(el('span', { class: 'badge' }, '自動'));
      const edit = el('button', { 'aria-label': `${nodeName(edge.from)}から${nodeName(edge.to)}の線を編集` }, '編集'); edit.onclick = () => editEdge(edge.id); actions.append(edit);
      const button = el('button', { 'aria-label': `${nodeName(edge.from)}から${nodeName(edge.to)}の線を削除` }, '削除'); button.onclick = () => { M.removeEdge(state, edge); redraw(); say('関係線を削除しました。'); }; actions.append(button); row.append(actions);
      $('edge-list').append(row);
    });
  }
  function editEdge(id) {
    const edge = [...M.autoEdges(state), ...state.edges].find(e => e.id === id);
    if (!edge) return;
    state.ui.connectionMode = null; redraw(); openEdgeDialog(edge);
  }
  function selectedType() { return document.querySelector('input[name="edge-type"]:checked').value; }
  function openEdgeDialog(edge) {
    edgeDraft = { ...edge };
    const { from, to } = edgeDraft;
    $('edge-dialog-title').textContent = edge.id ? '関係線を編集' : '関係線を追加';
    $('save-edge').textContent = edge.id ? '変更を保存' : '線を追加';
    $('delete-edge').hidden = !edge.id;
    $('reverse-edge-field').hidden = !edge.id || !D.edgeTypes.find(t => t.id === edge.type).arrow;
    $('reverse-edge').checked = false;
    $('edge-endpoints').textContent = `${nodeName(from)} → ${nodeName(to)}`;
    $('edge-types').replaceChildren();
    D.edgeTypes.forEach(t => {
      const label = el('label', { class: 'edge-type-option' });
      const radio = el('input', { type: 'radio', name: 'edge-type', value: t.id }); radio.checked = t.id === edge.type;
      radio.onchange = () => renderLabelOptions();
      label.append(radio, R.renderLineSample(t), el('span', {}, t.name));
      $('edge-types').append(label);
    });
    $('edge-error').textContent = '';
    renderLabelOptions(edge); $('edge-dialog').showModal(); updatePointer();
  }
  function renderLabelOptions(existing) {
    const type = D.edgeTypes.find(t => t.id === selectedType());
    $('reverse-edge').disabled = !type.arrow;
    if (!type.arrow) $('reverse-edge').checked = false;
    $('edge-label').replaceChildren();
    const labels = [{ id: 'none', text: 'なし（空欄）' }, ...type.labels.filter(l => l.id !== 'none')];
    labels.forEach(l => option($('edge-label'), l.id, l.text));
    if (existing) $('edge-label').value = existing.label ? existing.labelType : 'none';
    else if (edgeDraft.from === 'g' && type.id === 'red-dashed-arrow') $('edge-label').value = 'estimate-material';
    renderExtraField(existing);
  }
  function renderExtraField(existing) {
    const def = $('edge-label').value === 'none' ? {} : D.edgeTypes.find(t => t.id === selectedType()).labels.find(l => l.id === $('edge-label').value);
    $('edge-extra-field').hidden = !def.extra;
    $('edge-extra-title').textContent = def.extra === 'percent' ? '3. 営業値引きの割合（％）' : def.extra === 'name' ? '3. ●に入る名称' : '3. 線に表示する内容';
    const input = $('edge-extra'); input.value = ''; input.type = def.extra === 'percent' ? 'number' : 'text'; input.required = false; input.setCustomValidity('');
    if (def.extra === 'percent') { input.min = '0'; input.max = '100'; input.step = 'any'; } else { input.removeAttribute('min'); input.removeAttribute('max'); input.removeAttribute('step'); }
    if (existing && def.extra) {
      if (existing.labelExtra !== undefined) input.value = existing.labelExtra;
      else if (def.id === 'custom') input.value = existing.label;
      else { const [before, after] = def.text.split('●'); input.value = existing.label.slice(before.length, after ? -after.length : undefined); }
    }
    $('edge-error').textContent = '';
  }
  function closeDialog() { $('edge-dialog').close(); edgeDraft = null; cancelConnection(); }
  $('edge-form').onsubmit = event => {
    event.preventDefault();
    try {
      const editing = Boolean(edgeDraft.id);
      const edge = { ...edgeDraft, id: edgeDraft.id || `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: selectedType(), labelType: $('edge-label').value, labelExtra: $('edge-extra').value, label: M.resolveLabel(selectedType(), $('edge-label').value, $('edge-extra').value) };
      if (editing && !$('reverse-edge-field').hidden && $('reverse-edge').checked && D.edgeTypes.find(t => t.id === edge.type).arrow) [edge.from, edge.to] = [edge.to, edge.from];
      const newEstimate = !editing && edge.type === 'red-dashed-arrow' && /^estimate-(material-work|material|work)$/.test(edge.labelType) && Boolean(edge.label);
      M.saveEdge(state, edge, { applyRelations: editing || newEstimate }); closeDialog(); say(editing ? '関係線を変更しました。' : '関係線を追加しました。');
    } catch (error) { $('edge-error').textContent = error.message; }
  };
  $('edge-label').onchange = () => renderExtraField();
  $('delete-edge').onclick = () => { M.removeEdge(state, edgeDraft); closeDialog(); say('関係線を削除しました。'); };
  $('close-dialog').onclick = closeDialog; $('cancel-dialog').onclick = closeDialog;
  $('edge-dialog').addEventListener('cancel', () => { edgeDraft = null; cancelConnection(); });
  $('edge-dialog').addEventListener('click', e => { if (e.target === $('edge-dialog')) { const r = $('edge-dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
  $('cancel-connection').onclick = cancelConnection;
  function updatePointer() {
    const svg = $('diagram').querySelector('svg');
    const line = svg?.querySelector('[data-connection-preview]');
    if (!line) return;
    const current = state.ui.connectionMode;
    const matrix = svg.getScreenCTM();
    if (!pointer || !current || $('edge-dialog').open || $('reset-dialog').open || !matrix) { line.setAttribute('visibility', 'hidden'); return; }
    const point = svg.createSVGPoint(); point.x = pointer.x; point.y = pointer.y;
    const end = point.matrixTransform(matrix.inverse());
    const node = R.calculateNodeLayout(state).nodes.find(n => n.id === current.from);
    const dx = end.x - node.x - node.width / 2, dy = end.y - node.y - node.height / 2;
    if (!dx && !dy) { line.setAttribute('visibility', 'hidden'); return; }
    const start = R.boundary(node, dx, dy);
    line.setAttribute('d', `M ${start[0]} ${start[1]} L ${end.x} ${end.y}`); line.setAttribute('visibility', 'visible');
  }
  document.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; updatePointer(); });
  document.addEventListener('scroll', updatePointer, true); window.addEventListener('resize', updatePointer);
  $('reset').onclick = () => { $('reset-dialog').showModal(); updatePointer(); };
  $('cancel-reset').onclick = () => { $('reset-dialog').close(); updatePointer(); };
  $('confirm-reset').onclick = () => {
    $('reset-dialog').close(); if ($('edge-dialog').open) $('edge-dialog').close();
    state = M.createState(); edgeDraft = null; pointer = null; $('export-scale').value = '1';
    renderQuestions(); redraw(); $('questions').scrollTop = 0; $('diagram-stage').scrollTop = 0; $('diagram-stage').scrollLeft = 0; say('図をリセットしました。');
  };
  $('diagram-stage').addEventListener('click', e => { if (e.target === $('diagram-stage')) cancelConnection(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('edge-dialog').open) cancelConnection(); });
  $('show-all').onclick = () => { state.ui.showAllQuestions = !state.ui.showAllQuestions; renderQuestions(); };
  $('previous').onclick = () => { state.ui.currentSection--; renderQuestions(); $('questions').scrollTop = 0; };
  $('next').onclick = () => { state.ui.currentSection++; renderQuestions(); $('questions').scrollTop = 0; };
  $('export').onclick = async () => {
    $('export').disabled = true; say('PNGを生成しています…');
    try { await R.exportPng(state, Number($('export-scale').value)); say('PNGを出力しました。ブラウザのダウンロード先をご確認ください。'); }
    catch (error) { say(error.message, true); }
    finally { $('export').disabled = false; }
  };
  $('export-scale').value = '1';
  renderQuestions(); redraw();
})();
