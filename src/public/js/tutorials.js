console.log("Tutorials frontend javascript file");

// Same extraction rules as src/libs/utils/tutorialLink.ts on the server —
// duplicated here because this is a plain script tag, no bundler, so the
// server's TS util can't be imported directly. Only used for the live
// preview; the server re-parses (and is the one that actually decides what
// gets saved) when the form is submitted.
const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
];
const INSTAGRAM_ID_PATTERN = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/;

function parseTutorialLinkClient(url) {
  if (!url) return null;
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return { platform: "YOUTUBE", embedId: match[1] };
  }
  const igMatch = url.match(INSTAGRAM_ID_PATTERN);
  if (igMatch) return { platform: "INSTAGRAM", embedId: igMatch[1] };
  return null;
}

function renderTutorialPreview(url) {
  const $preview = $("#tutorial-url-preview");
  const parsed = parseTutorialLinkClient(url);

  if (!parsed) {
    $preview.html(
      url
        ? '<div class="preview-hint preview-hint-bad">Link not recognised — paste a YouTube or Instagram link.</div>'
        : "",
    );
    return;
  }

  if (parsed.platform === "YOUTUBE") {
    $preview.html(
      `<iframe src="https://www.youtube.com/embed/${parsed.embedId}" frameborder="0" allowfullscreen></iframe>`,
    );
  } else {
    $preview.html(
      `<blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14"></blockquote>`,
    );
    if (window.instgrm) window.instgrm.Embeds.process();
  }
}

let previewTimer = null;

$(function () {
  $("#process-btn").on("click", () => {
    $(".tutorial-container").slideToggle(500);
    $("#process-btn").css("display", "none");
  });

  $("#cancel-btn").on("click", () => {
    $(".tutorial-container").slideToggle(500);
    $("#process-btn").css("display", "flex");
  });

  // Debounced — waits for a short pause in typing/pasting rather than
  // re-parsing on every keystroke.
  $("#tutorial-url-input").on("input", function () {
    const url = $(this).val().trim();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => renderTutorialPreview(url), 400);
  });

  /** Status toggle **/
  $(".tutorial-status").on("change", async function (e) {
    const id = e.target.id;
    const tutorialStatus = $(`#${id}.tutorial-status`).val();

    try {
      const response = await axios.post(`/admin/tutorial/${id}`, {
        tutorialStatus: tutorialStatus,
      });
      if (response.data.data) {
        $(`#${id}.tutorial-status`)
          .removeClass("status-active status-hidden")
          .addClass(`status-${tutorialStatus.toLowerCase()}`)
          .blur();
      } else alert("Tutorial update failed!");
    } catch (err) {
      console.log(err);
      alert("Tutorial update failed!");
    }
  });

  /** Inline edit open/close **/
  $(".tutorial-edit-btn").on("click", function () {
    const id = $(this).data("id");
    $(`#edit-${id}`).slideToggle(300);
  });

  $(".tutorial-edit-cancel").on("click", function () {
    const id = $(this).data("id");
    $(`#edit-${id}`).slideUp(300);
  });

  $(".tutorial-edit-save").on("click", async function () {
    const id = $(this).data("id");
    const $form = $(`#edit-${id}`);
    const tutorialTitle = $form.find(".edit-title").val();
    const tutorialCategory = $form.find(".edit-category").val();
    const tutorialDescription = $form.find(".edit-desc").val();

    if (!tutorialTitle) {
      alert("Title cannot be empty!");
      return;
    }

    try {
      const response = await axios.post(`/admin/tutorial/${id}`, {
        tutorialTitle,
        tutorialCategory,
        tutorialDescription,
      });
      const result = response.data.data;
      if (result) {
        const $card = $(`#card-${id}`);
        $card.find(".tutorial-title").text(result.tutorialTitle);
        $card.find(".tutorial-desc").text(result.tutorialDescription || "");
        $card.find(".tutorial-category").text(result.tutorialCategory || "");
        $form.slideUp(300);
      } else alert("Tutorial update failed!");
    } catch (err) {
      console.log(err);
      alert("Tutorial update failed!");
    }
  });

  /** Delete — confirm() has to run inside this same handler (not a
   * separate onclick on the button) so that clicking Cancel actually stops
   * the axios call instead of just failing to block a competing listener. */
  $(".tutorial-delete-btn").on("click", async function () {
    if (!confirm("This tutorial will be permanently deleted. Continue?"))
      return;

    const id = $(this).data("id");

    try {
      const response = await axios.delete(`/admin/tutorial/${id}`);
      if (response.data.data) {
        $(`#card-${id}`).remove();
      } else alert("Tutorial delete failed!");
    } catch (err) {
      console.log(err);
      alert("Tutorial delete failed!");
    }
  });
});

function validateTutorialForm() {
  const tutorialUrl = $("#tutorial-url-input").val();
  const tutorialTitle = $("#tutorial-title-input").val();

  if (!tutorialUrl || !tutorialTitle) {
    alert("Please insert the video link and a title!");
    return false;
  }
  if (!parseTutorialLinkClient(tutorialUrl)) {
    alert("Link not recognised — paste a YouTube or Instagram link.");
    return false;
  }
  return true;
}
