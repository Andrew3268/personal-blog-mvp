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

  const createCloseIcon = () => `
    <svg class="nav__icon-svg nav__icon-svg--close" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path d="M6 6l12 12"></path>
      <path d="M18 6L6 18"></path>
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
      <div class="site-search__panel" role="dialog" aria-modal="false" aria-label="사이트 검색">
        <div class="site-search__top">
          <div class="site-search__input-wrap">
            <span class="site-search__input-icon" aria-hidden="true">
              ${createSearchIcon()}
            </span>
            <input id="siteSearchInput" class="site-search__input" type="search" placeholder="제목으로 검색" autocomplete="off" spellcheck="false" />
            <button type="button" class="site-search__clear" data-site-search-clear hidden>지우기</button>
          </div>
          <button type="button" class="site-search__close" data-site-search-close aria-label="검색 닫기">
            <span class="site-search__close-icon" aria-hidden="true">${createCloseIcon()}</span>
          </button>
        </div>
        <div class="site-search__filters" role="group" aria-label="검색 범위 선택">
          <button type="button" class="site-search__toggle is-on" data-search-mode="title" aria-pressed="true">제목 검색</button>
          <button type="button" class="site-search__toggle" data-search-mode="content" aria-pressed="false">내용 검색</button>
        </div>
        <div class="site-search__results" data-site-search-results hidden></div>
      </div>
    </div>
  `;

  topbar.insertAdjacentElement('afterend', searchRoot);

  const input = searchRoot.querySelector('#siteSearchInput');
  const results = searchRoot.querySelector('[data-site-search-results]');
  const clearBtn = searchRoot.querySelector('[data-site-search-clear]');
  const closeBtn = searchRoot.querySelector('[data-site-search-close]');
  const toggleButtons = Array.from(searchRoot.querySelectorAll('[data-search-mode]'));

  let isOpen = false;
  let requestSeq = 0;
  let debounceTimer = null;
  const modes = {
    title: true,
    content: false
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function updatePlaceholder() {
    if (modes.title && modes.content) {
      input.placeholder = '제목과 내용으로 검색';
    } else if (modes.content) {
      input.placeholder = '내용으로 검색';
    } else {
      input.placeholder = '제목으로 검색';
    }
  }

  function syncToggleUi() {
    toggleButtons.forEach((button) => {
      const mode = button.getAttribute('data-search-mode');
      const isOn = !!modes[mode];
      button.classList.toggle('is-on', isOn);
      button.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    });
    updatePlaceholder();
  }

  function buildResultItem(item) {
    const href = `/post/${encodeURIComponent(item.slug || '')}`;
    return `
      <a class="site-search__item" href="${href}">
        <strong class="site-search__item-title">${escapeHtml(item.title || '')}</strong>
      </a>
    `;
  }

  function showResults() {
    results.hidden = false;
  }

  function hideResults() {
    results.hidden = true;
    results.innerHTML = '';
  }

  function setLoading() {
    showResults();
    results.innerHTML = `
      <div class="site-search__loading">
        <span class="site-search__loading-line"></span>
        <span class="site-search__loading-line"></span>
        <span class="site-search__loading-line site-search__loading-line--short"></span>
      </div>
    `;
  }

  function setEmpty(message) {
    showResults();
    results.innerHTML = `<div class="site-search__empty">${escapeHtml(message)}</div>`;
  }

  async function runSearch(keyword) {
    const query = String(keyword || '').trim();
    if (!query) {
      clearBtn.hidden = true;
      hideResults();
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
      url.searchParams.set('search_title', modes.title ? '1' : '0');
      url.searchParams.set('search_content', modes.content ? '1' : '0');
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('search_failed');
      const data = await res.json().catch(() => ({}));
      if (currentSeq !== requestSeq) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        setEmpty(`“${query}”에 대한 검색 결과가 없습니다.`);
        return;
      }
      showResults();
      results.innerHTML = items.map(buildResultItem).join('');
    } catch (_) {
      if (currentSeq !== requestSeq) return;
      setEmpty('검색 결과를 불러오지 못했습니다.');
    }
  }

  function openSearch() {
    if (isOpen) return;
    isOpen = true;
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
    setTimeout(() => {
      if (!isOpen) searchRoot.hidden = true;
    }, 220);
  }

  searchButton.addEventListener('click', () => {
    if (isOpen) closeSearch();
    else openSearch();
  });

  closeBtn?.addEventListener('click', closeSearch);
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    hideResults();
    input.focus();
  });

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-search-mode');
      if (!mode || !(mode in modes)) return;

      if (modes[mode]) {
        const activeCount = Object.values(modes).filter(Boolean).length;
        if (activeCount === 1) return;
        modes[mode] = false;
      } else {
        modes[mode] = true;
      }

      syncToggleUi();
      if (String(input.value || '').trim()) {
        clearTimeout(debounceTimer);
        runSearch(input.value);
      }
    });
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

  syncToggleUi();
})();
