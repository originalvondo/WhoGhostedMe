let ghostedUsers = [];
let fansUsers = [];
let targetUsername = "";
let unfollowedUsers = new Set();
let followedUsers = new Set();
let requestedUsers = new Set();
let removedFollowers = new Set();
let isOwnProfile = false;
let currentTab = "ghosted"; // "ghosted" or "fans"

const pageTitle = document.getElementById("pageTitle");
const errorNoticeEl = document.getElementById("errorNotice");
const userList = document.getElementById("user-list");
const tabGhosted = document.getElementById("tabGhosted");
const tabFans = document.getElementById("tabFans");
const ghostedCountEl = document.getElementById("ghostedCount");
const fansCountEl = document.getElementById("fansCount");

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
    targetUsername: targetUsername,
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
  renderUsers();
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

      // 3. Try relay fetch from Instagram tab via background worker
      try {
        chrome.runtime.sendMessage({ type: "relayFetchImage", url: primaryUrl }, (resp) => {
          if (resp && resp.dataUrl) {
            img.src = resp.dataUrl;
          } else {
            const sep = primaryUrl.includes('?') ? '&' : '?';
            img.src = `${primaryUrl}${sep}_retry=${Date.now()}`;
          }
        });
      } catch {
        const sep = primaryUrl.includes('?') ? '&' : '?';
        img.src = `${primaryUrl}${sep}_retry=${Date.now()}`;
      }
    }, delay);
  };

  img.addEventListener('error', handleImageError);
}

