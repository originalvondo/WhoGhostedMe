// popup.js - WhoGhostedMe V2.0 Clean-Slate Controller
// Universal Instagram Relationship Manager & Viewer-Centric State Machine

// DOM Elements
const activeProfileLink = document.getElementById("activeProfileLink");
const scanBtn = document.getElementById("scanBtn");
const startScreen = document.getElementById("startScreen");
const startScanBtn = document.getElementById("startScanBtn");

// Progress Elements
const progressSection = document.getElementById("progressSection");
const followingSpinner = document.getElementById("followingSpinner");
const followingCountText = document.getElementById("followingCountText");
const followingProgressFill = document.getElementById("followingProgressFill");
const followersSpinner = document.getElementById("followersSpinner");
const followersCountText = document.getElementById("followersCountText");
const followersProgressFill = document.getElementById("followersProgressFill");

// Private Profile Elements
const privateCard = document.getElementById("privateCard");
const privateAvatar = document.getElementById("privateAvatar");
const privateName = document.getElementById("privateName");
const privateBio = document.getElementById("privateBio");
const privateFollowingCount = document.getElementById("privateFollowingCount");
const privateFollowerCount = document.getElementById("privateFollowerCount");
const privateNoticeText = document.getElementById("privateNoticeText");
const privateActionBtn = document.getElementById("privateActionBtn");

// Tabs & Counters
const tabsNav = document.getElementById("tabsNav");
const tabButtons = document.querySelectorAll(".tab-btn");
const countNotFollowingBack = document.getElementById("countNotFollowingBack");
const countFans = document.getElementById("countFans");
const countFollowings = document.getElementById("countFollowings");
const countFollowers = document.getElementById("countFollowers");

const summaryPillWrap = document.getElementById("summaryPillWrap");
const summaryPill = document.getElementById("summaryPill");

// Secondary Controls
const controlsBar = document.getElementById("controlsBar");
const filterPills = document.querySelectorAll(".pill-btn");
const listContainer = document.getElementById("listContainer");

// Notice Card
const noticeCard = document.getElementById("noticeCard");
const noticeTitle = document.getElementById("noticeTitle");
const noticeDesc = document.getElementById("noticeDesc");
const noticeBtn = document.getElementById("noticeBtn");

// State
let activeTabId = null;
let currentTab = "notFollowingBack";
let currentFilter = "all";

let dataSets = {
  notFollowingBack: [],
  fans: [],
  followings: [],
  followers: []
};

let targetProfile = null;
let currentDetectedUsername = null;

const SVG_FALLBACK_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDQiIGhlaWdodD0iNDQiIHZpZXdCb3g9IjAgMCA0NCA0NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjIiIGN5PSIyMiIgcj0iMjIiIGZpbGw9IiNlNWU3ZWIiLz4KPHBhdGggZD0iTTIyIDEzQzE3Ljg2IDEzIDE0LjUgMTYuMzYgMTQuNSAyMC41QzE0LjUgMjQuNjQgMTcuODYgMjggMjIgMjhDMjYuMTQgMjggMjkuNSAyNC42NCAyOS41IDIwLjVDMjkuNSAxNi4zNiAyNi4xNCAxMyAyMiAxMloiIGZpbGw9IiM5Y2EzYWYiLz4KPHBhdGggZD0iTTIyIDMxQzI2LjE0IDMxIDMwLjY0IDMwLjM0IDMzLjUgMjguNUMzMC42NCAyNi42NiAyNi4xNCAyNiAyMiAyNkMxNy44NiAyNiAxMy4zNiAyNi42NiAxMC41IDI4LjVDMTMuMzYgMzAuMzQgMTcuODYgMzEgMjIgMzFaIiBmaWxsPSIjOWNhM2FmIi8+Cjwvc3ZnPg==';

