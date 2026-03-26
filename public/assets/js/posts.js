(async function () {
  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#postsList');
  const loadingEl = $('#postsLoading');
  const errorEl = $('#postsError');
  const emptyEl = $('#postsEmpty');
  const pageTitleEl = $('#postsPageTitle');
  const pageDescEl = $('#postsPageDescription');

  const show = (el, on) => { if (el) el.hidden = !on; };
  const escapeHtml = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const url = new URL(window.location.href);
  const category = (url.searchParams.get('category') || '').trim();
  const tag = (url.searchParams.get('tag') || '').trim();

  const apiUrl = new URL('/api/posts', window.location.origin);
  if (category) apiUrl.searchParams.set('category', category);
  if (tag) apiUrl.searchParams.set('tag', tag);

  if (pageTitleEl) {
    if (category) pageTitleEl.textContent = `카테고리: ${category}`;
    else if (tag) pageTitleEl.textContent = `태그: #${tag}`;
    else pageTitleEl.textContent = '글 목록';
  }

  if (pageDescEl) {
    if (category) pageDescEl.innerHTML = `<b>${escapeHtml(category)}</b> 카테고리 글만 모아 보여줍니다.`;
    else if (tag) pageDescEl.innerHTML = `<b>#${escapeHtml(tag)}</b> 태그가 포함된 글만 모아 보여줍니다.`;
    else pageDescEl.innerHTML = '목록은 <b>/api/posts</b>에서 불러오며, 실제 공개 페이지는 각 <b>/post/slug</b> 주소에서 SSR로 열립니다.';
  }

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
        if (category) emptyEl.textContent = `'${category}' 카테고리 글이 없습니다.`;
        else if (tag) emptyEl.textContent = `'#${tag}' 태그 글이 없습니다.`;
        else emptyEl.textContent = '등록된 글이 없습니다.';
      }
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = items.map((it) => {
      const title = escapeHtml(it.title || '(제목 없음)');
      const categoryText = String(it.category || '').trim();
      const categoryHtml = categoryText
        ? `<a class="badge" href="/posts/?category=${encodeURIComponent(categoryText)}">${escapeHtml(categoryText)}</a>`
        : `<span class="badge">미분류</span>`;
      const summary = escapeHtml(it.summary || '요약이 아직 없습니다.');
      const slug = String(it.slug || '');
      const updated = escapeHtml(String(it.updated_at || '').slice(0, 10));
      const cover = String(it.cover_image || '').trim();

      return `
        <article class="card post-card">
          <div class="post-card__thumb">
            ${cover ? `<img src="${escapeHtml(cover)}" alt="${title} 대표 이미지" loading="lazy" />` : ''}
          </div>
          <div class="post-meta">
            ${categoryHtml}
            <div class="small">${updated}</div>
          </div>
          <div class="post-card__title">${title}</div>
          <div class="post-card__summary">${summary}</div>
          <div class="row" style="flex-wrap:wrap">
            <a class="btn btn--brand" href="/post/${encodeURIComponent(slug)}">글 보기</a>
            <a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a>
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
})();