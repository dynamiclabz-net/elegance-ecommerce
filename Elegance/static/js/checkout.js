/**
 * checkout.js — Elegance checkout page.
 * Called once via CheckoutPageInit(config) from checkout.html.
 */

let coConfig = null;
let coCart = null;
let coAddresses = [];
let coSelectedAddressId = null;
const CO_FREE_SHIPPING_THRESHOLD = 2999;
const CO_STANDARD_SHIPPING_CHARGE = 99;
const CO_ADVANCE_PCT = 20;

function CheckoutPageInit(config) {
  coConfig = config;
  bootstrap();

  document.getElementById("coAddAddressBtn").addEventListener("click", () => {
    document.getElementById("coAddressForm").style.display = "";
    document.getElementById("coAddAddressBtn").style.display = "none";
  });
  document.getElementById("coCancelAddressBtn").addEventListener("click", () => {
    document.getElementById("coAddressForm").style.display = "none";
    document.getElementById("coAddAddressBtn").style.display = "";
  });
  document.getElementById("coAddressForm").addEventListener("submit", handleAddAddress);

  document.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
    input.addEventListener("change", renderSummary);
  });

  document.getElementById("placeOrderBtn").addEventListener("click", placeOrder);
}

async function bootstrap() {
  const [cartOk, cartResult] = await callApi("GET", coConfig.cartApiUrl, null, "");
  const [addrOk, addrResult] = await callApi("GET", coConfig.addressApiUrl, null, "");

  document.getElementById("coLoadingState").style.display = "none";

  if (!cartOk || !cartResult.success || !cartResult.data.cart.items.length) {
    eToast("Your cart is empty.", "error");
    window.location.href = coConfig.cartPageUrl;
    return;
  }

  coCart = cartResult.data.cart;
  coAddresses = addrOk && addrResult.success ? addrResult.data.addresses : [];

  document.getElementById("coGrid").style.display = "";
  renderAddresses();
  renderSummaryItems();
  renderSummary();
  eRefreshCartBadge(coConfig.cartApiUrl);
}

function renderAddresses() {
  const list = document.getElementById("coAddressList");
  if (!coAddresses.length) {
    list.innerHTML = "";
    document.getElementById("coAddressForm").style.display = "";
    document.getElementById("coAddAddressBtn").style.display = "none";
    return;
  }

  if (!coSelectedAddressId) {
    const defaultAddr = coAddresses.find((a) => a.is_default) || coAddresses[0];
    coSelectedAddressId = defaultAddr.id;
  }

  list.innerHTML = coAddresses
    .map(
      (a) => `
      <label class="co-address-card">
        <input type="radio" name="coAddress" value="${a.id}" ${String(a.id) === String(coSelectedAddressId) ? "checked" : ""} />
        <div>
          <p class="co-address-name">${eEscapeHtml(a.full_name)} ${a.is_default ? '<span class="co-address-badge">Default</span>' : ""}</p>
          <p class="co-address-text">${eEscapeHtml(a.full_address || `${a.address_line1}, ${a.city}, ${a.state} ${a.pincode}`)}</p>
          <p class="co-address-text">${eEscapeHtml(a.mobile)}</p>
        </div>
      </label>`
    )
    .join("");

  list.querySelectorAll('input[name="coAddress"]').forEach((input) => {
    input.addEventListener("change", () => (coSelectedAddressId = input.value));
  });
}

async function handleAddAddress(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const payload = {
    full_name: formData.get("full_name"),
    mobile: formData.get("mobile"),
    address_line1: formData.get("address_line1"),
    address_line2: formData.get("address_line2") || "",
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
    country: formData.get("country") || "India",
    is_default: coAddresses.length === 0,
  };

  const [success, result] = await callApi("POST", coConfig.addressApiUrl, payload, coConfig.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not save address."), "error");
    return;
  }

  coAddresses.push(result.data.address);
  coSelectedAddressId = result.data.address.id;
  form.reset();
  document.getElementById("coAddressForm").style.display = "none";
  document.getElementById("coAddAddressBtn").style.display = "";
  renderAddresses();
  eToast("Address saved", "success");
}

function renderSummaryItems() {
  document.getElementById("csItemCount").textContent = `${coCart.total_items} item${coCart.total_items === 1 ? "" : "s"}`;
  document.getElementById("coSummaryItems").innerHTML = coCart.items
    .map(
      (item) => `
      <div class="co-summary-item">
        <img src="${item.image_url || "/static/images/placeholder-product.png"}" alt="" />
        <div class="co-summary-item-info">
          <p class="co-summary-item-name">${eEscapeHtml(item.product_name)}</p>
          <p class="co-summary-item-meta">Qty ${item.quantity}${item.variant_label ? ` · ${eEscapeHtml(item.variant_label)}` : ""}</p>
        </div>
        <span class="co-summary-item-price">${eFormatCurrency(item.total_price)}</span>
      </div>`
    )
    .join("");
}

function renderSummary() {
  const subtotal = Number(coCart.total_amount);
  const shipping = subtotal >= CO_FREE_SHIPPING_THRESHOLD ? 0 : CO_STANDARD_SHIPPING_CHARGE;
  const total = subtotal + shipping;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

  document.getElementById("subtotalVal").textContent = eFormatCurrency(subtotal);
  document.getElementById("shippingVal").textContent = shipping === 0 ? "Free" : eFormatCurrency(shipping);
  document.getElementById("totalVal").textContent = eFormatCurrency(total);

  const advanceRow = document.getElementById("advanceRow");
  const balanceRow = document.getElementById("balanceRow");

  if (paymentMethod === "cod") {
    const advance = Math.round((total * CO_ADVANCE_PCT) / 100);
    const balance = total - advance;
    document.getElementById("advanceVal").textContent = eFormatCurrency(advance);
    document.getElementById("balanceVal").textContent = eFormatCurrency(balance);
    advanceRow.style.display = "";
    balanceRow.style.display = "";
  } else {
    advanceRow.style.display = "none";
    balanceRow.style.display = "none";
  }
}

async function placeOrder() {
  if (!coSelectedAddressId) {
    eToast("Please select or add a shipping address.", "error");
    return;
  }

  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
  const btn = document.getElementById("placeOrderBtn");
  btn.disabled = true;
  btn.textContent = "Placing order…";

  const [success, result] = await callApi(
    "POST",
    coConfig.checkoutApiUrl,
    { address_id: coSelectedAddressId, payment_method: paymentMethod },
    coConfig.csrfToken
  );

  if (!success || !result.success) {
    btn.disabled = false;
    btn.innerHTML = 'Place Order <i class="fas fa-arrow-right"></i>';
    eToast(eExtractError(result, "Could not place order."), "error");
    return;
  }

  window.location.href = result.data.redirect_url;
}
