// popup.js
const statusEl = document.getElementById("status");
const errorNoticeEl = document.getElementById("errorNotice");
const progressContainer = document.getElementById("progressContainer");
const followersProgress = document.getElementById("followersProgress");
const followingsProgress = document.getElementById("followingsProgress");
const followersProgressText = document.getElementById("followersProgressText");
const followingsProgressText = document.getElementById("followingsProgressText");
const tabsContainer = document.getElementById("tabsContainer");
const tabGhosted = document.getElementById("tabGhosted");
const tabFans = document.getElementById("tabFans");
const ghostedCountEl = document.getElementById("ghostedCount");
const fansCountEl = document.getElementById("fansCount");
const resultList = document.getElementById("results");
const openBtn = document.getElementById("open");
const bottomWrapper = document.getElementById("bottomWrapper");

let ghostedUsers = [];
let fansUsers = [];
let currentUsername = "";
let unfollowedUsers = new Set();
let followedUsers = new Set();
let requestedUsers = new Set();
let removedFollowers = new Set();
let isOwnProfile = false;
let activeTabId = null;
let currentTab = "ghosted"; // "ghosted" or "fans"

function showStatus(text, withSpinner = true) {
  statusEl.innerHTML = withSpinner
    ? `${text}<span class="spinner"></span>`
    : text;
}

function showErrorNotice(msg) {
  if (!errorNoticeEl) return;
  if (msg) {
    errorNoticeEl.textContent = msg;
    errorNoticeEl.style.display = "block";
  } else {
    errorNoticeEl.style.display = "none";
  }
}

function getActiveGhostedUsers() {
  return (ghostedUsers || []).filter(u => {
    const id = String(u.id || '');
    const uname = (u.username || '').toLowerCase();
    return !unfollowedUsers.has(id) && !unfollowedUsers.has(u.username) && !unfollowedUsers.has(uname);
  });
}

function getActiveFansUsers() {
  return (fansUsers || []).filter(u => {
    const id = String(u.id || '');
    const uname = (u.username || '').toLowerCase();
    return !removedFollowers.has(id) && !removedFollowers.has(u.username) && !removedFollowers.has(uname);
  });
}

function saveState() {
  chrome.storage.local.set({
    ghostedUsers: getActiveGhostedUsers(),
    fansUsers: getActiveFansUsers(),
    targetUsername: currentUsername,
    unfollowedUsers: Array.from(unfollowedUsers),
    followedUsers: Array.from(followedUsers),
    requestedUsers: Array.from(requestedUsers),
    removedFollowers: Array.from(removedFollowers),
    isOwnProfile: isOwnProfile,
    activeTab: currentTab
  });
}

function updateTabCounts() {
  if (ghostedCountEl) ghostedCountEl.textContent = getActiveGhostedUsers().length;
  if (fansCountEl) fansCountEl.textContent = getActiveFansUsers().length;
}

function updateTabLabels() {
  const ghostedLabelEl = document.getElementById("tabGhostedLabel");
  const fansLabelEl = document.getElementById("tabFansLabel");
  if (!ghostedLabelEl || !fansLabelEl) return;

  if (isOwnProfile) {
    ghostedLabelEl.textContent = "Not following you";
    fansLabelEl.textContent = "You don't follow back";
  } else {
    ghostedLabelEl.textContent = "Not following them";
    fansLabelEl.textContent = "They don't follow back";
  }
}

