/**
 * payment-callback.js — reads the razorpay_* query params appended to this
 * page's URL and verifies the payment against the backend, then shows a
 * success/error state and links through to the order detail page.
 */

function PaymentCallbackPageInit(config) {
  verifyPayment(config);
}

async function verifyPayment(config) {
  const params = new URLSearchParams(window.location.search);

  const payload = {
    order_id: config.orderId,
    razorpay_payment_id: params.get("razorpay_payment_id"),
    razorpay_order_id: params.get("razorpay_order_id"),
    razorpay_signature: params.get("razorpay_signature"),
  };

  const [success, result] = await callApi("POST", config.paymentVerifyApiUrl, payload, config.csrfToken);

  document.getElementById("pcProcessing").style.display = "none";

  if (!success || !result.success) {
    document.getElementById("pcError").style.display = "";
    document.getElementById("pcErrorMsg").textContent = eExtractError(result, "We couldn't confirm your payment.");
    return;
  }

  document.getElementById("pcSuccess").style.display = "";
  document.getElementById("pcViewOrderBtn").href = config.orderDetailUrlTemplate.replace("__ID__", config.orderId);
  eRefreshCartBadge(window.ELEGANCE_CART_API_URL);
}
