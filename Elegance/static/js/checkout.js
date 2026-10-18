/**
 * checkout.js — Elegance checkout page.
 * Called once via CheckoutPageInit(config) from checkout.html.
 */

let coConfig = null;
let coCart = null;
let coAddresses = [];
let coSelectedAddressId = null;
let coGeneratedOtp = null;
const CO_ADVANCE_PCT = 20;

// status: "idle" (no pincode yet) | "loading" | "ok" | "unserviceable" | "error"
let coShipping = { status: "idle", pincode: null, charge: 0, state: "", message: "", isFree: false };
let coShippingRequestId = 0;

function coShippingCharge() {
  return coShipping.status === "ok" ? Number(coShipping.charge) : 0;
}

function coSelectedAddress() {
  return coAddresses.find((a) => String(a.id) === String(coSelectedAddressId)) || null;
}

async function fetchShippingQuote(pincode) {
  const requestId = ++coShippingRequestId;
  const [success, result] = await callApi(
    "GET",
    `${coConfig.pincodeRateApiUrl}?pincode=${encodeURIComponent(pincode)}`,
    null,
    ""
  );
  if (requestId !== coShippingRequestId) return null; // a newer lookup superseded this one

  if (!success || !result.success) {
    return { status: "error", pincode, charge: 0, state: "", isFree: false, message: eExtractError(result, "Could not check delivery for this pincode.") };
  }

  const quote = result.data.shipping;
  return {
    status: quote.serviceable ? "ok" : "unserviceable",
    pincode: quote.pincode,
    charge: quote.shipping_charge,
    state: quote.state || "",
    isFree: quote.is_free_shipping,
    message: quote.message || "",
  };
}

async function refreshShippingForSelectedAddress() {
  const address = coSelectedAddress();
  if (!address) {
    coShipping = { status: "idle", pincode: null, charge: 0, state: "", message: "", isFree: false };
    renderSummary();
    return;
  }

  coShipping = { ...coShipping, status: "loading", pincode: address.pincode };
  renderSummary();

  const quote = await fetchShippingQuote(address.pincode);
  if (!quote) return;
  coShipping = quote;
  renderSummary();
}

function setupPincodeHint() {
  const input = document.querySelector('#coAddressForm input[name="pincode"]');
  const hint = document.getElementById("coPincodeHint");
  let timer = null;

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    clearTimeout(timer);
    hint.className = "co-pincode-hint";

    if (input.value.length < 6) {
      hint.textContent = "";
      return;
    }

    hint.textContent = "Checking delivery…";
    timer = setTimeout(async () => {
      const pincode = input.value;
      const quote = await fetchShippingQuote(pincode);
      if (!quote || input.value !== pincode) return;

      if (quote.status === "ok") {
        hint.className = "co-pincode-hint co-pincode-ok";
        hint.textContent = quote.isFree
          ? `Delivering to ${quote.state} — free shipping on this order.`
          : `Delivering to ${quote.state} — shipping ${eFormatCurrency(quote.charge)}.`;
      } else {
        hint.className = "co-pincode-hint co-pincode-bad";
        hint.textContent = quote.message;
      }
    }, 300);
  });
}

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
  setupPincodeHint();

  document.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
    input.addEventListener("change", renderSummary);
  });

  document.getElementById("placeOrderBtn").addEventListener("click", openConfirmModal);
  document.getElementById("coConfirmProceedBtn").addEventListener("click", handleConfirmProceed);
  document.getElementById("coOtpBackBtn").addEventListener("click", showConfirmStep);
  document.getElementById("coOtpResendBtn").addEventListener("click", generateAndFillOtp);
  document.getElementById("coOtpVerifyBtn").addEventListener("click", handleOtpVerify);
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
  refreshShippingForSelectedAddress();
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
    input.addEventListener("change", () => {
      coSelectedAddressId = input.value;
      refreshShippingForSelectedAddress();
    });
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
  document.getElementById("coPincodeHint").textContent = "";
  document.getElementById("coAddressForm").style.display = "none";
  document.getElementById("coAddAddressBtn").style.display = "";
  renderAddresses();
  refreshShippingForSelectedAddress();
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
  const shipping = coShippingCharge();
  const total = subtotal + shipping;
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

  document.getElementById("subtotalVal").textContent = eFormatCurrency(subtotal);
  document.getElementById("shippingVal").textContent = {
    idle: "Enter pincode",
    loading: "Calculating…",
    error: "Unavailable",
    unserviceable: "Not deliverable",
    ok: shipping === 0 ? "Free" : eFormatCurrency(shipping),
  }[coShipping.status];
  document.getElementById("totalVal").textContent = eFormatCurrency(total);

  const note = document.getElementById("shippingNote");
  const noteText = {
    idle: "Select or add an address to see delivery cost.",
    loading: "",
    error: coShipping.message,
    unserviceable: coShipping.message,
    ok: coShipping.state ? `Delivering to ${coShipping.state} (${coShipping.pincode})` : "",
  }[coShipping.status];
  note.textContent = noteText;
  note.className = "cs-shipping-note" + (["error", "unserviceable"].includes(coShipping.status) ? " cs-shipping-bad" : "");
  note.style.display = noteText ? "" : "none";

  document.getElementById("placeOrderBtn").disabled = coShipping.status !== "ok";

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