function updateStatusText() {
  if (!currentUsername) return;
  const ghostedCount = getActiveGhostedUsers().length;
  const fansCount = getActiveFansUsers().length;
  if (isOwnProfile) {
    if (currentTab === "ghosted") {
      statusEl.innerHTML = `<strong>${ghostedCount}</strong> people don't follow you back`;
    } else {
      statusEl.innerHTML = `<strong>${fansCount}</strong> people you don't follow back`;
    }
  } else {
    if (currentTab === "ghosted") {
      statusEl.innerHTML = `<strong>${ghostedCount}</strong> people don't follow <strong>@${currentUsername}</strong> back`;
    } else {
      statusEl.innerHTML = `<strong>${fansCount}</strong> people <strong>@${currentUsername}</strong> doesn't follow back`;
    }
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  if (tabGhosted && tabFans) {
    if (tabName === "ghosted") {
      tabGhosted.classList.add("active");
      tabFans.classList.remove("active");
    } else {
      tabFans.classList.add("active");
      tabGhosted.classList.remove("active");
    }
  }
  updateTabLabels();
  updateTabCounts();
  updateStatusText();
  renderCurrentList();
  saveState();
}

const SVG_FALLBACK_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTI1IDE1QzE5LjQ3NzEgMTUgMTUgMTkuNDc3MSAxNSAyNUMxNSAzMC41MjI5IDE5LjQ3NzEgMzUgMjUgMzVDMzAuNTIyOSAzNSAzNSAzMC41MjI5IDM1IDI1QzM1IDE5LjQ3NzEgMzAuNTIyOSAxNSAyNSAxNVoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTI1IDM3QzI5LjQxODMgMzcgMzMgMzMuNDE4MyAzMyAyOUMzMyAyMy41ODE3IDI5LjQxODMgMjAgMjUgMjBDMjAuNTgxNyAyMCAxNyAyMy41ODE3IDE3IDI5QzE3IDMzLjQxODMgMjAuNTgxNyAzNyAyNSAzN1oiIGZpbGw9IiM5OTkiLz4KPC9zdmc+';

function setupLazyAvatar(img, user) {
  if (!img || !user) return;

  const candidateUrls = [
    user.profile_pic_url_hd,
    user.profile_pic_url,
    user.profile_pic_data_url
  ].filter(u => u && typeof u === 'string' && !u.startsWith('data:image/svg'));

  if (candidateUrls.length === 0) {
    img.src = SVG_FALLBACK_AVATAR;
    return;
  }

  let attempt = 0;
  const maxAttempts = 3;
  let retryTimeout = null;

  const tryFetchDataUrl = async (url) => {
    try {
      const res = await fetch(url, {
        referrerPolicy: 'no-referrer',
        credentials: 'omit'
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size === 0) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleImageError = () => {
    attempt++;
    if (attempt > maxAttempts) {
      img.removeEventListener('error', handleImageError);
      img.src = SVG_FALLBACK_AVATAR;
      return;
    }

    // Exponential backoff: 1st retry: 1200ms, 2nd: 2500ms, 3rd: 4500ms
    const delay = attempt === 1 ? 1200 : (attempt === 2 ? 2500 : 4500);

    clearTimeout(retryTimeout);
    retryTimeout = setTimeout(async () => {
      // 1. Try alternative candidate URL if different from current src
      for (const candidate of candidateUrls) {
        if (candidate && img.src !== candidate) {
          img.src = candidate;
          return;
        }
      }

      // 2. Try fetching as data URL directly via extension permissions
      const primaryUrl = candidateUrls[0];
      const dataUrl = await tryFetchDataUrl(primaryUrl);
      if (dataUrl) {
        img.src = dataUrl;
        return;
      }

      // 3. Try relay fetch from Instagram tab if available
      try {
        const relayMsg = { type: "fetchImageBlob", url: primaryUrl };
        const relayCallback = (resp) => {
          if (resp && resp.dataUrl) {
            img.src = resp.dataUrl;
          } else {
            const sep = primaryUrl.includes('?') ? '&' : '?';
            img.src = `${primaryUrl}${sep}_retry=${Date.now()}`;
          }
        };

        if (typeof activeTabId === 'number' && activeTabId) {
          chrome.tabs.sendMessage(activeTabId, relayMsg, (resp) => {
            if (chrome.runtime.lastError || !resp) {
              chrome.runtime.sendMessage({ type: "relayFetchImage", url: primaryUrl }, relayCallback);
            } else {
              relayCallback(resp);
            }
          });
        } else {
          chrome.runtime.sendMessage({ type: "relayFetchImage", url: primaryUrl }, relayCallback);
        }
      } catch {
        const sep = primaryUrl.includes('?') ? '&' : '?';
        img.src = `${primaryUrl}${sep}_retry=${Date.now()}`;
      }
    }, delay);
  };

  img.addEventListener('error', handleImageError);
}

function renderCurrentList() {
  resultList.innerHTML = '';
  showErrorNotice(null);
  
  const isGhostedTab = currentTab === "ghosted";
  const users = isGhostedTab ? getActiveGhostedUsers() : getActiveFansUsers();
  
  if (!users || users.length === 0) {
    const emptyMsg = isGhostedTab 
      ? "No non-followers found 🎉" 
      : "You follow everyone back! 🎉";
    resultList.innerHTML = `<li class="empty-state">${emptyMsg}</li>`;
    return;
  }

  users.forEach(user => {
    const li = document.createElement("li");
    li.className = "user-card";
    
    const profilePic = user.profile_pic_data_url || user.profile_pic_url_hd || user.profile_pic_url || '';
    const fullName = user.full_name || '';
    const username = user.username || '';
    const userId = user.id || '';
    
    const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username) || unfollowedUsers.has((username || '').toLowerCase());
    const isFollowed = followedUsers.has(userId) || followedUsers.has(username) || followedUsers.has((username || '').toLowerCase());
    const isRequested = requestedUsers.has(userId) || requestedUsers.has(username) || requestedUsers.has((username || '').toLowerCase()) || Boolean(user.is_requested || user.outgoing_request);
    const isRemoved = removedFollowers.has(userId) || removedFollowers.has(username) || removedFollowers.has((username || '').toLowerCase());

    let actionButtonHtml = '';
    if (isOwnProfile) {
      if (isGhostedTab) {
        actionButtonHtml = `
          <div class="card-actions">
            <button class="unfollow-btn ${isUnfollowed ? 'unfollowed' : ''}" 
                    data-id="${userId}" 
                    data-username="${username}"
                    ${isUnfollowed ? 'disabled' : ''}
                    title="${isUnfollowed ? 'Already unfollowed' : `Unfollow @${username}`}">
              <span>${isUnfollowed ? 'Unfollowed' : 'Unfollow'}</span>
            </button>
          </div>
        `;
      } else {
        const followLabel = isFollowed ? 'Following' : (isRequested ? 'Requested' : 'Follow back');
        const followClass = (isFollowed || isRequested) ? 'followed' : '';
        actionButtonHtml = `
          <div class="card-actions">
            <button class="follow-btn ${followClass}" 
                    data-id="${userId}" 
                    data-username="${username}"
                    ${(isFollowed || isRequested) ? 'disabled' : ''}
                    title="${isFollowed ? 'Already following' : (isRequested ? 'Follow request sent' : `Follow back @${username}`)}">
              <span>${followLabel}</span>
            </button>
            <button class="remove-btn ${isRemoved ? 'removed' : ''}" 
                    data-id="${userId}" 
                    data-username="${username}"
                    ${isRemoved ? 'disabled' : ''}
                    title="${isRemoved ? 'Follower removed' : `Remove @${username} as follower`}">
              <span>${isRemoved ? 'Removed' : 'Remove'}</span>
            </button>
          </div>
        `;
      }
    }

    let badgesHtml = '';
    if (isOwnProfile) {
      const badges = [];
      if (user.is_bestie) {
        badges.push('<span class="badge badge-bestie" title="Close Friend">★ Close Friend</span>');
      }
      if (user.is_feed_favorite) {
        badges.push('<span class="badge badge-favorite" title="Favorite">♥ Favorite</span>');
      }
      if (user.is_restricted) {
        badges.push('<span class="badge badge-restricted" title="Restricted Account">Restricted</span>');
      }
      if (user.incoming_request) {
        badges.push('<span class="badge badge-incoming" title="Requested to follow you">Requested You</span>');
      }
      if (isRequested) {
        badges.push('<span class="badge badge-requested" title="Follow request sent (Pending approval)">Request Sent</span>');
      }
      if (badges.length > 0) {
        badgesHtml = `<div class="user-badges">${badges.join('')}</div>`;
      }
    }

    li.innerHTML = `
      <a href="https://instagram.com/${username}" target="_blank" class="user-link">
        <img src="${profilePic}" alt="${username}" class="profile-pic" referrerpolicy="no-referrer" loading="lazy" data-fallback="true">
        <div class="user-info">
          <div class="username-row">
            <span class="username">@${username}</span>
            <span class="external-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </span>
          </div>
          ${fullName ? `<span class="full-name">${fullName}</span>` : ''}
          ${badgesHtml}
        </div>
      </a>
      ${actionButtonHtml}
    `;
    
    // Attach lazy avatar with automatic retry on error
    const img = li.querySelector('.profile-pic');
    if (img) {
      setupLazyAvatar(img, user);
    }

    // Attach button click handler
    if (isOwnProfile) {
      if (isGhostedTab) {
        const btn = li.querySelector('.unfollow-btn');
        const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username);
        if (btn && !isUnfollowed) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleUnfollowClick(btn, userId, username);
          });
        }
      } else {
        const followBtn = li.querySelector('.follow-btn');
        const isFollowed = followedUsers.has(userId) || followedUsers.has(username) || followedUsers.has((username || '').toLowerCase());
        const isRequested = requestedUsers.has(userId) || requestedUsers.has(username) || requestedUsers.has((username || '').toLowerCase()) || Boolean(user.is_requested || user.outgoing_request);
        if (followBtn && !isFollowed && !isRequested) {
          followBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleFollowClick(followBtn, userId, username);
          });
        }

        const removeBtn = li.querySelector('.remove-btn');
        const isRemoved = removedFollowers.has(userId) || removedFollowers.has(username);
        if (removeBtn && !isRemoved) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRemoveFollowerClick(removeBtn, userId, username);
          });
        }
      }
    }
    
    resultList.appendChild(li);
  });
}

