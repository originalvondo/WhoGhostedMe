function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  if (match) return match[1];
  return null;
}

async function unfollowUser(userId, username) {
  // If userId is missing, try to look it up
  if (!userId && username) {
    try {
      const userQueryRes = await fetch(
        `https://www.instagram.com/web/search/topsearch/?query=${username}`
      );
      const userQueryJson = await userQueryRes.json();
      const user = userQueryJson.users?.find(u => u.user.username === username);
      userId = user?.user?.pk || null;
    } catch (e) {
      console.warn("User ID lookup failed:", e);
    }
  }

  if (!userId) {
    return { success: false, error: `User ID not found for ${username || 'unknown user'}` };
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return { success: false, error: "CSRF token not found. Please make sure you are logged into Instagram." };
  }

  const baseHeaders = {
    'X-CSRFToken': csrfToken,
    'X-IG-App-ID': '936619743392459',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Instagram-AJAX': '1',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Strategy 1: Standard REST API endpoint
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
      method: 'POST',
      headers: baseHeaders
    });

    const data = await res.json().catch(() => null);
    if (res.ok && (data?.status === 'ok' || data?.friendship_status?.following === false)) {
      return { success: true, userId, username, data };
    }

    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
  } catch (err) {
    console.warn("REST unfollow attempt failed, trying GraphQL:", err);
  }

  // Strategy 2: GraphQL usePolarisUnfollowMutation
  try {
    const formBody = new URLSearchParams();
    formBody.append('fb_api_req_friendly_name', 'usePolarisUnfollowMutation');
    formBody.append('variables', JSON.stringify({ target_user_id: String(userId), user_id: String(userId) }));

    const res = await fetch('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'X-FB-Friendly-Name': 'usePolarisUnfollowMutation'
      },
      body: formBody.toString()
    });

    const data = await res.json().catch(() => null);
    if (res.ok && (data?.data?.xdt_destroy_friendship?.friendship_status?.following === false || data?.status === 'ok')) {
      return { success: true, userId, username, data };
    }

    if (res.status === 429 || data?.message === 'feedback_required') {
      return {
        success: false,
        error: data?.feedback_message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
  } catch (err) {
    console.warn("GraphQL unfollow attempt failed, trying web fallback:", err);
  }

  // Strategy 3: Web endpoint fallback
  try {
    const res = await fetch(`https://www.instagram.com/web/friendships/${userId}/unfollow/`, {
      method: 'POST',
      headers: baseHeaders
    });

    const data = await res.json().catch(() => null);
    if (res.ok && (data?.status === 'ok' || data?.friendship_status?.following === false)) {
      return { success: true, userId, username, data };
    }
    if (data?.message) {
      return { 
        success: false, 
        error: data.message === 'feedback_required' ? "Instagram limit reached. Please wait a few minutes." : data.message,
        isRateLimit: data.message === 'feedback_required'
      };
    }
  } catch (err) {
    console.warn("Web unfollow fallback failed:", err);
  }

  return { success: false, error: "Instagram limit reached. Please wait a few minutes before unfollowing more accounts." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "unfollowUser") {
    (async () => {
      try {
        const result = await unfollowUser(message.userId, message.username);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "getNonFollowers") {
    (async () => {
      try {
        const url = window.location.href;
        const usernameMatch = url.match(/instagram\.com\/([^/?]+)/);
        const username = usernameMatch ? usernameMatch[1] : null;

        if (!username) {
          sendResponse({ error: "Not on a profile page." });
          return;
        }

        let followers = [];
        let followings = [];

        // First try topsearch
        let userId = null;
        try {
          const userQueryRes = await fetch(
            `https://www.instagram.com/web/search/topsearch/?query=${username}`
          );
          const userQueryJson = await userQueryRes.json();
          const user = userQueryJson.users.find(u => u.user.username === username);
          userId = user?.user?.pk || null;
        } catch (e) {
          console.warn("Topsearch failed:", e);
        }

        // If topsearch fails, fallback to scraping profile_id from HTML
        if (!userId) {
          const html = document.documentElement.innerHTML;
          const match = html.match(/"profile_id":"(\d+)"/);
          if (match) {
            userId = match[1];
          }
        }

        if (!userId) {
          sendResponse({ error: "User ID not found." });
          return;
        }

        const sendProgress = (progress) => {
          chrome.runtime.sendMessage({ action: 'progress', ...progress });
        };

        // Function to fetch image and convert to data URL
        const fetchImageAsDataUrl = async (imageUrl) => {
          if (!imageUrl) return '';
          try {
            const response = await fetch(imageUrl);
            if (!response.ok) return '';
            const blob = await response.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.warn('Failed to fetch image:', imageUrl, e);
            return '';
          }
        };

        // Fetch followers and followings in parallel
        const fetchFollowers = async (userId, onProgress) => {
          let followers = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;
          let totalCount = 0;

          while (has_next) {
            const res = await fetch(
              `https://www.instagram.com/graphql/query/?query_hash=c76146de99bb02f6415203be841dd25a&variables=` +
              encodeURIComponent(JSON.stringify({
                id: userId,
                first: 100,
                after: after,
              }))
            );
            const data = await res.json();
            has_next = data.data.user.edge_followed_by.page_info.has_next_page;
            after = data.data.user.edge_followed_by.page_info.end_cursor;

            // Get total count from first response
            if (totalCount === 0) {
              totalCount = data.data.user.edge_followed_by.count;
            }

            const newFollowers = data.data.user.edge_followed_by.edges.map(({ node }) => ({
              id: node.id,
              username: node.username,
              full_name: node.full_name,
              profile_pic_url: node.profile_pic_url,
              profile_pic_url_hd: node.profile_pic_url_hd,
            }));
            followers = followers.concat(newFollowers);
            totalFetched += newFollowers.length;

            if (onProgress) {
              onProgress({ type: 'followers', fetched: totalFetched, total: totalCount });
            }
          }
          return followers;
        };

        const fetchFollowings = async (userId, onProgress) => {
          let followings = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;
          let totalCount = 0;

          while (has_next) {
            const res = await fetch(
              `https://www.instagram.com/graphql/query/?query_hash=d04b0a864b4b54837c0d870b0e77e076&variables=` +
              encodeURIComponent(JSON.stringify({
                id: userId,
                first: 100,
                after: after,
              }))
            );
            const data = await res.json();
            has_next = data.data.user.edge_follow.page_info.has_next_page;
            after = data.data.user.edge_follow.page_info.end_cursor;

            // Get total count from first response
            if (totalCount === 0) {
              totalCount = data.data.user.edge_follow.count;
            }

            const newFollowings = data.data.user.edge_follow.edges.map(({ node }) => ({
              id: node.id,
              username: node.username,
              full_name: node.full_name,
              profile_pic_url: node.profile_pic_url,
              profile_pic_url_hd: node.profile_pic_url_hd,
            }));
            followings = followings.concat(newFollowings);
            totalFetched += newFollowings.length;

            if (onProgress) {
              onProgress({ type: 'followings', fetched: totalFetched, total: totalCount });
            }
          }
          return followings;
        };

        // Fetch followers and followings in parallel
        const [fetchedFollowers, fetchedFollowings] = await Promise.all([
          fetchFollowers(userId, sendProgress),
          fetchFollowings(userId, sendProgress)
        ]);

        followers = fetchedFollowers;
        followings = fetchedFollowings;

        // Use Web Worker for comparison if lists are large
        const totalUsers = followers.length + followings.length;
        
        if (totalUsers > 10000) {
          const worker = new Worker(chrome.runtime.getURL('worker.js'));
          worker.onmessage = async (e) => {
            const { notFollowingBack } = e.data;
            const usersWithImages = await Promise.all(notFollowingBack.map(async (user) => {
              const profilePic = user.profile_pic_url_hd || user.profile_pic_url;
              const profilePicDataUrl = await fetchImageAsDataUrl(profilePic);
              return { ...user, profile_pic_data_url: profilePicDataUrl };
            }));
            chrome.runtime.sendMessage({
              action: 'ghostedUsers',
              users: usersWithImages
            });
            sendResponse({ nonFollowers: usersWithImages, username });
            worker.terminate();
          };
          worker.postMessage({ followers, followings });
        } else {
          const followerUsernames = new Set(followers.map(f => f.username));
          const dontFollowMeBack = followings.filter(f => !followerUsernames.has(f.username));

          const usersWithImages = await Promise.all(dontFollowMeBack.map(async (user) => {
            const profilePic = user.profile_pic_url_hd || user.profile_pic_url;
            const profilePicDataUrl = await fetchImageAsDataUrl(profilePic);
            return { ...user, profile_pic_data_url: profilePicDataUrl };
          }));

          chrome.runtime.sendMessage({
            action: 'ghostedUsers',
            users: usersWithImages
          });
          
          sendResponse({ nonFollowers: usersWithImages, username });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
