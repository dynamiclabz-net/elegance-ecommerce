/* ═══════════════════════════════════════════════════════════════
   ELEGANCE — Product Detail Page JS
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── NAVBAR: scroll shadow + hamburger ── */
  const siteNav   = document.getElementById('siteNav');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    siteNav.classList.toggle('scrolled', window.scrollY > 20);
    checkStickyBar();
  }, { passive: true });

  hamburger?.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      navLinks.classList.remove('open');
    }
  });

  /* ── SEARCH TOGGLE ── */
  const searchToggle = document.getElementById('searchToggle');
  const searchBar    = document.getElementById('searchBar');
  const searchClose  = document.getElementById('searchClose');

  searchToggle?.addEventListener('click', () => searchBar.classList.add('open'));
  searchClose?.addEventListener('click',  () => searchBar.classList.remove('open'));

  /* ══════════════════════════════════════════════════════════════
     IMAGE GALLERY — Thumbnail switch + slide track
  ══════════════════════════════════════════════════════════════ */
  const pdThumbs    = document.querySelectorAll('.pd-thumb');
  const pdMainTrack = document.getElementById('pdMainTrack');
  const pdImgPrev   = document.getElementById('pdImgPrev');
  const pdImgNext   = document.getElementById('pdImgNext');

  const totalImgs = pdThumbs.length;
  let currentImg  = 0;

  const galleryImgSrcs = Array.from(pdThumbs).map(t => t.querySelector('img').src);

  function goToImage(idx) {
    const prev = currentImg;
    currentImg = ((idx % totalImgs) + totalImgs) % totalImgs;

    pdMainTrack.style.transform = `translateX(-${currentImg * 100}%)`;

    document.querySelectorAll('.pd-main-slide').forEach((s, i) => {
      s.classList.toggle('pd-main-active', i === currentImg);
    });
    pdThumbs.forEach((t, i) => t.classList.toggle('pd-thumb-active', i === currentImg));

    // Sync lightbox if open
    if (document.getElementById('pdLightbox').classList.contains('open')) {
      goLightbox(currentImg);
    }
  }

  pdThumbs.forEach((t, i) => {
    t.addEventListener('click', () => goToImage(i));
  });
  pdImgPrev?.addEventListener('click', () => goToImage(currentImg - 1));
  pdImgNext?.addEventListener('click', () => goToImage(currentImg + 1));

  // Touch swipe on gallery
  let galTouchX = 0;
  pdMainTrack?.addEventListener('touchstart', e => { galTouchX = e.touches[0].clientX; }, { passive: true });
  pdMainTrack?.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - galTouchX;
    if (Math.abs(dx) > 44) goToImage(currentImg + (dx < 0 ? 1 : -1));
  });

  /* ══════════════════════════════════════════════════════════════
     HOVER ZOOM (lens + zoom result panel)
  ══════════════════════════════════════════════════════════════ */
  const pdMainWrap   = document.getElementById('pdMainWrap');
  const pdZoomLens   = document.getElementById('pdZoomLens');
  const pdZoomResult = document.getElementById('pdZoomResult');

  const LENS_W = 120, LENS_H = 130, ZOOM_FACTOR = 2.8;

  function initZoom() {
    const activeSlide = pdMainTrack.querySelectorAll('.pd-main-slide')[currentImg];
    if (!activeSlide) return;
    const img = activeSlide.querySelector('img');
    if (!img || !img.complete || !img.naturalWidth) return;

    const wrapRect = pdMainWrap.getBoundingClientRect();
    const resultW  = pdZoomResult.offsetWidth || 380;
    const resultH  = pdZoomResult.offsetHeight || 380;

    // Set result background
    pdZoomResult.style.backgroundImage  = `url('${img.src}')`;
    pdZoomResult.style.backgroundRepeat = 'no-repeat';

    const bgW = wrapRect.width  * ZOOM_FACTOR;
    const bgH = wrapRect.height * ZOOM_FACTOR;
    pdZoomResult.style.backgroundSize = `${bgW}px ${bgH}px`;

    pdZoomResult.classList.add('active');

    return { wrapRect, bgW, bgH, resultW, resultH };
  }

  pdMainWrap?.addEventListener('mousemove', e => {
    const data = initZoom();
    if (!data) return;
    const { wrapRect, bgW, bgH } = data;

    let lx = e.clientX - wrapRect.left - LENS_W / 2;
    let ly = e.clientY - wrapRect.top  - LENS_H / 2;

    lx = Math.max(0, Math.min(lx, wrapRect.width  - LENS_W));
    ly = Math.max(0, Math.min(ly, wrapRect.height - LENS_H));

    pdZoomLens.style.width  = LENS_W + 'px';
    pdZoomLens.style.height = LENS_H + 'px';
    pdZoomLens.style.left   = lx + 'px';
    pdZoomLens.style.top    = ly + 'px';

    // Calc background position for result
    const rx = (lx / (wrapRect.width  - LENS_W)) * (bgW - (pdZoomResult.offsetWidth  || 380));
    const ry = (ly / (wrapRect.height - LENS_H)) * (bgH - (pdZoomResult.offsetHeight || 380));
    pdZoomResult.style.backgroundPosition = `-${rx}px -${ry}px`;
  });

  pdMainWrap?.addEventListener('mouseleave', () => {
    pdZoomResult.classList.remove('active');
  });

  /* ══════════════════════════════════════════════════════════════
     LIGHTBOX (fullscreen image viewer)
  ══════════════════════════════════════════════════════════════ */
  const pdLightbox    = document.getElementById('pdLightbox');
  const lbMainImg     = document.getElementById('lbMainImg');
  const lbCurrent     = document.getElementById('lbCurrent');
  const lbClose       = document.getElementById('lbClose');
  const lbBackdrop    = document.getElementById('lbBackdrop');
  const lbPrev        = document.getElementById('lbPrev');
  const lbNext        = document.getElementById('lbNext');
  const lbThumbBtns   = document.querySelectorAll('.pd-lb-thumb');
  let lbIdx = 0;

  function openLightbox(idx) {
    lbIdx = idx;
    updateLightbox();
    pdLightbox.classList.add('open');
    pdLightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    pdLightbox.classList.remove('open');
    pdLightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  function goLightbox(idx) {
    lbIdx = ((idx % totalImgs) + totalImgs) % totalImgs;
    updateLightbox();
  }
  function updateLightbox() {
    lbMainImg.src = galleryImgSrcs[lbIdx];
    lbCurrent.textContent = lbIdx + 1;
    lbThumbBtns.forEach((t, i) => t.classList.toggle('pd-lb-thumb-active', i === lbIdx));
  }

  document.getElementById('pdFullscreenBtn')?.addEventListener('click', () => openLightbox(currentImg));
  pdMainWrap?.addEventListener('dblclick', () => openLightbox(currentImg));
  lbClose?.addEventListener('click', closeLightbox);
  lbBackdrop?.addEventListener('click', closeLightbox);
  lbPrev?.addEventListener('click', () => goLightbox(lbIdx - 1));
  lbNext?.addEventListener('click', () => goLightbox(lbIdx + 1));
  lbThumbBtns.forEach(t => t.addEventListener('click', () => goLightbox(+t.dataset.idx)));

  document.addEventListener('keydown', e => {
    if (!pdLightbox.classList.contains('open')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  goLightbox(lbIdx - 1);
    if (e.key === 'ArrowRight') goLightbox(lbIdx + 1);
  });

  /* ══════════════════════════════════════════════════════════════
     COLOUR SWATCHES
  ══════════════════════════════════════════════════════════════ */
  const colorSwatches   = document.querySelectorAll('.pd-color-swatch');
  const selectedColorEl = document.getElementById('selectedColor');

  colorSwatches.forEach(sw => {
    sw.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('pd-swatch-active'));
      sw.classList.add('pd-swatch-active');
      if (selectedColorEl) selectedColorEl.textContent = sw.dataset.color;
    });
  });

  /* ══════════════════════════════════════════════════════════════
     SIZE SELECTOR
  ══════════════════════════════════════════════════════════════ */
  const sizeBtns      = document.querySelectorAll('.pd-size-btn:not([disabled])');
  const selectedSizeEl = document.getElementById('selectedSize');

  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeBtns.forEach(b => b.classList.remove('pd-size-active'));
      btn.classList.add('pd-size-active');
      if (selectedSizeEl) selectedSizeEl.textContent = btn.dataset.size;
    });
  });

  /* ══════════════════════════════════════════════════════════════
     QUANTITY STEPPER
  ══════════════════════════════════════════════════════════════ */
  const pdQtyVal   = document.getElementById('pdQtyVal');
  const pdQtyMinus = document.getElementById('pdQtyMinus');
  const pdQtyPlus  = document.getElementById('pdQtyPlus');
  let qty = 1;

  pdQtyMinus?.addEventListener('click', () => {
    if (qty > 1) { qty--; pdQtyVal.textContent = qty; }
  });
  pdQtyPlus?.addEventListener('click', () => {
    if (qty < 10) { qty++; pdQtyVal.textContent = qty; }
  });

  /* ══════════════════════════════════════════════════════════════
     WISHLIST TOGGLE
  ══════════════════════════════════════════════════════════════ */
  const pdWishBtn = document.getElementById('pdWishBtn');
  let wishlisted = false;

  pdWishBtn?.addEventListener('click', () => {
    wishlisted = !wishlisted;
    pdWishBtn.classList.toggle('active', wishlisted);
    const icon = pdWishBtn.querySelector('i');
    icon.className = wishlisted ? 'fas fa-heart' : 'far fa-heart';
    showToast(wishlisted ? 'Added to wishlist' : 'Removed from wishlist');
  });

  // Related product wish btns
  document.querySelectorAll('.pd-rel-wish').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = btn.querySelector('i');
      const on = i.classList.contains('fas');
      i.className = on ? 'far fa-heart' : 'fas fa-heart';
      btn.style.color = on ? '' : '#e74c3c';
      showToast(on ? 'Removed from wishlist' : 'Added to wishlist');
    });
  });

  /* ══════════════════════════════════════════════════════════════
     ADD TO CART / BUY NOW
  ══════════════════════════════════════════════════════════════ */
  function validateSelection() {
    if (!document.querySelector('.pd-size-btn.pd-size-active')) {
      // Highlight size row
      document.querySelector('.pd-size-grid').style.outline = '2px solid #e74c3c';
      document.querySelector('.pd-size-grid').style.borderRadius = '8px';
      setTimeout(() => {
        document.querySelector('.pd-size-grid').style.outline = '';
      }, 1800);
      showToast('Please select a size first');
      return false;
    }
    return true;
  }

  document.getElementById('pdAddCart')?.addEventListener('click', () => {
    if (!validateSelection()) return;
    const btn = document.getElementById('pdAddCart');
    btn.innerHTML = '<i class="fas fa-check"></i> Added!';
    btn.style.background = '#27AE60';
    setTimeout(() => {
      btn.innerHTML = '<i class="fas fa-shopping-bag"></i> Add to Cart';
      btn.style.background = '';
    }, 2000);
    showToast('Added to your bag!');
    // Update cart badge
    const badge = document.querySelector('.cart-badge');
    if (badge) badge.textContent = +badge.textContent + qty;
  });

  document.getElementById('pdBuyNow')?.addEventListener('click', () => {
    if (!validateSelection()) return;
    showToast('Redirecting to checkout…');
  });

  document.querySelectorAll('.pd-sticky-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!validateSelection()) return;
      showToast('Added to your bag!');
    });
  });

  /* ══════════════════════════════════════════════════════════════
     TOAST NOTIFICATION
  ══════════════════════════════════════════════════════════════ */
  const pdToast    = document.getElementById('pdToast');
  const pdToastMsg = document.getElementById('pdToastMsg');
  let toastTimer;

  function showToast(msg) {
    clearTimeout(toastTimer);
    if (pdToastMsg) pdToastMsg.textContent = msg;
    pdToast?.classList.add('show');
    toastTimer = setTimeout(() => pdToast?.classList.remove('show'), 2400);
  }

  /* ══════════════════════════════════════════════════════════════
     STICKY BAR
  ══════════════════════════════════════════════════════════════ */
  const pdStickyBar = document.getElementById('pdStickyBar');
  const ctaRow      = document.querySelector('.pd-cta-row');

  function checkStickyBar() {
    if (!ctaRow || !pdStickyBar) return;
    const rect = ctaRow.getBoundingClientRect();
    pdStickyBar.classList.toggle('visible', rect.bottom < 0);
  }

  /* ══════════════════════════════════════════════════════════════
     PRODUCT TABS
  ══════════════════════════════════════════════════════════════ */
  const tabBtns   = document.querySelectorAll('.pd-tab-btn');
  const tabPanels = document.querySelectorAll('.pd-tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('pd-tab-active', b === btn));
      tabPanels.forEach(p => {
        p.classList.toggle('pd-tab-panel-active', p.id === `tab-${tabId}`);
      });
    });
  });

  /* ══════════════════════════════════════════════════════════════
     REVIEW STAR PICKER
  ══════════════════════════════════════════════════════════════ */
  const starBtns    = document.querySelectorAll('.pd-rm-star');
  const starLabel   = document.getElementById('starLabel');
  const starLabels  = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];
  let selectedRating = 0;

  starBtns.forEach(btn => {
    btn.addEventListener('mouseover', () => {
      const val = +btn.dataset.val;
      highlightStars(val);
    });
    btn.addEventListener('mouseout', () => {
      highlightStars(selectedRating);
    });
    btn.addEventListener('click', () => {
      selectedRating = +btn.dataset.val;
      highlightStars(selectedRating);
      if (starLabel) starLabel.textContent = starLabels[selectedRating];
    });
  });

  function highlightStars(val) {
    starBtns.forEach(b => {
      const bv = +b.dataset.val;
      b.classList.toggle('lit', bv <= val);
      b.querySelector('i').className = bv <= val ? 'fas fa-star' : 'far fa-star';
    });
  }

  /* ══════════════════════════════════════════════════════════════
     REVIEW MODAL
  ══════════════════════════════════════════════════════════════ */
  const reviewModal  = document.getElementById('reviewModal');
  const writeRevBtn  = document.getElementById('writeReviewBtn');
  const rmClose      = document.getElementById('rmClose');
  const rmBackdrop   = document.getElementById('rmBackdrop');
  const reviewForm   = document.getElementById('reviewForm');

  function openReviewModal()  {
    reviewModal.classList.add('open');
    reviewModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeReviewModal() {
    reviewModal.classList.remove('open');
    reviewModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  writeRevBtn?.addEventListener('click', openReviewModal);
  rmClose?.addEventListener('click', closeReviewModal);
  rmBackdrop?.addEventListener('click', closeReviewModal);

  reviewForm?.addEventListener('submit', e => {
    e.preventDefault();
    if (selectedRating === 0) {
      if (starLabel) starLabel.textContent = 'Please select a rating';
      starLabel.style.color = '#e74c3c';
      return;
    }
    closeReviewModal();
    showToast('Review submitted — thank you!');
    reviewForm.reset();
    selectedRating = 0;
    highlightStars(0);
    if (starLabel) { starLabel.textContent = 'Select a rating'; starLabel.style.color = ''; }
  });

  /* ══════════════════════════════════════════════════════════════
     REVIEW FILTER TABS
  ══════════════════════════════════════════════════════════════ */
  const revFilterBtns = document.querySelectorAll('.pd-rev-filter');

  revFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      revFilterBtns.forEach(b => b.classList.remove('pd-rev-filter-active'));
      btn.classList.add('pd-rev-filter-active');

      const rating = btn.dataset.rating;
      document.querySelectorAll('.pd-review-card').forEach(card => {
        const show = rating === 'all' || card.dataset.rating === rating;
        card.style.display = show ? '' : 'none';
      });
    });
  });

  /* ══════════════════════════════════════════════════════════════
     REVIEW HELPFUL BUTTONS
  ══════════════════════════════════════════════════════════════ */
  document.querySelectorAll('.pd-rev-helpful-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.voted) return;
      btn.dataset.voted = '1';
      const i = btn.querySelector('i');
      const isThumbUp = i.classList.contains('fa-thumbs-up');
      // Extract count
      const match = btn.innerHTML.match(/\((\d+)\)/);
      if (match) {
        const newCount = +match[1] + 1;
        btn.innerHTML = btn.innerHTML.replace(/\(\d+\)/, `(${newCount})`);
      }
      btn.style.borderColor = isThumbUp ? '#27AE60' : '#e74c3c';
      btn.style.color       = isThumbUp ? '#27AE60' : '#e74c3c';
    });
  });

  /* ══════════════════════════════════════════════════════════════
     RELATED PRODUCTS CAROUSEL
  ══════════════════════════════════════════════════════════════ */
  const relTrack  = document.getElementById('relTrack');
  const relPrev   = document.getElementById('relPrev');
  const relNext   = document.getElementById('relNext');

  if (relTrack) {
    const relCards  = relTrack.querySelectorAll('.pd-rel-card');
    const relCount  = relCards.length;
    let relOffset   = 0;
    let visibleRel  = 4;

    function getVisibleRel() {
      if (window.innerWidth <= 767) return 2;
      if (window.innerWidth <= 991) return 3;
      if (window.innerWidth <= 1199) return 4;
      return 4;
    }

    function getRelCardWidth() {
      if (!relCards[0]) return 0;
      return relCards[0].offsetWidth + 20;
    }

    function slideRel(dir) {
      visibleRel = getVisibleRel();
      const maxOff = Math.max(0, relCount - visibleRel);
      relOffset = Math.max(0, Math.min(relOffset + dir, maxOff));
      relTrack.style.transform = `translateX(-${relOffset * getRelCardWidth()}px)`;
    }

    relPrev?.addEventListener('click', () => slideRel(-1));
    relNext?.addEventListener('click', () => slideRel(1));

    // Touch swipe
    let relTouchX = 0;
    relTrack.addEventListener('touchstart', e => { relTouchX = e.touches[0].clientX; }, { passive: true });
    relTrack.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - relTouchX;
      if (Math.abs(dx) > 44) slideRel(dx < 0 ? 1 : -1);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SIZE GUIDE MODAL
  ══════════════════════════════════════════════════════════════ */
  const sizeGuideModal = document.getElementById('sizeGuideModal');
  const sgmBackdrop    = document.getElementById('sgmBackdrop');
  const sgmClose       = document.getElementById('sgmClose');

  document.querySelectorAll('.pd-size-guide').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      sizeGuideModal.classList.add('open');
      sizeGuideModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    });
  });

  function closeSizeGuide() {
    sizeGuideModal.classList.remove('open');
    sizeGuideModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  sgmClose?.addEventListener('click', closeSizeGuide);
  sgmBackdrop?.addEventListener('click', closeSizeGuide);

  /* ══════════════════════════════════════════════════════════════
     LOAD MORE REVIEWS (simulated)
  ══════════════════════════════════════════════════════════════ */
  const loadMoreBtn = document.getElementById('loadMoreReviews');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
      loadMoreBtn.disabled = true;
      setTimeout(() => {
        loadMoreBtn.innerHTML = 'No More Reviews';
        loadMoreBtn.style.opacity = '.45';
        loadMoreBtn.style.cursor = 'default';
      }, 1400);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     SHARE COPY LINK
  ══════════════════════════════════════════════════════════════ */
  document.querySelectorAll('.pd-share-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (btn.querySelector('.fa-link')) {
        navigator.clipboard?.writeText(window.location.href).then(() => showToast('Link copied to clipboard!'));
      }
    });
  });

  /* ══════════════════════════════════════════════════════════════
     SCROLL REVEAL (intersection observer for sections)
  ══════════════════════════════════════════════════════════════ */
  const revealEls = document.querySelectorAll('.pd-rel-card, .pd-care-item, .pd-review-card');
  if ('IntersectionObserver' in window) {
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'panelFadeIn .5s var(--ease) both';
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(el => {
      el.style.opacity = '0';
      revealObs.observe(el);
    });
  }

});