async function handleUnfollowClick(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Unfollowing...</span>`;
  showErrorNotice(null);

  const sendUnfollowMessage = () => {
    return new Promise((resolve) => {
      if (activeTabId) {
        chrome.tabs.sendMessage(
          activeTabId,
          { type: "unfollowUser", userId, username },
          (response) => {
            if (!chrome.runtime.lastError && response) {
              resolve(response);
            } else {
              chrome.runtime.sendMessage(
                { type: "relayUnfollow", userId, username },
                (bgResponse) => {
                  resolve(bgResponse || { success: false, error: "Unable to contact Instagram tab." });
                }
              );
            }
          }
        );
      } else {
        chrome.runtime.sendMessage(
          { type: "relayUnfollow", userId, username },
          (bgResponse) => {
            resolve(bgResponse || { success: false, error: "Instagram tab not found." });
          }
        );
      }
    });
  };

  const response = await sendUnfollowMessage();

  if (response && response.success) {
    button.classList.remove('loading', 'error');
    button.classList.add('unfollowed');
    button.disabled = true;
    button.innerHTML = `<span>Unfollowed</span>`;
    
    if (userId) unfollowedUsers.add(userId);
    if (username) unfollowedUsers.add(username);
    
    updateTabCounts();
    updateStatusText();
    saveState();

    setTimeout(() => {
      const card = button.closest('.user-card') || button.closest('li');
      if (card) {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.96)';
        setTimeout(() => {
          renderCurrentList();
        }, 250);
      }
    }, 600);
  } else {
    const errorMsg = response?.error || "Failed to unfollow";
    button.classList.remove('loading');
    button.classList.add('error');
    button.disabled = false;
    button.innerHTML = `<span>Retry</span>`;
    button.title = `Error: ${errorMsg}. Click to retry.`;
    
    showErrorNotice(errorMsg);
  }
}

async function handleFollowClick(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Following...</span>`;
  showErrorNotice(null);

  const sendFollowMessage = () => {
    return new Promise((resolve) => {
      if (activeTabId) {
        chrome.tabs.sendMessage(
          activeTabId,
          { type: "followUser", userId, username },
          (response) => {
            if (!chrome.runtime.lastError && response) {
              resolve(response);
            } else {
              chrome.runtime.sendMessage(
                { type: "relayFollow", userId, username },
                (bgResponse) => {
                  resolve(bgResponse || { success: false, error: "Unable to contact Instagram tab." });
                }
              );
            }
          }
        );
      } else {
        chrome.runtime.sendMessage(
          { type: "relayFollow", userId, username },
          (bgResponse) => {
            resolve(bgResponse || { success: false, error: "Instagram tab not found." });
          }
        );
      }
    });
  };

  const response = await sendFollowMessage();

  if (response && response.success) {
    button.classList.remove('loading', 'error');
    button.classList.add('followed');
    button.disabled = true;
    if (response.isRequested) {
      if (userId) requestedUsers.add(userId);
      if (username) requestedUsers.add(username);
      button.innerHTML = `<span>Requested</span>`;
      button.title = "Follow request sent";
    } else {
      if (userId) followedUsers.add(userId);
      if (username) followedUsers.add(username);
      button.innerHTML = `<span>Following</span>`;
      button.title = "Following";
    }
    
    saveState();
  } else {
    const errorMsg = response?.error || "Failed to follow back";
    button.classList.remove('loading');
    button.classList.add('error');
    button.disabled = false;
    button.innerHTML = `<span>Retry</span>`;
    button.title = `Error: ${errorMsg}. Click to retry.`;
    
    showErrorNotice(errorMsg);
  }
}

