(() => {
  const root = document.documentElement;
  const mediaBlocks = Array.from(document.querySelectorAll('.home-loading-media'));

  const mediaJobs = mediaBlocks.map((media) => {
    media.classList.add('is-loading');
    const image = media.querySelector('img[data-home-image]');
    if (!image) {
      media.classList.remove('is-loading');
      media.classList.add('is-loaded');
      return Promise.resolve();
    }

    const markLoaded = () => {
      media.classList.remove('is-loading');
      media.classList.add('is-loaded');
    };
    if (image.complete) {
      markLoaded();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => {
        markLoaded();
        resolve();
      };
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });
  });

  const timeout = new Promise((resolve) => window.setTimeout(resolve, 1800));
  Promise.race([Promise.allSettled(mediaJobs), timeout]).then(() => {
    requestAnimationFrame(() => root?.classList.remove('home-skeleton-active'));
  });
})();
