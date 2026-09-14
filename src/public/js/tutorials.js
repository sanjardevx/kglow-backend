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
      `<iframe src="https://www.youtube.com/embed/${parsed.embedId}?rel=0&modestbranding=1&iv_load_policy=3" frameborder="0" allowfullscreen></iframe>`,
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

  /** Click-to-play: swap the thumbnail button for the real YouTube iframe
   * only once the admin actually wants to watch it. Built with .attr()
   * rather than a template-literal string so a title containing a quote
   * character can't break out of an attribute. */
  $(".tutorial-play-btn").on("click", function () {
    const embedId = $(this).data("embed-id");
    const title = $(this).data("title");
    const $iframe = $("<iframe>")
      .attr(
        "src",
        `https://www.youtube.com/embed/${embedId}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`,
      )
      .attr("title", title)
      .attr("frameborder", "0")
      .attr(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      )
      .attr("allowfullscreen", "");
    $(this).replaceWith($iframe);
  });

  /** Status toggle — the colour now lives on the .tutorial-status-wrap
   * (the dot + pill), not the select itself, so the class swap targets
   * that wrapper instead. **/
  $(".tutorial-status").on("change", async function () {
    const id = this.id;
    const tutorialStatus = $(this).val();

    try {
      const response = await axios.post(`/admin/tutorial/${id}`, {
        tutorialStatus: tutorialStatus,
      });
      if (response.data.data) {
        $(this)
          .closest(".tutorial-status-wrap")
          .removeClass("status-active status-hidden")
          .addClass(`status-${tutorialStatus.toLowerCase()}`);
        $(this).blur();
        // The edit overlay carries its own copy of the status and saves it
        // alongside the title/URL — without this it would still hold the
        // pre-change value and silently revert the status on the next save.
        $(`#tutorial-edit-overlay-${id}`).find(".edit-status").val(tutorialStatus);
      } else alert("Tutorial update failed!");
    } catch (err) {
      console.log(err);
      alert("Tutorial update failed!");
    }
  });

  /** Edit — an overlay scoped to just that one card (`#tutorial-edit-
   * overlay-<id>`), not a page-wide modal and not an inline panel that grew
   * the card's own height — either of those used to spill into the grid
   * row's other cards. **/
  $(".tutorial-edit-btn").on("click", function () {
    const id = $(this).data("id");
    $(`#tutorial-edit-overlay-${id}`).addClass("open");
  });

  $(".tutorial-edit-cancel, .tutorial-edit-overlay-close").on(
    "click",
    function () {
      const id = $(this).data("id");
      $(`#tutorial-edit-overlay-${id}`).removeClass("open");
    },
  );

  $(".tutorial-edit-save").on("click", async function () {
    const id = $(this).data("id");
    const $overlay = $(`#tutorial-edit-overlay-${id}`);
    const tutorialTitle = $overlay.find(".edit-title").val();
    const tutorialUrl = $overlay.find(".edit-url").val();
    const tutorialStatus = $overlay.find(".edit-status").val();

    if (!tutorialTitle || !tutorialUrl) {
      alert("Title and video link cannot be empty!");
      return;
    }

    try {
      const response = await axios.post(`/admin/tutorial/${id}`, {
        tutorialTitle,
        tutorialUrl,
        tutorialStatus,
      });
      if (response.data.data) {
        // The link can change platform/embed id, which changes what markup
        // the card needs to show (iframe vs. thumbnail vs. Instagram
        // blockquote) — simplest to just re-render from the server rather
        // than patch that live.
        window.location.reload();
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