function renderUsers() {
  const isGhostedTab = currentTab === "ghosted";
  
  if (targetUsername) {
    if (isOwnProfile) {
      if (isGhostedTab) {
        pageTitle.textContent = `People who don't follow you back`;
        document.title = `WhoGhostedMe (@${targetUsername})`;
      } else {
        pageTitle.textContent = `People you don't follow back`;
        document.title = `WhoGhostedMe - You Don't Follow Back (@${targetUsername})`;
      }
    } else {
      if (isGhostedTab) {
        pageTitle.textContent = `People who don't follow @${targetUsername} back`;
        document.title = `WhoGhostedMe (@${targetUsername})`;
      } else {
        pageTitle.textContent = `People @${targetUsername} doesn't follow back`;
        document.title = `WhoGhostedMe - They Don't Follow Back (@${targetUsername})`;
      }
    }
  }

  updateTabLabels();
  updateTabCounts();
  showErrorNotice(null);

  const users = isGhostedTab ? getActiveGhostedUsers() : getActiveFansUsers();

  if (!users || users.length === 0) {
    const emptyMsg = isGhostedTab
      ? "No non-followers found 🎉"
      : "You follow everyone back! 🎉";
    userList.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  userList.innerHTML = users.map(u => {
    const profilePic = u.profile_pic_data_url || u.profile_pic_url_hd || u.profile_pic_url || '';
    const fullName = u.full_name || '';
    const username = u.username || '';
    const userId = u.id || '';

    const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username) || unfollowedUsers.has((username || '').toLowerCase());
    const isFollowed = followedUsers.has(userId) || followedUsers.has(username) || followedUsers.has((username || '').toLowerCase());
    const isRequested = requestedUsers.has(userId) || requestedUsers.has(username) || requestedUsers.has((username || '').toLowerCase()) || Boolean(u.is_requested || u.outgoing_request);
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
        let followBtnHtml = '';
        if (isFollowed) {
          followBtnHtml = `
            <button class="follow-btn followed" 
                    data-id="${userId}" 
                    data-username="${username}"
                    disabled
                    title="Already following @${username}">
              <span>Following</span>
            </button>
          `;
        } else if (isRequested) {
          followBtnHtml = `
            <button class="follow-btn requested" 
                    data-id="${userId}" 
                    data-username="${username}"
                    title="Cancel follow request to @${username}">
              <span class="btn-text-default">Requested</span>
              <span class="btn-text-hover">Cancel request</span>
            </button>
          `;
        } else {
          followBtnHtml = `
            <button class="follow-btn" 
                    data-id="${userId}" 
                    data-username="${username}"
                    title="Follow back @${username}">
              <span>Follow back</span>
            </button>
          `;
        }

        actionButtonHtml = `
          <div class="card-actions">
            ${followBtnHtml}
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
      if (u.is_bestie) {
        badges.push('<span class="badge badge-bestie" title="Close Friend">★ Close Friend</span>');
      }
      if (u.is_feed_favorite) {
        badges.push('<span class="badge badge-favorite" title="Favorite">♥ Favorite</span>');
      }
      if (u.is_restricted) {
        badges.push('<span class="badge badge-restricted" title="Restricted Account">Restricted</span>');
      }
      if (u.incoming_request) {
        badges.push('<span class="badge badge-incoming" title="Requested to follow you">Requested You</span>');
      }
      if (isRequested) {
        badges.push('<span class="badge badge-requested" title="Follow request sent (Pending approval)">Request Sent</span>');
      }
      if (badges.length > 0) {
        badgesHtml = `<div class="user-badges">${badges.join('')}</div>`;
      }
    }

    return `
      <div class="user-card" data-id="${userId}" data-username="${username}">
        <a href="https://instagram.com/${username}" target="_blank" class="user-link">
          <img src="${profilePic}" alt="${username}" class="profile-pic" referrerpolicy="no-referrer" loading="lazy">
          <div class="user-info">
            <div class="username-row">
              <span class="username">@${username}</span>
              <span class="external-icon" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
      </div>
    `;
  }).join('');

  // Attach lazy avatar with automatic retry on error
  const cards = userList.querySelectorAll('.user-card');
  cards.forEach(card => {
    const userId = card.dataset.id;
    const user = (ghostedUsers.concat(fansUsers)).find(u => String(u.id) === String(userId));
    const img = card.querySelector('.profile-pic');
    if (img && user) {
      setupLazyAvatar(img, user);
    }
  });

  // Attach button event listeners
  if (isOwnProfile) {
    if (isGhostedTab) {
      const buttons = userList.querySelectorAll('.unfollow-btn');
      buttons.forEach(btn => {
        const userId = btn.dataset.id;
        const username = btn.dataset.username;
        const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username);

        if (!isUnfollowed) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleUnfollow(btn, userId, username);
          });
        }
      });
    } else {
      const followButtons = userList.querySelectorAll('.follow-btn');
      followButtons.forEach(btn => {
        const userId = btn.dataset.id;
        const username = btn.dataset.username;
        const isFollowed = followedUsers.has(userId) || followedUsers.has(username) || followedUsers.has((username || '').toLowerCase());
        const isRequested = requestedUsers.has(userId) || requestedUsers.has(username) || requestedUsers.has((username || '').toLowerCase());

        if (isRequested) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleCancelRequest(btn, userId, username);
          });
        } else if (!isFollowed) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleFollow(btn, userId, username);
          });
        }
      });

      const removeButtons = userList.querySelectorAll('.remove-btn');
      removeButtons.forEach(btn => {
        const userId = btn.dataset.id;
        const username = btn.dataset.username;
        const isRemoved = removedFollowers.has(userId) || removedFollowers.has(username);

        if (!isRemoved) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleRemoveFollower(btn, userId, username);
          });
        }
      });
    }
  }
}

async function handleUnfollow(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Unfollowing...</span>`;
  showErrorNotice(null);

  chrome.runtime.sendMessage(
    { type: "relayUnfollow", userId, username },
    (response) => {
      if (response && response.success) {
        button.classList.remove('loading', 'error');
        button.classList.add('unfollowed');
        button.disabled = true;
        button.innerHTML = `<span>Unfollowed</span>`;

        if (userId) unfollowedUsers.add(userId);
        if (username) unfollowedUsers.add(username);

        updateTabCounts();
        saveState();

        setTimeout(() => {
          const card = button.closest('.user-card');
          if (card) {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.96)';
            setTimeout(() => renderUsers(), 250);
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
  );
}

async function handleFollow(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Following...</span>`;
  showErrorNotice(null);

  chrome.runtime.sendMessage(
    { type: "relayFollow", userId, username },
    (response) => {
      if (response && response.success) {
        button.classList.remove('loading', 'error');
        button.classList.add('followed');
        button.disabled = true;
        if (response.isRequested) {
          button.classList.remove('followed');
          button.classList.add('requested');
          button.disabled = false;
          button.innerHTML = `<span class="btn-text-default">Requested</span><span class="btn-text-hover">Cancel request</span>`;
          button.title = `Cancel follow request to @${username}`;

          if (userId) requestedUsers.add(String(userId));
          if (username) {
            requestedUsers.add(username);
            requestedUsers.add(username.toLowerCase());
          }

          const u = (fansUsers || []).find(f => String(f.id) === String(userId) || f.username === username);
          if (u) {
            u.outgoing_request = true;
            u.is_requested = true;
            if (u.friendship_status) {
              u.friendship_status.outgoing_request = true;
            }
          }

          const card = button.closest('.user-card');
          if (card) {
            let badgesContainer = card.querySelector('.user-badges');
            if (!badgesContainer) {
              const userInfo = card.querySelector('.user-info');
              if (userInfo) {
                badgesContainer = document.createElement('div');
                badgesContainer.className = 'user-badges';
                userInfo.appendChild(badgesContainer);
              }
            }
            if (badgesContainer && !badgesContainer.querySelector('.badge-requested')) {
              badgesContainer.insertAdjacentHTML('beforeend', '<span class="badge badge-requested" title="Follow request sent (Pending approval)">Request Sent</span>');
            }
          }

          const newBtn = button.cloneNode(true);
          button.parentNode.replaceChild(newBtn, button);
          newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleCancelRequest(newBtn, userId, username);
          });
        } else {
          button.classList.remove('requested');
          button.classList.add('followed');
          button.disabled = true;
          button.innerHTML = `<span>Following</span>`;
          button.title = "Following";

          if (userId) followedUsers.add(String(userId));
          if (username) {
            followedUsers.add(username);
            followedUsers.add(username.toLowerCase());
          }
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
  );
}

async function handleCancelRequest(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Cancelling...</span>`;
  showErrorNotice(null);

  chrome.runtime.sendMessage(
    { type: "relayCancelFollowRequest", userId, username },
    (response) => {
      if (response && response.success) {
        if (userId) requestedUsers.delete(String(userId));
        if (username) {
          requestedUsers.delete(username);
          requestedUsers.delete(username.toLowerCase());
        }

        const u = (fansUsers || []).find(f => String(f.id) === String(userId) || f.username === username);
        if (u) {
          u.outgoing_request = false;
          u.is_requested = false;
          if (u.friendship_status) {
            u.friendship_status.outgoing_request = false;
          }
        }

        const card = button.closest('.user-card');
        if (card) {
          const badge = card.querySelector('.badge-requested');
          if (badge) badge.remove();
        }

        button.classList.remove('loading', 'error', 'requested', 'followed');
        button.disabled = false;
        button.innerHTML = `<span>Follow back</span>`;
        button.title = `Follow back @${username}`;

        const newBtn = button.cloneNode(true);
        button.parentNode.replaceChild(newBtn, button);
        newBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleFollow(newBtn, userId, username);
        });

        saveState();
      } else {
        const errorMsg = response?.error || "Failed to cancel follow request";
        button.classList.remove('loading');
        button.classList.add('error');
        button.disabled = false;
        button.innerHTML = `<span>Retry</span>`;
        button.title = `Error: ${errorMsg}. Click to retry.`;

        showErrorNotice(errorMsg);
      }
    }
  );
}

async function handleRemoveFollower(button, userId, username) {
  if (button.disabled || button.classList.contains('loading')) return;

  button.classList.remove('error');
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span>Removing...</span>`;
  showErrorNotice(null);

  chrome.runtime.sendMessage(
    { type: "relayRemoveFollower", userId, username },
    (response) => {
      if (response && response.success) {
        button.classList.remove('loading', 'error');
        button.classList.add('removed');
        button.disabled = true;
        button.innerHTML = `<span>Removed</span>`;
        button.title = "Follower removed";

        if (userId) removedFollowers.add(userId);
        if (username) removedFollowers.add(username);

        updateTabCounts();
        saveState();

        setTimeout(() => {
          const card = button.closest('.user-card');
          if (card) {
            card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.96)';
            setTimeout(() => renderUsers(), 250);
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
  );
}

// Tab button listeners
if (tabGhosted) {
  tabGhosted.addEventListener("click", () => switchTab("ghosted"));
}
if (tabFans) {
  tabFans.addEventListener("click", () => switchTab("fans"));
}

// Initial load from storage
chrome.storage.local.get(["ghostedUsers", "fansUsers", "targetUsername", "unfollowedUsers", "followedUsers", "requestedUsers", "removedFollowers", "isOwnProfile", "activeTab"], (data) => {
  if (data.ghostedUsers && Array.isArray(data.ghostedUsers)) {
    ghostedUsers = data.ghostedUsers;
  }
  if (data.fansUsers && Array.isArray(data.fansUsers)) {
    fansUsers = data.fansUsers;
    fansUsers.forEach(u => {
      if (u.outgoing_request || u.is_requested) {
        if (u.id) requestedUsers.add(String(u.id));
        if (u.username) requestedUsers.add(u.username);
        if (u.username) requestedUsers.add(u.username.toLowerCase());
      }
    });
  }
  if (data.targetUsername) {
    targetUsername = data.targetUsername;
  }
  if (data.unfollowedUsers && Array.isArray(data.unfollowedUsers)) {
    unfollowedUsers = new Set(data.unfollowedUsers);
  }
  if (data.followedUsers && Array.isArray(data.followedUsers)) {
    followedUsers = new Set(data.followedUsers);
  }
  if (data.requestedUsers && Array.isArray(data.requestedUsers)) {
    data.requestedUsers.forEach(item => requestedUsers.add(item));
  }
  if (data.removedFollowers && Array.isArray(data.removedFollowers)) {
    removedFollowers = new Set(data.removedFollowers);
  }
  if (typeof data.isOwnProfile === 'boolean') {
    isOwnProfile = data.isOwnProfile;
  }
  if (data.activeTab) {
    currentTab = data.activeTab;
    if (tabGhosted && tabFans) {
      if (currentTab === "ghosted") {
        tabGhosted.classList.add("active");
        tabFans.classList.remove("active");
      } else {
        tabFans.classList.add("active");
        tabGhosted.classList.remove("active");
      }
    }
  }

  updateTabCounts();
  renderUsers();
});

// Sync if storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.unfollowedUsers) {
      unfollowedUsers = new Set(changes.unfollowedUsers.newValue || []);
    }
    if (changes.followedUsers) {
      followedUsers = new Set(changes.followedUsers.newValue || []);
    }
    if (changes.requestedUsers) {
      requestedUsers = new Set(changes.requestedUsers.newValue || []);
    }
    if (changes.removedFollowers) {
      removedFollowers = new Set(changes.removedFollowers.newValue || []);
    }
    if (changes.ghostedUsers) {
      ghostedUsers = changes.ghostedUsers.newValue || [];
    }
    if (changes.fansUsers) {
      fansUsers = changes.fansUsers.newValue || [];
    }
    if (changes.isOwnProfile) {
      isOwnProfile = Boolean(changes.isOwnProfile.newValue);
    }
    if (changes.activeTab) {
      currentTab = changes.activeTab.newValue || "ghosted";
      if (tabGhosted && tabFans) {
        if (currentTab === "ghosted") {
          tabGhosted.classList.add("active");
          tabFans.classList.remove("active");
        } else {
          tabFans.classList.add("active");
          tabGhosted.classList.remove("active");
        }
      }
    }
    renderUsers();
  }
});
