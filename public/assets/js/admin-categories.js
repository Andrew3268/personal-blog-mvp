function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeName(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

let categories = [];
let subcategories = [];
let selectedCategory = '';
let editingMain = '';
let editingSub = '';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.message || `요청 실패 (${response.status})`);
  return json;
}

function setStatus(id, message = '', error = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', Boolean(error));
}

function subcategoriesFor(categoryName) {
  return subcategories.filter((item) => normalizeName(item.category_name) === categoryName);
}

function renderMainCategories() {
  const list = document.getElementById('mainCategoryList');
  const count = document.getElementById('mainCategoryCount');
  if (count) count.textContent = `${categories.length}개`;
  if (!list) return;
  if (!categories.length) {
    list.innerHTML = '<div class="taxonomy-empty small">등록된 메인 카테고리가 없습니다.</div>';
    return;
  }

  list.innerHTML = categories.map((item) => {
    const name = normalizeName(item.name);
    const isSelected = selectedCategory === name;
    const isEditing = editingMain === name;
    const childCount = subcategoriesFor(name).length;
    return `
      <div class="taxonomy-item ${isSelected ? 'is-selected' : ''}" data-main-item="${escapeHtml(name)}">
        <div class="taxonomy-item__body">
          ${isEditing
            ? `<input class="input taxonomy-item__edit-input" data-main-edit-input="${escapeHtml(name)}" value="${escapeHtml(name)}" />`
            : `<button class="taxonomy-item__select" type="button" data-main-select="${escapeHtml(name)}">
                <span class="taxonomy-item__name">${escapeHtml(name)}</span>
                <span class="taxonomy-item__meta">글 ${Number(item.count || 0).toLocaleString('ko-KR')} · 서브 ${childCount}</span>
              </button>`}
        </div>
        <div class="taxonomy-item__actions">
          ${isEditing
            ? `<button class="btn btn--brand" type="button" data-main-save="${escapeHtml(name)}">저장</button><button class="btn" type="button" data-main-cancel>취소</button>`
            : `<button class="btn" type="button" data-main-edit="${escapeHtml(name)}">수정</button><button class="btn btn--danger" type="button" data-main-delete="${escapeHtml(name)}">삭제</button>`}
        </div>
      </div>`;
  }).join('');
}

function renderSubcategories() {
  const list = document.getElementById('subCategoryList');
  const title = document.getElementById('subCategoryTitle');
  const count = document.getElementById('subCategoryCount');
  const input = document.getElementById('newSubcategoryName');
  const addBtn = document.getElementById('addSubcategoryBtn');
  const items = selectedCategory ? subcategoriesFor(selectedCategory) : [];

  if (title) title.textContent = selectedCategory || '메인 카테고리를 선택하세요';
  if (count) count.textContent = selectedCategory ? `${items.length}개` : '-';
  if (input) input.disabled = !selectedCategory;
  if (addBtn) addBtn.disabled = !selectedCategory;
  if (!list) return;

  if (!selectedCategory) {
    list.innerHTML = '<div class="taxonomy-empty small">왼쪽에서 메인 카테고리를 선택하세요.</div>';
    return;
  }
  if (!items.length) {
    list.innerHTML = '<div class="taxonomy-empty small">등록된 서브 카테고리가 없습니다.</div>';
    return;
  }

  list.innerHTML = items.map((item) => {
    const name = normalizeName(item.name);
    const isEditing = editingSub === name;
    return `
      <div class="taxonomy-item taxonomy-item--sub">
        <div class="taxonomy-item__body">
          ${isEditing
            ? `<input class="input taxonomy-item__edit-input" data-sub-edit-input="${escapeHtml(name)}" value="${escapeHtml(name)}" />`
            : `<div class="taxonomy-item__static"><span class="taxonomy-item__name">${escapeHtml(name)}</span><span class="taxonomy-item__meta">연결 글 ${Number(item.count || 0).toLocaleString('ko-KR')}</span></div>`}
        </div>
        <div class="taxonomy-item__actions">
          ${isEditing
            ? `<button class="btn btn--brand" type="button" data-sub-save="${escapeHtml(name)}">저장</button><button class="btn" type="button" data-sub-cancel>취소</button>`
            : `<button class="btn" type="button" data-sub-edit="${escapeHtml(name)}">수정</button><button class="btn btn--danger" type="button" data-sub-delete="${escapeHtml(name)}">삭제</button>`}
        </div>
      </div>`;
  }).join('');
}

async function reloadTaxonomy(preferredCategory = selectedCategory) {
  const [categoryJson, subcategoryJson] = await Promise.all([
    fetchJson('/api/categories'),
    fetchJson('/api/subcategories')
  ]);
  categories = Array.isArray(categoryJson.items) ? categoryJson.items : [];
  subcategories = Array.isArray(subcategoryJson.items) ? subcategoryJson.items : [];
  const names = categories.map((item) => normalizeName(item.name)).filter(Boolean);
  selectedCategory = names.includes(preferredCategory) ? preferredCategory : (names[0] || '');
  editingMain = '';
  editingSub = '';
  renderMainCategories();
  renderSubcategories();
}

