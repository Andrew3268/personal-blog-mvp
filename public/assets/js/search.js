(function () {
  const overlay = document.getElementById('siteSearchOverlay');
  const input = document.getElementById('siteSearchInput');
  const form = document.getElementById('siteSearchForm');
  const openButtons = document.querySelectorAll('[data-search-open]');
  const closeButtons = document.querySelectorAll('[data-search-close]');
  if (!overlay || !input || !form) return;

  let lastTrigger = null;

  function setOpen(open, trigger = null) {
    if (open) {
      lastTrigger = trigger || document.activeElement;
      overlay.hidden = false;
      overlay.removeAttribute('inert');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('has-search-open');

      const currentQ = String(new URL(location.href).searchParams.get('q') || '').trim();
      input.value = currentQ;
      setTimeout(() => {
        input.focus();
        input.select();
      }, 10);
      return;
    }

    const active = document.activeElement;
    if (active && overlay.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }

    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    document.body.classList.remove('has-search-open');

    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      setTimeout(() => lastTrigger.focus(), 10);
    }
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', () => setOpen(true, button));
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => setOpen(false));
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) setOpen(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setOpen(true, document.activeElement);
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = input.value.trim();
    const target = new URL('/', window.location.origin);
    if (q) target.searchParams.set('q', q);
    window.location.href = `${target.pathname}${target.search}`;
  });
})();