// Helpers
function showNotice(title, desc, buttonText, buttonAction) {
  startScreen.style.display = "none";
  progressSection.style.display = "none";
  privateCard.style.display = "none";
  tabsNav.style.display = "none";
  if (summaryPillWrap) summaryPillWrap.style.display = "none";
  controlsBar.style.display = "none";
  listContainer.style.display = "none";

  noticeCard.style.display = "block";
  noticeTitle.textContent = title;
  noticeDesc.textContent = desc;

  if (buttonText && buttonAction) {
    noticeBtn.textContent = buttonText;
    noticeBtn.style.display = "inline-block";
    noticeBtn.onclick = buttonAction;
  } else {
    noticeBtn.style.display = "none";
  }
}

function updateSummaryPill() {
  if (!summaryPill || !summaryPillWrap) return;
  const count = dataSets[currentTab]?.length || 0;
  const isOwn = Boolean(targetProfile?.isOwnProfile);

  let text = "";
  if (currentTab === "notFollowingBack") {
    text = isOwn
      ? `<strong>${count}</strong> people don't follow you back`
      : `<strong>${count}</strong> people don't follow back`;
  } else if (currentTab === "fans") {
    text = isOwn
      ? `<strong>${count}</strong> people you don't follow back`
      : `<strong>${count}</strong> people they don't follow back`;
  } else if (currentTab === "followings") {
    text = `Following <strong>${count}</strong> accounts`;
  } else if (currentTab === "followers") {
    text = `<strong>${count}</strong> followers`;
  }

  summaryPill.innerHTML = `<span>${text}</span>`;
}

function updateCounts() {
  countNotFollowingBack.textContent = dataSets.notFollowingBack.length;
  countFans.textContent = dataSets.fans.length;
  countFollowings.textContent = dataSets.followings.length;
  countFollowers.textContent = dataSets.followers.length;

  const isOwn = Boolean(targetProfile?.isOwnProfile);
  const tabNotFollowingBackLabel = document.querySelector('.tab-btn[data-tab="notFollowingBack"] .tab-label');
  const tabFansLabel = document.querySelector('.tab-btn[data-tab="fans"] .tab-label');
  if (tabNotFollowingBackLabel) {
    tabNotFollowingBackLabel.textContent = isOwn ? "Not following you" : "Don't follow them back";
  }
  if (tabFansLabel) {
    tabFansLabel.textContent = isOwn ? "You don't follow back" : "They don't follow back";
  }

  updateSummaryPill();
}

function getActiveList() {
  let list = dataSets[currentTab] || [];

  if (currentFilter === "besties") {
    return list.filter(u => u.is_bestie);
  } else if (currentFilter === "private") {
    return list.filter(u => u.is_private);
  }

  return list;
}

