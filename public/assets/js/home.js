(() => {
  const mediaBlocks = Array.from(document.querySelectorAll('.home-loading-media'));

  mediaBlocks.forEach((media) => {
    const image = media.querySelector('img[data-home-image]');
    if (!image) {
      media.classList.add('is-loaded');
      return;
    }

    const markLoaded = () => media.classList.add('is-loaded');
    if (image.complete && image.naturalWidth > 0) {
      markLoaded();
      return;
    }

    image.addEventListener('load', markLoaded, { once: true });
    image.addEventListener('error', markLoaded, { once: true });
  });
})();
