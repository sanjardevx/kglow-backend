/**
 * Admin → Discount: shows what the current setting does to a real basket.
 *
 * The percentage on its own is easy to fat-finger — 100 instead of 10 reads
 * fine as a number and gives the shop away. Spelling the effect out in so'm
 * makes that obvious before the form is saved.
 *
 * The arithmetic mirrors calculateOrderTotals on the server: one rounding, on
 * the discount, so this preview can never promise a total the checkout would
 * not actually produce.
 */
(function () {
  var SAMPLE = 500000;

  var percentInput = document.getElementById("percent-input");
  var activeInput = document.getElementById("active-input");
  var preview = document.getElementById("preview");
  var pill = document.getElementById("state-pill");
  if (!percentInput || !activeInput || !preview) return;

  function format(value) {
    return value.toLocaleString("en-US");
  }

  function render() {
    var percent = Number(percentInput.value);
    var running = activeInput.checked && percent > 0;

    if (pill) {
      pill.className = "state-pill " + (running ? "on" : "off");
      pill.textContent = running ? "SALE IS ON" : "SALE IS OFF";
    }

    if (!running) {
      preview.className = "discount-preview off";
      preview.textContent =
        "No discount — shoppers pay the full basket total.";
      return;
    }

    var discount = Math.round((SAMPLE * Math.min(percent, 100)) / 100);
    preview.className = "discount-preview on";
    preview.textContent =
      "A " +
      format(SAMPLE) +
      " so'm basket pays " +
      format(SAMPLE - discount) +
      " so'm — " +
      format(discount) +
      " so'm off.";
  }

  percentInput.addEventListener("input", render);
  activeInput.addEventListener("change", render);
  render();
})();
