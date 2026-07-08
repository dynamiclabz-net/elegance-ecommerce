/* ═══════════════════════════════════════════════════════════════
   ELEGANCE — Cart Page JS
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── CART STATE ──
     Each item: { id, price, qty, name }
  ─────────────────────────────────────── */
  const cartState = {
    items: [
      { id: '1', price: 4250, qty: 1, name: 'Ivory Embroidered Anarkali Set' },
      { id: '2', price: 2890, qty: 2, name: 'Rose Gold Co-ord Sharara Set' },
      { id: '3', price: 3750, qty: 1, name: 'Marigold Printed Salwar Suit' },
    ],
    couponDiscount: 0,
    couponCode: '',
    stitching: 500,
    appliedCoupon: null,
  };

  const VALID_COUPONS = {
    'ELEGANCE10': { type: 'percent', value: 10 },
    'FIRST20':    { type: 'percent', value: 20 },
    'FESTIVE15':  { type: 'percent', value: 15 },
    'FLAT500':    { type: 'flat',    value: 500 },
  };

  const FREE_SHIPPING_THRESHOLD = 2999;

  /* ─── DOM refs ─── */
  const cartItemsList   = document.getElementById('cartItemsList');
  const emptyCart       = document.getElementById('emptyCart');
  const cartGrid        = document.getElementById('cartGrid');
  const cartCountLabel  = document.getElementById('cartCountLabel');
  const cartBadge       = document.getElementById('cartBadge');
  const csItemCount     = document.getElementById('csItemCount');
  const breakdownCount  = document.getElementById('breakdownCount');
  const subtotalVal     = document.getElementById('subtotalVal');
  const discountVal     = document.getElementById('discountVal');
  const couponRow       = document.getElementById('couponRow');
  const couponAppliedCode = document.getElementById('couponAppliedCode');
  const couponDiscVal   = document.getElementById('couponDiscVal');
  const stitchingVal    = document.getElementById('stitchingVal');
  const deliveryVal     = document.getElementById('deliveryVal');
  const totalVal        = document.getElementById('totalVal');
  const savingsAmt      = document.getElementById('savingsAmt');
  const csSavingsPill   = document.getElementById('csSavingsPill');
  const fsbMsg          = document.getElementById('fsbMsg');
  const fsbFill         = document.getElementById('fsbFill');
  const fsbAmt          = document.getElementById('fsbAmt');
  const freeShippingBar = document.getElementById('freeShippingBar');
  const removeOverlay   = document.getElementById('removeOverlay');
  const rmProductName   = document.getElementById('rmProductName');
  const rmConfirm       = document.getElementById('rmConfirm');
  const rmCancel        = document.getElementById('rmCancel');
  const cartToast       = document.getElementById('cartToast');
  const cartToastMsg    = document.getElementById('cartToastMsg');

  let pendingRemoveId = null;

  /* ═══════════════════════════════
     SUMMARY CALCULATIONS
  ═══════════════════════════════ */
  function fmt(n) {
    return '₹' + n.toLocaleString('en-IN');
  }

  function getMRPMultiplier(id) {
    const mrpMap = { '1': 6500, '2': 4200, '3': 5500 };
    return mrpMap[id] || 0;
  }

  function calcTotals() {
    const totalQty = cartState.items.reduce((s, i) => s + i.qty, 0);
    const subtotal = cartState.items.reduce((s, i) => s + i.price * i.qty, 0);
    const totalMRP = cartState.items.reduce((s, i) => s + getMRPMultiplier(i.id) * i.qty, 0);
    const productDiscount = totalMRP - subtotal;

    let couponDisc = 0;
    if (cartState.appliedCoupon) {
      const c = VALID_COUPONS[cartState.appliedCoupon];
      if (c.type === 'percent') couponDisc = Math.round(subtotal * c.value / 100);
      else couponDisc = c.value;
    }

    const delivery = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : 99;
    const total = subtotal - couponDisc + cartState.stitching + delivery;
    const totalSavings = productDiscount + couponDisc + (delivery === 0 ? 99 : 0);

    return { totalQty, subtotal, totalMRP, productDiscount, couponDisc, delivery, total, totalSavings };
  }

  function updateSummaryDOM() {
    const t = calcTotals();

    // Counts
    const label = t.totalQty === 1 ? '1 item' : `${t.totalQty} items`;
    if (cartCountLabel) cartCountLabel.textContent = label;
    if (csItemCount)    csItemCount.textContent = label;
    if (breakdownCount) breakdownCount.textContent = t.totalQty;
    if (cartBadge)      cartBadge.textContent = t.totalQty;

    if (subtotalVal)  subtotalVal.textContent  = fmt(t.subtotal);
    if (discountVal)  discountVal.textContent  = '−' + fmt(t.productDiscount);
    if (stitchingVal) stitchingVal.textContent = fmt(cartState.stitching);
    if (deliveryVal)  {
      deliveryVal.textContent = t.delivery === 0 ? 'FREE' : fmt(t.delivery);
      deliveryVal.classList.toggle('cs-green', t.delivery === 0);
    }
    if (totalVal) totalVal.textContent = fmt(t.total);
    if (savingsAmt) savingsAmt.textContent = fmt(t.totalSavings);
    if (csSavingsPill) csSavingsPill.style.display = t.totalSavings > 0 ? 'flex' : 'none';

    // Coupon row
    if (cartState.appliedCoupon) {
      couponRow.style.display = 'flex';
      couponAppliedCode.textContent = cartState.appliedCoupon;
      couponDiscVal.textContent = '−' + fmt(t.couponDisc);
    } else {
      couponRow.style.display = 'none';
    }

    // Free shipping bar
    updateShippingBar(t.subtotal);

    // Toggle empty / cart
    const isEmpty = cartState.items.length === 0;
    if (cartGrid)  cartGrid.style.display  = isEmpty ? 'none' : '';
    if (emptyCart) emptyCart.style.display = isEmpty ? 'block' : 'none';
  }

  function updateShippingBar(subtotal) {
    if (!fsbFill || !fsbMsg) return;
    if (subtotal >= FREE_SHIPPING_THRESHOLD) {
      fsbMsg.innerHTML = '<i class="fas fa-truck"></i> &nbsp;You\'ve unlocked <strong>Free Shipping!</strong> 🎉';
      fsbFill.style.width = '100%';
      if (freeShippingBar) freeShippingBar.style.background = 'linear-gradient(90deg,rgba(42,125,79,0.07),rgba(42,125,79,0.04))';
    } else {
      const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
      const pct = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);
      fsbMsg.innerHTML = `<i class="fas fa-truck"></i> Add <strong>₹${remaining.toLocaleString('en-IN')}</strong> more for free shipping!`;
      fsbFill.style.width = pct + '%';
      if (freeShippingBar) freeShippingBar.style.background = '';
    }
  }

  /* ═══════════════════════════════
     QTY STEPPER
  ═══════════════════════════════ */
  function bindQtySteppers() {
    document.querySelectorAll('.qty-inc').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = cartState.items.find(i => i.id === id);
        if (!item) return;
        item.qty++;
        document.getElementById(`qty-${id}`).textContent = item.qty;
        updateSummaryDOM();
        animateQty(id, 'up');
      });
    });
    document.querySelectorAll('.qty-dec').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = cartState.items.find(i => i.id === id);
        if (!item) return;
        if (item.qty <= 1) {
          triggerRemove(id, item.name);
          return;
        }
        item.qty--;
        document.getElementById(`qty-${id}`).textContent = item.qty;
        updateSummaryDOM();
        animateQty(id, 'down');
      });
    });
  }

  function animateQty(id, dir) {
    const el = document.getElementById(`qty-${id}`);
    if (!el) return;
    el.style.transform = `translateY(${dir === 'up' ? '-5px' : '5px'})`;
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.2s, opacity 0.2s';
        el.style.transform = 'translateY(0)';
        el.style.opacity = '1';
      });
    });
    setTimeout(() => { el.style.transition = ''; }, 220);
  }

  /* ═══════════════════════════════
     REMOVE FLOW
  ═══════════════════════════════ */
  function triggerRemove(id, name) {
    pendingRemoveId = id;
    if (rmProductName) rmProductName.textContent = name;
    removeOverlay.classList.add('visible');
  }

  rmConfirm?.addEventListener('click', () => {
    if (!pendingRemoveId) return;
    const card = document.querySelector(`.cart-item[data-id="${pendingRemoveId}"]`);
    if (card) {
      card.classList.add('removing');
      card.addEventListener('animationend', () => {
        card.remove();
        cartState.items = cartState.items.filter(i => i.id !== pendingRemoveId);
        pendingRemoveId = null;
        updateSummaryDOM();
      }, { once: true });
    }
    removeOverlay.classList.remove('visible');
    showToast('Item removed from cart.');
  });

  rmCancel?.addEventListener('click', () => {
    removeOverlay.classList.remove('visible');
    pendingRemoveId = null;
  });
  removeOverlay?.addEventListener('click', (e) => {
    if (e.target === removeOverlay) {
      removeOverlay.classList.remove('visible');
      pendingRemoveId = null;
    }
  });

  function bindRemoveBtns() {
    document.querySelectorAll('.ci-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.cart-item');
        const id   = card?.dataset.id;
        const name = card?.dataset.name;
        if (id) triggerRemove(id, name);
      });
    });
  }

  /* ═══════════════════════════════
     WISHLIST SAVE
  ═══════════════════════════════ */
  function bindWishlistBtns() {
    document.querySelectorAll('.ci-wishlist').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.cart-item');
        const name = card?.dataset.name || 'Item';
        const id   = card?.dataset.id;
        btn.innerHTML = '<i class="fas fa-heart" style="color:var(--gold)"></i> Saved';
        btn.style.color = 'var(--gold)';
        showToast(`"${name}" saved to wishlist.`);
        // remove after short delay
        setTimeout(() => {
          if (card) {
            card.classList.add('removing');
            card.addEventListener('animationend', () => {
              card.remove();
              cartState.items = cartState.items.filter(i => i.id !== id);
              updateSummaryDOM();
            }, { once: true });
          }
        }, 900);
      });
    });
  }

  /* ═══════════════════════════════
     COUPON
  ═══════════════════════════════ */
  const couponInput    = document.getElementById('couponInput');
  const couponApplyBtn = document.getElementById('couponApplyBtn');
  const couponMsg      = document.getElementById('couponMsg');

  function applyCoupon(code) {
    const c = VALID_COUPONS[code.toUpperCase().trim()];
    if (!c) {
      couponMsg.textContent = 'Invalid coupon code. Try ELEGANCE10';
      couponMsg.className = 'coupon-msg error';
      cartState.appliedCoupon = null;
    } else {
      cartState.appliedCoupon = code.toUpperCase().trim();
      const t = calcTotals();
      couponMsg.textContent = `Coupon applied! You save ${fmt(t.couponDisc)}.`;
      couponMsg.className = 'coupon-msg success';
      couponApplyBtn.textContent = 'Applied ✓';
      couponApplyBtn.style.background = '#2a7d4f';
    }
    updateSummaryDOM();
    setTimeout(() => { couponMsg.textContent = ''; }, 4000);
  }

  couponApplyBtn?.addEventListener('click', () => {
    const code = couponInput?.value;
    if (!code?.trim()) {
      couponMsg.textContent = 'Please enter a coupon code.';
      couponMsg.className = 'coupon-msg error';
      return;
    }
    applyCoupon(code);
  });
  couponInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.nativeEvent?.isComposing) applyCoupon(couponInput.value);
  });

  // Coupon chips
  document.querySelectorAll('.coupon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (couponInput) couponInput.value = chip.dataset.code;
      applyCoupon(chip.dataset.code);
    });
  });

  /* ═══════════════════════════════
     PINCODE CHECK
  ═══════════════════════════════ */
  const pincodeInput = document.getElementById('pincodeInput');
  const deCheckBtn   = document.getElementById('deCheckBtn');
  const deResult     = document.getElementById('deResult');
  const dePincode    = document.getElementById('dePincode');

  deCheckBtn?.addEventListener('click', checkPincode);
  pincodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.nativeEvent?.isComposing) checkPincode();
  });

  function checkPincode() {
    const val = pincodeInput?.value?.trim();
    if (!val || val.length < 6) {
      deResult.textContent = 'Please enter a valid 6-digit pincode.';
      deResult.style.color = '#c0392b';
      return;
    }
    deCheckBtn.textContent = 'Checking...';
    setTimeout(() => {
      deCheckBtn.textContent = 'Check';
      dePincode.textContent = val;
      deResult.textContent = `Estimated delivery in 3–5 working days. Express available.`;
      deResult.style.color = '#2a7d4f';
    }, 900);
  }

  /* ═══════════════════════════════
     UPSELL CAROUSEL
  ═══════════════════════════════ */
  const upsellTrack = document.getElementById('upsellTrack');
  const upsellPrev  = document.getElementById('upsellPrev');
  const upsellNext  = document.getElementById('upsellNext');

  upsellNext?.addEventListener('click', () => {
    upsellTrack.scrollBy({ left: 210, behavior: 'smooth' });
  });
  upsellPrev?.addEventListener('click', () => {
    upsellTrack.scrollBy({ left: -210, behavior: 'smooth' });
  });

  // Add to cart from upsell
  document.querySelectorAll('.uc-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const name  = btn.dataset.name;
      const price = parseInt(btn.dataset.price, 10);
      const newId = 'u' + Date.now();
      cartState.items.push({ id: newId, price, qty: 1, name });
      showToast(`"${name}" added to cart!`);
      updateSummaryDOM();
      btn.innerHTML = '<i class="fas fa-check"></i> Added!';
      btn.style.background = '#2a7d4f';
      setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-plus"></i> Add';
        btn.style.background = '';
      }, 2500);
    });
  });

  // Wishlist in upsell
  document.querySelectorAll('.uc-wish').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.innerHTML = '<i class="fas fa-heart"></i>';
      btn.style.color = '#c0392b';
      showToast('Saved to wishlist!');
    });
  });

  /* ═══════════════════════════════
     CHECKOUT BUTTON
  ═══════════════════════════════ */
  const checkoutBtn = document.getElementById('checkoutBtn');
  checkoutBtn?.addEventListener('click', () => {
    checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing…';
    checkoutBtn.disabled = true;
    setTimeout(() => {
      checkoutBtn.innerHTML = '<span>Proceed to Checkout</span><i class="fas fa-arrow-right"></i>';
      checkoutBtn.disabled = false;
      showToast('Redirecting to checkout…');
    }, 1800);
  });

  /* ═══════════════════════════════
     TOAST
  ═══════════════════════════════ */
  let toastTimer;
  function showToast(msg) {
    clearTimeout(toastTimer);
    if (cartToastMsg) cartToastMsg.textContent = msg;
    cartToast.classList.add('show');
    toastTimer = setTimeout(() => cartToast.classList.remove('show'), 3000);
  }

  /* ═══════════════════════════════
     INIT
  ═══════════════════════════════ */
  bindQtySteppers();
  bindRemoveBtns();
  bindWishlistBtns();
  updateSummaryDOM();

});
