import { REGISTRY, GROUPS, PRESETS, loadToggles, saveToggles } from './registry.js';

/**
 * Builds the tabbed toggle drawer. `onChange(id, value, allState)` fires on
 * every control interaction. Returns { state, refreshControl(id) }.
 */
export function buildToggleDrawer(root, onChange) {
  const state = loadToggles();

  root.innerHTML = '';
  const drawer = document.createElement('div');
  drawer.className = 'drawer';

  const header = document.createElement('div');
  header.className = 'drawer-header';
  const tabs = document.createElement('div');
  tabs.className = 'drawer-tabs';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'drawer-collapse';
  collapseBtn.textContent = '▾ Toggle drawer';
  header.appendChild(tabs);

  const presetBar = document.createElement('div');
  presetBar.className = 'preset-bar';
  const presetLabel = document.createElement('span');
  presetLabel.textContent = 'Presets:';
  presetBar.appendChild(presetLabel);
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.className = 'preset-btn';
    b.onclick = () => applyPreset(name);
    presetBar.appendChild(b);
  }
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset all';
  resetBtn.className = 'preset-btn reset';
  resetBtn.onclick = () => {
    for (const item of REGISTRY) state[item.id] = item.def;
    saveToggles(state);
    render();
    for (const item of REGISTRY) onChange(item.id, state[item.id], state);
  };
  presetBar.appendChild(resetBtn);
  header.appendChild(presetBar);
  header.appendChild(collapseBtn);
  drawer.appendChild(header);

  const body = document.createElement('div');
  body.className = 'drawer-body';
  drawer.appendChild(body);
  root.appendChild(drawer);

  collapseBtn.onclick = () => {
    drawer.classList.toggle('collapsed');
    collapseBtn.textContent = drawer.classList.contains('collapsed') ? '▸ Toggle drawer' : '▾ Toggle drawer';
  };

  let activeGroup = GROUPS[0];
  const controlEls = {};

  function applyPreset(name) {
    Object.assign(state, PRESETS[name]);
    saveToggles(state);
    render();
    for (const id of Object.keys(PRESETS[name])) onChange(id, state[id], state);
  }

  function makeControl(item) {
    const row = document.createElement('label');
    row.className = 'toggle-row';
    row.title = item.id;
    const span = document.createElement('span');
    span.className = 'toggle-label';
    span.textContent = item.label;
    row.appendChild(span);

    let input;
    if (item.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!state[item.id];
      input.onchange = () => {
        state[item.id] = input.checked;
        saveToggles(state);
        onChange(item.id, state[item.id], state);
      };
    } else if (item.type === 'enum') {
      input = document.createElement('select');
      for (const opt of item.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (opt === state[item.id]) o.selected = true;
        input.appendChild(o);
      }
      input.onchange = () => {
        state[item.id] = input.value;
        saveToggles(state);
        onChange(item.id, state[item.id], state);
      };
    } else if (item.type === 'range') {
      const wrap = document.createElement('span');
      wrap.className = 'range-wrap';
      input = document.createElement('input');
      input.type = 'range';
      input.min = item.min; input.max = item.max; input.step = item.step;
      input.value = state[item.id];
      const valEl = document.createElement('span');
      valEl.className = 'range-val';
      valEl.textContent = fmtNum(state[item.id]);
      input.oninput = () => {
        state[item.id] = parseFloat(input.value);
        valEl.textContent = fmtNum(state[item.id]);
        saveToggles(state);
        onChange(item.id, state[item.id], state);
      };
      wrap.appendChild(input);
      wrap.appendChild(valEl);
      row.appendChild(wrap);
      controlEls[item.id] = { input, valEl };
      return row;
    }
    row.appendChild(input);
    controlEls[item.id] = { input };
    return row;
  }

  function fmtNum(v) {
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  }

  function render() {
    tabs.innerHTML = '';
    for (const g of GROUPS) {
      const t = document.createElement('button');
      t.textContent = g;
      t.className = 'tab-btn' + (g === activeGroup ? ' active' : '');
      t.onclick = () => { activeGroup = g; render(); };
      tabs.appendChild(t);
    }
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'toggle-grid';
    for (const item of REGISTRY.filter(i => i.group === activeGroup)) {
      grid.appendChild(makeControl(item));
    }
    body.appendChild(grid);
  }

  render();

  function refreshControl(id) {
    const item = REGISTRY.find(i => i.id === id);
    const el = controlEls[id];
    if (!item || !el) return;
    if (item.type === 'bool') el.input.checked = !!state[id];
    else if (item.type === 'enum') el.input.value = state[id];
    else if (item.type === 'range') { el.input.value = state[id]; el.valEl.textContent = fmtNum(state[id]); }
  }

  return { state, refreshControl, render };
}
