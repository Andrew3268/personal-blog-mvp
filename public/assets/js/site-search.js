(function () {
  const topbar = document.querySelector('.topbar');
  const utilityNav = document.querySelector('.nav--utility.nav--right');
  if (!topbar || !utilityNav) return;

  const isAdminPage = window.location.pathname.startsWith('/admin/');
  if (isAdminPage) return;

  const createSearchIcon = () => `
    <svg class="nav__icon-svg nav__icon-svg--search" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="11" cy="11" r="6.5"></circle>
      <path d="M16 16l5 5"></path>
    </svg>
  `;

  let searchButton = utilityNav.querySelector('[data-site-search-toggle]');
  if (!searchButton) {
    searchButton = document.createElement('button');
    searchButton.type = 'button';
    searchButton.className = 'nav__icon-btn nav__search-btn';
    searchButton.setAttribute('data-site-search-toggle', '');
    searchButton.setAttribute('aria-label', '검색 열기');
    searchButton.setAttribute('aria-expanded', 'false');
    searchButton.innerHTML = createSearchIcon();
    utilityNav.insertBefore(searchButton, utilityNav.firstChild || null);
  }

  const searchRoot = document.createElement('section');
  searchRoot.className = 'site-search';
  searchRoot.hidden = true;
  searchRoot.setAttribute('aria-hidden', 'true');
  searchRoot.innerHTML = `
    <div class="site-search__shell">
      <div class="site-search__panel" role="dialog" aria-modal="false" aria-labelledby="siteSearchLabel">
        <div class="site-search__top">
          <div class="site-search__input-wrap">
            <span class="site-search__input-icon" aria-hidden="true">
              ${createSearchIcon()}
            </span>
            <input id="siteSearchInput" class="site-search__input" type="search" placeholder="제목, 요약, 카테고리로 검색" autocomplete="off" spellcheck="false" />
            <button type="button" class="site-search__clear" data-site-search-clear hidden>지우기</button>
          </div>
          <button type="button" class="site-search__close" data-site-search-close aria-label="검색 닫기">닫기</button>
        </div>
        <div class="site-search__status" id="siteSearchLabel">검색어를 입력하면 관련 글이 바로 표시됩니다.</div>
        <div class="site-search__results" data-site-search-results>
          <div class="site-search__empty">검색어를 입력해 주세요.</div>
        </div>
      </div>
    </div>
  `;

  topbar.insertAdjacentElement('afterend', searchRoot);

  const input = searchRoot.querySelector('#siteSearchInput');
  const results = searchRoot.querySelector('[data-site-search-results]');
  const clearBtn = searchRoot.querySelector('[data-site-search-clear]');
  const closeBtn = searchRoot.querySelector('[data-site-search-close]');
  const statusEl = searchRoot.querySelector('.site-search__status');

  let isOpen = false;
  let requestSeq = 0;
  let debounceTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeText(value, limit = 140) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
  }

  function buildResultItem(item) {
    const href = `/post/${encodeURIComponent(item.slug || '')}`;
    const category = normalizeText(item.category || '전체', 18);
    const summary = normalizeText(item.summary || item.meta_description || '', 110);
    const updatedAt = String(item.updated_at || item.published_at || '').slice(0, 10);
    return `
      <a class="site-search__item" href="${href}">
        <div class="site-search__item-meta">
          <span class="site-search__item-badge">${escapeHtml(category)}</span>
          ${updatedAt ? `<time class="site-search__item-date" datetime="${escapeHtml(updatedAt)}">${escapeHtml(updatedAt)}</time>` : ''}
        </div>
        <strong class="site-search__item-title">${escapeHtml(item.title || '')}</strong>
        ${summary ? `<p class="site-search__item-desc">${escapeHtml(summary)}</p>` : ''}
      </a>
    `;
  }

  function setLoading() {
    statusEl.textContent = '검색 중입니다.';
    results.innerHTML = `
      <div class="site-search__loading">
        <span class="site-search__loading-line"></span>
        <span class="site-search__loading-line"></span>
        <span class="site-search__loading-line site-search__loading-line--short"></span>
      </div>
    `;
  }

  function setEmpty(message) {
    statusEl.textContent = message;
    results.innerHTML = `<div class="site-search__empty">${escapeHtml(message)}</div>`;
  }

  async function runSearch(keyword) {
    const query = String(keyword || '').trim();
    if (!query) {
      setEmpty('검색어를 입력해 주세요.');
      clearBtn.hidden = true;
      return;
    }

    clearBtn.hidden = false;
    setLoading();
    const currentSeq = ++requestSeq;

    try {
      const url = new URL('/api/posts', window.location.origin);
      url.searchParams.set('q', query);
      url.searchParams.set('page', '1');
      url.searchParams.set('per_page', '8');
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('search_failed');
      const data = await res.json().catch(() => ({}));
      if (currentSeq !== requestSeq) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        setEmpty(`“${query}”에 대한 검색 결과가 없습니다.`);
        return;
      }
      statusEl.textContent = `총 ${items.length}개의 관련 글을 찾았습니다.`;
      results.innerHTML = items.map(buildResultItem).join('');
    } catch (_) {
      if (currentSeq !== requestSeq) return;
      setEmpty('검색 결과를 불러오지 못했습니다.');
    }
  }

  function syncTopOffset() {
    const rect = topbar.getBoundingClientRect();
    const top = rect.bottom;
    searchRoot.style.setProperty('--site-search-top', `${Math.max(64, Math.round(top))}px`);
  }

  function openSearch() {
    if (isOpen) return;
    isOpen = true;
    syncTopOffset();
    document.body.classList.add('search-open');
    searchRoot.hidden = false;
    searchRoot.setAttribute('aria-hidden', 'false');
    searchButton.setAttribute('aria-expanded', 'true');
    searchButton.classList.add('is-active');
    requestAnimationFrame(() => {
      searchRoot.classList.add('is-open');
      input?.focus();
      input?.select();
    });
  }

  function closeSearch() {
    if (!isOpen) return;
    isOpen = false;
    searchRoot.classList.remove('is-open');
    searchRoot.setAttribute('aria-hidden', 'true');
    searchButton.setAttribute('aria-expanded', 'false');
    searchButton.classList.remove('is-active');
    document.body.classList.remove('search-open');
    setTimeout(() => {
      if (!isOpen) searchRoot.hidden = true;
    }, 180);
  }

  searchButton.addEventListener('click', () => {
    if (isOpen) closeSearch();
    else openSearch();
  });

  closeBtn?.addEventListener('click', closeSearch);
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    setEmpty('검색어를 입력해 주세요.');
    input.focus();
  });

  input?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(input.value), 180);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) closeSearch();
  });

  document.addEventListener('click', (event) => {
    if (!isOpen) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.site-search__panel') || target.closest('[data-site-search-toggle]')) return;
    closeSearch();
  });

  window.addEventListener('resize', syncTopOffset);
  window.addEventListener('scroll', () => {
    if (isOpen) syncTopOffset();
  }, { passive: true });
})();
