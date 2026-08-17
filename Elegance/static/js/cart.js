/**
 * cart.js — Elegance cart page.
 * Called once via CartPageInit(config) from cart.html.
 */

let cartConfig = null;
const FREE_SHIPPING_THRESHOLD = 2999;
const STANDARD_SHIPPING_CHARGE = 99;

function CartPageInit(config) {
  cartConfig = config;
  loadCart();
  document.getElementById("checkoutBtn").addEventListener("click", () => {
    window.location.href = cartConfig.checkoutPageUrl;
  });
}

async function loadCart() {
  const [success, result] = await callApi("GET", cartConfig.cartApiUrl, null, "");
  document.getElementById("cartLoadingState").style.display = "none";

  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not load your cart."), "error");
    return;
  }

  const cart = result.data.cart;
  eRefreshCartBadge(cartConfig.cartApiUrl);

  if (!cart.items.length) {
    document.getElementById("cartEmptyState").style.display = "";
    return;
  }

  document.getElementById("cartGrid").style.display = "";
  renderCart(cart);
}

function renderCart(cart) {
  document.getElementById("cartCountLabel").textContent = `${cart.total_items} item${cart.total_items === 1 ? "" : "s"}`;
  document.getElementById("csItemCount").textContent = `${cart.total_items} item${cart.total_items === 1 ? "" : "s"}`;

  document.getElementById("cartItemsList").innerHTML = cart.items.map(renderCartItem).join("");
  bindItemEvents();

  const subtotal = Number(cart.total_amount);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_CHARGE;
  const total = subtotal + shipping;

  document.getElementById("subtotalVal").textContent = eFormatCurrency(subtotal);
  document.getElementById("shippingVal").textContent = shipping === 0 ? "Free" : eFormatCurrency(shipping);
  document.getElementById("totalVal").textContent = eFormatCurrency(total);

  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
  document.getElementById("fsbFill").style.width = `${pct}%`;
  document.getElementById("fsbMsg").innerHTML =
    remaining > 0
      ? `Add <strong>${eFormatCurrency(remaining)}</strong> more for free shipping!`
      : `You&apos;ve unlocked free shipping!`;
}

function renderCartItem(item) {
  return `
    <div class="cart-item" data-id="${item.id}">
      <div class="ci-img-wrap">
        <img class="ci-img" src="${item.image_url || "/static/images/placeholder-product.png"}" alt="${eEscapeHtml(item.product_name)}" />
      </div>
      <div class="ci-details">
        <div class="ci-top">
          <div>
            <h3 class="ci-name"><a href="/product/${item.product_slug}/">${eEscapeHtml(item.product_name)}</a></h3>
            ${item.variant_label ? `<div class="ci-meta"><span class="ci-meta-pill">${eEscapeHtml(item.variant_label)}</span></div>` : ""}
          </div>
          <button class="ci-remove" data-id="${item.id}" aria-label="Remove item"><i class="fas fa-times"></i></button>
        </div>
        <div class="ci-bottom">
          <div class="ci-price-block">
            <span class="ci-price">${eFormatCurrency(item.unit_price)}</span>
          </div>
          <div class="ci-qty-stepper">
            <button class="qty-dec" data-id="${item.id}" data-qty="${item.quantity}">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-inc" data-id="${item.id}" data-qty="${item.quantity}">+</button>
          </div>
        </div>
      </div>
    </div>`;
}

function bindItemEvents() {
  document.querySelectorAll(".ci-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(btn.dataset.id));
  });
  document.querySelectorAll(".qty-dec").forEach((btn) => {
    btn.addEventListener("click", () => updateQty(btn.dataset.id, parseInt(btn.dataset.qty, 10) - 1));
  });
  document.querySelectorAll(".qty-inc").forEach((btn) => {
    btn.addEventListener("click", () => updateQty(btn.dataset.id, parseInt(btn.dataset.qty, 10) + 1));
  });
}

async function updateQty(itemId, newQty) {
  if (newQty < 1) {
    removeItem(itemId);
    return;
  }
  const [success, result] = await callApi(
    "PUT", `${cartConfig.cartApiUrl}${itemId}/`, { quantity: newQty }, cartConfig.csrfToken
  );
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not update quantity."), "error");
    return;
  }
  eRefreshCartBadge(cartConfig.cartApiUrl);
  renderCart(result.data.cart);
}

async function removeItem(itemId) {
  const [success, result] = await callApi("DELETE", `${cartConfig.cartApiUrl}${itemId}/`, null, cartConfig.csrfToken);
  if (!success || !result.success) {
    eToast(eExtractError(result, "Could not remove item."), "error");
    return;
  }
  eRefreshCartBadge(cartConfig.cartApiUrl);
  eToast("Item removed", "success");
  if (!result.data.cart.items.length) {
    document.getElementById("cartGrid").style.display = "none";
    document.getElementById("cartEmptyState").style.display = "";
  } else {
    renderCart(result.data.cart);
  }
}