async function addMainCategory() {
  const input = document.getElementById('newMainCategoryName');
  const name = normalizeName(input?.value);
  if (!name) return setStatus('mainCategoryStatus', '메인 카테고리 이름을 입력하세요.', true);
  try {
    setStatus('mainCategoryStatus', '추가 중…');
    await fetchJson('/api/categories', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    if (input) input.value = '';
    await reloadTaxonomy(name);
    setStatus('mainCategoryStatus', '메인 카테고리가 추가되었습니다.');
  } catch (error) { setStatus('mainCategoryStatus', error.message, true); }
}

async function saveMainCategory(currentName) {
  const input = document.querySelector(`[data-main-edit-input="${CSS.escape(currentName)}"]`);
  const newName = normalizeName(input?.value);
  if (!newName) return setStatus('mainCategoryStatus', '새 이름을 입력하세요.', true);
  try {
    setStatus('mainCategoryStatus', '수정 중…');
    await fetchJson('/api/categories', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ current_name: currentName, new_name: newName })
    });
    await reloadTaxonomy(selectedCategory === currentName ? newName : selectedCategory);
    setStatus('mainCategoryStatus', '메인 카테고리가 수정되었습니다.');
  } catch (error) { setStatus('mainCategoryStatus', error.message, true); }
}

async function deleteMainCategory(name) {
  if (!confirm(`'${name}' 메인 카테고리를 삭제할까요?\n연결된 글의 메인/서브 카테고리 지정이 해제되고, 하위 서브 카테고리도 함께 삭제됩니다.`)) return;
  try {
    setStatus('mainCategoryStatus', '삭제 중…');
    await fetchJson('/api/categories', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    await reloadTaxonomy(selectedCategory === name ? '' : selectedCategory);
    setStatus('mainCategoryStatus', '메인 카테고리가 삭제되었습니다.');
  } catch (error) { setStatus('mainCategoryStatus', error.message, true); }
}

async function addSubcategory() {
  const input = document.getElementById('newSubcategoryName');
  const name = normalizeName(input?.value);
  if (!selectedCategory) return setStatus('subCategoryStatus', '메인 카테고리를 먼저 선택하세요.', true);
  if (!name) return setStatus('subCategoryStatus', '서브 카테고리 이름을 입력하세요.', true);
  try {
    setStatus('subCategoryStatus', '추가 중…');
    await fetchJson('/api/subcategories', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category_name: selectedCategory, name })
    });
    if (input) input.value = '';
    await reloadTaxonomy(selectedCategory);
    setStatus('subCategoryStatus', '서브 카테고리가 추가되었습니다.');
  } catch (error) { setStatus('subCategoryStatus', error.message, true); }
}

async function saveSubcategory(currentName) {
  const input = document.querySelector(`[data-sub-edit-input="${CSS.escape(currentName)}"]`);
  const newName = normalizeName(input?.value);
  if (!newName) return setStatus('subCategoryStatus', '새 이름을 입력하세요.', true);
  try {
    setStatus('subCategoryStatus', '수정 중…');
    await fetchJson('/api/subcategories', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category_name: selectedCategory, current_name: currentName, new_name: newName })
    });
    await reloadTaxonomy(selectedCategory);
    setStatus('subCategoryStatus', '서브 카테고리가 수정되었습니다.');
  } catch (error) { setStatus('subCategoryStatus', error.message, true); }
}

async function deleteSubcategory(name) {
  if (!confirm(`'${name}' 서브 카테고리를 삭제할까요?\n글 자체는 삭제되지 않고 서브 카테고리 지정만 해제됩니다.`)) return;
  try {
    setStatus('subCategoryStatus', '삭제 중…');
    await fetchJson('/api/subcategories', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category_name: selectedCategory, name })
    });
    await reloadTaxonomy(selectedCategory);
    setStatus('subCategoryStatus', '서브 카테고리가 삭제되었습니다.');
  } catch (error) { setStatus('subCategoryStatus', error.message, true); }
}

function bindEvents() {
  document.getElementById('addMainCategoryBtn')?.addEventListener('click', addMainCategory);
  document.getElementById('newMainCategoryName')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addMainCategory(); }
  });
  document.getElementById('addSubcategoryBtn')?.addEventListener('click', addSubcategory);
  document.getElementById('newSubcategoryName')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); addSubcategory(); }
  });

  document.getElementById('mainCategoryList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button'); if (!btn) return;
    if (btn.dataset.mainSelect) { selectedCategory = btn.dataset.mainSelect; editingSub = ''; renderMainCategories(); renderSubcategories(); return; }
    if (btn.dataset.mainEdit) { editingMain = btn.dataset.mainEdit; renderMainCategories(); document.querySelector(`[data-main-edit-input="${CSS.escape(editingMain)}"]`)?.focus(); return; }
    if (btn.dataset.mainSave) return void saveMainCategory(btn.dataset.mainSave);
    if (btn.dataset.mainDelete) return void deleteMainCategory(btn.dataset.mainDelete);
    if (btn.hasAttribute('data-main-cancel')) { editingMain = ''; renderMainCategories(); }
  });

  document.getElementById('subCategoryList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('button'); if (!btn) return;
    if (btn.dataset.subEdit) { editingSub = btn.dataset.subEdit; renderSubcategories(); document.querySelector(`[data-sub-edit-input="${CSS.escape(editingSub)}"]`)?.focus(); return; }
    if (btn.dataset.subSave) return void saveSubcategory(btn.dataset.subSave);
    if (btn.dataset.subDelete) return void deleteSubcategory(btn.dataset.subDelete);
    if (btn.hasAttribute('data-sub-cancel')) { editingSub = ''; renderSubcategories(); }
  });
}

async function init() {
  const session = await (window.__adminSessionPromise || Promise.resolve(window.__ADMIN_SESSION__ || { authenticated: false }));
  if (!session.authenticated) { location.href = '/admin/'; return; }
  bindEvents();
  try { await reloadTaxonomy(); }
  catch (error) {
    setStatus('mainCategoryStatus', error.message || '카테고리를 불러오지 못했습니다.', true);
    setStatus('subCategoryStatus', '서브 카테고리 DB 마이그레이션이 적용되었는지 확인하세요.', true);
  }
}

init();
