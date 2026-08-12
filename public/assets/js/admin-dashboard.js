function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
}

function formatDate(value) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 10) : '-';
}

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

function renderManagedPostList(items, { popular = false } = {}) {
  if (!Array.isArray(items) || !items.length) {
    return '<li class="small">표시할 글이 없습니다.</li>';
  }

  return items.slice(0, 10).map((item, index) => {
    const slug = String(item.slug || '');
    const title = String(item.title || '제목 없음');
    const publishedAt = formatDate(item.published_at);
    const statusText = item.status === 'draft' ? '초안' : '발행';
    const sideMeta = popular
      ? `조회수 ${formatNumber(item.view_count)}`
      : statusText;
    const titleHref = item.status === 'draft'
      ? `/edit.html?slug=${encodeURIComponent(slug)}`
      : `/post/${encodeURIComponent(slug)}`;
    const titleTarget = item.status === 'draft' ? '' : ' target="_blank" rel="noopener noreferrer"';

    return `
      <li class="dashboard-popular__item" data-dashboard-post-item data-slug="${escapeHtml(slug)}">
        <div class="dashboard-popular__main">
          <a href="${titleHref}"${titleTarget}>${index + 1}. ${escapeHtml(title)}</a>
          <div class="dashboard-popular__meta-row">
            <div class="dashboard-popular__meta">작성 ${escapeHtml(publishedAt)}</div>
            <span class="dashboard-popular__actions">
              <a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a>
              <button class="btn btn--danger js-dashboard-delete-post" type="button" data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(title)}">삭제</button>
            </span>
          </div>
        </div>
        <span class="dashboard-popular__views">${escapeHtml(sideMeta)}</span>
      </li>
    `;
  }).join('');
}

function bindDashboardTabs() {
  const tabs = Array.from(document.querySelectorAll('[data-dashboard-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-dashboard-tab-panel]'));
  if (!tabs.length || !panels.length) return;

  function activate(name) {
    tabs.forEach((tab) => {
      const active = tab.dataset.dashboardTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.dashboardTabPanel !== name;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.dashboardTab || 'recent'));
  });

  activate('recent');
}

