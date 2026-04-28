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

  const sessionRes = await fetch('/api/admin/session', { credentials: 'same-origin' });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  if (!sessionJson.authenticated) {
    location.href = '/admin/';
    return;
  }
  if (!emailEl || !totalEl || !publishedEl || !draftEl || !popularListEl || !recentListEl || !categoryChipsEl) {
    console.error('대시보드 필수 요소를 찾을 수 없습니다.');
    return;
  }

  emailEl.textContent = sessionJson.admin?.email || '관리자';

  const postsRes = await fetch('/api/posts?status=all&page=1&per_page=5', { credentials: 'same-origin' });
  const postsJson = await postsRes.json().catch(() => ({}));
  const sidebar = postsJson.sidebar || {};
  let indexSidebarAdEnabled = Boolean(sidebar.settings?.index_sidebar_ad_enabled);
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


  function renderIndexSidebarAdToggle() {
    if (!indexSidebarAdToggleEl || !indexSidebarAdStatusEl) return;
    indexSidebarAdToggleEl.disabled = false;
    indexSidebarAdToggleEl.textContent = indexSidebarAdEnabled ? '사이드바 광고 끄기' : '사이드바 광고 켜기';
    indexSidebarAdToggleEl.classList.toggle('btn--brand', !indexSidebarAdEnabled);
    indexSidebarAdStatusEl.textContent = indexSidebarAdEnabled ? '현재 켜짐' : '현재 꺼짐';
  }

  renderIndexSidebarAdToggle();

  indexSidebarAdToggleEl?.addEventListener('click', async () => {
    const nextValue = !indexSidebarAdEnabled;
    indexSidebarAdToggleEl.disabled = true;
    indexSidebarAdToggleEl.textContent = '저장 중…';
    try {
      const res = await fetch('/api/site-settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index_sidebar_ad_enabled: nextValue })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || `저장 실패 (${res.status})`);
      indexSidebarAdEnabled = Boolean(json?.settings?.index_sidebar_ad_enabled);
      renderIndexSidebarAdToggle();
    } catch (err) {
      alert(err?.message || '광고 표시 설정 저장 중 오류가 발생했습니다.');
      renderIndexSidebarAdToggle();
    }
  });
}

initDashboard();
