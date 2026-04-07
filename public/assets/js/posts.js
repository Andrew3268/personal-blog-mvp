(async function () {
  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#postsList');
  const loadingEl = $('#postsLoading');
  const errorEl = $('#postsError');
  const emptyEl = $('#postsEmpty');
  const pageTitleEl = $('#postsPageTitle');
  const pageDescEl = $('#postsPageDescription');
  const postsSummaryEl = $('#postsSummary');
  const postsCategoriesEl = $('#postsCategories');
  const postsPopularEl = $('#postsPopular');

  const show = (el, on) => { if (el) el.hidden = !on; };
  const escapeHtml = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const url = new URL(window.location.href);
  const status = String(url.searchParams.get('status') || 'published').trim().toLowerCase();
  const category = String(url.searchParams.get('category') || '').trim();
  const tag = String(url.searchParams.get('tag') || '').trim();
  const safeStatus = ['published', 'draft', 'all'].includes(status) ? status : 'published';

  const apiUrl = new URL('/api/posts', window.location.origin);
  if (safeStatus) apiUrl.searchParams.set('status', safeStatus);
  if (category) apiUrl.searchParams.set('category', category);
  if (tag) apiUrl.searchParams.set('tag', tag);

  function getPageTitle() {
    if (safeStatus === 'draft') return '초안 글 목록';
    if (safeStatus === 'all') return '전체 글 목록';
    if (category) return `카테고리: ${category}`;
    if (tag) return `태그: #${tag}`;
    return '글 목록';
  }

  function getPageDescription() {
    if (safeStatus === 'draft') return '상태가 <b>draft</b>인 글만 모아서 보여줍니다.';
    if (safeStatus === 'all') return '발행글과 초안글을 모두 보여줍니다.';
    if (category) return `<b>${escapeHtml(category)}</b> 카테고리 글만 모아 보여줍니다.`;
    if (tag) return `<b>#${escapeHtml(tag)}</b> 태그가 포함된 글만 모아 보여줍니다.`;
    return '목록은 <b>/api/posts</b>에서 불러오며, 실제 공개 페이지는 각 <b>/post/slug</b> 주소에서 SSR로 열립니다.';
  }



  function formatCountLabel(count, label) {
    return `<div class="posts-summary-card"><strong>${count}</strong><span>${label}</span></div>`;
  }

  function renderSidebar(items) {
    const publishedCount = items.filter((item) => String(item.status || 'published').trim().toLowerCase() === 'published').length;
    const draftCount = items.filter((item) => String(item.status || '').trim().toLowerCase() === 'draft').length;
    const categoryMap = new Map();

    items.forEach((item) => {
      const name = String(item.category || '').trim() || '미분류';
      categoryMap.set(name, (categoryMap.get(name) || 0) + 1);
    });

    const categoryEntries = [...categoryMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
    const popularItems = [...items]
      .sort((a, b) => (Number(b.view_count || 0) - Number(a.view_count || 0)) || String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || '')))
      .slice(0, 5);

    if (postsSummaryEl) {
      postsSummaryEl.innerHTML = [
        formatCountLabel(items.length, safeStatus === 'draft' ? '초안 글' : '전체 글'),
        formatCountLabel(publishedCount, '발행'),
        formatCountLabel(draftCount, '초안')
      ].join('');
    }

    if (postsCategoriesEl) {
      postsCategoriesEl.innerHTML = categoryEntries.length
        ? categoryEntries.map(([name, count]) => `<a class="badge posts-sidebar__chip" href="/posts/?category=${encodeURIComponent(name)}">${escapeHtml(name)} <span>${count}</span></a>`).join('')
        : '<span class="small">표시할 카테고리가 없습니다.</span>';
    }

    if (postsPopularEl) {
      postsPopularEl.innerHTML = popularItems.length
        ? popularItems.map((item, index) => `
            <li>
              <a class="post-side__popular-link" href="/post/${encodeURIComponent(String(item.slug || ''))}">
                <span class="post-side__popular-rank">${index + 1}</span>
                <span class="post-side__popular-text">${escapeHtml(String(item.title || '제목 없음'))}</span>
              </a>
            </li>
          `).join('')
        : '<li class="small">인기글이 없습니다.</li>';
    }
  }

  if (pageTitleEl) pageTitleEl.textContent = getPageTitle();
  if (pageDescEl) pageDescEl.innerHTML = getPageDescription();

  try {
    show(loadingEl, true);
    show(errorEl, false);
    show(emptyEl, false);

    const res = await fetch(apiUrl.toString(), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('API 오류: ' + res.status);

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    show(loadingEl, false);

    if (!items.length) {
      show(emptyEl, true);
      if (emptyEl) {
        if (safeStatus === 'draft') emptyEl.textContent = '등록된 초안 글이 없습니다.';
        else if (category) emptyEl.textContent = `'${category}' 카테고리 글이 없습니다.`;
        else if (tag) emptyEl.textContent = `'#${tag}' 태그 글이 없습니다.`;
        else emptyEl.textContent = '등록된 글이 없습니다.';
      }
      listEl.innerHTML = '';
      renderSidebar([]);
      return;
    }

    renderSidebar(items);

    listEl.innerHTML = items.map((it) => {
      const rawTitle = String(it.title || '(제목 없음)');
      const title = escapeHtml(rawTitle);
      const categoryText = String(it.category || '').trim();
      const categoryHtml = categoryText
        ? `<a class="badge" href="/posts/?category=${encodeURIComponent(categoryText)}">${escapeHtml(categoryText)}</a>`
        : `<span class="badge">미분류</span>`;
      const summary = escapeHtml(it.summary || '요약이 아직 없습니다.');
      const slug = String(it.slug || '');
      const updated = escapeHtml(String(it.updated_at || '').slice(0, 10));
      const cover = String(it.cover_image || '').trim();
      const itemStatus = String(it.status || 'published').trim().toLowerCase();
      const statusBadge = itemStatus === 'draft'
        ? '<span class="badge" style="background:rgba(245,158,11,.14);color:#92400e;border-color:rgba(245,158,11,.22)">초안</span>'
        : '<span class="badge">발행</span>';
      const postHref = itemStatus === 'published' ? `/post/${encodeURIComponent(slug)}` : `/edit.html?slug=${encodeURIComponent(slug)}`;

      return `
        <article class="card post-card post-card--row js-post-card" data-href="${postHref}" tabindex="0" aria-label="${title} 글로 이동">
          <div class="post-card__thumb post-card__thumb--row">
            ${cover ? `<img src="${escapeHtml(cover)}" alt="${title} 대표 이미지" loading="lazy" />` : '<div class="post-card__thumb-placeholder">대표 이미지 없음</div>'}
          </div>
          <div class="post-card__body">
            <div class="post-meta post-meta--row">
              <div class="row" style="gap:8px;flex-wrap:wrap">
                ${categoryHtml}
                ${statusBadge}
              </div>
              <div class="small">${updated}</div>
            </div>
            <div class="post-card__title">${title}</div>
            <div class="post-card__summary">${summary}</div>
            <div class="row post-admin-actions" style="flex-wrap:wrap">
              ${itemStatus === 'published' ? `<a class="btn btn--brand" href="/post/${encodeURIComponent(slug)}">글 보기</a>` : ''}
              <a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a>
              <button class="btn btn--danger js-delete-post" type="button" data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(rawTitle)}">삭제</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  } catch (err) {
    show(loadingEl, false);
    show(emptyEl, false);
    show(errorEl, true);
    errorEl.textContent = '목록을 불러오지 못했습니다. ' + (err?.message || '');
  }

  listEl?.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-delete-post');
    if (deleteBtn) {
      const slug = decodeURIComponent(String(deleteBtn.dataset.slug || ''));
      const title = String(deleteBtn.dataset.title || slug || '이 글');
      if (!slug) return;
      const confirmed = window.confirm(`'${title}' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`);
      if (!confirmed) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = '삭제 중…';
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || `삭제 실패 (${res.status})`);
        const card = deleteBtn.closest('.post-card');
        if (card) card.remove();
        if (!listEl.children.length) {
          show(emptyEl, true);
          emptyEl.textContent = '등록된 글이 없습니다.';
        }
      } catch (err) {
        alert(err?.message || '삭제 중 오류가 발생했습니다.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = '삭제';
      }
      return;
    }

    const blockedTarget = event.target.closest('a, button, input, select, textarea, label');
    if (blockedTarget) return;

    const card = event.target.closest('.js-post-card');
    const href = card?.dataset.href;
    if (href) window.location.href = href;
  });

  listEl?.addEventListener('keydown', (event) => {
    const card = event.target.closest('.js-post-card');
    if (!card) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const href = card.dataset.href;
    if (!href) return;
    event.preventDefault();
    window.location.href = href;
  });

})();
