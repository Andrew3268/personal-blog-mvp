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

async function initDashboard() {
  const emailEl = document.getElementById('adminDashboardEmail');
  const totalEl = document.getElementById('dashboardTotalCount');
  const publishedEl = document.getElementById('dashboardPublishedCount');
  const draftEl = document.getElementById('dashboardDraftCount');
  const popularListEl = document.getElementById('dashboardPopularList');
  const recentListEl = document.getElementById('dashboardRecentList');
  const categoryChipsEl = document.getElementById('dashboardCategoryChips');
  const indexSidebarAdToggleEl = document.getElementById('indexSidebarAdToggle');
  const indexSidebarAdStatusEl = document.getElementById('indexSidebarAdStatus');

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

  const settingsPromise = fetchJson('/api/site-settings?ts=' + Date.now());
  const postsPromise = fetchJson('/api/posts?status=all&page=1&per_page=5&ts=' + Date.now());
  const [settingsResult, postsResult] = await Promise.allSettled([settingsPromise, postsPromise]);

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

  if (!totalEl || !publishedEl || !draftEl || !popularListEl || !recentListEl || !categoryChipsEl) {
    console.error('대시보드 필수 요소를 찾을 수 없습니다.');
    return;
  }

  if (postsResult.status === 'rejected') {
    console.error(postsResult.reason);
    totalEl.textContent = '-';
    publishedEl.textContent = '-';
    draftEl.textContent = '-';
    popularListEl.innerHTML = '<li class="small">글 목록 정보를 불러오지 못했습니다.</li>';
    recentListEl.innerHTML = '<li class="small">최근 글을 불러오지 못했습니다.</li>';
    categoryChipsEl.innerHTML = '<span class="chip">카테고리 확인 실패</span>';
    return;
  }

  const postsJson = postsResult.value;
  const sidebar = postsJson.sidebar || {};
  const counts = sidebar.counts || {};
  const popular = Array.isArray(sidebar.popular) ? sidebar.popular : [];
  const categories = Array.isArray(sidebar.categories) ? sidebar.categories : [];
  const items = Array.isArray(postsJson.items) ? postsJson.items : [];

  totalEl.textContent = formatNumber(counts.total || 0);
  publishedEl.textContent = formatNumber(counts.published || 0);
  draftEl.textContent = formatNumber(counts.draft || 0);

  popularListEl.innerHTML = popular.length
    ? popular.map((item, index) => {
        const publishedAt = item.published_at ? String(item.published_at).slice(0, 10) : '-';
        const updatedAt = item.updated_at ? String(item.updated_at).slice(0, 10) : '-';
        const slug = String(item.slug || '');
        const title = String(item.title || '제목 없음');
        return `
        <li class="dashboard-popular__item" data-dashboard-popular-item>
          <div class="dashboard-popular__main">
            <a href="/post/${encodeURIComponent(slug)}" target="_blank" rel="noopener noreferrer">${index + 1}. ${escapeHtml(title)}</a>
            <div class="dashboard-popular__meta-row">
              <div class="dashboard-popular__meta">작성 ${escapeHtml(publishedAt)} · 수정 ${escapeHtml(updatedAt)}</div>
              <span class="dashboard-popular__actions">
                <a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a>
                <button class="btn btn--danger js-dashboard-delete-post" type="button" data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(title)}">삭제</button>
              </span>
            </div>
          </div>
          <span class="dashboard-popular__views">조회수 ${formatNumber(item.view_count)}</span>
        </li>
      `;
      }).join('')
    : '<li class="small">표시할 인기글이 없습니다.</li>';

  recentListEl.innerHTML = items.length
    ? items.map((item) => `
        <li class="dashboard-recent__item">
          <a href="/edit.html?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a>
          <span class="dashboard-recent__meta">${item.status === 'draft' ? '초안' : '발행'}</span>
        </li>
      `).join('')
    : '<li class="small">최근 수정 글이 없습니다.</li>';

  categoryChipsEl.innerHTML = categories.length
    ? categories.slice(0, 8).map((item) => `<span class="chip">${escapeHtml(item.name)} <strong>${formatNumber(item.count)}</strong></span>`).join('')
    : '<span class="chip">카테고리 없음</span>';

  popularListEl.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-dashboard-delete-post');
    if (!deleteBtn) return;
    const slug = decodeURIComponent(String(deleteBtn.dataset.slug || ''));
    const title = String(deleteBtn.dataset.title || slug || '이 글');
    if (!slug) return;
    const confirmed = window.confirm(`'${title}' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`);
    if (!confirmed) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = '삭제 중…';
    try {
      await fetchJson(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      const itemEl = deleteBtn.closest('[data-dashboard-popular-item]');
      if (itemEl) itemEl.remove();
      if (!popularListEl.querySelector('[data-dashboard-popular-item]')) {
        popularListEl.innerHTML = '<li class="small">표시할 인기글이 없습니다.</li>';
      }
    } catch (err) {
      alert(err?.message || '삭제 중 오류가 발생했습니다.');
      deleteBtn.disabled = false;
      deleteBtn.textContent = '삭제';
    }
  });
}

initDashboard();
