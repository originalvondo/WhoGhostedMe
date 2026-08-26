// popup.js
const statusEl = document.getElementById("status");
const progressContainer = document.getElementById("progressContainer");
const followersProgress = document.getElementById("followersProgress");
const followingsProgress = document.getElementById("followingsProgress");
const followersProgressText = document.getElementById("followersProgressText");
const followingsProgressText = document.getElementById("followingsProgressText");
const resultList = document.getElementById("results");
const openBtn = document.getElementById("open");

let ghostedUsers = [];
let currentUsername = "";
let unfollowedUsers = new Set();
let activeTabId = null;

function showStatus(text, withSpinner = true) {
  statusEl.innerHTML = withSpinner
    ? `${text}<span class="spinner"></span>`
    : text;
}

function saveState() {
  chrome.storage.local.set({
    ghostedUsers: ghostedUsers,
    targetUsername: currentUsername,
    unfollowedUsers: Array.from(unfollowedUsers)
  });
}

function renderGhostedUsers(users) {
  resultList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement("li");
    li.className = "user-card";
    
    const profilePic = user.profile_pic_data_url || user.profile_pic_url_hd || user.profile_pic_url || '';
    const fullName = user.full_name || '';
    const username = user.username || '';
    const userId = user.id || '';
    const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username);
    
    li.innerHTML = `
      <a href="https://instagram.com/${username}" target="_blank" class="user-link">
        <img src="${profilePic}" alt="${username}" class="profile-pic" data-fallback="true">
        <div class="user-info">
          <span class="username">@${username}</span>
          ${fullName ? `<span class="full-name">${fullName}</span>` : ''}
        </div>
      </a>
      <button class="unfollow-btn ${isUnfollowed ? 'unfollowed' : ''}" 
              data-id="${userId}" 
              data-username="${username}"
              ${isUnfollowed ? 'disabled' : ''}
              title="${isUnfollowed ? 'Already unfollowed' : `Unfollow @${username}`}">
        <span>${isUnfollowed ? 'Unfollowed' : 'Unfollow'}</span>
      </button>
    `;
    
    // Add error handler for profile picture
    const img = li.querySelector('.profile-pic');
    if (img && profilePic && !user.profile_pic_data_url) {
      img.addEventListener('error', function fallback() {
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTI1IDE1QzE5LjQ3NzEgMTUgMTUgMTkuNDc3MSAxNSAyNUMxNSAzMC41MjI5IDE5LjQ3NzEgMzUgMjUgMzVDMzAuNTIyOSAzNSAzNSAzMC41MjI5IDM1IDI1QzM1IDE5LjQ3NzEgMzAuNTIyOSAxNSAyNSAxNVoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTI1IDM3QzI5LjQxODMgMzcgMzMgMzMuNDE4MyAzMyAyOUMzMyAyMy41ODE3IDI5LjQxODMgMjAgMjUgMjBDMjAuNTgxNyAyMCAxNyAyMy41ODE3IDE3IDI5QzE3IDMzLjQxODMgMjAuNTgxNyAzNyAyNSAzN1oiIGZpbGw9IiM5OTkiLz4KPC9zdmc+';
        this.removeEventListener('error', fallback);
      });
    }

    // Attach unfollow button listener
    const btn = li.querySelector('.unfollow-btn');
    if (btn && !isUnfollowed) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleUnfollowClick(btn, userId, username);
      });
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
                  resolve(bgResponse || { success: false, error: "Unable to contact Instagram." });
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
    
    saveState();
  } else {
    const errorMsg = response?.error || "Failed to unfollow";
    button.classList.remove('loading');
    button.classList.add('error');
    button.disabled = false;
    button.innerHTML = `<span>Retry</span>`;
    button.title = `Error: ${errorMsg}. Click to retry.`;
  }
}

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    progressContainer.style.display = 'block';
    
    if (message.type === 'followers') {
      followersProgressText.textContent = `${message.fetched} / ${message.total || '?'} loaded`;
      const percentage = message.total ? Math.min((message.fetched / message.total) * 100, 100) : Math.min(message.fetched / 100 * 100, 100);
      followersProgress.style.width = `${percentage}%`;
    } else if (message.type === 'followings') {
      followingsProgressText.textContent = `${message.fetched} / ${message.total || '?'} loaded`;
      const percentage = message.total ? Math.min((message.fetched / message.total) * 100, 100) : Math.min(message.fetched / 100 * 100, 100);
      followingsProgress.style.width = `${percentage}%`;
    }
  } else if (message.action === 'ghostedUsers') {
    ghostedUsers = message.users;
    renderGhostedUsers(message.users);
    saveState();
  }
});

// Load previously unfollowed users
chrome.storage.local.get(['unfollowedUsers'], (res) => {
  if (res.unfollowedUsers && Array.isArray(res.unfollowedUsers)) {
    unfollowedUsers = new Set(res.unfollowedUsers);
  }
});

// kick off
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

    const { nonFollowers, username } = response;
    currentUsername = username || "";
    ghostedUsers = nonFollowers || [];

    progressContainer.style.display = "none";
    showStatus(`${ghostedUsers.length} people ghosted ${username}`, false);
    
    renderGhostedUsers(ghostedUsers);
    saveState();

    openBtn.style.display = "inline-block";

    openBtn.addEventListener("click", () => {
      saveState();
      chrome.tabs.create({ url: chrome.runtime.getURL("results.html") });
    });
  });
});
