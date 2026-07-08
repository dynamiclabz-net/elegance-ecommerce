/* ═══════════════════════════════════════════════════════════════
   ELEGANCE — Account Page Interactive Features
   Tab switching, password strength, form validation, animations
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function() {

  /* ── TAB SWITCHING ── */
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  const accountPanels = document.querySelectorAll('.account-panel');

  sidebarItems.forEach(item => {
    item.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      
      // Deactivate all
      sidebarItems.forEach(i => i.classList.remove('sidebar-item-active'));
      accountPanels.forEach(p => p.classList.remove('account-panel-active'));
      
      // Activate clicked
      this.classList.add('sidebar-item-active');
      document.querySelector(`[data-panel="${tabName}"]`).classList.add('account-panel-active');
      
      // Scroll to top
      document.querySelector('.account-main').scrollTop = 0;
    });
  });

  /* ── PASSWORD STRENGTH CHECKER ── */
  const newPwdInput = document.getElementById('newPwd');
  const strengthBar = document.querySelector('.strength-fill');
  const strengthLabel = document.getElementById('strengthLabel');
  const reqChecks = document.querySelectorAll('.req-check');

  if (newPwdInput) {
    newPwdInput.addEventListener('input', function() {
      const pwd = this.value;
      let strength = 0;
      const checks = {
        length:    pwd.length >= 8,
        uppercase: /[A-Z]/.test(pwd),
        lowercase: /[a-z]/.test(pwd),
        number:    /\d/.test(pwd),
        special:   /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd)
      };

      // Calculate strength
      Object.values(checks).forEach(met => { if (met) strength++; });

      // Update visual feedback
      const colors = ['#F44336', '#FF9800', '#FFC107', '#8BC34A', '#4CAF50'];
      const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
      
      if (pwd.length === 0) {
        strengthBar.style.width = '0%';
        strengthBar.style.background = '#e0e0e0';
        strengthLabel.textContent = 'Too weak';
      } else {
        strengthBar.style.width = (strength * 20) + '%';
        strengthBar.style.background = colors[strength - 1];
        strengthLabel.textContent = labels[strength - 1];
      }

      // Update checkmarks
      reqChecks.forEach(check => {
        const req = check.getAttribute('data-req');
        if (checks[req]) {
          check.classList.add('active');
        } else {
          check.classList.remove('active');
        }
      });
    });
  }

  /* ── PASSWORD VISIBILITY TOGGLE ── */
  const pwdToggles = document.querySelectorAll('.pwd-toggle');
  pwdToggles.forEach(toggle => {
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const icon = this.querySelector('i');
      
      if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  });

  /* ── FORM SUBMISSIONS ── */
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', function(e) {
      e.preventDefault();
      // Visual feedback
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = '✓ Saved!';
      submitBtn.style.background = '#4CAF50';
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.style.background = '';
      }, 2000);
    });
  }

  const passwordForm = document.getElementById('passwordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const newPwd = document.getElementById('newPwd');
      const confirmPwd = document.getElementById('confirmPwd');
      
      if (newPwd.value !== confirmPwd.value) {
        alert('Passwords do not match!');
        return;
      }
      
      // Visual feedback
      const submitBtn = this.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = '✓ Password updated!';
      submitBtn.style.background = '#4CAF50';
      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.style.background = '';
        // Reset form
        this.reset();
      }, 2000);
    });
  }

  /* ── ORDER ACTIONS ── */
  const trackBtns = document.querySelectorAll('.btn-track');
  trackBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const orderId = this.closest('.order-card').querySelector('.order-id').textContent;
      alert('Tracking page would open for: ' + orderId);
    });
  });

  const reorderBtns = document.querySelectorAll('.btn-reorder');
  reorderBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      alert('Items added to cart! View your cart.');
    });
  });

  const reviewBtns = document.querySelectorAll('.btn-review');
  reviewBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      alert('Review modal would open for this product.');
    });
  });

  const cancelBtns = document.querySelectorAll('.btn-cancel');
  cancelBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      if (confirm('Are you sure you want to cancel this order?')) {
        alert('Order cancelled successfully.');
      }
    });
  });

  /* ── ADDRESS MANAGEMENT ── */
  const addAddressBtn = document.getElementById('addAddressBtn');
  if (addAddressBtn) {
    addAddressBtn.addEventListener('click', function() {
      alert('Add new address modal would open here.');
    });
  }

  const editAddressBtns = document.querySelectorAll('.btn-edit');
  editAddressBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      alert('Edit address modal would open.');
    });
  });

  const deleteAddressBtns = document.querySelectorAll('.btn-delete');
  deleteAddressBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      if (confirm('Are you sure you want to delete this address?')) {
        // Visual removal
        const card = this.closest('.address-card');
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        setTimeout(() => card.remove(), 300);
      }
    });
  });

  /* ── ADDRESS SELECTION ── */
  const addressCards = document.querySelectorAll('.address-card');
  addressCards.forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.address-actions')) return; // Skip if clicking buttons
      
      addressCards.forEach(c => c.classList.remove('address-card-active'));
      this.classList.add('address-card-active');
    });
  });

  /* ── WISHLIST ACTIONS ── */
  const wishlistRemoveBtns = document.querySelectorAll('.wishlist-remove');
  wishlistRemoveBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const card = this.closest('.wishlist-card');
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => card.remove(), 300);
    });
  });

  const wishlistAddBtns = document.querySelectorAll('.btn-add-cart');
  wishlistAddBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const originalText = this.textContent;
      this.textContent = '✓ Added to cart!';
      this.style.background = '#4CAF50';
      setTimeout(() => {
        this.textContent = originalText;
        this.style.background = '';
      }, 2000);
    });
  });

  /* ── FILTER CHIPS ── */
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', function() {
      filterChips.forEach(c => c.classList.remove('filter-chip-active'));
      this.classList.add('filter-chip-active');
      // In a real app, this would filter the orders
    });
  });

  /* ── LOGOUT ── */
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to logout?')) {
        alert('Logged out successfully. Redirecting to home...');
        // In a real app: window.location.href = '/';
      }
    });
  }

  /* ── TOGGLE SWITCHES ── */
  const toggleSwitches = document.querySelectorAll('.toggle-switch input');
  toggleSwitches.forEach(toggle => {
    toggle.addEventListener('change', function() {
      const settingName = this.closest('.setting-item').querySelector('.setting-name').textContent;
      const state = this.checked ? 'enabled' : 'disabled';
      console.log('[v0]', settingName, 'is now', state);
    });
  });

});
