/**
 * payment-callback.js — the screen Razorpay sends the customer back to.
 *
 * It asks the backend whether the payment went through. The backend reads the
 * real status from Razorpay, so "pending" is common for a few seconds after a
 * UPI payment. We check once, then retry up to config.maxRetries times with the
 * delays from settings, and only then show the "still confirming" state.
 */

const PC_STATES = ["pcProcessing", "pcSuccess", "pcPending", "pcFailed"];

function PaymentCallbackPageInit(config) {
  const retryBtn = document.getElementById("pcRetryPayBtn");
  const checkBtn = document.getElementById("pcCheckAgainBtn");

  retryBtn.addEventListener("click", () => retryPayment(config, retryBtn));
  checkBtn.addEventListener("click", () => runChecks(config, { withRedirectParams: false }));

  document.querySelectorAll("[data-pc-order-link]").forEach((link) => {
    link.href = config.orderDetailUrl;
  });

  window.EleganceRazorpay.preload().catch(() => {});
  runChecks(config, { withRedirectParams: true });
}

function showState(id) {
  PC_STATES.forEach((state) => {
    document.getElementById(state).style.display = state === id ? "" : "none";
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOnce(config, withRedirectParams) {
  const params = new URLSearchParams(window.location.search);
  const payload = { order_id: config.orderId };
  if (withRedirectParams) {
    ["razorpay_payment_id", "razorpay_order_id", "razorpay_signature", "error_code", "error_description"].forEach((key) => {
      if (params.get(key)) payload[key] = params.get(key);
    });
  }

  const [ok, result] = await callApi("POST", config.paymentVerifyApiUrl, payload, config.csrfToken);
  if (!ok || !result || !result.success) {
    return { state: "pending", message: eExtractError(result, "We couldn't reach the payment service.") };
  }
  return result.data;
}

async function runChecks(config, { withRedirectParams }) {
  showState("pcProcessing");
  document.getElementById("pcAttempt").textContent = "";

  const totalAttempts = 1 + config.retryDelays.slice(0, config.maxRetries).length;
  let last = { state: "pending", message: "" };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    if (attempt > 0) {
      document.getElementById("pcAttempt").textContent = "Checking again (" + attempt + " of " + config.maxRetries + ")…";
      await wait(config.retryDelays[attempt - 1]);
    }

    last = await checkOnce(config, withRedirectParams);
    if (last.state === "success" || last.state === "failed") break;
  }

  if (last.state === "success") {
    showState("pcSuccess");
    eRefreshCartBadge(window.ELEGANCE_CART_API_URL);
    return;
  }

  if (last.state === "failed") {
    document.getElementById("pcFailedMsg").textContent =
      last.message || "Your payment didn't go through. No money has been taken, or any amount debited will be refunded by your bank.";
    showState("pcFailed");
    return;
  }

  document.getElementById("pcPendingMsg").textContent =
    "We haven't received a confirmation from your bank yet. If money was debited, your order will be confirmed automatically once it arrives. You can also check again or pay later from your order page.";
  showState("pcPending");
}

async function retryPayment(config, button) {
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Opening payment…";

  const [ok, result] = await callApi("POST", config.orderPaymentApiUrl, { order_id: config.orderId }, config.csrfToken);
  if (!ok || !result.success) {
    button.disabled = false;
    button.textContent = originalText;
    eToast(eExtractError(result, "Could not start the payment. Please try again."), "error");
    return;
  }

  const opened = await window.EleganceRazorpay.open(result.data.razorpay, {
    onDismiss: function () {
      button.disabled = false;
      button.textContent = originalText;
    },
  });
  if (!opened) {
    button.disabled = false;
    button.textContent = originalText;
  }
}