// Render User Cards
function renderList() {
  const users = getActiveList();
  listContainer.innerHTML = "";

  if (users.length === 0) {
    let emptyIcon = "🔍";
    let emptyTitle = "No accounts found";
    let emptySub = "Try clearing your search query or filters.";

    if (!listQuery && currentFilter === "all") {
      if (currentTab === "notFollowingBack") {
        emptyIcon = "🎉";
        emptyTitle = "No Ghosts Found!";
        emptySub = "Everyone this account follows follows them back.";
      } else if (currentTab === "fans") {
        emptyIcon = "✨";
        emptyTitle = "No Pending Fans";
        emptySub = "All followers are followed back.";
      } else if (currentTab === "mutual") {
        emptyIcon = "🤝";
        emptyTitle = "No Mutual Connections";
        emptySub = "No accounts with reciprocal follow status.";
      } else if (currentTab === "followings") {
        emptyIcon = "👥";
        emptyTitle = "Not Following Anyone";
        emptySub = "This account is not following anyone yet.";
      } else if (currentTab === "followers") {
        emptyIcon = "👋";
        emptyTitle = "No Followers Yet";
        emptySub = "This account has no followers yet.";
      }
    }

    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${emptyIcon}</div>
        <div class="empty-state-text">${emptyTitle}</div>
        <div class="empty-state-sub">${emptySub}</div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const user of users) {
    const card = document.createElement("div");
    card.className = "user-card";
    card.dataset.userId = user.id;

    // Clickable Body -> Opens Instagram Profile in new tab
    const cardMain = document.createElement("a");
    cardMain.className = "user-card-main";
    cardMain.href = `https://www.instagram.com/${encodeURIComponent(user.username)}/`;
    cardMain.target = "_blank";
    cardMain.rel = "noopener noreferrer";

    // Avatar with Close Friends Green Story Ring
    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = `avatar-wrapper ${user.is_bestie ? "is-bestie" : ""}`;

    const img = document.createElement("img");
    img.className = "avatar";
    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    img.src = user.profile_pic_url || SVG_FALLBACK_AVATAR;

    img.onerror = () => {
      if (img.dataset.triedFallback !== "true" && user.profile_pic_url && user.profile_pic_url.startsWith("http")) {
        img.dataset.triedFallback = "true";
        fetch(user.profile_pic_url, { referrerPolicy: "no-referrer" })
          .then(r => r.ok ? r.blob() : null)
          .then(blob => {
            img.src = blob ? URL.createObjectURL(blob) : SVG_FALLBACK_AVATAR;
          })
          .catch(() => {
            img.src = SVG_FALLBACK_AVATAR;
          });
      } else {
        img.src = SVG_FALLBACK_AVATAR;
      }
    };

    avatarWrapper.appendChild(img);

    // User Details
    const userMeta = document.createElement("div");
    userMeta.className = "user-meta";

    const usernameRow = document.createElement("div");
    usernameRow.className = "username-row";
    const displayUname = user.username ? (user.username.startsWith("@") ? user.username : `@${user.username}`) : "";
    usernameRow.textContent = displayUname;

    if (user.is_verified) {
      const verified = document.createElement("span");
      verified.className = "verified-badge";
      verified.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      `;
      usernameRow.appendChild(verified);
    }

    const fullName = document.createElement("div");
    fullName.className = "full-name";
    fullName.textContent = user.full_name || "";

    userMeta.appendChild(usernameRow);
    userMeta.appendChild(fullName);

    // Badges & Signals
    const badgesRow = document.createElement("div");
    badgesRow.className = "badges-row";

    if (user.is_bestie) {
      const b = document.createElement("span");
      b.className = "badge badge-bestie";
      b.innerHTML = `
        <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        Close Friend
      `;
      badgesRow.appendChild(b);
    }

    if (user.is_private) {
      const b = document.createElement("span");
      b.className = "badge badge-private";
      b.textContent = "Private";
      badgesRow.appendChild(b);
    }

    if (currentTab === "notFollowingBack") {
      const b = document.createElement("span");
      b.className = "badge badge-ghost";
      b.textContent = "Doesn't follow back";
      badgesRow.appendChild(b);
    }

    if (user.incoming_request) {
      const b = document.createElement("span");
      b.className = "badge badge-req";
      b.textContent = "Requested you";
      badgesRow.appendChild(b);
    }

    if (badgesRow.children.length > 0) {
      userMeta.appendChild(badgesRow);
    }

    cardMain.appendChild(avatarWrapper);
    cardMain.appendChild(userMeta);
    card.appendChild(cardMain);

    // Card Action Buttons
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "card-actions";

    const actionBtn = createActionButton(user);
    actionsWrap.appendChild(actionBtn);

    // If on own profile and user is a follower in fans tab, show Remove Follower button
    const isViewerFan = targetProfile?.isOwnProfile && currentTab === "fans";
    if (isViewerFan) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-remove-follower";
      removeBtn.textContent = "Remove";
      removeBtn.title = "Remove from followers";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        handleRemoveFollower(user, card);
      };
      actionsWrap.appendChild(removeBtn);
    }

    card.appendChild(actionsWrap);
    fragment.appendChild(card);
  }

  listContainer.appendChild(fragment);
}

// Action Button State Machine
function createActionButton(user) {
  const btn = document.createElement("button");
  btn.className = "btn-action";
  btn.dataset.userId = user.id;

  if (user.following) {
    btn.classList.add("btn-following");
    btn.innerHTML = `
      <span class="txt-following">Following</span>
      <span class="txt-unfollow">Unfollow</span>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      handleUnfollow(user, btn);
    };
  } else if (user.outgoing_request) {
    btn.classList.add("btn-requested");
    btn.innerHTML = `
      <span class="txt-requested">Requested</span>
      <span class="txt-cancel">Cancel</span>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      handleUnfollow(user, btn); // destroy endpoint cancels pending requests
    };
  } else {
    btn.classList.add("btn-follow");
    const isFan = targetProfile?.isOwnProfile ? dataSets.followers.some(f => f.id === user.id) : Boolean(user.followed_by);
    btn.textContent = isFan ? "Follow back" : "Follow";
    btn.onclick = (e) => {
      e.stopPropagation();
      handleFollow(user, btn);
    };
  }

  return btn;
}

// Follow Action
function handleFollow(user, btn) {
  if (!activeTabId) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-btn"></span>`;

  chrome.tabs.sendMessage(activeTabId, { action: "followUser", userId: user.id }, (res) => {
    btn.disabled = false;
    if (chrome.runtime.lastError || !res || !res.success) {
      btn.textContent = "Failed";
      setTimeout(() => {
        const isFan = dataSets.followers.some(f => f.id === user.id);
        btn.textContent = isFan ? "Follow back" : "Follow";
      }, 1200);
      return;
    }

    if (res.isRequested) {
      user.outgoing_request = true;
      user.following = false;
      btn.className = "btn-action btn-requested";
      btn.innerHTML = `
        <span class="txt-requested">Requested</span>
        <span class="txt-cancel">Cancel</span>
      `;
      btn.onclick = (e) => {
        e.stopPropagation();
        handleUnfollow(user, btn);
      };
    } else {
      user.following = true;
      user.outgoing_request = false;
      btn.className = "btn-action btn-following";
      btn.innerHTML = `
        <span class="txt-following">Following</span>
        <span class="txt-unfollow">Unfollow</span>
      `;
      btn.onclick = (e) => {
        e.stopPropagation();
        handleUnfollow(user, btn);
      };

      // Optimistic relationship updates
      if (targetProfile?.isOwnProfile) {
        if (!dataSets.followings.some(u => u.id === user.id)) {
          dataSets.followings.push(user);
        }
        // If in fans, remove from fans
        if (dataSets.followers.some(f => f.id === user.id)) {
          dataSets.fans = dataSets.fans.filter(u => u.id !== user.id);
        }
        updateCounts();
      }
    }
  });
}

// Unfollow Action
function handleUnfollow(user, btn) {
  if (!activeTabId) return;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-btn"></span>`;

  chrome.tabs.sendMessage(activeTabId, { action: "unfollowUser", userId: user.id }, (res) => {
    btn.disabled = false;
    if (chrome.runtime.lastError || !res || !res.success) {
      btn.textContent = "Failed";
      setTimeout(() => {
        btn.className = "btn-action btn-following";
        btn.innerHTML = `<span class="txt-following">Following</span><span class="txt-unfollow">Unfollow</span>`;
      }, 1200);
      return;
    }

    user.following = false;
    user.outgoing_request = false;
    btn.className = "btn-action btn-follow";
    const isFan = dataSets.followers.some(f => f.id === user.id);
    btn.textContent = isFan ? "Follow back" : "Follow";
    btn.onclick = (e) => {
      e.stopPropagation();
      handleFollow(user, btn);
    };

    // Optimistic relationship updates
    if (targetProfile?.isOwnProfile) {
      dataSets.followings = dataSets.followings.filter(u => u.id !== user.id);
      // If was follower, now a fan!
      if (dataSets.followers.some(f => f.id === user.id)) {
        if (!dataSets.fans.some(u => u.id === user.id)) {
          dataSets.fans.push(user);
        }
      }
      updateCounts();
    }
  });
}

// Remove Follower Action
function handleRemoveFollower(user, card) {
  if (!activeTabId) return;

  chrome.tabs.sendMessage(activeTabId, { action: "removeFollower", userId: user.id }, (res) => {
    if (chrome.runtime.lastError || !res || !res.success) return;

    // Remove from followers & fans lists
    dataSets.followers = dataSets.followers.filter(u => u.id !== user.id);
    dataSets.fans = dataSets.fans.filter(u => u.id !== user.id);
    updateCounts();

    // Animate removal
    card.style.opacity = "0";
    card.style.transform = "scale(0.95)";
    setTimeout(() => {
      renderList();
    }, 150);
  });
}

// Scan Profile Controller
function startScan() {
  getActiveInstagramTab((tab) => {
    if (!tab || !tab.url || !tab.url.includes("instagram.com")) {
      showNotice(
        "Open Instagram Tab",
        "Please navigate to Instagram in your active tab to use WhoGhostedMe.",
        "Open Instagram",
        () => { chrome.tabs.create({ url: "https://www.instagram.com" }); }
      );
      return;
    }

    activeTabId = tab.id;
    const liveProfileFromUrl = extractProfileFromUrl(tab.url);
    const targetUser = (currentDetectedUsername || liveProfileFromUrl || "").trim().replace(/^@/, '');

    if (!targetUser) {
      showNotice(
        "Navigate to Profile",
        "Please navigate to an Instagram profile to scan.",
        null,
        null
      );
      return;
    }

    updateDetectedProfile(targetUser);

    // Reset previous dataset & results
    dataSets = {
      notFollowingBack: [],
      fans: [],
      followings: [],
      followers: []
    };
    targetProfile = null;

    // Reset UI state
    startScreen.style.display = "none";
    privateCard.style.display = "none";
    tabsNav.style.display = "none";
    if (summaryPillWrap) summaryPillWrap.style.display = "none";
    controlsBar.style.display = "none";
    listContainer.style.display = "none";
    noticeCard.style.display = "none";

    progressSection.style.display = "block";
    followingSpinner.style.display = "inline-block";
    followingProgressFill.style.width = "0%";
    followingCountText.textContent = "Connecting...";

    followersSpinner.style.display = "inline-block";
    followersProgressFill.style.width = "0%";
    followersCountText.textContent = "Connecting...";

    if (scanBtn) scanBtn.disabled = true;
    if (startScanBtn) startScanBtn.disabled = true;

    function dispatchScan() {
      chrome.tabs.sendMessage(activeTabId, { action: "scanProfile", username: targetUser }, (res) => {
        if (scanBtn) scanBtn.disabled = false;
        if (startScanBtn) startScanBtn.disabled = false;

        if (chrome.runtime.lastError) {
          showNotice(
            "Refresh Needed",
            "Could not communicate with Instagram. Please refresh your Instagram tab and click Scan again.",
            "Refresh Tab",
            () => { chrome.tabs.reload(activeTabId); }
          );
          return;
        }

        if (!res || !res.success) {
          showNotice("Scan Notice", res?.error || "Failed to scan profile.", null, null);
          return;
        }

        targetProfile = res.profile;

        // Update header details
        const handle = `@${res.profile.username}`;
        activeProfileLink.textContent = handle;
        activeProfileLink.href = `https://www.instagram.com/${encodeURIComponent(res.profile.username)}/`;

        // Handle Scenario 3: Private Account not followed
        if (res.isRestrictedPrivate) {
          progressSection.style.display = "none";
          privateCard.style.display = "block";
          privateAvatar.src = res.profile.profile_pic_url || SVG_FALLBACK_AVATAR;
          privateName.textContent = `@${res.profile.username}`;
          privateBio.textContent = res.profile.biography || res.profile.full_name || "Private Account";
          privateFollowingCount.textContent = res.profile.following_count;
          privateFollowerCount.textContent = res.profile.follower_count;

          const doesFollowViewer = Boolean(res.profile.friendship_status?.followed_by);
          privateNoticeText.textContent = doesFollowViewer
            ? `@${res.profile.username} follows you, but their profile is private. Follow back to view their relationships.`
            : `This account is private. Follow @${res.profile.username} to view their relationships.`;

          if (res.profile.friendship_status?.outgoing_request) {
            privateActionBtn.className = "btn-action btn-requested";
            privateActionBtn.innerHTML = `<span class="txt-requested">Requested</span><span class="txt-cancel">Cancel</span>`;
            privateActionBtn.onclick = () => handleUnfollow(res.profile, privateActionBtn);
          } else {
            privateActionBtn.className = "btn-action btn-follow";
            privateActionBtn.textContent = doesFollowViewer ? "Follow back" : "Follow";
            privateActionBtn.onclick = () => handleFollow(res.profile, privateActionBtn);
          }
          return;
        }

        // Populate dataset
        dataSets.notFollowingBack = res.notFollowingBack || [];
        dataSets.fans = res.fans || [];
        dataSets.followings = res.followings || [];
        dataSets.followers = res.followers || [];

        updateCounts();

        // Show results
        progressSection.style.display = "none";
        tabsNav.style.display = "flex";
        if (summaryPillWrap) summaryPillWrap.style.display = "flex";
        controlsBar.style.display = "flex";
        listContainer.style.display = "block";

        updateSummaryPill();
        renderList();
      });
    }

    // Ensure content script is running; if not, inject it and scan
    chrome.tabs.sendMessage(activeTabId, { action: "detectProfile" }, (probeRes) => {
      if (chrome.runtime.lastError) {
        injectContentScriptIfNeeded(activeTabId, (injected) => {
          if (injected) {
            dispatchScan();
          } else {
            showNotice(
              "Refresh Needed",
              "Could not communicate with Instagram. Please refresh your Instagram tab and click Scan again.",
              "Refresh Tab",
              () => { chrome.tabs.reload(activeTabId); }
            );
          }
        });
      } else {
        dispatchScan();
      }
    });
  });
}

// Live Progress Listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "scan_progress") {
    progressSection.style.display = "block";

    // Following Bar
    const fgFetched = msg.followingFetched || 0;
    const fgTotal = msg.followingTotal || 0;
    const fgPct = fgTotal > 0 ? Math.min(Math.round((fgFetched / fgTotal) * 100), 100) : (msg.followingDone ? 100 : 0);
    followingProgressFill.style.width = `${msg.followingDone ? 100 : fgPct}%`;
    followingCountText.textContent = fgTotal > 0 ? `${fgFetched} / ${fgTotal} (${fgPct}%)` : `${fgFetched} loaded`;
    followingSpinner.style.display = msg.followingDone ? "none" : "inline-block";

    // Followers Bar
    const frFetched = msg.followersFetched || 0;
    const frTotal = msg.followersTotal || 0;
    const frPct = frTotal > 0 ? Math.min(Math.round((frFetched / frTotal) * 100), 100) : (msg.followersDone ? 100 : 0);
    followersProgressFill.style.width = `${msg.followersDone ? 100 : frPct}%`;
    followersCountText.textContent = frTotal > 0 ? `${frFetched} / ${frTotal} (${frPct}%)` : `${frFetched} loaded`;
    followersSpinner.style.display = msg.followersDone ? "none" : "inline-block";
  }
});

