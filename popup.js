// popup.js
const statusEl = document.getElementById("status");
const progressContainer = document.getElementById("progressContainer");
const followersProgress = document.getElementById("followersProgress");
const followingsProgress = document.getElementById("followingsProgress");
const followersProgressText = document.getElementById("followersProgressText");
const followingsProgressText = document.getElementById("followingsProgressText");
const resultList = document.getElementById("results");
const copyBtn = document.getElementById("copy");
const openBtn = document.getElementById("open");
// const exportTxtBtn = document.getElementById("exportTxtBtn");
const exportCSVBtn = document.getElementById("exportCsvBtn");

let ghostedUsers = [];

function showStatus(text, withSpinner = true) {
  statusEl.innerHTML = withSpinner
    ? `${text}<span class="spinner"></span>`
    : text;
}

function renderGhostedUsers(users) {
  resultList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement("li");
    li.className = "user-card";
    
    // Use profile_pic_data_url if available (fetched as data URL), otherwise fallback to external URL
    const profilePic = user.profile_pic_data_url || user.profile_pic_url_hd || user.profile_pic_url || '';
    const fullName = user.full_name || '';
    const username = user.username || '';
    
    li.innerHTML = `
      <a href="https://instagram.com/${username}" target="_blank" class="user-link">
        <img src="${profilePic}" alt="${username}" class="profile-pic" data-fallback="true">
        <div class="user-info">
          <span class="username">@${username}</span>
          ${fullName ? `<span class="full-name">${fullName}</span>` : ''}
        </div>
      </a>
    `;
    
    // Add error handler for profile picture (CSP-compliant)
    const img = li.querySelector('.profile-pic');
    if (img && profilePic && !user.profile_pic_data_url) {
      img.addEventListener('error', function() {
        // Use a simple SVG placeholder as fallback
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjUiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTI1IDE1QzE5LjQ3NzEgMTUgMTUgMTkuNDc3MSAxNSAyNUMxNSAzMC41MjI5IDE5LjQ3NzEgMzUgMjUgMzVDMzAuNTIyOSAzNSAzNSAzMC41MjI5IDM1IDI1QzM1IDE5LjQ3NzEgMzAuNTIyOSAxNSAyNSAxNVoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTI1IDM3QzI5LjQxODMgMzcgMzMgMzMuNDE4MyAzMyAyOUMzMyAyMy41ODE3IDI5LjQxODMgMjAgMjUgMjBDMjAuNTgxNyAyMCAxNyAyMy41ODE3IDE3IDI5QzE3IDMzLjQxODMgMjAuNTgxNyAzNyAyNSAzN1oiIGZpbGw9IiM5OTkiLz4KPC9zdmc+';
        this.removeEventListener('error', arguments.callee);
      });
    }
    
    resultList.appendChild(li);
  });
}

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    progressContainer.style.display = 'block';
    
    if (message.type === 'followers') {
      followersProgressText.textContent = `${message.fetched} / ${message.total || '?'} loaded`;
      // Use total count for accurate percentage
      const percentage = message.total ? Math.min((message.fetched / message.total) * 100, 100) : Math.min(message.fetched / 100 * 100, 100);
      followersProgress.style.width = `${percentage}%`;
    } else if (message.type === 'followings') {
      followingsProgressText.textContent = `${message.fetched} / ${message.total || '?'} loaded`;
      const percentage = message.total ? Math.min((message.fetched / message.total) * 100, 100) : Math.min(message.fetched / 100 * 100, 100);
      followingsProgress.style.width = `${percentage}%`;
    }
  } else if (message.action === 'ghostedUsers') {
    // Store ghosted users for export functionality
    ghostedUsers = message.users;
    // Render the user cards
    renderGhostedUsers(message.users);
  }
});

