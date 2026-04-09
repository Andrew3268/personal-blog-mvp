(async function(){
  const res = await fetch('/api/admin/session', { credentials: 'same-origin' }).catch(() => null);
  if (!res) {
    location.href = '/admin/';
    return;
  }
  const json = await res.json().catch(() => ({}));
  if (!json.authenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.href = `/admin/?next=${returnTo}`;
  }
})();
