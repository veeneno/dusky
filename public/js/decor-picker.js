/* Galeria paginada: apenas miniaturas estáticas; prévia animada no cartão ao selecionar. */
const decorCatalogSearch = {};
function buildCatalogPicker(slot) {
  const section = document.createElement('section');
  section.className = 'decor-catalog';
  const title = document.createElement('h3');
  title.textContent = 'catálogo';
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'buscar decoração pelo nome';
  search.setAttribute('aria-label', 'buscar no catálogo de ' + DECOR_SLOTS[slot].label);
  search.value = decorCatalogSearch[slot] || '';
  const info = document.createElement('p');
  info.className = 'field-help'; info.setAttribute('aria-live', 'polite');
  const grid = document.createElement('div');
  grid.className = 'decor-catalog-grid'; grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'catálogo de ' + DECOR_SLOTS[slot].label);
  const nav = document.createElement('div'); nav.className = 'decor-catalog-nav';
  const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = 'anterior';
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'próxima';
  const pageLabel = document.createElement('span');
  nav.append(prev, pageLabel, next);
  const selected = document.createElement('p'); selected.className = 'field-help decor-catalog-selected';
  section.append(title, search, selected, info, grid, nav);
  let page = 0;
  const pageSize = 36;
  const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const all = (window.DuskyDecor?.items || []).filter(item => item.slot === slot);
  const refreshSelected = () => {
    const item = window.DuskyDecor?.get(slot, (decorDraft[slot] || '').replace(/^catalog:/, ''));
    selected.textContent = item ? 'selecionado: ' + item.name : '';
    selected.hidden = !item;
  };
  function render() {
    const found = all.filter(item => fold(item.name).includes(fold(search.value.trim())));
    const pages = Math.max(1, Math.ceil(found.length / pageSize));
    page = Math.min(page, pages - 1);
    grid.replaceChildren();
    for (const item of found.slice(page * pageSize, (page + 1) * pageSize)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'decor-chip';
      button.dataset.catalogId = item.id; button.setAttribute('role', 'radio');
      const active = decorDraft[slot] === 'catalog:' + item.id;
      button.classList.toggle('active', active); button.setAttribute('aria-checked', String(active));
      const image = document.createElement('img');
      image.src = item.preview; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.className = 'catalog-thumb catalog-thumb-' + slot;
      const label = document.createElement('span'); label.className = 'decor-chip-label'; label.textContent = item.name;
      button.append(image, label);
      button.addEventListener('click', () => {
        decorDraft[slot] = 'catalog:' + item.id;
        for (const chip of section.parentElement.querySelectorAll('.decor-chip[role="radio"]')) {
          const checked = chip === button;
          chip.classList.toggle('active', checked); chip.setAttribute('aria-checked', String(checked));
        }
        profileDecorTabs.querySelector(`[data-tab="decor-${slot}"]`)?.classList.add('has-value');
        refreshSelected(); refreshLivePreview(); refreshDecorNpPreview();
      });
      grid.appendChild(button);
    }
    info.textContent = found.length ? `${found.length} decorações` : 'nenhuma decoração encontrada';
    prev.disabled = page === 0; next.disabled = page >= pages - 1;
    pageLabel.textContent = `${page + 1} / ${pages}`;
    nav.hidden = pages === 1;
    refreshSelected();
  }
  search.addEventListener('input', () => { decorCatalogSearch[slot] = search.value; page = 0; render(); });
  prev.addEventListener('click', () => { page--; render(); });
  next.addEventListener('click', () => { page++; render(); });
  render();
  return section;
}
