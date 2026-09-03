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

    let actionButtonHtml = '';
    if (isOwnProfile) {
      if (isGhostedTab) {
        const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username);
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
        const isFollowed = followedUsers.has(userId) || followedUsers.has(username);
        const isRequested = requestedUsers.has(userId) || requestedUsers.has(username);
        const isRemoved = removedFollowers.has(userId) || removedFollowers.has(username);
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

    return `
      <div class="user-card" data-id="${userId}" data-username="${username}">
        <a href="https://instagram.com/${username}" target="_blank" class="user-link">
          <img src="${profilePic}" alt="${username}" class="profile-pic" referrerpolicy="no-referrer" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTMwIDE4QzI0LjQ3NzEgMTggMTggMjQuNDc3MSAxOCAzMEMxOCAzNS41MjI5IDI0LjQ3NzEgNDEgMzAgNDFDMzUuNTIyOSA0MSA0MSAzNS41MjI5IDQxIDMwQzQxIDI0LjQ3NzEgMzUuNTIyOSAxOCAzMCAxOFoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTMwIDQ0QzM1LjQxODMgNDQgMzkgNDAuNDE4MyAzOSAzNkMzOSAyOS41ODE3IDM1LjQxODMgMjYgMzAgMjZDMjQuNTgxNyAyNiAyMSAyOS41ODE3IDIxIDM2QzIxIDQwLjQxODMgMjQuNTgxNyA0NCAzMCA0NFoiIGZpbGw9IiM5OTkiLz4KPC9zdmc+'">
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
          </div>
        </a>
        ${actionButtonHtml}
      </div>
    `;
  }).join('');

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
        const isFollowed = followedUsers.has(userId) || followedUsers.has(username);

        if (!isFollowed) {
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
chrome.storage.local.get(["ghostedUsers", "fansUsers", "targetUsername", "unfollowedUsers", "removedFollowers", "isOwnProfile", "activeTab"], (data) => {
  if (data.ghostedUsers && Array.isArray(data.ghostedUsers)) {
    ghostedUsers = data.ghostedUsers;
  }
  if (data.fansUsers && Array.isArray(data.fansUsers)) {
    fansUsers = data.fansUsers;
  }
  if (data.targetUsername) {
    targetUsername = data.targetUsername;
  }
  if (data.unfollowedUsers && Array.isArray(data.unfollowedUsers)) {
    unfollowedUsers = new Set(data.unfollowedUsers);
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
