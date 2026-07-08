/* ═══════════════════════════════════════════════════
   ELEGANCE — shop.js
   Handles: navbar, search, category tabs, filters,
            grid view toggle, sorting, pagination,
            quick-view modal, wishlist toggle
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── NAVBAR SCROLL SHADOW ── */
  const siteNav = document.getElementById('siteNav');
  window.addEventListener('scroll', () => {
    siteNav?.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  /* ── SEARCH TOGGLE ── */
  const searchToggle = document.getElementById('searchToggle');
  const searchBar    = document.getElementById('searchBar');
  const searchClose  = document.getElementById('searchClose');
  const searchInput  = document.getElementById('searchInput');

  searchToggle?.addEventListener('click', () => {
    searchBar.classList.add('open');
    searchInput?.focus();
  });
  searchClose?.addEventListener('click', () => searchBar.classList.remove('open'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') searchBar?.classList.remove('open');
  });

  /* ── HAMBURGER ── */
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  hamburger?.addEventListener('click', () => navLinks?.classList.toggle('open'));

  /* ══════════════════════════════════════════════════
     CATEGORY TABS
  ══════════════════════════════════════════════════ */
  const catTabs  = document.querySelectorAll('.cat-tab');
  const spCards  = document.querySelectorAll('.sp-card');

  catTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      catTabs.forEach(t => t.classList.remove('cat-tab-active'));
      tab.classList.add('cat-tab-active');

      const cat = tab.dataset.cat;
      filterAndRender();
      // Scroll to top of grid
      document.getElementById('productGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* ══════════════════════════════════════════════════
     SIDEBAR FILTER TOGGLE (mobile drawer)
  ══════════════════════════════════════════════════ */
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const shopSidebar     = document.getElementById('shopSidebar');
  const sidebarClose    = document.getElementById('sidebarClose');
  const filterBackdrop  = document.getElementById('filterBackdrop');

  function openSidebar() {
    shopSidebar.classList.add('open');
    filterBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    shopSidebar.classList.remove('open');
    filterBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  filterToggleBtn?.addEventListener('click', () => {
    // On mobile → open drawer; on desktop → sidebar is always visible
    if (window.innerWidth <= 991) openSidebar();
  });
  sidebarClose?.addEventListener('click', closeSidebar);
  filterBackdrop?.addEventListener('click', closeSidebar);

  /* ══════════════════════════════════════════════════
     FILTER GROUP ACCORDION
  ══════════════════════════════════════════════════ */
  document.querySelectorAll('.filter-group-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const body     = btn.nextElementSibling;
      const chevron  = btn.querySelector('.filter-chevron');

      btn.setAttribute('aria-expanded', !expanded);
      if (expanded) {
        body.style.display = 'none';
        if (chevron) { chevron.classList.remove('fa-chevron-up'); chevron.classList.add('fa-chevron-down'); }
      } else {
        body.style.display = 'flex';
        if (chevron) { chevron.classList.remove('fa-chevron-down'); chevron.classList.add('fa-chevron-up'); }
      }
    });
  });

  /* ══════════════════════════════════════════════════
     SIZE PILLS TOGGLE
  ══════════════════════════════════════════════════ */
  document.querySelectorAll('.size-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      pill.classList.toggle('size-active');
      updateActiveFilters();
      filterAndRender();
    });
  });

  /* ══════════════════════════════════════════════════
     COLOUR SWATCHES TOGGLE
  ══════════════════════════════════════════════════ */
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      sw.classList.toggle('color-active');
      updateActiveFilters();
      filterAndRender();
    });
  });

  /* ══════════════════════════════════════════════════
     CHECKBOX FILTERS
  ══════════════════════════════════════════════════ */
  document.querySelectorAll('.filter-input').forEach(inp => {
    inp.addEventListener('change', () => {
      updateActiveFilters();
      filterAndRender();
    });
  });

  /* ══════════════════════════════════════════════════
     PRICE RANGE SLIDERS (dual-thumb)
  ══════════════════════════════════════════════════ */
  const sliderMin = document.getElementById('priceSliderMin');
  const sliderMax = document.getElementById('priceSliderMax');
  const priceMinLabel = document.getElementById('priceMin');
  const priceMaxLabel = document.getElementById('priceMax');

  function formatPrice(val) {
    return '₹' + Number(val).toLocaleString('en-IN');
  }

  function updatePriceTrack() {
    if (!sliderMin || !sliderMax) return;
    const min = parseInt(sliderMin.value);
    const max = parseInt(sliderMax.value);
    const range = parseInt(sliderMin.max) - parseInt(sliderMin.min);
    const leftPct  = ((min - parseInt(sliderMin.min)) / range) * 100;
    const rightPct = ((parseInt(sliderMax.max) - max) / range) * 100;
    // Visual track (injected inline, CSS can't handle dual thumb easily)
    sliderMin.style.background = `linear-gradient(to right, #e0d8d0 ${leftPct}%, var(--gold) ${leftPct}%, var(--gold) ${100 - rightPct}%, #e0d8d0 ${100 - rightPct}%)`;
    sliderMax.style.background = 'transparent';
    if (priceMinLabel) priceMinLabel.textContent = formatPrice(min);
    if (priceMaxLabel) priceMaxLabel.textContent = formatPrice(max);
  }

  sliderMin?.addEventListener('input', () => {
    if (parseInt(sliderMin.value) > parseInt(sliderMax.value) - 500) {
      sliderMin.value = parseInt(sliderMax.value) - 500;
    }
    updatePriceTrack();
    filterAndRender();
  });
  sliderMax?.addEventListener('input', () => {
    if (parseInt(sliderMax.value) < parseInt(sliderMin.value) + 500) {
      sliderMax.value = parseInt(sliderMin.value) + 500;
    }
    updatePriceTrack();
    filterAndRender();
  });
  updatePriceTrack();

  /* ══════════════════════════════════════════════════
     ACTIVE FILTER CHIPS
  ══════════════════════════════════════════════════ */
  const activeFiltersEl  = document.getElementById('activeFilters');
  const activeFiltersRow = document.getElementById('activeFiltersRow');
  const filterCountBadge = document.getElementById('filterCountBadge');
  const clearAllBtn      = document.getElementById('clearAllBtn');

  function updateActiveFilters() {
    const chips = [];

    // Checkboxes
    document.querySelectorAll('.filter-input:checked').forEach(inp => {
      chips.push({ label: inp.parentElement.textContent.trim().replace(/\d+/g, '').trim(), value: inp.value, type: inp.dataset.type });
    });

    // Sizes
    document.querySelectorAll('.size-pill.size-active').forEach(pill => {
      chips.push({ label: 'Size: ' + pill.dataset.size, value: pill.dataset.size, type: 'size' });
    });

    // Colors
    document.querySelectorAll('.color-swatch.color-active').forEach(sw => {
      chips.push({ label: sw.dataset.color, value: sw.dataset.color, type: 'color' });
    });

    // Price (only if changed from defaults)
    if (sliderMin && parseInt(sliderMin.value) > 500) {
      chips.push({ label: 'Min: ' + formatPrice(sliderMin.value), value: 'priceMin', type: 'price' });
    }
    if (sliderMax && parseInt(sliderMax.value) < 25000) {
      chips.push({ label: 'Max: ' + formatPrice(sliderMax.value), value: 'priceMax', type: 'price' });
    }

    // Render chips
    if (activeFiltersRow) {
      activeFiltersRow.innerHTML = chips.map(c => `
        <span class="af-chip" data-type="${c.type}" data-value="${c.value}">
          ${c.label}
          <button aria-label="Remove filter" onclick="removeFilter('${c.type}','${c.value}')">✕</button>
        </span>
      `).join('');
    }

    const count = chips.length;
    if (activeFiltersEl) activeFiltersEl.style.display = count > 0 ? 'block' : 'none';
    if (filterCountBadge) {
      filterCountBadge.textContent = count;
      filterCountBadge.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  // Expose removeFilter globally for inline onclick
  window.removeFilter = function(type, value) {
    if (type === 'size') {
      document.querySelector(`.size-pill[data-size="${value}"]`)?.classList.remove('size-active');
    } else if (type === 'color') {
      document.querySelector(`.color-swatch[data-color="${value}"]`)?.classList.remove('color-active');
    } else if (type === 'price') {
      if (value === 'priceMin' && sliderMin) { sliderMin.value = 500; }
      if (value === 'priceMax' && sliderMax) { sliderMax.value = 25000; }
      updatePriceTrack();
    } else {
      const inp = document.querySelector(`.filter-input[data-type="${type}"][value="${value}"]`);
      if (inp) inp.checked = false;
    }
    updateActiveFilters();
    filterAndRender();
  };

  clearAllBtn?.addEventListener('click', () => {
    document.querySelectorAll('.filter-input').forEach(i => i.checked = false);
    document.querySelectorAll('.size-pill').forEach(p => p.classList.remove('size-active'));
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('color-active'));
    if (sliderMin) sliderMin.value = 500;
    if (sliderMax) sliderMax.value = 25000;
    updatePriceTrack();
    catTabs.forEach(t => t.classList.remove('cat-tab-active'));
    document.querySelector('.cat-tab[data-cat="all"]')?.classList.add('cat-tab-active');
    updateActiveFilters();
    filterAndRender();
  });

  /* ══════════════════════════════════════════════════
     CORE FILTER + SORT + RENDER
  ══════════════════════════════════════════════════ */
  const resultCountEl = document.getElementById('resultCount');

  function filterAndRender() {
    const activeCat = document.querySelector('.cat-tab-active')?.dataset.cat || 'all';
    const checkedCats = [...document.querySelectorAll('.filter-input[data-type="category"]:checked')].map(i => i.value);
    const minPrice = sliderMin ? parseInt(sliderMin.value) : 0;
    const maxPrice = sliderMax ? parseInt(sliderMax.value) : 999999;

    let visible = 0;
    spCards.forEach(card => {
      const cardCat     = card.dataset.cat;
      const cardPrice   = parseInt(card.dataset.price) || 0;
      const cardDisc    = parseInt(card.dataset.discount) || 0;

      // Category tab filter
      const passTab = activeCat === 'all' || cardCat === activeCat ||
                      (activeCat === 'sale' && cardDisc >= 30);

      // Sidebar category checkboxes
      const passCheck = checkedCats.length === 0 || checkedCats.includes(cardCat);

      // Price
      const passPrice = cardPrice >= minPrice && cardPrice <= maxPrice;

      // Discount filter (radio)
      const checkedDisc = document.querySelector('input[name="discount"]:checked');
      const passDisc = !checkedDisc || cardDisc >= parseInt(checkedDisc.value);

      const show = passTab && passCheck && passPrice && passDisc;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (resultCountEl) resultCountEl.textContent = visible + ' Products';
    currentPage = 1;
    renderPagination(visible);
  }

  /* ══════════════════════════════════════════════════
     SORT
  ══════════════════════════════════════════════════ */
  const sortSelect = document.getElementById('sortSelect');
  sortSelect?.addEventListener('change', () => {
    const val = sortSelect.value;
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll('.sp-card')];

    cards.sort((a, b) => {
      const pa = parseInt(a.dataset.price) || 0;
      const pb = parseInt(b.dataset.price) || 0;
      const da = parseInt(a.dataset.discount) || 0;
      const db = parseInt(b.dataset.discount) || 0;
      if (val === 'price-asc')  return pa - pb;
      if (val === 'price-desc') return pb - pa;
      if (val === 'discount')   return db - da;
      return 0;
    });

    cards.forEach(c => grid.appendChild(c));
  });

  /* ══════════════════════════════════════════════════
     GRID VIEW TOGGLE (3 / 4 columns)
  ══════════════════════════════════════════════════ */
  const grid3Btn = document.getElementById('grid3Btn');
  const grid4Btn = document.getElementById('grid4Btn');
  const productGrid = document.getElementById('productGrid');

  grid3Btn?.addEventListener('click', () => {
    productGrid?.classList.replace('grid-4', 'grid-3');
    grid3Btn.classList.add('grid-btn-active');
    grid4Btn?.classList.remove('grid-btn-active');
  });
  grid4Btn?.addEventListener('click', () => {
    productGrid?.classList.replace('grid-3', 'grid-4');
    grid4Btn.classList.add('grid-btn-active');
    grid3Btn?.classList.remove('grid-btn-active');
  });

  /* ══════════════════════════════════════════════════
     PAGINATION
  ══════════════════════════════════════════════════ */
  let currentPage  = 1;
  const perPageBtns = document.querySelectorAll('.per-page-btn');
  let perPage = 12;

  perPageBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      perPageBtns.forEach(b => b.classList.remove('per-page-active'));
      btn.classList.add('per-page-active');
      perPage = parseInt(btn.dataset.pp);
      renderPagination(parseInt(document.getElementById('resultCount')?.textContent) || 152);
    });
  });

  function renderPagination(total) {
    const totalPages = Math.ceil(total / perPage);
    const pgWrap     = document.getElementById('paginationWrap');
    const pgInfo     = document.getElementById('paginationInfo');
    const pgPrev     = document.getElementById('pgPrev');
    const pgNext     = document.getElementById('pgNext');

    if (pgInfo) {
      const start = (currentPage - 1) * perPage + 1;
      const end   = Math.min(currentPage * perPage, total);
      pgInfo.textContent = total > 0
        ? `Showing ${start}–${end} of ${total} products`
        : 'No products found';
    }

    if (pgPrev) pgPrev.disabled = currentPage === 1;
    if (pgNext) pgNext.disabled = currentPage >= totalPages;

    // Re-build page number buttons
    const nav = document.querySelector('.pagination');
    if (!nav) return;
    nav.querySelectorAll('.pg-num, .pg-ellipsis').forEach(el => el.remove());

    // Generate page numbers: always show 1, current-1, current, current+1, totalPages
    const pages = new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]);
    const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);

    let last = 0;
    sorted.forEach(p => {
      if (last && p - last > 1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pg-ellipsis';
        ellipsis.textContent = '…';
        pgNext.before(ellipsis);
      }
      const btn = document.createElement('button');
      btn.className = 'pg-num' + (p === currentPage ? ' pg-active' : '');
      btn.dataset.page = p;
      btn.textContent = p;
      btn.addEventListener('click', () => goPage(p, total));
      pgNext.before(btn);
      last = p;
    });
  }

  function goPage(page, total) {
    currentPage = page;
    renderPagination(total);
    document.getElementById('productGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('pgPrev')?.addEventListener('click', () => {
    if (currentPage > 1) goPage(currentPage - 1, parseInt(resultCountEl?.textContent) || 152);
  });
  document.getElementById('pgNext')?.addEventListener('click', () => {
    goPage(currentPage + 1, parseInt(resultCountEl?.textContent) || 152);
  });

  renderPagination(152);

  /* ══════════════════════════════════════════════════
     WISHLIST TOGGLE ON CARDS
  ══════════════════════════════════════════════════ */
  document.querySelectorAll('.sp-wish').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const icon = btn.querySelector('i');
      btn.classList.toggle('active');
      if (btn.classList.contains('active')) {
        icon?.classList.replace('fa-heart', 'fa-heart');
        icon?.classList.remove('far');
        icon?.classList.add('fas');
        btn.style.color = '#e05555';
      } else {
        icon?.classList.remove('fas');
        icon?.classList.add('far');
        btn.style.color = '';
      }
    });
  });

  /* ══════════════════════════════════════════════════
     QUICK VIEW MODAL
  ══════════════════════════════════════════════════ */
  const qvBackdrop = document.getElementById('qvBackdrop');
  const qvClose    = document.getElementById('qvClose');
  const qvModal    = document.getElementById('qvModal');

  function openQuickView(card) {
    // Populate modal with card data
    const name  = card.querySelector('.sp-name')?.textContent || '';
    const cat   = card.querySelector('.sp-category')?.textContent || '';
    const price = card.querySelector('.sp-price')?.textContent || '';
    const mrp   = card.querySelector('.sp-mrp')?.textContent || '';
    const off   = card.querySelector('.sp-off')?.textContent || '';
    const img   = card.querySelector('.sp-img-wrap img')?.src || '';

    if (document.getElementById('qvImg'))    document.getElementById('qvImg').src = img;
    if (qvModal?.querySelector('.qv-title')) qvModal.querySelector('.qv-title').textContent = name;
    if (qvModal?.querySelector('.qv-cat'))   qvModal.querySelector('.qv-cat').textContent = cat;
    if (qvModal?.querySelector('.qv-price')) qvModal.querySelector('.qv-price').textContent = price;
    if (qvModal?.querySelector('.qv-mrp'))   qvModal.querySelector('.qv-mrp').textContent = mrp;
    if (qvModal?.querySelector('.qv-off'))   qvModal.querySelector('.qv-off').textContent = off;

    qvBackdrop?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeQuickView() {
    qvBackdrop?.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.sp-quick-view').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openQuickView(btn.closest('.sp-card'));
    });
  });
  qvClose?.addEventListener('click', closeQuickView);
  qvBackdrop?.addEventListener('click', e => {
    if (e.target === qvBackdrop) closeQuickView();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeQuickView();
  });

  // Quick-view thumbnail switcher
  document.querySelectorAll('.qv-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.querySelectorAll('.qv-thumb').forEach(t => t.classList.remove('qv-thumb-active'));
      thumb.classList.add('qv-thumb-active');
      const src = thumb.querySelector('img')?.src;
      if (src && document.getElementById('qvImg')) document.getElementById('qvImg').src = src;
    });
  });

  // Quick-view quantity
  const qvQtyVal   = document.getElementById('qvQtyVal');
  const qvQtyMinus = document.getElementById('qvQtyMinus');
  const qvQtyPlus  = document.getElementById('qvQtyPlus');
  let qvQty = 1;

  qvQtyMinus?.addEventListener('click', () => {
    if (qvQty > 1) { qvQty--; if (qvQtyVal) qvQtyVal.textContent = qvQty; }
  });
  qvQtyPlus?.addEventListener('click', () => {
    qvQty++;
    if (qvQtyVal) qvQtyVal.textContent = qvQty;
  });

  // Quick-view size buttons
  document.querySelectorAll('.qv-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.qv-size-btn').forEach(b => b.classList.remove('qv-size-active'));
      btn.classList.add('qv-size-active');
    });
  });

  /* ══════════════════════════════════════════════════
     ADD TO CART TOAST (visual feedback)
  ══════════════════════════════════════════════════ */
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
      background:var(--text-dark); color:#fff;
      padding:12px 28px; border-radius:100px;
      font-size:13px; font-weight:500; letter-spacing:0.3px;
      z-index:999; box-shadow:0 8px 24px rgba(0,0,0,0.18);
      animation: toastIn 0.35s ease both;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  document.querySelectorAll('.sp-add-cart, .qv-btn-cart').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showToast('Added to cart');
      const badge = document.querySelector('.cart-badge');
      if (badge) badge.textContent = parseInt(badge.textContent || '0') + 1;
    });
  });

}); // DOMContentLoaded
