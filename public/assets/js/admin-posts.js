(function () {
  const state = {
    posts: [],
    query: ''
  };

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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

  async function fetchAllPosts() {
    const first = await fetchJson(`/api/posts?status=all&sort=created&page=1&per_page=100&ts=${Date.now()}`);
    const items = Array.isArray(first.items) ? [...first.items] : [];
    const totalPages = Number(first.pagination?.total_pages || 1);
    if (totalPages <= 1) return items;

    const requests = [];
    for (let page = 2; page <= totalPages; page += 1) {
      requests.push(fetchJson(`/api/posts?status=all&sort=created&page=${page}&per_page=100&ts=${Date.now()}-${page}`));
    }
    const pages = await Promise.all(requests);
    pages.forEach((json) => {
      if (Array.isArray(json.items)) items.push(...json.items);
    });
    return items;
  }

  function getFilteredPosts() {
    const query = state.query.trim().toLocaleLowerCase('ko-KR');
    if (!query) return state.posts;
    return state.posts.filter((item) => String(item.title || '').toLocaleLowerCase('ko-KR').includes(query));
  }

  function render() {
    const listEl = document.getElementById('adminPostList');
    const emptyEl = document.getElementById('adminPostEmpty');
    const countEl = document.getElementById('adminPostResultCount');
    if (!listEl || !emptyEl || !countEl) return;

    const filtered = getFilteredPosts();
    countEl.textContent = state.query
      ? `${filtered.length}개 검색됨 / 전체 ${state.posts.length}개`
      : `전체 ${state.posts.length}개`;

    if (!filtered.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = filtered.map((item) => {
      const slug = String(item.slug || '');
      const title = String(item.title || '제목 없음');
      return `
        <li class="admin-post-list__item" data-admin-post-row data-slug="${escapeHtml(slug)}">
          <span class="admin-post-list__title">${escapeHtml(title)}</span>
          <time class="admin-post-list__date" datetime="${escapeHtml(String(item.published_at || ''))}">${escapeHtml(formatDate(item.published_at))}</time>
          <div class="admin-post-list__actions">
            <a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a>
            <button class="btn btn--danger js-admin-post-delete" type="button" data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(title)}">삭제</button>
          </div>
        </li>
      `;
    }).join('');
  }

  async function init() {
    const sessionJson = await (window.__adminSessionPromise || Promise.resolve(
      window.__ADMIN_SESSION__ || { authenticated: false, admin: null }
    ));
    if (!sessionJson.authenticated) {
      location.href = '/admin/';
      return;
    }

    const searchInput = document.getElementById('adminPostSearchInput');
    const clearButton = document.getElementById('adminPostSearchClear');
    const listEl = document.getElementById('adminPostList');

    try {
      state.posts = await fetchAllPosts();
      render();
      if (searchInput) searchInput.disabled = false;
    } catch (error) {
      console.error(error);
      if (listEl) listEl.innerHTML = '<li class="admin-post-list__loading">글 목록을 불러오지 못했습니다.</li>';
      const countEl = document.getElementById('adminPostResultCount');
      if (countEl) countEl.textContent = '불러오기 실패';
      return;
    }

    searchInput?.addEventListener('input', () => {
      state.query = searchInput.value || '';
      if (clearButton) clearButton.hidden = !state.query;
      render();
    });

    clearButton?.addEventListener('click', () => {
      state.query = '';
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      clearButton.hidden = true;
      render();
    });

    listEl?.addEventListener('click', async (event) => {
      const button = event.target.closest('.js-admin-post-delete');
      if (!button) return;
      const slug = decodeURIComponent(String(button.dataset.slug || ''));
      const title = String(button.dataset.title || slug || '이 글');
      if (!slug) return;
      if (!window.confirm(`'${title}' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`)) return;

      button.disabled = true;
      button.textContent = '삭제 중…';
      try {
        await fetchJson(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        state.posts = state.posts.filter((item) => String(item.slug || '') !== slug);
        render();
      } catch (error) {
        alert(error?.message || '삭제 중 오류가 발생했습니다.');
        button.disabled = false;
        button.textContent = '삭제';
      }
    });
  }

  init();
})();
