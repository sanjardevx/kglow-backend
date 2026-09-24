console.log("Products frontend javascript file");

const MAX_PRODUCT_IMAGES = 5;
const VALID_IMAGE_TYPES = [
  "image/jpg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

/** Edit-drawer state. `drawerImages` holds the stored paths the admin has
 * left in place and `drawerNewFiles` the freshly picked File objects; on save
 * the first list goes up as JSON and the second as multipart, and the server
 * deletes whatever fell out of the first. */
let drawerProductId = null;
let drawerImages = [];
let drawerNewFiles = [];

function renderDrawerMedia() {
  const $media = $("#drawer-media").empty();

  const filled = [
    ...drawerImages.map((imagePath, index) => ({
      type: "kept",
      index: index,
      src: "/" + imagePath,
    })),
    ...drawerNewFiles.map((file, index) => ({
      type: "new",
      index: index,
      src: URL.createObjectURL(file),
    })),
  ];

  // Built with .attr() rather than a template string so a path or filename
  // containing a quote can't break out of the attribute.
  filled.forEach((item) => {
    const $slot = $('<div class="drawer-slot filled"></div>');
    $("<img alt='' />").attr("src", item.src).appendTo($slot);
    $('<button type="button" class="drawer-slot-remove">&times;</button>')
      .attr("data-type", item.type)
      .attr("data-index", item.index)
      .appendTo($slot);
    $media.append($slot);
  });

  for (let i = filled.length; i < MAX_PRODUCT_IMAGES; i++) {
    $media.append(
      '<div class="drawer-slot">' +
        '<span class="drawer-slot-empty">+</span>' +
        '<input type="file" accept="image/*" />' +
        "</div>",
    );
  }
}

function openDrawer() {
  $("#drawer-backdrop").addClass("open");
  $("#product-drawer").addClass("open");
}

function closeDrawer() {
  $("#drawer-backdrop").removeClass("open");
  $("#product-drawer").removeClass("open");
}

$(function () {
  $("#process-btn").on("click", () => {
    $(".dish-container").slideToggle(500);
    $("#process-btn").css("display", "none");
  });

  $("#cancel-btn").on("click", () => {
    $(".dish-container").slideToggle(500);
    $("#process-btn").css("display", "flex");
  });

    $(".new-product-status").on("change", async function (e) {
    const id = e.target.id;
    const productStatus = $(`#${id}.new-product-status`).val();

    try {
      const response = await axios.post(`/admin/product/${id}`, {
        productStatus: productStatus,
      });
      console.log("response:", response);
      const result = response.data;
      if (result.data) {
        $(`#${id}.new-product-status`)
          .removeClass("status-pause status-process status-delete")
          .addClass(`status-${productStatus.toLowerCase()}`)
          .blur();
      } else alert("Product update failed!");
    } catch (err) {
      console.log(err);
      alert("Product update failed!");
    }
  });

  /** The whole table's data is embedded once as JSON, so opening the drawer
   * needs no extra request — it just looks the product up by id. */
  const productsData = JSON.parse(
    document.getElementById("products-data").textContent,
  );

  $(".product-edit-btn").on("click", function () {
    const id = String($(this).data("id"));
    const product = productsData.find((item) => String(item._id) === id);
    if (!product) return;

    drawerProductId = id;
    drawerImages = [...(product.productImages || [])];
    drawerNewFiles = [];

    $("#edit-name").val(product.productName);
    $("#edit-brand").val(product.productBrand);
    $("#edit-category").val(product.productCategory);
    $("#edit-volume").val(product.productVolume);
    $("#edit-status").val(product.productStatus);
    $("#edit-price").val(product.productPrice);
    $("#edit-left").val(product.productLeftCount);

    renderDrawerMedia();
    openDrawer();
  });

  $("#drawer-close, #drawer-cancel, #drawer-backdrop").on("click", closeDrawer);

  // Delegated: the slots are rebuilt on every change, so handlers bound to
  // them directly would be lost after the first edit.
  $("#drawer-media").on("change", "input[type='file']", function () {
    const file = this.files[0];
    if (!file) return;

    if (!VALID_IMAGE_TYPES.includes(file.type)) {
      alert("Please insert only jpeg, jpg, png, webp or avif!");
      this.value = "";
      return;
    }

    drawerNewFiles.push(file);
    renderDrawerMedia();
  });

  $("#drawer-media").on("click", ".drawer-slot-remove", function () {
    const index = Number($(this).data("index"));
    if ($(this).data("type") === "kept") drawerImages.splice(index, 1);
    else drawerNewFiles.splice(index, 1);
    renderDrawerMedia();
  });

  $("#drawer-save").on("click", async function () {
    const productName = $("#edit-name").val().trim(),
      productBrand = $("#edit-brand").val().trim(),
      productVolume = $("#edit-volume").val().trim(),
      productPrice = $("#edit-price").val(),
      productLeftCount = $("#edit-left").val();

    if (
      !productName ||
      !productBrand ||
      !productVolume ||
      productPrice === "" ||
      productLeftCount === ""
    ) {
      alert("Please fill in every field!");
      return;
    }
    if (!drawerImages.length && !drawerNewFiles.length) {
      alert("A product needs at least one image!");
      return;
    }

    const form = new FormData();
    form.append("productName", productName);
    form.append("productBrand", productBrand);
    form.append("productCategory", $("#edit-category").val());
    form.append("productVolume", productVolume);
    form.append("productStatus", $("#edit-status").val());
    form.append("productPrice", productPrice);
    form.append("productLeftCount", productLeftCount);
    form.append("keptImages", JSON.stringify(drawerImages));
    drawerNewFiles.forEach((file) => form.append("productImages", file));

    // Disabled while in flight: a double click would upload the files twice.
    const $save = $(this).prop("disabled", true).text("Saving...");

    try {
      const response = await axios.post(
        `/admin/product/${drawerProductId}/edit`,
        form,
      );
      if (response.data.data) window.location.reload();
      else alert("Product update failed!");
    } catch (err) {
      console.log(err);
      alert(err.response?.data?.message || "Product update failed!");
    } finally {
      $save.prop("disabled", false).text("Save");
    }
  });
});

function validateForm() {
  const productName = $(".product-name").val(),
   productBrand = $(".product-brand").val(),
   productPrice = $(".product-price").val(),
   productLeftCount = $(".product-left-count").val(),
   productCategory = $(".product-category").val(),
   productVolume = $(".product-volume").val(),
   productDesc = $(".product-desc").val(),
   productStatus = $(".product-status").val();

  if (
    productName === "" ||
    productBrand === "" ||
    productPrice === "" ||
    productLeftCount === "" ||
    productCategory === "" ||
    productVolume === "" ||
    productDesc === "" ||
    productStatus === ""
  ) {
    alert("Please insert all details!");
    return false;
  } else return true;
}

function previewFileHandler(input, order) {
  const imgClassName = input.className;
  console.log("input:", input);

  const file = $(`.${imgClassName}`).get(0).files[0];
  const fileType = file["type"];

  if (!VALID_IMAGE_TYPES.includes(fileType)) {
    alert("Please insert only jpeg, jpg, png, webp or avif!");
  } else {
    if (file) {
      const reader = new FileReader();
      reader.onload = function () {
        $(`#image-section-${order}`).attr("src", reader.result);
      };
      reader.readAsDataURL(file);
    }
  }
}