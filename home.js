/* ═══════════════════════════════════════════════════
   ELEGANCE — Home Page Interactions
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── NAVBAR SCROLL STATE ── */
  const nav = document.getElementById('siteNav');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 60);
    backToTop?.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });


  /* ── HAMBURGER MENU ── */
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  hamburger?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('mobile-open');
    hamburger.classList.toggle('open', open);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 992) {
      navLinks?.classList.remove('mobile-open');
      hamburger?.classList.remove('open');
    }
  });


  /* ── SEARCH BAR TOGGLE ── */
  const searchToggle = document.getElementById('searchToggle');
  const searchBar    = document.getElementById('searchBar');
  const searchClose  = document.getElementById('searchClose');
  const searchInput  = document.getElementById('searchInput');

  searchToggle?.addEventListener('click', () => {
    searchBar.classList.toggle('open');
    if (searchBar.classList.contains('open')) searchInput?.focus();
  });
  searchClose?.addEventListener('click', () => searchBar.classList.remove('open'));


  /* ── HERO BANNER SLIDER ── */
  const hbTrack  = document.getElementById('hbTrack');
  const hbPrev   = document.getElementById('hbPrev');
  const hbNext   = document.getElementById('hbNext');
  const hbDotBtns  = document.querySelectorAll('.hb-dot');
  const hbThumbBtns = document.querySelectorAll('.hb-thumb');
  const hbCurrent  = document.getElementById('hbCurrent');

  if (hbTrack) {
    const slides  = hbTrack.querySelectorAll('.hb-slide');
    const total   = slides.length;
    let cur       = 0;
    let autoTimer = null;

    function goBanner(idx) {
      const prev = cur;
      cur = ((idx % total) + total) % total;

      // Move track
      hbTrack.style.transform = `translateX(-${cur * 100}%)`;

      // Swap active slide class (triggers Ken Burns + content animation)
      slides[prev].classList.remove('hb-slide-active');
      slides[cur].classList.add('hb-slide-active');

      // Dots
      hbDotBtns.forEach((d, i) => d.classList.toggle('hb-dot-active', i === cur));

      // Thumbnails
      hbThumbBtns.forEach((t, i) => t.classList.toggle('hb-thumb-active', i === cur));

      // Counter
      if (hbCurrent) hbCurrent.textContent = String(cur + 1).padStart(2, '0');
    }

    function startAuto() {
      stopAuto();
      autoTimer = setInterval(() => goBanner(cur + 1), 5500);
    }
    function stopAuto() { clearInterval(autoTimer); }

    hbPrev?.addEventListener('click', () => { goBanner(cur - 1); startAuto(); });
    hbNext?.addEventListener('click', () => { goBanner(cur + 1); startAuto(); });

    hbDotBtns.forEach(d => {
      d.addEventListener('click', () => { goBanner(+d.dataset.idx); startAuto(); });
    });
    hbThumbBtns.forEach(t => {
      t.addEventListener('click', () => { goBanner(+t.dataset.idx); startAuto(); });
    });

    // Touch / swipe support
    let hbTouchX = 0;
    hbTrack.addEventListener('touchstart', e => { hbTouchX = e.touches[0].clientX; }, { passive: true });
    hbTrack.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - hbTouchX;
      if (Math.abs(dx) > 48) { goBanner(cur + (dx < 0 ? 1 : -1)); startAuto(); }
    });

    // Pause on hover
    hbTrack.closest('.hero-banner')?.addEventListener('mouseenter', stopAuto);
    hbTrack.closest('.hero-banner')?.addEventListener('mouseleave', startAuto);

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { goBanner(cur - 1); startAuto(); }
      if (e.key === 'ArrowRight') { goBanner(cur + 1); startAuto(); }
    });

    goBanner(0);
    startAuto();
  }


  /* ── GENERIC CATEGORY CAROUSEL FACTORY ── */
  function initCatCarousel(trackId, prevId, nextId) {
    const track = document.getElementById(trackId);
    const prev  = document.getElementById(prevId);
    const next  = document.getElementById(nextId);
    if (!track || !prev || !next) return;

    const cards    = track.querySelectorAll('.cat-prod-card');
    const visible  = () => Math.round(track.parentElement.offsetWidth / (cards[0]?.offsetWidth + 20) || 4);
    let pos = 0;

    function slide(dir) {
      const maxPos = Math.max(0, cards.length - visible());
      pos = Math.min(Math.max(pos + dir, 0), maxPos);
      const cardW = cards[0] ? cards[0].offsetWidth + 20 : 0;
      track.style.transform = `translateX(-${pos * cardW}px)`;
      prev.style.opacity = pos === 0 ? '0.4' : '1';
      next.style.opacity = pos >= maxPos ? '0.4' : '1';
    }

    prev.addEventListener('click', () => slide(-1));
    next.addEventListener('click', () => slide(1));

    // Touch
    let startX = 0;
    track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 45) slide(dx < 0 ? 1 : -1);
    });

    slide(0);
  }

  initCatCarousel('suitsTrack',    'suitsPrev',    'suitsNext');
  initCatCarousel('coordTrack',    'coordPrev',    'coordNext');
  initCatCarousel('occasionTrack', 'occasionPrev', 'occasionNext');


  /* ── WISHLIST TOGGLE ── */
  document.querySelectorAll('.wish-btn, .cat-wish-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.classList.toggle('active');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('far');
        icon.classList.toggle('fas');
      }
      // Bounce animation
      btn.style.transform = 'scale(1.3)';
      setTimeout(() => { btn.style.transform = ''; }, 220);
    });
  });


  /* ── QUICK ADD ── */
  document.querySelectorAll('.prod-quick-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const original = btn.textContent;
      btn.textContent = '✓ Added!';
      btn.style.background = 'rgba(39,174,96,0.9)';
      btn.style.color = '#fff';

      // Update cart badge count
      const badge = document.querySelector('.cart-badge');
      if (badge) {
        const count = parseInt(badge.textContent || '0') + 1;
        badge.textContent = count;
        badge.style.transform = 'scale(1.5)';
        setTimeout(() => { badge.style.transform = ''; }, 300);
      }

      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    });
  });


  /* ── SCROLL REVEAL ── */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          ro.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(el => ro.observe(el));
  }

  // Also reveal product cards on scroll
  const prodCards = document.querySelectorAll('.prod-card, .cat-prod-card, .occ-card, .shop-cat-card, .reel-portrait-card');
  const cardObs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.style.opacity = '1', i * 40);
        cardObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  prodCards.forEach(el => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.55s ease, transform 0.4s ease';
    cardObs.observe(el);
  });


  /* ── BACK TO TOP ── */
  const backToTop = document.getElementById('backToTop');
  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  /* ── REEL CARDS — play video or redirect on click ── */
  document.querySelectorAll('.reel-portrait-card').forEach(card => {
    card.addEventListener('click', () => {
      window.open('https://www.instagram.com/elegance.india_/', '_blank');
    });
  });


  /* ── SIZE CHIP SELECTION ── */
  document.querySelectorAll('.size-chips span').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const siblings = chip.closest('.size-chips').querySelectorAll('span');
      siblings.forEach(s => s.classList.remove('selected'));
      chip.classList.add('selected');
      chip.style.background = '#1C1613';
      chip.style.color = '#fff';
      setTimeout(() => {
        siblings.forEach(s => {
          if (!s.classList.contains('selected')) {
            s.style.background = '';
            s.style.color = '';
          }
        });
      }, 50);
    });
  });


  /* ── NEWSLETTER FORM ── */
  const newsletterForm = document.querySelector('.newsletter-form');
  newsletterForm?.addEventListener('submit', e => {
    e.preventDefault();
    const input = newsletterForm.querySelector('.newsletter-input');
    const btn   = newsletterForm.querySelector('.newsletter-btn');
    if (!input.value.trim()) return;
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.background = '#27ae60';
    input.value = '';
    input.placeholder = 'Thank you for subscribing!';
    setTimeout(() => {
      btn.innerHTML = '<i class="fas fa-arrow-right"></i>';
      btn.style.background = '';
      input.placeholder = 'Your email address';
    }, 3000);
  });


  /* ── HORIZONTAL SCROLL ROWS — drag to scroll ── */
  function makeDraggable(el) {
    if (!el) return;
    let isDown = false, startX = 0, scrollLeft = 0;

    el.addEventListener('mousedown', e => {
      isDown    = true;
      startX    = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', () => { isDown = false; if (el) el.style.cursor = ''; });
    el.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      const x    = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.4;
      el.scrollLeft = scrollLeft - walk;
    });
  }

  makeDraggable(document.getElementById('newArrivalsRow'));
  makeDraggable(document.getElementById('bestsellersRow'));
  makeDraggable(document.getElementById('reelsRow'));

  /* Trigger scroll event on load */
  window.dispatchEvent(new Event('scroll'));

});
