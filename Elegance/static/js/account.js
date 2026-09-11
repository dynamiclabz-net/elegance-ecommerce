// ─────────────────────────────────────────────
// account.html — customer account page
// ─────────────────────────────────────────────
let _acctCfg = null;
let _bsOtpModal = null;
let _bsAddressModal = null;
let _currentUser = null;
let _allOrders = [];
let _allAddresses = [];
let _currentOtpId = null;
let _currentOtpMobile = null;

const ORDER_CANCELLABLE_STATUSES = ["placed", "confirmed", "processing"];

function AccountPageInit(config) {
  _acctCfg = config;

  wireSidebarTabs();
  wireLogout();
  wireProfileForm();
  wireOrdersFilter();
  wireAddressModal();
  wireOtpModal();
  // wireAvatarEdit();

  checkSessionAndBoot();
}

/* ── SESSION / OTP LOGIN ── */

async function checkSessionAndBoot() {
  const [success, result] = await callApi("GET", _acctCfg.sessionApiUrl, null, _acctCfg.csrfToken);

  if (!success || !result.success || !result.data.is_authenticated) {
    showOtpModal();
    return;
  }

  _currentUser = result.data.user;
  hideOtpModalIfShown();
  boot();
}

function boot() {
  renderProfileHeader(_currentUser);
  populateProfileForm(_currentUser);
  loadOrders();
  loadAddresses();
}

function wireOtpModal() {
  _bsOtpModal = new bootstrap.Modal(document.getElementById("otpLoginModal"));

  document.getElementById("otpSendBtn").addEventListener("click", handleSendOtp);
  document.getElementById("otpVerifyBtn").addEventListener("click", handleVerifyOtp);
  document.getElementById("otpChangeNumberBtn").addEventListener("click", resetOtpStepToMobile);

  document.getElementById("otpMobile").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleSendOtp();
    }
  });

  document.getElementById("otpCode").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleVerifyOtp();
    }
  });
}

function showOtpModal() {
  resetOtpStepToMobile();
  _bsOtpModal.show();
}

function hideOtpModalIfShown() {
  if (_bsOtpModal) _bsOtpModal.hide();
}

function resetOtpStepToMobile() {
  document.getElementById("otpStepMobile").style.display = "block";
  document.getElementById("otpStepVerify").style.display = "none";
  hideOtpAlert();
}

function showOtpAlert(message) {
  const el = document.getElementById("otpAlert");
  el.textContent = message;
  el.style.display = "block";
}

function hideOtpAlert() {
  document.getElementById("otpAlert").style.display = "none";
}

