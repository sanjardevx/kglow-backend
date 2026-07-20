console.log("Order confirmation frontend javascript file");

$(function () {
  $(".confirm-btn").on("click", async function (e) {
    const id = e.target.id;
    const orderId = id.replace("confirm-", "");
    if (!confirm("Confirm this order?")) return;

    try {
      const response = await axios.post("/admin/order/update", {
        orderId: orderId,
        orderStatus: "CONFIRMED",
      });
      if (response.data.data) {
        location.reload();
      } else alert("Order update failed!");
    } catch (err) {
      console.log(err);
      alert("Order update failed!");
    }
  });

  $(".reject-btn").on("click", async function (e) {
    const id = e.target.id;
    const orderId = id.replace("reject-", "");
    if (!confirm("Reject this order?")) return;

    try {
      const response = await axios.post("/admin/order/update", {
        orderId: orderId,
        orderStatus: "REJECTED",
      });
      if (response.data.data) {
        location.reload();
      } else alert("Order update failed!");
    } catch (err) {
      console.log(err);
      alert("Order update failed!");
    }
  });
});