// Tab Switching
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    updateSummaryPill();
    renderList();
  });
});

// Filter Pills
filterPills.forEach(pill => {
  pill.addEventListener("click", () => {
    filterPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    currentFilter = pill.dataset.filter;
    renderList();
  });
});

// Scan Button Listeners
if (scanBtn) {
  scanBtn.addEventListener("click", () => {
    startScan();
  });
}

if (startScanBtn) {
  startScanBtn.addEventListener("click", () => {
    startScan();
  });
}

// Active Profile Detection & Continuous Monitoring
function extractProfileFromUrl(urlStr) {
  try {
    if (!urlStr) return null;
    const url = new URL(urlStr);
    if (!url.hostname.includes("instagram.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    const reserved = new Set([
      "explore", "reels", "stories", "direct", "p", "reel", "accounts",
      "developer", "about", "legal", "home", "api", "graphql", "emails"
    ]);
    if (first && !reserved.has(first.toLowerCase())) {
      return first;
    }
  } catch (e) {}
  return null;
}

function updateDetectedProfile(username, statusMsg) {
  if (username) {
    if (currentDetectedUsername !== username) {
      currentDetectedUsername = username;
      activeProfileLink.textContent = `@${username}`;
      activeProfileLink.href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
      activeProfileLink.title = `View @${username} on Instagram`;
      if (startScanBtn) {
        startScanBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Scan @${username}
        `;
      }
    }
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.title = `Scan @${username}`;
    }
    if (startScanBtn) startScanBtn.disabled = false;
  } else {
    currentDetectedUsername = null;
    activeProfileLink.textContent = statusMsg || "Navigate to a profile";
    activeProfileLink.removeAttribute("href");
    activeProfileLink.title = "";
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.title = "Navigate to an Instagram profile to scan";
    }
    if (startScanBtn) {
      startScanBtn.disabled = true;
      startScanBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Navigate to a Profile to Scan
      `;
    }
  }
}

function getActiveInstagramTab(callback) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    let tab = tabs && tabs[0];
    if (tab && tab.url && tab.url.includes("instagram.com")) {
      callback(tab);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabsCur) => {
      callback(tabsCur && tabsCur[0]);
    });
  });
}

