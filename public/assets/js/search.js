(function () {
  const overlay = document.getElementById('siteSearchOverlay');
  const input = document.getElementById('siteSearchInput');
  const form = document.getElementById('siteSearchForm');
  const openButtons = document.querySelectorAll('[data-search-open]');
  const closeButtons = document.querySelectorAll('[data-search-close]');
  if (!overlay || !input || !form) return;

  function setOpen(open) {
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('has-search-open', open);
    if (open) {
      const currentQ = String(new URL(location.href).searchParams.get('q') || '').trim();
      input.value = currentQ;
      setTimeout(() => input.focus(), 10);
      input.select();
    }
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', () => setOpen(true));
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
      setOpen(true);
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