async function initDashboard() {
  const emailEl = document.getElementById('adminDashboardEmail');
  const totalEl = document.getElementById('dashboardTotalCount');
  const publishedEl = document.getElementById('dashboardPublishedCount');
  const draftEl = document.getElementById('dashboardDraftCount');
  const recentCreatedListEl = document.getElementById('dashboardRecentCreatedList');
  const popularListEl = document.getElementById('dashboardPopularList');
  const recentListEl = document.getElementById('dashboardRecentList');
  const categoryChipsEl = document.getElementById('dashboardCategoryChips');
  const indexSidebarAdToggleEl = document.getElementById('indexSidebarAdToggle');
  const indexSidebarAdStatusEl = document.getElementById('indexSidebarAdStatus');

  bindDashboardTabs();

  function renderIndexSidebarAdToggle(isEnabled) {
    if (!indexSidebarAdToggleEl || !indexSidebarAdStatusEl) return;
    indexSidebarAdToggleEl.disabled = false;
    indexSidebarAdToggleEl.textContent = isEnabled ? '사이드바 광고 끄기' : '사이드바 광고 켜기';
    indexSidebarAdToggleEl.classList.toggle('btn--brand', !isEnabled);
    indexSidebarAdStatusEl.textContent = isEnabled ? '현재 켜짐' : '현재 꺼짐';
  }

  const sessionJson = await (window.__adminSessionPromise || Promise.resolve(
    window.__ADMIN_SESSION__ || { authenticated: false, admin: null }
  ));
  if (!sessionJson.authenticated) {
    location.href = '/admin/';
    return;
  }

  if (emailEl) emailEl.textContent = sessionJson.admin?.email || '관리자';

  const ts = Date.now();
  const settingsPromise = fetchJson(`/api/site-settings?ts=${ts}`);
  const recentCreatedPromise = fetchJson(`/api/posts?status=all&sort=created&page=1&per_page=10&ts=${ts}`);
  const popularPromise = fetchJson(`/api/posts?status=published&sort=popular&page=1&per_page=10&ts=${ts}`);
  const recentModifiedPromise = fetchJson(`/api/posts?status=all&sort=updated&page=1&per_page=5&ts=${ts}`);
  const [settingsResult, recentCreatedResult, popularResult, recentModifiedResult] = await Promise.allSettled([
    settingsPromise,
    recentCreatedPromise,
    popularPromise,
    recentModifiedPromise
  ]);

  let indexSidebarAdEnabled = false;
  if (settingsResult.status === 'fulfilled') {
    indexSidebarAdEnabled = Boolean(settingsResult.value?.settings?.index_sidebar_ad_enabled);
    renderIndexSidebarAdToggle(indexSidebarAdEnabled);
  } else {
    console.error(settingsResult.reason);
    if (indexSidebarAdStatusEl) indexSidebarAdStatusEl.textContent = '설정 확인 실패';
    if (indexSidebarAdToggleEl) {
      indexSidebarAdToggleEl.disabled = true;
      indexSidebarAdToggleEl.textContent = '설정 확인 실패';
    }
  }

  indexSidebarAdToggleEl?.addEventListener('click', async () => {
    const nextValue = !indexSidebarAdEnabled;
    indexSidebarAdToggleEl.disabled = true;
    indexSidebarAdToggleEl.textContent = '저장 중…';
    try {
      const json = await fetchJson('/api/site-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index_sidebar_ad_enabled: nextValue })
      });
      indexSidebarAdEnabled = Boolean(json?.settings?.index_sidebar_ad_enabled);
      renderIndexSidebarAdToggle(indexSidebarAdEnabled);
    } catch (err) {
      alert(err?.message || '광고 표시 설정 저장 중 오류가 발생했습니다.');
      renderIndexSidebarAdToggle(indexSidebarAdEnabled);
    }
  });

  if (!totalEl || !publishedEl || !draftEl || !recentCreatedListEl || !popularListEl || !recentListEl || !categoryChipsEl) {
    console.error('대시보드 필수 요소를 찾을 수 없습니다.');
    return;
  }

  if (recentCreatedResult.status === 'fulfilled') {
    const postsJson = recentCreatedResult.value;
    const sidebar = postsJson.sidebar || {};
    const counts = sidebar.counts || {};
    const categories = Array.isArray(sidebar.categories) ? sidebar.categories : [];
    const items = Array.isArray(postsJson.items) ? postsJson.items : [];

    totalEl.textContent = formatNumber(counts.total || 0);
    publishedEl.textContent = formatNumber(counts.published || 0);
    draftEl.textContent = formatNumber(counts.draft || 0);
    recentCreatedListEl.innerHTML = renderManagedPostList(items);
    categoryChipsEl.innerHTML = categories.length
      ? categories.slice(0, 8).map((item) => `<span class="chip">${escapeHtml(item.name)} <strong>${formatNumber(item.count)}</strong></span>`).join('')
      : '<span class="chip">카테고리 없음</span>';
  } else {
    console.error(recentCreatedResult.reason);
    totalEl.textContent = '-';
    publishedEl.textContent = '-';
    draftEl.textContent = '-';
    recentCreatedListEl.innerHTML = '<li class="small">최근 작성글을 불러오지 못했습니다.</li>';
    categoryChipsEl.innerHTML = '<span class="chip">카테고리 확인 실패</span>';
  }

  if (popularResult.status === 'fulfilled') {
    popularListEl.innerHTML = renderManagedPostList(popularResult.value?.items || [], { popular: true });
  } else {
    console.error(popularResult.reason);
    popularListEl.innerHTML = '<li class="small">인기글을 불러오지 못했습니다.</li>';
  }

  if (recentModifiedResult.status === 'fulfilled') {
    const items = Array.isArray(recentModifiedResult.value?.items) ? recentModifiedResult.value.items : [];
    recentListEl.innerHTML = items.length
      ? items.map((item) => `
          <li class="dashboard-recent__item">
            <a href="/edit.html?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a>
            <span class="dashboard-recent__meta">${item.status === 'draft' ? '초안' : '발행'}</span>
          </li>
        `).join('')
      : '<li class="small">최근 수정 글이 없습니다.</li>';
  } else {
    console.error(recentModifiedResult.reason);
    recentListEl.innerHTML = '<li class="small">최근 수정 글을 불러오지 못했습니다.</li>';
  }

  document.querySelector('.dashboard-post-panel')?.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-dashboard-delete-post');
    if (!deleteBtn) return;
    const slug = decodeURIComponent(String(deleteBtn.dataset.slug || ''));
    const title = String(deleteBtn.dataset.title || slug || '이 글');
    if (!slug) return;
    if (!window.confirm(`'${title}' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`)) return;

    deleteBtn.disabled = true;
    deleteBtn.textContent = '삭제 중…';
    try {
      await fetchJson(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      document.querySelectorAll(`[data-dashboard-post-item][data-slug="${CSS.escape(slug)}"]`).forEach((item) => item.remove());
      const currentTotal = Number(String(totalEl.textContent || '0').replace(/[^0-9]/g, ''));
      if (Number.isFinite(currentTotal) && currentTotal > 0) totalEl.textContent = formatNumber(currentTotal - 1);
    } catch (err) {
      alert(err?.message || '삭제 중 오류가 발생했습니다.');
      deleteBtn.disabled = false;
      deleteBtn.textContent = '삭제';
    }
  });
}

initDashboard();
