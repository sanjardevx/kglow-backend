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

/** Custom YouTube player state. We mount the official IFrame Player API
 * with `controls: 0`, which hides ALL of YouTube's own UI (title overlay,
 * play button, settings, CC — everything) in one shot, and drive playback
 * ourselves with the play/pause + mute + progress bar built below. This is
 * the only way to get rid of YouTube's title overlay — there is no
 * embed parameter that hides just the title (the old `showinfo` param that
 * used to do that was removed by YouTube in 2018). */
let ytApiReady = false;
let ytApiQueue = [];
const ytPlayers = {};
const ytProgressTimers = {};
// Only one short should ever be playing — starting (or resuming) one pauses
// whichever other mount was previously active.
let ytActiveMountId = null;

window.onYouTubeIframeAPIReady = function () {
  ytApiReady = true;
  ytApiQueue.forEach((fn) => fn());
  ytApiQueue = [];
};

function withYouTubeApi(fn) {
  if (ytApiReady && window.YT && window.YT.Player) fn();
  else ytApiQueue.push(fn);
}

function startYouTubePlayer($btn, embedId) {
  const mountId = `yt-mount-${embedId}-${Math.random().toString(36).slice(2, 8)}`;

  // Shorts-style chrome: tap anywhere on the video to play/pause, a small
  // round mute button in the top-right corner that opens a volume slider
  // right underneath it (closed by default), and a bottom bar holding
  // play/pause + the video's seek/progress bar.
  const $wrap = $(
    '<div class="tutorial-yt-mount-wrap">' +
      `<div id="${mountId}" class="tutorial-yt-mount"></div>` +
      '<button type="button" class="tutorial-yt-tap-toggle" aria-label="Play/Pause"></button>' +
      '<div class="tutorial-yt-volume-wrap">' +
      '<button type="button" class="tutorial-yt-mute" aria-label="Mute/Unmute">' +
      '<svg class="icon-unmuted" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"></path></svg>' +
      '<svg class="icon-muted" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M3 9v6h4l5 5V4L7 9H3z"></path><line x1="15" y1="9" x2="21" y2="15" stroke="currentColor" stroke-width="2"></line><line x1="21" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2"></line></svg>' +
      "</button>" +
      '<input type="range" class="tutorial-yt-volume" min="0" max="100" value="100" aria-label="Volume" orient="vertical" />' +
      "</div>" +
      '<div class="tutorial-yt-bottom-controls">' +
      '<button type="button" class="tutorial-yt-playpause" aria-label="Play/Pause">' +
      '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' +
      '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" style="display:none"><polygon points="6,4 20,12 6,20"></polygon></svg>' +
      "</button>" +
      '<div class="tutorial-yt-progress"><div class="tutorial-yt-progress-fill"></div></div>' +
      "</div>" +
      "</div>",
  );
  $btn.replaceWith($wrap);

  function pauseOtherPlayers() {
    if (ytActiveMountId && ytActiveMountId !== mountId) {
      const other = ytPlayers[ytActiveMountId];
      if (other && other.pauseVideo) other.pauseVideo();
    }
    ytActiveMountId = mountId;
  }

  const player = new YT.Player(mountId, {
    videoId: embedId,
    playerVars: {
      controls: 0,
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      iv_load_policy: 3,
      playsinline: 1,
      disablekb: 1,
      fs: 0,
    },
    events: {
      onReady: function (e) {
        pauseOtherPlayers();
        e.target.playVideo();
        ytProgressTimers[mountId] = setInterval(() => {
          const p = ytPlayers[mountId];
          const duration = p && p.getDuration && p.getDuration();
          if (!duration) return;
          const ratio = p.getCurrentTime() / duration;
          $wrap.find(".tutorial-yt-progress-fill").css("width", `${ratio * 100}%`);
        }, 400);
      },
      onStateChange: function (e) {
        const playing = e.data === YT.PlayerState.PLAYING;
        if (playing) pauseOtherPlayers();
        $wrap.find(".tutorial-yt-playpause .icon-pause").toggle(playing);
        $wrap.find(".tutorial-yt-playpause .icon-play").toggle(!playing);
      },
    },
  });
  ytPlayers[mountId] = player;

  function togglePlayPause() {
    const p = ytPlayers[mountId];
    if (!p) return;
    if (p.getPlayerState() === 1) p.pauseVideo();
    else p.playVideo();
  }

  $wrap.find(".tutorial-yt-tap-toggle, .tutorial-yt-playpause").on("click", togglePlayPause);

  // Mute button just opens/closes the volume slider underneath it — the
  // slider itself is the actual volume control (dragging it to 0 mutes,
  // above 0 unmutes), not a plain on/off toggle.
  $wrap.find(".tutorial-yt-mute").on("click", function () {
    $wrap.find(".tutorial-yt-volume-wrap").toggleClass("open");
  });

  $wrap.find(".tutorial-yt-volume").on("input", function () {
    const p = ytPlayers[mountId];
    if (!p) return;
    const volume = Number(this.value);
    p.setVolume(volume);
    if (volume === 0) p.mute();
    else p.unMute();
    $wrap.find(".tutorial-yt-mute .icon-unmuted").toggle(volume > 0);
    $wrap.find(".tutorial-yt-mute .icon-muted").toggle(volume === 0);
  });

  // Closes itself once the admin lets go of the slider (the "change" event
  // fires on release, unlike "input" which fires continuously while
  // dragging) — no need to click the mute icon again just to dismiss it.
  $wrap.find(".tutorial-yt-volume").on("change", function () {
    $wrap.find(".tutorial-yt-volume-wrap").removeClass("open");
  });

  $wrap.find(".tutorial-yt-progress").on("click", function (e) {
    const p = ytPlayers[mountId];
    if (!p) return;
    const rect = this.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    p.seekTo(p.getDuration() * ratio, true);
  });
}

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

  /** Click-to-play: swap the thumbnail button for our custom-controlled
   * YouTube player (controls: 0 — no native title/UI at all) only once the
   * admin actually wants to watch it. */
  $(".tutorial-play-btn").on("click", function () {
    const $btn = $(this);
    const embedId = $btn.data("embed-id");
    withYouTubeApi(() => startYouTubePlayer($btn, embedId));
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