function injectContentScriptIfNeeded(tabId, callback) {
  if (!chrome.scripting) {
    if (callback) callback(false);
    return;
  }
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).then(() => {
    if (callback) callback(true);
  }).catch(() => {
    if (callback) callback(false);
  });
}

function detectCurrentProfile() {
  getActiveInstagramTab((tab) => {
    if (!tab) {
      updateDetectedProfile(null, "No active tab");
      return;
    }
    if (!tab.url || !tab.url.includes("instagram.com")) {
      updateDetectedProfile(null, "Not on Instagram");
      return;
    }

    activeTabId = tab.id;

    // 1. Instant extraction from URL
    const fromUrl = extractProfileFromUrl(tab.url);
    if (fromUrl) {
      updateDetectedProfile(fromUrl);
    } else {
      updateDetectedProfile(null, "Navigate to a profile");
    }

    // 2. Query content script for live confirmation
    chrome.tabs.sendMessage(tab.id, { action: "detectProfile" }, (res) => {
      if (chrome.runtime.lastError) {
        // Content script disconnected or missing? Self-heal!
        injectContentScriptIfNeeded(tab.id);
        return;
      }
      if (res && res.detectedUsername !== undefined) {
        if (res.detectedUsername) {
          updateDetectedProfile(res.detectedUsername);
        } else {
          updateDetectedProfile(null, "Navigate to a profile");
        }
      }
    });
  });
}

// Initial detection immediately on sidepanel load
detectCurrentProfile();

// Active Continuous Monitoring
// 1. 250ms interval for immediate reactivity
setInterval(detectCurrentProfile, 250);

// 2. Tab activation change (switching between tabs)
chrome.tabs.onActivated.addListener(() => {
  detectCurrentProfile();
});

// 3. Tab URL navigation or completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete" || changeInfo.title) {
    detectCurrentProfile();
  }
});

// 4. Real-time notification from content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "profile_changed") {
    if (msg.username) {
      updateDetectedProfile(msg.username);
    } else {
      updateDetectedProfile(null, "Navigate to a profile");
    }
  }
});
