/**
 * razorpay-pay.js — one place that loads Razorpay Checkout and opens it.
 * Used by the checkout page, the payment status screen and the order detail
 * page ("Pay now"), so every entry point behaves the same.
 *
 * The options come from the server (build_checkout_options) and use redirect
 * mode: after paying, Razorpay sends the browser to our return URL, which
 * lands on the payment status screen. This is what keeps UPI apps and bank
 * pages working, because nothing depends on a popup staying alive.
 */
(function () {
  const CHECKOUT_JS_URL = "https://checkout.razorpay.com/v1/checkout.js";
  let loadingPromise = null;

  function loadCheckoutScript() {
    if (window.Razorpay) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_JS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loadingPromise = null;
        script.remove();
        reject(new Error("Could not load the payment window."));
      };
      document.head.appendChild(script);
    });
    return loadingPromise;
  }

  /**
   * Opens the Razorpay window. Resolves true once it is open, false if it could
   * not be opened (script blocked, offline). `onDismiss` runs if the customer
   * closes the window without paying.
   */
  async function open(options, { onDismiss } = {}) {
    try {
      await loadCheckoutScript();
    } catch (err) {
      if (typeof eToast === "function") {
        eToast("Could not load the payment window. Check your connection and try again.", "error");
      }
      return false;
    }

    const merged = Object.assign({}, options, {
      modal: Object.assign({}, options.modal, {
        ondismiss: function () {
          if (typeof onDismiss === "function") onDismiss();
        },
      }),
    });

    const instance = new window.Razorpay(merged);
    instance.open();
    return true;
  }

  window.EleganceRazorpay = { preload: loadCheckoutScript, open: open };
})();