async function handleRemoveFollowerClick(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Removing...</span>`;
  showErrorNotice(null);

  const sendRemoveMessage = () => {
    return new Promise((resolve) => {
      if (activeTabId) {
        chrome.tabs.sendMessage(
          activeTabId,
          { type: "removeFollower", userId, username },
          (response) => {
            if (chrome.runtime.lastError) {
              chrome.runtime.sendMessage(
                { type: "relayRemoveFollower", userId, username },
                (bgResponse) => {
                  resolve(bgResponse || { success: false, error: "Instagram tab not found." });
                }
              );
            } else {
              resolve(response || { success: false, error: "No response from tab." });
            }
          }
        );
      } else {
        chrome.runtime.sendMessage(
          { type: "relayRemoveFollower", userId, username },
          (bgResponse) => {
            resolve(bgResponse || { success: false, error: "Instagram tab not found." });
          }
        );
      }
    });
  };

  const response = await sendRemoveMessage();

  if (response && response.success) {
    button.classList.remove('loading', 'error');
    button.classList.add('removed');
    button.disabled = true;
    button.innerHTML = `<span>Removed</span>`;
    button.title = "Follower removed";

    if (userId) removedFollowers.add(userId);
    if (username) removedFollowers.add(username);

    updateTabCounts();
    updateStatusText();
    saveState();

    setTimeout(() => {
      const card = button.closest('.user-card') || button.closest('li');
      if (card) {
        card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.96)';
        setTimeout(() => {
          renderCurrentList();
        }, 250);
      }
    }, 600);
  } else {
    const errorMsg = response?.error || "Failed to remove follower";
    button.classList.remove('loading');
    button.classList.add('error');
    button.disabled = false;
    button.innerHTML = `<span>Retry</span>`;
    button.title = `Error: ${errorMsg}. Click to retry.`;

    showErrorNotice(errorMsg);
  }
}

// Tab button event listeners
if (tabGhosted) {
  tabGhosted.addEventListener("click", () => switchTab("ghosted"));
}
if (tabFans) {
  tabFans.addEventListener("click", () => switchTab("fans"));
}

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    progressContainer.style.display = 'block';
    
    if (message.type === 'followers') {
      const totalDisplay = (message.total && message.total > 0) ? message.total : '?';
      followersProgressText.textContent = `${message.fetched} / ${totalDisplay} loaded`;
      const percentage = message.done
        ? 100
        : ((message.total && message.total > 0)
            ? Math.min((message.fetched / message.total) * 100, 100)
            : Math.min((message.fetched / (message.fetched + 48)) * 100, 92));
      followersProgress.style.width = `${percentage}%`;
    } else if (message.type === 'followings') {
      const totalDisplay = (message.total && message.total > 0) ? message.total : '?';
      followingsProgressText.textContent = `${message.fetched} / ${totalDisplay} loaded`;
      const percentage = message.done
        ? 100
        : ((message.total && message.total > 0)
            ? Math.min((message.fetched / message.total) * 100, 100)
            : Math.min((message.fetched / (message.fetched + 48)) * 100, 92));
      followingsProgress.style.width = `${percentage}%`;
    }
  }
});

// Load stored profile ownership
chrome.storage.local.get(['isOwnProfile'], (res) => {
  if (typeof res.isOwnProfile === 'boolean') {
    isOwnProfile = res.isOwnProfile;
  }
});

// Kick off
showStatus("Checking");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) {
    statusEl.textContent = "Error: No active tab found.";
    return;
  }

  activeTabId = tabs[0].id;

  chrome.tabs.sendMessage(activeTabId, { type: "getNonFollowers" }, (response) => {
    if (!response || response.error) {
      statusEl.textContent = "Error: " + (response?.error || "No response from content script.");
      return;
    }

    const { nonFollowers, fans, username } = response;
    currentUsername = username || "";
    ghostedUsers = nonFollowers || [];
    fansUsers = fans || [];
    isOwnProfile = Boolean(response.isOwnProfile);

    // Fresh live scan from Instagram represents real-time ground truth.
    // Reset all temporary session action sets so newly followed/changed accounts show up accurately.
    unfollowedUsers = new Set();
    removedFollowers = new Set();
    followedUsers = new Set();
    requestedUsers = new Set();
    chrome.storage.local.remove(['unfollowedUsers', 'removedFollowers', 'followedUsers', 'requestedUsers']);

    fansUsers.forEach(u => {
      if (u.outgoing_request || u.is_requested) {
        if (u.id) requestedUsers.add(String(u.id));
        if (u.username) requestedUsers.add(u.username);
        if (u.username) requestedUsers.add(u.username.toLowerCase());
      }
    });

    progressContainer.style.display = "none";
    if (tabsContainer) tabsContainer.style.display = "flex";
    
    updateTabLabels();
    switchTab("ghosted");

    if (bottomWrapper) bottomWrapper.style.display = "block";
    openBtn.style.display = "block";

    openBtn.addEventListener("click", () => {
      saveState();
      chrome.tabs.create({ url: chrome.runtime.getURL("results.html") });
    });
  });
});
