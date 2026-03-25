(async function () {
  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#postsList');
  const loadingEl = $('#postsLoading');
  const errorEl = $('#postsError');
  const emptyEl = $('#postsEmpty');

  const show = (el, on) => { if (el) el.hidden = !on; };
  const escapeHtml = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  try {
    show(loadingEl, true);
    show(errorEl, false);
    show(emptyEl, false);

    const res = await fetch('/api/posts', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('API 오류: ' + res.status);

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    show(loadingEl, false);

    if (!items.length) {
      show(emptyEl, true);
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = items.map((it) => {
      const title = escapeHtml(it.title || '(제목 없음)');
      const category = escapeHtml(it.category || '미분류');
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
            <span class="badge">${category}</span>
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
