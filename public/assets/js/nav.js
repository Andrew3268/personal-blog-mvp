(function(){
  const path = location.pathname.replace(/\/$/, "") || "/";
  const links = document.querySelectorAll('.nav a[data-path]');
  links.forEach(a => {
    const p = a.getAttribute('data-path');
    if (p === path) a.setAttribute('aria-current','page');
    else a.removeAttribute('aria-current');
  });
})();
