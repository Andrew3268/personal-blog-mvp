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

  async function fetchIndexSidebarAdSetting() {
    const res = await fetch('/api/site-settings?ts=' + Date.now(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `설정 조회 실패 (${res.status})`);
    return Boolean(json?.settings?.index_sidebar_ad_enabled);
  }

  const sessionRes = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  if (!sessionJson.authenticated) {
    location.href = '/admin/';
    return;
  }

  if (emailEl) emailEl.textContent = sessionJson.admin?.email || '관리자';

  let indexSidebarAdEnabled = false;
  try {
    indexSidebarAdEnabled = await fetchIndexSidebarAdSetting();
    renderIndexSidebarAdToggle(indexSidebarAdEnabled);
  } catch (err) {
    console.error(err);
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
      const res = await fetch('/api/site-settings', {
        method: 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ index_sidebar_ad_enabled: nextValue })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `저장 실패 (${res.status})`);
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

  try {
    const postsRes = await fetch('/api/posts?status=all&page=1&per_page=5&ts=' + Date.now(), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const postsJson = await postsRes.json().catch(() => ({}));
    if (!postsRes.ok) throw new Error(postsJson?.message || `글 목록 조회 실패 (${postsRes.status})`);

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
          return `
          <li class="dashboard-popular__item">
            <div class="dashboard-popular__main">
              <a href="/post/${encodeURIComponent(item.slug)}" target="_blank" rel="noopener noreferrer">${index + 1}. ${escapeHtml(item.title)}</a>
              <div class="dashboard-popular__meta">작성 ${escapeHtml(publishedAt)} · 수정 ${escapeHtml(updatedAt)}</div>
            </div>
            <span class="dashboard-popular__views">조회수 ${formatNumber(item.view_count)}</span>
          </li>
        `}).join('')
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
  } catch (err) {
    console.error(err);
    totalEl.textContent = '-';
    publishedEl.textContent = '-';
    draftEl.textContent = '-';
    popularListEl.innerHTML = '<li class="small">글 목록 정보를 불러오지 못했습니다.</li>';
    recentListEl.innerHTML = '<li class="small">최근 글을 불러오지 못했습니다.</li>';
    categoryChipsEl.innerHTML = '<span class="chip">카테고리 확인 실패</span>';
  }
}

initDashboard();