// kick off
showStatus("Checking");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: "getNonFollowers" }, (response) => {
    if (!response || response.error) {
      statusEl.textContent = "Error: " + (response?.error || "No response from content script.");
      return;
    }

    const { nonFollowers, username } = response;
    progressContainer.style.display = "none";
    showStatus(`${nonFollowers.length} people ghosted ${username}`, false);
    
    // Store for export functionality
    ghostedUsers = nonFollowers;
    
    // Render user cards (the ghostedUsers message will also trigger this, but we do it here as fallback)
    renderGhostedUsers(nonFollowers);

    copyBtn.style.display = "inline-block";
    openBtn.style.display = "inline-block";
    // exportTxtBtn.style.display = "inline-block";
    exportCSVBtn.style.display = "inline-block";

    copyBtn.addEventListener("click", () => {
      const text = ghostedUsers.map(u =>
        `Username: ${u.username}\nFull Name: ${u.full_name || 'N/A'}\nProfile: https://instagram.com/${u.username}`
      ).join("\n\n");

      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "Copied to clipboard";
        copyBtn.classList.add("copied");
      });
    });

    openBtn.addEventListener("click", () => {
      // Create HTML with proper UTF-8 encoding and card-style layout
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Ghosted ${username}</title>
          <style>
            body {
              font-family: 'Segoe UI', sans-serif;
              padding: 20px;
              max-width: 600px;
              margin: 0 auto;
              background-color: #fafafa;
              color: #333;
            }
            h2 {
              text-align: center;
              color: #333;
              margin-bottom: 20px;
            }
            .user-card {
              display: flex;
              align-items: center;
              padding: 16px;
              margin-bottom: 12px;
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.08);
              transition: transform 0.2s, box-shadow 0.2s;
            }
            .user-card:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 16px rgba(0,0,0,0.12);
            }
            .user-link {
              display: flex;
              align-items: center;
              text-decoration: none;
              color: inherit;
              width: 100%;
            }
            .profile-pic {
              width: 60px;
              height: 60px;
              border-radius: 50%;
              object-fit: cover;
              margin-right: 16px;
              flex-shrink: 0;
            }
            .user-info {
              flex: 1;
              min-width: 0;
            }
            .username {
              font-weight: 600;
              font-size: 16px;
              color: #0073e6;
              text-decoration: none;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              display: block;
            }
            .username:hover {
              text-decoration: underline;
            }
            .full-name {
              font-size: 14px;
              color: #666;
              margin-top: 4px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              display: block;
            }
            .empty-state {
              text-align: center;
              padding: 40px;
              color: #999;
            }
          </style>
        </head>
        <body>
          <h2>People who ghosted ${username}</h2>
          ${ghostedUsers.length === 0 ? `
            <div class="empty-state">No one ghosted you! 🎉</div>
          ` : `
            <div id="user-list">
              ${ghostedUsers.map(u => {
                const profilePic = u.profile_pic_data_url || u.profile_pic_url_hd || u.profile_pic_url || '';
                const fullName = u.full_name || '';
                const username = u.username || '';
                return `
                  <div class="user-card">
                    <a href="https://instagram.com/${username}" target="_blank" class="user-link">
                      <img src="${profilePic}" alt="${username}" class="profile-pic" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNlMGUwZTAiLz4KPHBhdGggZD0iTTMwIDE4QzI0LjQ3NzEgMTggMTggMjQuNDc3MSAxOCAzMEMxOCAzNS41MjI5IDI0LjQ3NzEgNDEgMzAgNDFDMzUuNTIyOSA0MSA0MSAzNS41MjI5IDQxIDMwQzQxIDI0LjQ3NzEgMzUuNTIyOSAxOCAzMCAxOFoiIGZpbGw9IiM5OTkiLz4KPHBhdGggZD0iTTMwIDQ0QzM1LjQxODMgNDQgMzkgNDAuNDE4MyAzOSAzNkMzOSAyOS41ODE3IDM1LjQxODMgMjYgMzAgMjZDMjQuNTgxNyAyNiAyMSAyOS41ODE3IDIxIDM2QzIxIDQwLjQxODMgMjQuNTgxNyA0NCAzMCA0NFoiIGZpbGw9IiM5OTkiLz4KPC9zdmc+'">
                      <div class="user-info">
                        <span class="username">@${username}</span>
                        ${fullName ? `<span class="full-name">${fullName}</span>` : ''}
                      </div>
                    </a>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </body>
        </html>
      `;
      // Use proper UTF-8 encoding
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
    });

    // exportTxtBtn.addEventListener("click", () => {
    //   if (!ghostedUsers.length) return;
    //   const content = ghostedUsers.map(u => `${u.full_name} | (@${u.username})`).join("\n");
    //   downloadFile("ghosted_list.txt", content, "text/plain");
    // });

    exportCSVBtn.addEventListener("click", () => {
      if (!ghostedUsers.length) return;
      const headers = "Full Name,Username,Profile Picture URL\n";
      const rows = ghostedUsers.map(u => `${u.full_name || ''}, ${u.username}, ${u.profile_pic_url_hd || u.profile_pic_url || ''}`).join("\n");
      const content = headers + rows;
      downloadFile("ghosted_list.csv", content, "text/csv");
    });

    function downloadFile(filename, content, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
    }

  });
});

