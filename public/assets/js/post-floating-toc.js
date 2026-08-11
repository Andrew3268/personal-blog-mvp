(function () {
  const page = document.querySelector('.post-page-body');
  const article = page?.querySelector('.post-content');
  const root = document.querySelector('[data-floating-toc]');
  const panel = root?.querySelector('[data-floating-toc-panel]');
  const toggle = root?.querySelector('[data-floating-toc-toggle]');
  const closeButton = root?.querySelector('[data-floating-toc-close]');
  const list = root?.querySelector('[data-floating-toc-list]');

  if (!page || !article || !root || !panel || !toggle || !closeButton || !list) return;

  const headings = Array.from(article.querySelectorAll('h2, h3')).filter((heading) => {
    return String(heading.textContent || '').trim().length > 0;
  });
  if (!headings.length) return;

  const usedIds = new Set(Array.from(document.querySelectorAll('[id]')).map((node) => node.id).filter(Boolean));
  let h2Index = 0;
  let h3Index = 0;

  function ensureHeadingId(heading, index) {
    if (heading.id) return heading.id;
    let candidate = `post-section-${index + 1}`;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `post-section-${index + 1}-${suffix}`;
      suffix += 1;
    }
    heading.id = candidate;
    usedIds.add(candidate);
    return candidate;
  }

  const tocEntries = headings.map((heading, index) => {
    const level = heading.tagName === 'H3' ? 3 : 2;
    if (level === 2) {
      h2Index += 1;
      h3Index = 0;
    } else {
      h3Index += 1;
    }
    const id = ensureHeadingId(heading, index);
    const indexLabel = level === 2
      ? String(h2Index).padStart(2, '0')
      : `${String(h2Index).padStart(2, '0')}.${h3Index}`;
    return { heading, id, level, indexLabel, text: String(heading.textContent || '').trim() };
  });

  const fragment = document.createDocumentFragment();
  tocEntries.forEach((entry) => {
    const item = document.createElement('li');
    item.className = `post-floating-toc__item post-floating-toc__item--h${entry.level}`;

    const link = document.createElement('a');
    link.className = 'post-floating-toc__link';
    link.href = `#${encodeURIComponent(entry.id)}`;
    link.setAttribute('data-floating-toc-link', '');
    link.setAttribute('data-target-id', entry.id);

    const indexNode = document.createElement('span');
    indexNode.className = 'post-floating-toc__index';
    indexNode.textContent = entry.indexLabel;

    const textNode = document.createElement('span');
    textNode.className = 'post-floating-toc__text';
    textNode.textContent = entry.text;

    link.append(indexNode, textNode);
    item.append(link);
    fragment.append(item);
  });
  list.replaceChildren(fragment);

  root.hidden = false;

  let isOpen = false;
  let rafId = 0;
  const articleTop = article.getBoundingClientRect().top + window.scrollY;
  const revealAt = Math.max(420, articleTop - 120);

  function setOpen(nextOpen, { restoreFocus = false } = {}) {
    isOpen = Boolean(nextOpen);
    panel.hidden = !isOpen;
    root.classList.toggle('is-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? '목차 닫기' : '목차 열기');
    if (isOpen) {
      const active = list.querySelector('[aria-current="true"]') || list.querySelector('[data-floating-toc-link]');
      active?.scrollIntoView({ block: 'nearest' });
    } else if (restoreFocus) {
      toggle.focus({ preventScroll: true });
    }
  }

  function syncVisibility() {
    rafId = 0;
    const shouldShow = window.scrollY >= revealAt;
    root.classList.toggle('is-visible', shouldShow);
    if (!shouldShow && isOpen) setOpen(false);
  }

  function requestVisibilitySync() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(syncVisibility);
  }

  toggle.addEventListener('click', () => setOpen(!isOpen));
  closeButton.addEventListener('click', () => setOpen(false, { restoreFocus: true }));

  list.addEventListener('click', (event) => {
    const link = event.target.closest('[data-floating-toc-link]');
    if (!link) return;
    const targetId = link.getAttribute('data-target-id');
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!isOpen || root.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
    }
  });

  window.addEventListener('scroll', requestVisibilitySync, { passive: true });
  window.addEventListener('resize', requestVisibilitySync, { passive: true });

  const links = Array.from(list.querySelectorAll('[data-floating-toc-link]'));
  function setActive(id) {
    links.forEach((link) => {
      const active = link.getAttribute('data-target-id') === id;
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target?.id) setActive(visible[0].target.id);
    }, { rootMargin: '-12% 0px -72% 0px', threshold: [0, 1] });
    headings.forEach((heading) => observer.observe(heading));
  }

  setActive(tocEntries[0].id);
  syncVisibility();
})();
