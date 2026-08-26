// results.js
let ghostedUsers = [];
let targetUsername = "";
let unfollowedUsers = new Set();
let isOwnProfile = false;

const pageTitle = document.getElementById("pageTitle");
const errorNoticeEl = document.getElementById("errorNotice");
const userList = document.getElementById("user-list");

function showErrorNotice(msg) {
  if (!errorNoticeEl) return;
  if (msg) {
    errorNoticeEl.textContent = msg;
    errorNoticeEl.style.display = "block";
  } else {
    errorNoticeEl.style.display = "none";
  }
}

function saveState() {
  chrome.storage.local.set({
    ghostedUsers: ghostedUsers,
    targetUsername: targetUsername,
    unfollowedUsers: Array.from(unfollowedUsers),
    isOwnProfile: isOwnProfile
  });
}

function renderUsers() {
  if (targetUsername) {
    pageTitle.textContent = `People who don't follow @${targetUsername} back`;
    document.title = `WhoGhostedMe (@${targetUsername})`;
  }

  if (!ghostedUsers || ghostedUsers.length === 0) {
    userList.innerHTML = `<div class="empty-state">No non-followers found 🎉</div>`;
    return;
  }

  userList.innerHTML = ghostedUsers.map(u => {
    const profilePic = u.profile_pic_data_url || u.profile_pic_url_hd || u.profile_pic_url || '';
    const fullName = u.full_name || '';
    const username = u.username || '';
    const userId = u.id || '';
    const isUnfollowed = unfollowedUsers.has(userId) || unfollowedUsers.has(username);

    const unfollowButtonHtml = isOwnProfile ? `
      <button class="unfollow-btn ${isUnfollowed ? 'unfollowed' : ''}" 
              data-id="${userId}" 
              data-username="${username}"
              ${isUnfollowed ? 'disabled' : ''}
              title="${isUnfollowed ? 'Already unfollowed' : `Unfollow @${username}`}">
        <span>${isUnfollowed ? 'Unfollowed' : 'Unfollow'}</span>
      </button>
    ` : '';

    return `
      <div class="user-card" data-id="${userId}" data-username="${username}">
        <a href="https://instagram.com/${username}" target="_blank" class="user-link">
          <img src="${profilePic}" alt="${username}" class="profile-pic" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTMwIDE4QzI0LjQ3NzEgMTggMTggMjQuNDc3MSAxOCAzMEMxOCAzNS41MjI5IDI0LjQ3NzEgNDEgMzAgNDFDMzUuNTIyOSA0MSA0MSAzNS41MjI5IDQxIDMwQzQxIDI0LjQ3NzEgMzUuNTIyOSAxOCAzMCAxOFoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTMwIDQ0QzM1LjQxODMgNDQgMzkgNDAuNDE4MyAzOSAzNkMzOSAyOS41ODE3IDM1LjQxODMgMjYgMzAgMjZDMjQuNTgxNyAyNiAyMSAyOS41ODE3IDIxIDM2QzIxIDQwLjQxODMgMjQuNTgxNyA0NCAzMCA0NFoiIGZpbGw9IiM5OTkiLz4KPC9zdmc+'">
          <div class="user-info">
            <span class="username">@${username}</span>
            ${fullName ? `<span class="full-name">${fullName}</span>` : ''}
          </div>
        </a>
        ${unfollowButtonHtml}
      </div>
    `;
  }).join('');

  // Attach unfollow button handlers if viewing own profile
  if (isOwnProfile) {
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

        saveState();
      } else {
        const errorMsg = response?.error || "Failed to unfollow";
        button.classList.remove('loading');
        button.classList.add('error');
        button.disabled = false;
        button.innerHTML = `<span>Retry</span>`;
        button.title = `Error: ${errorMsg}. Click to retry.`;
        
        // Inline notice instead of alert dialog
        showErrorNotice(errorMsg);
      }
    }
  );
}

// Initial load from storage
chrome.storage.local.get(["ghostedUsers", "targetUsername", "unfollowedUsers", "isOwnProfile"], (data) => {
  if (data.ghostedUsers && Array.isArray(data.ghostedUsers)) {
    ghostedUsers = data.ghostedUsers;
  }
  if (data.targetUsername) {
    targetUsername = data.targetUsername;
  }
  if (data.unfollowedUsers && Array.isArray(data.unfollowedUsers)) {
    unfollowedUsers = new Set(data.unfollowedUsers);
  }
  if (typeof data.isOwnProfile === 'boolean') {
    isOwnProfile = data.isOwnProfile;
  }

  renderUsers();
});

// Sync if storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.unfollowedUsers) {
      unfollowedUsers = new Set(changes.unfollowedUsers.newValue || []);
      renderUsers();
    }
    if (changes.ghostedUsers) {
      ghostedUsers = changes.ghostedUsers.newValue || [];
      renderUsers();
    }
    if (changes.isOwnProfile) {
      isOwnProfile = Boolean(changes.isOwnProfile.newValue);
      renderUsers();
    }
  }
});