/* ══════════════════════════════════════════════════════════════
   CONFIRMATION MODAL + COD OTP VERIFICATION
══════════════════════════════════════════════════════════════ */
function openConfirmModal() {
  if (!coSelectedAddressId) {
    eToast("Please select or add a shipping address.", "error");
    return;
  }

  if (coShipping.status !== "ok") {
    eToast(coShipping.message || "Delivery cost is still being calculated.", "error");
    return;
  }

  const address = coSelectedAddress();
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
  const subtotal = Number(coCart.total_amount);
  const shipping = coShippingCharge();
  const total = subtotal + shipping;

  const rows = [
    ["Delivering to", address ? `${address.full_name}, ${address.city}` : "—"],
    ["Items", `${coCart.total_items} item${coCart.total_items === 1 ? "" : "s"}`],
    ["Shipping", shipping === 0 ? "Free" : eFormatCurrency(shipping)],
    ["Payment Method", paymentMethod === "cod" ? "Cash on Delivery" : "Pay Online"],
  ];

  if (paymentMethod === "cod") {
    const advance = Math.round((total * CO_ADVANCE_PCT) / 100);
    rows.push(["Pay Now (Advance)", eFormatCurrency(advance)]);
    rows.push(["Pay on Delivery", eFormatCurrency(total - advance)]);
  }

  document.getElementById("coConfirmRows").innerHTML = rows
    .map(([label, value]) => `<div class="co-confirm-row"><span>${eEscapeHtml(label)}</span><span>${eEscapeHtml(value)}</span></div>`)
    .join("") + `<div class="co-confirm-row co-confirm-total"><span>Total Amount</span><span>${eFormatCurrency(total)}</span></div>`;

  showConfirmStep();
  bootstrap.Modal.getOrCreateInstance(document.getElementById("coConfirmModal")).show();
}

function showConfirmStep() {
  document.getElementById("coConfirmStep").style.display = "block";
  document.getElementById("coOtpStep").style.display = "none";
}

// Demo-only OTP: generated and shown straight to the frontend (no SMS
// gateway wired up yet), and pre-filled so the flow can be tested end to end.
function generateAndFillOtp() {
  coGeneratedOtp = String(Math.floor(1000 + Math.random() * 9000));
  const input = document.getElementById("coOtpInput");
  input.value = coGeneratedOtp;
  eToast(`OTP sent — auto-filled for you: ${coGeneratedOtp}`, "success");
}

function handleConfirmProceed() {
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

  if (paymentMethod === "cod") {
    document.getElementById("coConfirmStep").style.display = "none";
    document.getElementById("coOtpStep").style.display = "block";
    generateAndFillOtp();
    return;
  }

  submitOrder();
}

function handleOtpVerify() {
  const entered = document.getElementById("coOtpInput").value.trim();
  if (!entered) {
    eToast("Please enter the OTP.", "error");
    return;
  }
  if (entered !== coGeneratedOtp) {
    eToast("Incorrect OTP. Please try again.", "error");
    return;
  }
  submitOrder();
}

async function submitOrder() {
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
  const activeBtn = paymentMethod === "cod"
    ? document.getElementById("coOtpVerifyBtn")
    : document.getElementById("coConfirmProceedBtn");

  activeBtn.disabled = true;
  const originalText = activeBtn.innerHTML;
  activeBtn.textContent = "Placing order…";

  const [success, result] = await callApi(
    "POST",
    coConfig.checkoutApiUrl,
    { address_id: coSelectedAddressId, payment_method: paymentMethod },
    coConfig.csrfToken
  );

  if (!success || !result.success) {
    activeBtn.disabled = false;
    activeBtn.innerHTML = originalText;
    eToast(eExtractError(result, "Could not place order."), "error");
    return;
  }

  window.location.href = result.data.redirect_url;
}
