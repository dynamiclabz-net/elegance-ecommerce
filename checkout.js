/* ═══════════════════════════════════════════════════════════════
   ELEGANCE — Checkout Page JS
   ═══════════════════════════════════════════════════════════════ */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. NAV SCROLL SHADOW ── */
  const nav = document.getElementById('checkoutNav');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  /* ── 2. STEP NAVIGATION ── */
  let currentStep = 2;

  const steps = {
    2: document.getElementById('checkoutStep2'),
    3: document.getElementById('checkoutStep3'),
    4: document.getElementById('checkoutStep4'),
    5: document.getElementById('checkoutStep5'),
  };

  function goToStep(n) {
    // Hide current, show new
    Object.values(steps).forEach(el => el?.classList.add('d-none'));
    steps[n]?.classList.remove('d-none');

    // Update progress bar
    for (let i = 2; i <= 5; i++) {
      const item   = document.querySelector(`[data-step="${i}"]`);
      const circle = item?.querySelector('.step-circle');
      if (!item) continue;
      item.classList.remove('step-active', 'step-complete', 'step-done');
      if (i < n) {
        item.classList.add('step-complete');
        if (circle) circle.innerHTML = '<i class="fas fa-check"></i>';
      } else if (i === n) {
        item.classList.add('step-active');
        if (circle) circle.textContent = i === 5 ? '✓' : i;
      } else {
        if (circle) circle.textContent = i;
      }
    }
    // Update connecting lines
    const line23 = document.getElementById('line2-3');
    const line34 = document.getElementById('line3-4');
    const line45 = document.getElementById('line4-5');
    if (line23) line23.classList.toggle('step-line-done', n > 3);
    if (line34) line34.classList.toggle('step-line-done', n > 4);
    if (line45) line45.classList.toggle('step-line-done', n > 5);

    currentStep = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Step 2 → 3
  document.getElementById('toStep3Btn')?.addEventListener('click', () => {
    if (validateAddressStep()) goToStep(3);
  });

  // Step 3 → 4
  document.getElementById('toStep4Btn')?.addEventListener('click', () => goToStep(4));

  // Step 4 → 5
  document.getElementById('placeOrderBtn')?.addEventListener('click', () => {
    goToStep(5);
    launchConfetti();
  });

  // Back buttons
  document.getElementById('backToStep2Btn')?.addEventListener('click', () => goToStep(2));
  document.getElementById('backToStep3Btn')?.addEventListener('click', () => goToStep(3));

  // Cart link
  document.getElementById('changeAddrBtn')?.addEventListener('click', () => goToStep(2));

  /* ── 3. ADDRESS FORM TOGGLE ── */
  const addrFormWrap = document.getElementById('addrFormWrap');
  const addNewBtn    = document.getElementById('addNewAddrBtn');
  const cancelBtn    = document.getElementById('addrFormCancel');

  addNewBtn?.addEventListener('click', () => {
    addrFormWrap?.classList.add('open');
    addNewBtn.style.display = 'none';
    addrFormWrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  cancelBtn?.addEventListener('click', () => {
    addrFormWrap?.classList.remove('open');
    addNewBtn.style.display = '';
  });

  /* ── 4. SAVED ADDRESS SELECTION ── */
  document.querySelectorAll('.saved-addr-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.saved-addr-card').forEach(c => c.classList.remove('saved-addr-selected'));
      card.classList.add('saved-addr-selected');
    });
  });

  /* ── 5. ADDRESS TYPE BUTTONS ── */
  document.querySelectorAll('.addr-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.addr-type-btn').forEach(b => b.classList.remove('addr-type-active'));
      btn.classList.add('addr-type-active');
    });
  });

  /* ── 6. PINCODE AUTO-FILL ── */
  const pincodeInput = document.getElementById('pincode');
  const cityInput    = document.getElementById('city');
  const stateSelect  = document.getElementById('state');
  const pinLoading   = document.getElementById('pinLoading');
  const pinTick      = document.getElementById('pinTick');

  const pincodeMap = {
    '380015': { city: 'Ahmedabad', state: 'GJ' },
    '380051': { city: 'Ahmedabad', state: 'GJ' },
    '400001': { city: 'Mumbai',    state: 'MH' },
    '302001': { city: 'Jaipur',    state: 'RJ' },
    '110001': { city: 'New Delhi', state: 'DL' },
    '560001': { city: 'Bangalore', state: 'KA' },
    '600001': { city: 'Chennai',   state: 'TN' },
    '700001': { city: 'Kolkata',   state: 'WB' },
    '226001': { city: 'Lucknow',   state: 'UP' },
  };

  pincodeInput?.addEventListener('input', () => {
    const val = pincodeInput.value.replace(/\D/g, '');
    pincodeInput.value = val;
    if (val.length === 6) {
      if (pinLoading) pinLoading.style.display = 'flex';
      if (pinTick)    pinTick.style.opacity = '0';
      setTimeout(() => {
        if (pinLoading) pinLoading.style.display = 'none';
        if (pincodeMap[val]) {
          cityInput.value   = pincodeMap[val].city;
          stateSelect.value = pincodeMap[val].state;
          pincodeInput.classList.add('input-valid');
          if (pinTick) { pinTick.style.opacity = '1'; }
        } else {
          pincodeInput.classList.remove('input-valid');
          pincodeInput.classList.add('input-invalid');
        }
      }, 600);
    } else {
      pincodeInput.classList.remove('input-valid', 'input-invalid');
      if (pinTick) pinTick.style.opacity = '0';
    }
  });

  /* ── 7. INLINE FORM VALIDATION ── */
  function validateField(input) {
    const wrap = input.closest('.form-field-wrap');
    if (!wrap) return true;
    const isValid = input.checkValidity() && input.value.trim() !== '';
    wrap.classList.toggle('has-error', !isValid);
    input.classList.toggle('input-valid', isValid);
    input.classList.toggle('input-invalid', !isValid);
    return isValid;
  }

  document.querySelectorAll('#addrForm .form-input').forEach(input => {
    input.addEventListener('blur', () => validateField(input));
  });

  function validateAddressStep() {
    // If form is open, validate it; otherwise assume saved address selected
    if (addrFormWrap?.classList.contains('open')) {
      const fields = addrFormWrap.querySelectorAll('[required]');
      let allValid = true;
      fields.forEach(f => { if (!validateField(f)) allValid = false; });
      return allValid;
    }
    return true;
  }

  /* ── 8. PHONE / CARD NUMBER FORMATTING ── */
  document.getElementById('phone')?.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });

  const cardNumInput = document.getElementById('cardNum');
  const previewNum   = document.getElementById('previewCardNum');
  const cardTypeBadge = document.getElementById('cardTypeBadge');
  const previewCardName = document.getElementById('previewCardName');
  const previewCardExp  = document.getElementById('previewCardExp');

  cardNumInput?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
    if (previewNum) {
      const display = v.padEnd(16, '•');
      previewNum.textContent = display.replace(/(.{4})/g, '$1 ').trim();
    }
    // Detect card type
    if (v.startsWith('4')) {
      cardTypeBadge.innerHTML = '<i class="fab fa-cc-visa" style="color:#1a1f71;font-size:24px;"></i>';
    } else if (/^5[1-5]/.test(v) || /^2[2-7]/.test(v)) {
      cardTypeBadge.innerHTML = '<i class="fab fa-cc-mastercard" style="color:#eb001b;font-size:24px;"></i>';
    } else if (/^3[47]/.test(v)) {
      cardTypeBadge.innerHTML = '<i class="fab fa-cc-amex" style="color:#2e77bc;font-size:24px;"></i>';
    } else {
      cardTypeBadge.innerHTML = '';
    }
  });

  document.getElementById('cardName')?.addEventListener('input', e => {
    if (previewCardName) previewCardName.textContent = e.target.value.toUpperCase() || 'YOUR NAME';
  });

  document.getElementById('cardExp')?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0,2) + ' / ' + v.slice(2);
    e.target.value = v;
    if (previewCardExp) previewCardExp.textContent = v || 'MM / YY';
  });

  /* ── 9. CVV TOGGLE ── */
  document.getElementById('cvvToggle')?.addEventListener('click', () => {
    const input = document.getElementById('cardCvv');
    const icon  = document.querySelector('#cvvToggle i');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon?.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
      input.type = 'password';
      icon?.classList.replace('fa-eye-slash', 'fa-eye');
    }
  });

  /* ── 10. CVV TOOLTIP ── */
  const cvvTooltip = document.getElementById('cvvTooltip');
  document.getElementById('cvvHelpBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cvvTooltip?.classList.toggle('d-none');
  });
  document.addEventListener('click', () => cvvTooltip?.classList.add('d-none'));

  /* ── 11. PAYMENT TABS ── */
  document.querySelectorAll('.pay-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('pay-tab-active'));
      document.querySelectorAll('.pay-panel').forEach(p => p.classList.add('d-none'));
      tab.classList.add('pay-tab-active');
      const panelId = `panel-${tab.dataset.pay}`;
      document.getElementById(panelId)?.classList.remove('d-none');

      // Update total for COD fee
      const codRow = document.getElementById('codRow');
      if (tab.dataset.pay === 'cod') {
        if (codRow) codRow.style.display = 'flex';
      } else {
        if (codRow) codRow.style.display = 'none';
      }
    });
  });

  /* ── 12. UPI — NEW ID TOGGLE ── */
  document.querySelectorAll('input[name="upiChoice"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.upi-saved-option').forEach(o => o.classList.remove('upi-saved-selected'));
      r.closest('.upi-saved-option')?.classList.add('upi-saved-selected');
      const newUpiWrap = document.getElementById('newUpiWrap');
      if (r.value === 'new') {
        newUpiWrap?.classList.remove('d-none');
      } else {
        newUpiWrap?.classList.add('d-none');
      }
    });
  });

  /* ── 13. UPI VERIFY BUTTON ── */
  document.getElementById('upiVerifyBtn')?.addEventListener('click', () => {
    const input = document.getElementById('newUpiId');
    if (!input?.value.trim()) return;
    const btn = document.getElementById('upiVerifyBtn');
    btn.textContent = '...';
    setTimeout(() => {
      btn.textContent = '✓ Valid';
      btn.style.background = '#2e7d32';
      input.classList.add('input-valid');
    }, 900);
  });

  /* ── 14. SHIPPING OPTION SELECTION ── */
  document.querySelectorAll('.shipping-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.shipping-option').forEach(o => o.classList.remove('shipping-option-selected'));
      opt.classList.add('shipping-option-selected');
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;

      // Update shipping cost in summary
      const shippingRow = document.getElementById('shippingUpgradeRow');
      const shippingAmt = document.getElementById('shippingUpgradeAmt');
      const val = radio?.value;
      if (shippingRow) {
        if (val === 'express') {
          shippingRow.style.display = 'flex';
          if (shippingAmt) shippingAmt.textContent = '₹149';
        } else if (val === 'sameday') {
          shippingRow.style.display = 'flex';
          if (shippingAmt) shippingAmt.textContent = '₹299';
        } else {
          shippingRow.style.display = 'none';
        }
      }
    });
  });

  /* ── 15. GIFT WRAP ── */
  document.getElementById('giftWrapCheck')?.addEventListener('change', e => {
    const wrap = document.getElementById('giftMsgWrap');
    wrap?.classList.toggle('d-none', !e.target.checked);
    const giftRow = document.getElementById('giftWrapRow');
    if (giftRow) giftRow.style.display = e.target.checked ? 'flex' : 'none';
  });

  // Gift message char counter
  document.querySelector('.gift-msg-input')?.addEventListener('input', e => {
    const count = document.getElementById('giftCharCount');
    if (count) count.textContent = e.target.value.length;
  });

  /* ── 16. COD PIN CHECK ── */
  document.getElementById('codCheckBtn')?.addEventListener('click', () => {
    const pin = document.getElementById('codPin')?.value;
    const msg = document.getElementById('codAvailMsg');
    if (pin?.length === 6 && msg) {
      msg.textContent = `✓ COD available at ${pin}`;
      msg.classList.remove('d-none');
    }
  });

  /* ── 17. COUPON CODE (SUMMARY SIDEBAR) ── */
  const validCoupons = { ELEGANCE10: 10, FIRST20: 20, FESTIVE15: 15 };
  let appliedCoupon = 'ELEGANCE10'; // pre-applied

  function applyCoupon(code) {
    const upper = code.toUpperCase().trim();
    if (validCoupons[upper]) {
      appliedCoupon = upper;
      document.getElementById('couponInputRow')?.classList.add('d-none');
      document.getElementById('couponAppliedRow')?.classList.remove('d-none');
      document.getElementById('couponAppliedRow').querySelector('strong').textContent = upper;
      document.getElementById('couponSuggestions')?.classList.add('d-none');
      updateTotal();
      return true;
    }
    return false;
  }

  function removeCoupon() {
    appliedCoupon = null;
    document.getElementById('couponInputRow')?.classList.remove('d-none');
    document.getElementById('couponAppliedRow')?.classList.add('d-none');
    document.getElementById('couponSuggestions')?.classList.remove('d-none');
    const input = document.getElementById('summCouponInput');
    if (input) input.value = '';
    updateTotal();
  }

  document.getElementById('summCouponApply')?.addEventListener('click', () => {
    const code = document.getElementById('summCouponInput')?.value;
    if (!applyCoupon(code)) {
      const input = document.getElementById('summCouponInput');
      input?.classList.add('input-invalid');
      setTimeout(() => input?.classList.remove('input-invalid'), 1500);
    }
  });

  document.getElementById('summCouponRemove')?.addEventListener('click', removeCoupon);
  document.getElementById('removeCouponPayStep')?.addEventListener('click', removeCoupon);

  document.querySelectorAll('.coupon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      applyCoupon(chip.dataset.code);
    });
  });

  function updateTotal() {
    const subtotal  = 13698; // 8499 + 5199
    const discount  = 3200;
    const stitching = 499;
    let couponSave  = 0;
    if (appliedCoupon && validCoupons[appliedCoupon]) {
      couponSave = Math.round((subtotal - discount) * validCoupons[appliedCoupon] / 100);
    }
    const total = subtotal - discount - couponSave + stitching;
    const totalEl = document.getElementById('summTotalAmt');
    if (totalEl) totalEl.textContent = '₹' + total.toLocaleString('en-IN');
    const couponRow = document.getElementById('summCouponRow');
    const couponAmt = document.getElementById('summCouponAmt');
    if (couponRow) couponRow.style.display = couponSave > 0 ? 'flex' : 'none';
    if (couponAmt) couponAmt.textContent = '− ₹' + couponSave.toLocaleString('en-IN');
    // Update place order button
    const placeBtn = document.getElementById('placeOrderBtn');
    if (placeBtn) placeBtn.innerHTML = `<i class="fas fa-lock" style="margin-right:8px;font-size:12px;"></i> Place Order — ₹${total.toLocaleString('en-IN')}`;
  }

  // Init coupon state
  applyCoupon('ELEGANCE10');

  /* ── 18. MOBILE SUMMARY TOGGLE ── */
  const summaryToggleBtn  = document.getElementById('summaryToggleBtn');
  const summaryBody       = document.getElementById('summaryBody');
  const summaryToggleIcon = document.getElementById('summaryToggleIcon');

  summaryToggleBtn?.addEventListener('click', () => {
    summaryBody?.classList.toggle('open');
    summaryToggleIcon?.classList.toggle('open');
  });

  /* ── 19. COPY ORDER ID ── */
  document.getElementById('copyOrderBtn')?.addEventListener('click', () => {
    navigator.clipboard?.writeText('#ELG-2026-07482').catch(() => {});
    const btn = document.getElementById('copyOrderBtn');
    if (btn) {
      btn.innerHTML = '<i class="fas fa-check" style="color:#2e7d32;"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 2000);
    }
  });

  /* ── 20. CONFETTI ── */
  function launchConfetti() {
    const wrap = document.getElementById('confettiWrap');
    if (!wrap) return;
    const colors = ['#D4A843', '#B8860B', '#F5E6C4', '#c0392b', '#2e7d32', '#1565c0', '#FAF7F2'];
    for (let i = 0; i < 120; i++) {
      const piece = document.createElement('div');
      piece.classList.add('confetti-piece');
      piece.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: -10px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${4 + Math.random() * 8}px;
        height: ${4 + Math.random() * 8}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration: ${1.5 + Math.random() * 2.5}s;
        animation-delay: ${Math.random() * 1.2}s;
      `;
      wrap.appendChild(piece);
    }
    setTimeout(() => { wrap.innerHTML = ''; }, 5000);
  }

  /* ── 21. STICKY NAV ON SCROLL ── */
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('checkoutNav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 4);
  }, { passive: true });

});
