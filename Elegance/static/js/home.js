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
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
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

  document.querySelectorAll('.cat-carousel-track[id$="Track"]').forEach(track => {
    const base = track.id.slice(0, -'Track'.length);
    initCatCarousel(track.id, base + 'Prev', base + 'Next');
  });

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
  /* Product cards and quick-add buttons open the product page, where the
     customer picks a size/variant before adding to the cart. */
  document.querySelectorAll('[data-href]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.wish-btn, .cat-wish-btn')) return;
      e.preventDefault();
      window.location.href = el.dataset.href;
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target === el) window.location.href = el.dataset.href;
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

  makeDraggable(document.getElementById('bestsellersRow'));
  makeDraggable(document.getElementById('reelsRow'));


  /* ── NEW ARRIVALS — expanding hover row ── */
  const naRow = document.getElementById('newArrivalsRow');
  if (naRow) {
    const naCards = [...naRow.querySelectorAll('.na-card')];
    const setActive = card => naCards.forEach(c => c.classList.toggle('is-active', c === card));
    naCards.forEach(card => {
      card.addEventListener('mouseenter', () => setActive(card));
      card.addEventListener('focusin', () => setActive(card));
    });
    naRow.addEventListener('mouseleave', () => setActive(naCards[0]));
  }




  /* ── BESTSELLERS — endless marquee (pauses on hover) ── */
  const bsTrack = document.getElementById('bsTrack');
  if (bsTrack) {
    [...bsTrack.children].forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.tabIndex = -1;
      bsTrack.appendChild(clone);
    });
  }


  /* ── SCHEDULE A CALL — modal ── */
  const scModal = document.getElementById('scheduleModal');
  if (scModal) {
    const scForm     = document.getElementById('scheduleForm');
    const scSuccess  = document.getElementById('scSuccess');
    const scDays     = document.getElementById('scDays');
    const scSlots    = [...scModal.querySelectorAll('.sc-slot')];
    const scNameEl   = document.getElementById('scName');
    const scPhoneEl  = document.getElementById('scPhone');
    const scSlotErr  = document.getElementById('scSlotError');
    const scSubmit   = document.getElementById('scSubmit');
    const scOpeners  = document.querySelectorAll('#openScheduleCall');
    let lastFocus = null;
    let selectedDay = null;
    let selectedSlot = null;

    const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
    const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
    const longFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    const scCal      = document.getElementById('scCal');
    const scCalGrid  = document.getElementById('scCalGrid');
    const scCalTitle = document.getElementById('scCalTitle');
    const scCalPrev  = document.getElementById('scCalPrev');
    const scCalNext  = document.getElementById('scCalNext');
    const monthFmt   = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
    const fullFmt    = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const QUICK_DAYS = 5;
    const MAX_DAYS_AHEAD = 90;
    let calMonth = null;

    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const sameDay = (a, b) => !!a && !!b && a.toDateString() === b.toDateString();
    const minDate = () => startOfDay(new Date());
    const maxDate = () => { const m = minDate(); m.setDate(m.getDate() + MAX_DAYS_AHEAD); return m; };

    function setMoreLabel(date) {
      const more = scDays.querySelector('.sc-day-more');
      if (!more) return;
      more.innerHTML = date
        ? `<small>${dayFmt.format(date)}</small><strong>${date.getDate()}</strong><small>${date.toLocaleString('en-IN', { month: 'short' })}</small>`
        : '<i class="far fa-calendar-alt"></i><strong>More</strong><small>dates</small>';
    }

    function renderCalendar() {
      const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const min = minDate();
      const max = maxDate();
      scCalTitle.textContent = monthFmt.format(first);
      scCalPrev.disabled = first <= new Date(min.getFullYear(), min.getMonth(), 1);
      scCalNext.disabled = first >= new Date(max.getFullYear(), max.getMonth(), 1);

      scCalGrid.innerHTML = '';
      for (let i = 0; i < first.getDay(); i++) scCalGrid.appendChild(document.createElement('span'));
      for (let n = 1; n <= daysInMonth; n++) {
        const d = new Date(first.getFullYear(), first.getMonth(), n);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-cal-day';
        btn.textContent = n;
        btn.setAttribute('aria-label', fullFmt.format(d));
        btn.disabled = d < min || d > max;
        btn.classList.toggle('is-today', sameDay(d, min));
        const picked = sameDay(d, selectedDay);
        btn.classList.toggle('is-selected', picked);
        btn.setAttribute('aria-pressed', picked ? 'true' : 'false');
        btn.addEventListener('click', () => pickCalendarDate(d));
        scCalGrid.appendChild(btn);
      }
    }

    function toggleCalendar(open) {
      const more = scDays.querySelector('.sc-day-more');
      const show = typeof open === 'boolean' ? open : scCal.hidden;
      if (show) {
        const base = selectedDay || minDate();
        calMonth = new Date(base.getFullYear(), base.getMonth(), 1);
        renderCalendar();
      }
      scCal.hidden = !show;
      more?.setAttribute('aria-expanded', show ? 'true' : 'false');
      if (show) scCal.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function pickCalendarDate(date) {
      const offset = Math.round((date - minDate()) / 86400000);
      const quick = offset < QUICK_DAYS ? scDays.querySelector(`.sc-day[data-offset="${offset}"]`) : null;
      const more = scDays.querySelector('.sc-day-more');
      if (quick) {
        quick.click();
      } else {
        selectDay(date, more);
        setMoreLabel(date);
      }
      toggleCalendar(false);
    }

    scCalPrev.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); });
    scCalNext.addEventListener('click', () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); });

    function buildDays() {
      scDays.innerHTML = '';
      const today = new Date();
      for (let i = 0; i < QUICK_DAYS; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sc-chip sc-day';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.offset = i;
        btn.innerHTML = `<small>${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : dayFmt.format(d)}</small><strong>${d.getDate()}</strong><small>${d.toLocaleString('en-IN', { month: 'short' })}</small>`;
        btn.addEventListener('click', () => selectDay(d, btn));
        scDays.appendChild(btn);
      }

      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'sc-chip sc-day sc-day-more';
      more.setAttribute('role', 'radio');
      more.setAttribute('aria-checked', 'false');
      more.setAttribute('aria-haspopup', 'true');
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', 'scCal');
      more.setAttribute('aria-label', 'Pick another date from the calendar');
      more.addEventListener('click', () => toggleCalendar());
      scDays.appendChild(more);
      setMoreLabel(null);
    }

    function refreshSlots() {
      const isToday = selectedDay && selectedDay.toDateString() === new Date().toDateString();
      const hour = new Date().getHours();
      scSlots.forEach(slot => {
        slot.disabled = !!isToday && Number(slot.dataset.end) <= hour + 1;
        if (slot.disabled && slot === selectedSlot) clearSlot();
      });
    }

    function clearSlot() {
      selectedSlot = null;
      scSlots.forEach(s => { s.classList.remove('is-selected'); s.setAttribute('aria-checked', 'false'); });
    }

    function selectDay(date, btn) {
      selectedDay = date;
      scDays.querySelectorAll('.sc-day').forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      if (!btn.classList.contains('sc-day-more')) {
        setMoreLabel(null);
        if (!scCal.hidden) toggleCalendar(false);
      }
      refreshSlots();
    }

    scSlots.forEach(slot => slot.addEventListener('click', () => {
      if (slot.disabled) return;
      selectedSlot = slot;
      scSlots.forEach(s => {
        const on = s === slot;
        s.classList.toggle('is-selected', on);
        s.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      scSlotErr.textContent = '';
    }));

    scModal.querySelectorAll('.sc-tag').forEach(tag => tag.addEventListener('click', () => {
      const on = tag.classList.toggle('is-selected');
      tag.setAttribute('aria-pressed', on ? 'true' : 'false');
    }));

    function resetModal() {
      scForm.reset();
      scForm.hidden = false;
      scSuccess.hidden = true;
      scModal.querySelectorAll('.sc-field').forEach(f => f.classList.remove('has-error'));
      scModal.querySelectorAll('.sc-error').forEach(el => { el.textContent = ''; });
      scModal.querySelectorAll('.sc-tag').forEach(t => { t.classList.remove('is-selected'); t.setAttribute('aria-pressed', 'false'); });
      clearSlot();
      scCal.hidden = true;
      buildDays();
      selectedDay = null;
      scSubmit.classList.remove('is-loading');
      scSubmit.disabled = false;
      const first = scDays.querySelector('.sc-day');
      if (first) first.click();
    }

    function openModal() {
      lastFocus = document.activeElement;
      resetModal();
      scModal.classList.add('open');
      scModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(() => scNameEl.focus(), 350);
    }

    function closeModal() {
      scModal.classList.remove('open');
      scModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      lastFocus?.focus?.();
    }

    scOpeners.forEach(btn => btn.addEventListener('click', openModal));
    scModal.querySelectorAll('[data-sc-close]').forEach(el => el.addEventListener('click', closeModal));

    document.addEventListener('keydown', e => {
      if (!scModal.classList.contains('open')) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...scModal.querySelectorAll('button, input, [href]')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    scPhoneEl.addEventListener('input', () => {
      scPhoneEl.value = scPhoneEl.value.replace(/\D/g, '').slice(0, 10);
    });

    function setError(input, message) {
      const field = input.closest('.sc-field');
      field.classList.toggle('has-error', !!message);
      field.querySelector('.sc-error').textContent = message || '';
    }

    [scNameEl, scPhoneEl].forEach(el => el.addEventListener('input', () => setError(el, '')));

    /* Replace with a real request (fetch to your backend / CRM) when one is available. */
    function submitScheduleCall(payload) {
      return new Promise(resolve => setTimeout(() => resolve(payload), 900));
    }

    scForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = scNameEl.value.trim();
      const phone = scPhoneEl.value.trim();
      let valid = true;

      if (name.length < 2) { setError(scNameEl, 'Please tell us your name'); valid = false; }
      if (!/^[6-9]\d{9}$/.test(phone)) { setError(scPhoneEl, 'Enter a valid 10-digit mobile number'); valid = false; }
      if (!selectedSlot) { scSlotErr.textContent = 'Choose a time window'; valid = false; }
      if (!valid) {
        (scModal.querySelector('.has-error .sc-input') || scSlots[0]).focus();
        return;
      }

      const topics = [...scModal.querySelectorAll('.sc-tag.is-selected')].map(t => t.textContent);
      scSubmit.classList.add('is-loading');
      scSubmit.disabled = true;

      await submitScheduleCall({ name, phone: '+91' + phone, date: selectedDay.toISOString(), slot: selectedSlot.dataset.slot, topics });

      document.getElementById('scSuccessName').textContent = name.split(' ')[0];
      document.getElementById('scSuccessPhone').textContent = '+91 ' + phone.replace(/(\d{5})(\d{5})/, '$1 $2');
      document.getElementById('scSuccessWhen').innerHTML =
        `<strong>${longFmt.format(selectedDay)}</strong><span>${selectedSlot.dataset.slot} &middot; ${selectedSlot.querySelector('small').textContent}</span>`;
      scForm.hidden = true;
      scSuccess.hidden = false;
    });
  }


  /* ── FEATURED COLLECTIONS TABS ── */
  const fcTabs = [...document.querySelectorAll('.fc-tab')];
  if (fcTabs.length) {
    const activateFcTab = (tab, focus = false) => {
      fcTabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !on;
          panel.classList.toggle('is-active', on);
        }
      });
      if (focus) tab.focus();
    };
    fcTabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activateFcTab(tab));
      tab.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') activateFcTab(fcTabs[(i + 1) % fcTabs.length], true);
        if (e.key === 'ArrowLeft') activateFcTab(fcTabs[(i - 1 + fcTabs.length) % fcTabs.length], true);
      });
    });
  }


  /* Trigger scroll event on load */
  window.dispatchEvent(new Event('scroll'));

});