async function handleSendOtp() {
  hideOtpAlert();
  const mobileInput = document.getElementById("otpMobile");
  const mobile = mobileInput.value.trim();

  if (!mobile || mobile.replace(/\D/g, "").length < 10) {
    showOtpAlert("Please enter a valid mobile number.");
    return;
  }

  const btn = document.getElementById("otpSendBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Sending...";

  const [success, result] = await callApi("POST", _acctCfg.otpRequestApiUrl, { mobile }, _acctCfg.csrfToken);

  btn.disabled = false;
  btn.textContent = original;

  if (!success || !result.success) {
    showOtpAlert(eExtractError(result, "Could not send OTP. Please try again."));
    return;
  }

  _currentOtpId = result.data.otp_id;
  _currentOtpMobile = result.data.mobile;

  document.getElementById("otpMobileDisplay").textContent = _currentOtpMobile;
  // No SMS gateway wired up yet — the OTP is handed straight to the
  // frontend and auto-filled below so the flow can be exercised end to end.
  document.getElementById("otpCode").value = result.data.otp || "";
  document.getElementById("otpStepMobile").style.display = "none";
  document.getElementById("otpStepVerify").style.display = "block";
  document.getElementById("otpCode").focus();
}

async function handleVerifyOtp() {
  hideOtpAlert();
  const otp = document.getElementById("otpCode").value.trim();

  if (!otp || otp.length !== 6) {
    showOtpAlert("Please enter the 6-digit OTP.");
    return;
  }

  const btn = document.getElementById("otpVerifyBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Verifying...";

  const verifyUrl = _acctCfg.otpVerifyUrlTemplate.replace("/0/", `/${_currentOtpId}/`);
  const [success, result] = await callApi("PUT", verifyUrl, { otp }, _acctCfg.csrfToken);

  btn.disabled = false;
  btn.textContent = original;

  if (!success || !result.success) {
    showOtpAlert(eExtractError(result, "Could not verify OTP. Please try again."));
    return;
  }

  if (!result.data.otp_verified) {
    showOtpAlert(result.data.message || "Invalid or expired OTP. Please try again.");
    return;
  }

  eToast("Signed in successfully!", "success");
  await checkSessionAndBoot();
}

/* ── SIDEBAR TABS ── */

function wireSidebarTabs() {
  const items = document.querySelectorAll(".sidebar-item");
  const panels = document.querySelectorAll(".account-panel");

  items.forEach((item) => {
    item.addEventListener("click", function () {
      const tab = this.getAttribute("data-tab");
      items.forEach((i) => i.classList.remove("sidebar-item-active"));
      panels.forEach((p) => p.classList.remove("account-panel-active"));
      this.classList.add("sidebar-item-active");
      document.querySelector(`[data-panel="${tab}"]`).classList.add("account-panel-active");
      document.querySelector(".account-main").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

/* ── LOGOUT ── */

function wireLogout() {
  document.getElementById("logoutBtn").addEventListener("click", async function () {
    if (!eConfirmAction("Are you sure you want to logout?")) return;
    await callApi("POST", _acctCfg.logoutApiUrl, {}, _acctCfg.csrfToken);
    window.location.href = _acctCfg.accountUrl;
  });
}

/* ── PROFILE ── */

function renderProfileHeader(user) {
  const name = (user.full_name || "").trim();
  document.getElementById("profileDisplayName").textContent = name || user.contact_number;
  document.getElementById("profileDisplayContact").textContent = user.email || user.contact_number;
  document.getElementById("profileMemberSince").textContent = "Member since " + eFormatDate(user.date_joined);
  document.getElementById("profileAvatarInitials").textContent = eInitials(
    user.first_name,
    user.last_name,
    user.contact_number
  );
  document.getElementById("statRole").textContent = user.role === "admin" ? "Admin" : "Customer";

  const incomplete = !user.first_name || !user.last_name;
  document.getElementById("profileIncompleteBanner").style.display = incomplete ? "flex" : "none";
}

function populateProfileForm(user) {
  document.getElementById("firstName").value = user.first_name || "";
  document.getElementById("lastName").value = user.last_name || "";
  document.getElementById("email").value = user.email || "";
  document.getElementById("contactNumber").value = user.contact_number || "";
}

function wireProfileForm() {
  document.getElementById("profileForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const first_name = document.getElementById("firstName").value.trim();
    const last_name = document.getElementById("lastName").value.trim();
    const email = document.getElementById("email").value.trim();

    if (!first_name || !last_name) {
      eToast("First and last name are required.", "danger");
      return;
    }

    const btn = document.getElementById("profileSaveBtn");
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Saving...";

    const url = _acctCfg.profileUpdateUrlTemplate.replace("/0/", `/${_currentUser.user_id}/`);
    const [success, result] = await callApi("PUT", url, { first_name, last_name, email }, _acctCfg.csrfToken);

    btn.disabled = false;
    btn.textContent = original;

    if (!success || !result.success) {
      eToast(eExtractError(result, "Could not update profile."), "danger");
      return;
    }

    _currentUser = result.data.profile;
    renderProfileHeader(_currentUser);
    eToast("Profile updated successfully!", "success");
  });
}

function wireAvatarEdit() {
  const btn = document.getElementById("avatarEditBtn");
  if (btn) {
    btn.addEventListener("click", function () {
      eToast("Profile photo uploads are coming soon.", "success");
    });
  }
}

/* ── ORDERS ── */

async function loadOrders() {
  const list = document.getElementById("ordersList");
  const [success, result] = await callApi("GET", _acctCfg.myOrdersApiUrl, null, _acctCfg.csrfToken);

  if (!success || !result.success) {
    list.innerHTML = emptyStateHtml(
      "fas fa-exclamation-triangle",
      "Could not load orders",
      eExtractError(result)
    );
    return;
  }

  _allOrders = result.data.orders || [];

  document.getElementById("statOrders").textContent = _allOrders.length;
  const totalSpent = _allOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  document.getElementById("statSpent").textContent = eFormatCurrency(totalSpent);

  const badge = document.getElementById("ordersBadge");
  if (_allOrders.length > 0) {
    badge.textContent = _allOrders.length;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  renderOrders(currentOrderFilter());
}

function currentOrderFilter() {
  const active = document.querySelector(".filter-chip-active");
  return active ? active.getAttribute("data-filter") : "all";
}

function wireOrdersFilter() {
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", function () {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("filter-chip-active"));
      this.classList.add("filter-chip-active");
      renderOrders(this.getAttribute("data-filter"));
    });
  });
}

function classifyOrder(order) {
  if (order.order_status === "cancelled" || order.order_status === "returned") return "cancelled";
  if (order.order_status === "delivered") return "delivered";
  return "pending";
}

function renderOrders(filter) {
  const list = document.getElementById("ordersList");
  let orders = _allOrders;

  if (filter && filter !== "all") {
    orders = orders.filter((o) => classifyOrder(o) === filter);
  }

  if (!orders.length) {
    list.innerHTML = emptyStateHtml(
      "fas fa-box-open",
      "No orders yet",
      "When you place an order, it will show up here."
    );
    return;
  }

  list.innerHTML = orders.map(renderOrderCard).join("");
}

function renderOrderCard(order) {
  const cls = classifyOrder(order);
  const statusLabel = order.order_status_display || order.order_status;
  const items = order.items || [];

  const itemsHtml = items.length
    ? items
        .map(
          (item) => `
      <div class="order-item">
        <img src="${item.image_url ? eEscapeHtml(item.image_url) : placeholderImageSrc()}" alt="${eEscapeHtml(item.product_name)}" />
        <div class="order-item-info">
          <p class="order-product-name">${eEscapeHtml(item.product_name)}</p>
          ${item.variant_label ? `<p class="order-product-meta">${eEscapeHtml(item.variant_label)}</p>` : ""}
          <p class="order-product-price">${eFormatCurrency(item.unit_price)}</p>
        </div>
        <span class="order-qty">Qty: ${item.quantity}</span>
      </div>`
        )
        .join("")
    : `<p class="order-product-meta">Item details unavailable.</p>`;

  return `
    <div class="order-card order-card-${cls}">
      <div class="order-header">
        <div>
          <p class="order-id">Order #${eEscapeHtml(order.order_number)}</p>
          <p class="order-date">Placed on ${eFormatDate(order.placed_at)}</p>
        </div>
        <span class="order-status order-status-${cls}">${eEscapeHtml(statusLabel)}</span>
      </div>
      <div class="order-items">${itemsHtml}</div>
      <div class="order-footer">
        <div class="order-total">
          <span>Total:</span>
          <span class="total-val">${eFormatCurrency(order.total_amount)}</span>
        </div>
        <div class="order-actions">
          <span class="order-product-meta">${eEscapeHtml(order.payment_method_display || "")}</span>
          <a href="/order-detail/${order.id}/" class="btn-order-action">View Details <i class="fas fa-arrow-right"></i></a>
        </div>
      </div>
    </div>
  `;
}

/* ── ADDRESSES ── */

async function loadAddresses() {
  const grid = document.getElementById("addressesGrid");
  const [success, result] = await callApi("GET", _acctCfg.addressApiUrl, null, _acctCfg.csrfToken);

  if (!success || !result.success) {
    grid.innerHTML = emptyStateHtml(
      "fas fa-exclamation-triangle",
      "Could not load addresses",
      eExtractError(result)
    );
    return;
  }

  _allAddresses = result.data.addresses || [];
  renderAddresses();
}

function renderAddresses() {
  const grid = document.getElementById("addressesGrid");

  if (!_allAddresses.length) {
    grid.innerHTML = emptyStateHtml(
      "fas fa-map-marker-alt",
      "No saved addresses",
      "Add an address to make checkout faster next time."
    );
    return;
  }

  grid.innerHTML = _allAddresses.map(renderAddressCard).join("");

  grid.querySelectorAll(".btn-edit").forEach((btn) => btn.addEventListener("click", handleEditAddress));
  grid.querySelectorAll(".btn-delete").forEach((btn) => btn.addEventListener("click", handleDeleteAddress));
  grid.querySelectorAll(".btn-set-default").forEach((btn) => btn.addEventListener("click", handleSetDefaultAddress));
}

function renderAddressCard(addr) {
  const typeLabel = capitalize(addr.address_type || "other");
  const line2 = addr.address_line2 ? `, ${eEscapeHtml(addr.address_line2)}` : "";

  return `
    <div class="address-card ${addr.is_default ? "address-card-active" : ""}" data-address-id="${addr.id}">
      <div class="address-badge">${eEscapeHtml(typeLabel)}${addr.is_default ? " · Default" : ""}</div>
      <h4>${eEscapeHtml(addr.full_name)}</h4>
      <p class="address-text">${eEscapeHtml(addr.address_line1)}${line2}<br>${eEscapeHtml(addr.city)}, ${eEscapeHtml(addr.state)} ${eEscapeHtml(addr.pincode)}</p>
      <p class="address-phone">${eEscapeHtml(addr.mobile)}</p>
      <div class="address-actions">
        ${!addr.is_default ? `<button type="button" class="btn-addr-action btn-set-default" data-id="${addr.id}"><i class="fas fa-star"></i> Default</button>` : ""}
        <button type="button" class="btn-addr-action btn-edit" data-id="${addr.id}"><i class="fas fa-edit"></i> Edit</button>
        <button type="button" class="btn-addr-action btn-delete" data-id="${addr.id}"><i class="fas fa-trash"></i> Delete</button>
      </div>
    </div>
  `;
}

function wireAddressModal() {
  _bsAddressModal = new bootstrap.Modal(document.getElementById("addressModal"));
  document.getElementById("addAddressBtn").addEventListener("click", () => openAddressModal(null));
  document.getElementById("addressForm").addEventListener("submit", handleAddressFormSubmit);
}

function openAddressModal(address) {
  const form = document.getElementById("addressForm");
  form.reset();

  document.getElementById("addressId").value = address ? address.id : "";
  document.getElementById("addressModalLabel").textContent = address ? "Edit Address" : "Add New Address";
  document.getElementById("addrFullName").value = address ? address.full_name : (_currentUser && _currentUser.full_name) || "";
  document.getElementById("addrMobile").value = address ? address.mobile : (_currentUser && _currentUser.contact_number) || "";
  document.getElementById("addrLine1").value = address ? address.address_line1 : "";
  document.getElementById("addrLine2").value = address ? address.address_line2 || "" : "";
  document.getElementById("addrLandmark").value = address ? address.landmark || "" : "";
  document.getElementById("addrCity").value = address ? address.city : "";
  document.getElementById("addrState").value = address ? address.state : "";
  document.getElementById("addrPincode").value = address ? address.pincode : "";
  document.getElementById("addrType").value = address ? address.address_type : "home";
  document.getElementById("addrIsDefault").checked = address ? !!address.is_default : false;

  _bsAddressModal.show();
}

function handleEditAddress(e) {
  const id = e.currentTarget.getAttribute("data-id");
  const addr = _allAddresses.find((a) => String(a.id) === String(id));
  if (addr) openAddressModal(addr);
}

async function handleAddressFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById("addressId").value;
  const payload = {
    full_name: document.getElementById("addrFullName").value.trim(),
    mobile: document.getElementById("addrMobile").value.trim(),
    address_line1: document.getElementById("addrLine1").value.trim(),
    address_line2: document.getElementById("addrLine2").value.trim(),
    landmark: document.getElementById("addrLandmark").value.trim(),
    city: document.getElementById("addrCity").value.trim(),
    state: document.getElementById("addrState").value.trim(),
    pincode: document.getElementById("addrPincode").value.trim(),
    address_type: document.getElementById("addrType").value,
    is_default: document.getElementById("addrIsDefault").checked,
  };

  const btn = document.getElementById("addressSaveBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving...";

  let success, result;
  if (id) {
    const url = _acctCfg.addressDetailUrlTemplate.replace("/0/", `/${id}/`);
    [success, result] = await callApi("PUT", url, payload, _acctCfg.csrfToken);
  } else {
    [success, result] = await callApi("POST", _acctCfg.addressApiUrl, payload, _acctCfg.csrfToken);
  }

  btn.disabled = false;
  btn.textContent = original;

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save address."), "danger");
    return;
  }

  eToast(id ? "Address updated." : "Address added.", "success");
  _bsAddressModal.hide();
  loadAddresses();
}

async function handleDeleteAddress(e) {
  const id = e.currentTarget.getAttribute("data-id");
  if (!eConfirmAction("Are you sure you want to delete this address?")) return;

  const url = _acctCfg.addressDetailUrlTemplate.replace("/0/", `/${id}/`);
  const [success, result] = await callApi("DELETE", url, null, _acctCfg.csrfToken);

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not delete address."), "danger");
    return;
  }

  eToast("Address deleted.", "success");
  loadAddresses();
}

async function handleSetDefaultAddress(e) {
  const id = e.currentTarget.getAttribute("data-id");
  const url = _acctCfg.addressDetailUrlTemplate.replace("/0/", `/${id}/`);
  const [success, result] = await callApi("PUT", url, { is_default: true }, _acctCfg.csrfToken);

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not update default address."), "danger");
    return;
  }

  eToast("Default address updated.", "success");
  loadAddresses();
}

/* ── SHARED HELPERS ── */

function emptyStateHtml(icon, title, message) {
  return `
    <div class="empty-state">
      <i class="${icon}"></i>
      <p class="empty-title">${eEscapeHtml(title)}</p>
      <p>${eEscapeHtml(message || "")}</p>
    </div>
  `;
}

function placeholderImageSrc() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23f5efe4'/%3E%3C/svg%3E";
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
