// history.js — last-10-diagrams history panel (Phase 4)

const HISTORY_KEY = 'textsketch_history';
const MAX_HISTORY = 10;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function pushHistory(spec, title) {
  const list = loadHistory();
  const entry = {
    id: Date.now(),
    title: title || spec.title || 'Untitled',
    type: spec.type,
    spec: JSON.parse(JSON.stringify(spec)), // deep clone
    ts: Date.now(),
  };
  // deduplicate: remove matching title+type entry if within last 30 s
  const recent = list.filter(e => !(e.title === entry.title && e.type === entry.type && entry.ts - e.ts < 30000));
  recent.unshift(entry);
  saveHistory(recent.slice(0, MAX_HISTORY));
}

export function getHistory() { return loadHistory(); }

export function deleteHistoryEntry(id) {
  saveHistory(loadHistory().filter(e => e.id !== id));
}

export function renameHistoryEntry(id, newTitle) {
  const list = loadHistory();
  const entry = list.find(e => e.id === id);
  if (entry) { entry.title = newTitle; saveHistory(list); }
}

// ─── History panel UI ─────────────────────────────────────────────────────────
export function buildHistoryPanel(container, onOpen) {
  function render() {
    container.replaceChildren();
    const list = getHistory();
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'hist-empty';
      p.textContent = 'No diagrams yet.';
      container.appendChild(p);
      return;
    }
    list.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'hist-row';

      const info = document.createElement('div');
      info.className = 'hist-info';

      const typeTag = document.createElement('span');
      typeTag.className = 'hist-type';
      typeTag.textContent = entry.type;

      const title = document.createElement('span');
      title.className = 'hist-title';
      title.textContent = entry.title;
      title.title = 'Click to rename';
      title.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.value = entry.title;
        inp.className = 'hist-rename-inp';
        title.replaceWith(inp);
        inp.focus(); inp.select();
        const commit = () => {
          const v = inp.value.trim() || entry.title;
          renameHistoryEntry(entry.id, v);
          render();
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
      });

      info.appendChild(typeTag);
      info.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'hist-actions';

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-sm';
      openBtn.textContent = 'Open';
      openBtn.setAttribute('aria-label', `Open ${entry.title}`);
      openBtn.addEventListener('click', () => onOpen(entry.spec));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm hist-del';
      delBtn.textContent = '\u00D7';
      delBtn.setAttribute('aria-label', `Delete ${entry.title}`);
      delBtn.addEventListener('click', () => { deleteHistoryEntry(entry.id); render(); });

      actions.appendChild(openBtn);
      actions.appendChild(delBtn);
      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  render();
  return { refresh: render };
}
