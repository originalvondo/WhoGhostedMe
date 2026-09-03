function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  if (match) return match[1];
  return null;
}

function getFbDtsg() {
  const input = document.querySelector('input[name="fb_dtsg"]');
  if (input && input.value) return input.value;

  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text) continue;
      const match = text.match(/"token":"(NA[a-zA-Z0-9_-]+:\d+:\d+)"/) ||
                    text.match(/"token":"([a-zA-Z0-9_-]+:\d+:\d+)"/) ||
                    text.match(/name="fb_dtsg"[^>]*value="([^"]+)"/) ||
                    text.match(/"dtsg":\{"token":"([^"]+)"\}/);
      if (match) return match[1];
    }

    const htmlMatch = document.documentElement.innerHTML.match(/"token":"(NA[a-zA-Z0-9_-]+:\d+:\d+)"/);
    if (htmlMatch) return htmlMatch[1];
  } catch (e) {
    console.warn("fb_dtsg extraction error:", e);
  }

  return null;
}

function getJazoest(dtsg) {
  const input = document.querySelector('input[name="jazoest"]');
  if (input && input.value) return input.value;

  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text) continue;
      const match = text.match(/"jazoest":(\d+)/) || text.match(/"jazoest":"(\d+)"/);
      if (match) return match[1];
    }
  } catch (e) {}

  if (dtsg) {
    let sum = 0;
    for (let i = 0; i < dtsg.length; i++) {
      sum += dtsg.charCodeAt(i);
    }
    return "2" + sum;
  }
  return "22714";
}

function getLsdToken() {
  const input = document.querySelector('input[name="lsd"]');
  if (input && input.value) return input.value;

  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text) continue;
      const match = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) ||
                    text.match(/"LSDInitialData",\[\],\{"token":"([^"]+)"\}/) ||
                    text.match(/name="lsd"[^>]*value="([^"]+)"/);
      if (match) return match[1];
    }
  } catch (e) {}

  return null;
}

async function unfollowUser(userId, username) {
  const cleanUsername = username ? username.replace(/^@/, '') : '';

  if (!userId && cleanUsername) {
    try {
      const userQueryRes = await fetch(
        `https://www.instagram.com/web/search/topsearch/?query=${cleanUsername}`
      );
      const userQueryJson = await userQueryRes.json();
      const user = userQueryJson.users?.find(u => u.user.username === cleanUsername);
      userId = user?.user?.pk || user?.user?.pk_id || user?.user?.id || null;
    } catch (e) {
      console.warn("User ID lookup failed:", e);
    }
  }

  if (!userId) {
    return { success: false, error: `User ID not found for ${cleanUsername || 'unknown user'}` };
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return { success: false, error: "CSRF token not found. Please make sure you are logged into Instagram." };
  }

  const lsdToken = getLsdToken() || 'AFYm2JnB7qQGQDkc31RS06';
  const fbDtsg = getFbDtsg() || 'NAfyXAfpsZrgWPmXbEvRjCVtV8R61iaYQ79nGfKMs0I4a92PSBEB4jg:17853828322093762:1787994042';
  const jazoest = getJazoest(fbDtsg);

  const baseHeaders = {
    'X-CSRFToken': csrfToken,
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-FB-LSD': lsdToken,
    'X-Requested-With': 'XMLHttpRequest',
    'X-Instagram-AJAX': '1046617997',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const checkUnfollowSuccess = (data) => {
    return Boolean(
      data?.status === 'ok' ||
      data?.friendship_status?.following === false ||
      data?.data?.xdt_destroy_friendship?.friendship_status?.following === false ||
      data?.data?.xdt_destroy_friendship?.id
    );
  };

  let lastError = null;

  // Strategy 1: Standard REST API endpoint with full tokens
  try {
    const postBody = new URLSearchParams();
    postBody.append('user_id', String(userId));
    if (fbDtsg) {
      postBody.append('fb_dtsg', fbDtsg);
      postBody.append('jazoest', jazoest);
    }
    if (lsdToken) {
      postBody.append('lsd', lsdToken);
    }

    const res = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: postBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkUnfollowSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }

    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("REST unfollow attempt 1 failed:", err);
    lastError = err.message;
  }

  // Strategy 2: GraphQL usePolarisUnfollowMutation with credentials and tokens
  try {
    const formBody = new URLSearchParams();
    formBody.append('fb_api_req_friendly_name', 'usePolarisUnfollowMutation');
    formBody.append('fb_api_caller_class', 'RelayModern');
    formBody.append('variables', JSON.stringify({ target_user_id: String(userId), user_id: String(userId) }));
    if (fbDtsg) {
      formBody.append('fb_dtsg', fbDtsg);
      formBody.append('jazoest', jazoest);
    }
    if (lsdToken) {
      formBody.append('lsd', lsdToken);
    }

    const res = await fetch('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        ...baseHeaders,
        'X-FB-Friendly-Name': 'usePolarisUnfollowMutation'
      },
      body: formBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkUnfollowSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }

    if (res.status === 429 || data?.message === 'feedback_required') {
      return {
        success: false,
        error: data?.feedback_message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("GraphQL unfollow attempt failed:", err);
  }

  // Strategy 3: Standard REST API endpoint (no body fallback)
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkUnfollowSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }

    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("REST unfollow (no body) failed:", err);
  }

  // Strategy 4: Web endpoint fallback
  try {
    const res = await fetch(`https://www.instagram.com/web/friendships/${userId}/unfollow/`, {
      method: 'POST',
      headers: baseHeaders,
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkUnfollowSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }
    if (data?.message) {
      if (data.message === 'feedback_required') {
        return { success: false, error: "Instagram action limit reached. Please wait a few minutes.", isRateLimit: true };
      }
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Web unfollow fallback failed:", err);
  }

  return { success: false, error: lastError || "Failed to unfollow user. Please wait a few minutes or check your connection." };
}

async function followUser(userId, username) {
  const cleanUsername = username ? username.replace(/^@/, '') : '';

  if (!userId && cleanUsername) {
    try {
      const userQueryRes = await fetch(
        `https://www.instagram.com/web/search/topsearch/?query=${cleanUsername}`
      );
      const userQueryJson = await userQueryRes.json();
      const user = userQueryJson.users?.find(u => u.user.username === cleanUsername);
      userId = user?.user?.pk || user?.user?.pk_id || user?.user?.id || null;
    } catch (e) {
      console.warn("User ID lookup failed:", e);
    }
  }

  if (!userId) {
    return { success: false, error: `User ID not found for ${cleanUsername || 'unknown user'}` };
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return { success: false, error: "CSRF token not found. Please make sure you are logged into Instagram." };
  }

  const baseHeaders = {
    'X-CSRFToken': csrfToken,
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Instagram-AJAX': '1046617997',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const checkSuccess = (data) => {
    return Boolean(
      data?.status === 'ok' ||
      data?.friendship_status?.following === true ||
      data?.friendship_status?.outgoing_request === true
    );
  };

  const isOutgoing = (data) => {
    return Boolean(data?.friendship_status?.outgoing_request);
  };

  let lastError = null;

  // Strategy 1: Native REST API /api/v1/friendships/create/${userId}/ with exact Instagram web payload
  try {
    const postBody = new URLSearchParams();
    postBody.append('container_module', 'profile');
    postBody.append('include_follow_friction_check', 'true');
    postBody.append('nav_chain', 'PolarisProfilePostsTabRoot:profilePage:2:topnav-link');
    postBody.append('user_id', String(userId));

    const fbDtsg = getFbDtsg() || 'NAfyXAfpsZrgWPmXbEvRjCVtV8R61iaYQ79nGfKMs0I4a92PSBEB4jg:17853828322093762:1787994042';
    postBody.append('fb_dtsg', fbDtsg);
    postBody.append('jazoest', getJazoest(fbDtsg));

    const res = await fetch(`https://www.instagram.com/api/v1/friendships/create/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: postBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkSuccess(data)) {
      return { success: true, userId, username: cleanUsername, isRequested: isOutgoing(data), data };
    }
    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Exact payload follow failed:", err);
    lastError = err.message;
  }

  // Strategy 2: Native REST API /api/v1/friendships/create/${userId}/ with simple user_id body
  try {
    const postBody = new URLSearchParams();
    postBody.append('user_id', String(userId));

    const res = await fetch(`https://www.instagram.com/api/v1/friendships/create/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: postBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkSuccess(data)) {
      return { success: true, userId, username: cleanUsername, isRequested: isOutgoing(data), data };
    }
    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Simple user_id follow failed:", err);
    lastError = err.message;
  }

  // Strategy 3: Web endpoint /web/friendships/${userId}/follow/
  try {
    const res = await fetch(`https://www.instagram.com/web/friendships/${userId}/follow/`, {
      method: 'POST',
      headers: baseHeaders,
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkSuccess(data)) {
      return { success: true, userId, username: cleanUsername, isRequested: isOutgoing(data), data };
    }
    if (data?.message) {
      if (data.message === 'feedback_required') {
        return { success: false, error: "Instagram action limit reached. Please wait a few minutes.", isRateLimit: true };
      }
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Web follow failed:", err);
    lastError = err.message;
  }

  return { success: false, error: lastError || "Failed to follow user. Please check your connection or wait a moment." };
}

async function removeFollower(userId, username) {
  const cleanUsername = username ? username.replace(/^@/, '') : '';

  if (!userId && cleanUsername) {
    try {
      const userQueryRes = await fetch(
        `https://www.instagram.com/web/search/topsearch/?query=${cleanUsername}`
      );
      const userQueryJson = await userQueryRes.json();
      const user = userQueryJson.users?.find(u => u.user.username === cleanUsername);
      userId = user?.user?.pk || user?.user?.pk_id || user?.user?.id || null;
    } catch (e) {
      console.warn("User ID lookup failed:", e);
    }
  }

  if (!userId) {
    return { success: false, error: `User ID not found for ${cleanUsername || 'unknown user'}` };
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    return { success: false, error: "CSRF token not found. Please make sure you are logged into Instagram." };
  }

  const baseHeaders = {
    'X-CSRFToken': csrfToken,
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Instagram-AJAX': '1046617997',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const checkRemoveSuccess = (data) => {
    return Boolean(
      data?.status === 'ok' ||
      data?.friendship_status?.followed_by === false
    );
  };

  let lastError = null;

  // Strategy 1: REST API /api/v1/friendships/remove_follower/${userId}/ with user_id, fb_dtsg, and jazoest
  try {
    const postBody = new URLSearchParams();
    postBody.append('user_id', String(userId));
    const fbDtsg = getFbDtsg() || 'NAfyXAfpsZrgWPmXbEvRjCVtV8R61iaYQ79nGfKMs0I4a92PSBEB4jg:17853828322093762:1787994042';
    postBody.append('fb_dtsg', fbDtsg);
    postBody.append('jazoest', getJazoest(fbDtsg));

    const res = await fetch(`https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: postBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkRemoveSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }
    if (res.status === 429 || data?.message === 'feedback_required' || data?.feedback_title) {
      return {
        success: false,
        error: data?.feedback_message || data?.message || "Instagram action limit reached. Please wait a few minutes.",
        isRateLimit: true
      };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Remove follower attempt 1 failed:", err);
    lastError = err.message;
  }

  // Strategy 2: Simple user_id body
  try {
    const postBody = new URLSearchParams();
    postBody.append('user_id', String(userId));

    const res = await fetch(`https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      body: postBody.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkRemoveSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Remove follower attempt 2 failed:", err);
    lastError = err.message;
  }

  // Strategy 3: No body
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`, {
      method: 'POST',
      headers: baseHeaders,
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    if (res.ok && checkRemoveSuccess(data)) {
      return { success: true, userId, username: cleanUsername, data };
    }
    if (data?.message) {
      lastError = data.message;
    }
  } catch (err) {
    console.warn("Remove follower attempt 3 failed:", err);
    lastError = err.message;
  }

  return { success: false, error: lastError || "Failed to remove follower. Please check your connection or wait a moment." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "followUser") {
    (async () => {
      try {
        const result = await followUser(message.userId, message.username);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.type === "removeFollower") {
    (async () => {
      try {
        const result = await removeFollower(message.userId, message.username);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

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
          try {
            chrome.runtime.sendMessage({ action: 'progress', ...progress }, () => {
              // Suppress potential unhandled receiving end errors
              chrome.runtime.lastError;
            });
          } catch (e) {
            // Suppress error if extension context was reloaded
          }
        };

        // Function to fetch image and convert to data URL silently without logging errors
        const fetchImageAsDataUrl = async (imageUrl) => {
          if (!imageUrl) return '';
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(imageUrl, {
              signal: controller.signal,
              referrerPolicy: 'no-referrer',
              credentials: 'omit'
            }).catch(() => null);
            clearTimeout(timeoutId);

            if (!response || !response.ok) return '';
            const blob = await response.blob().catch(() => null);
            if (!blob) return '';

            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result || '');
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
          } catch {
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

        const viewerIdMatch = document.cookie.match(/ds_user_id=([^;]+)/);
        const viewerUserId = viewerIdMatch ? viewerIdMatch[1] : null;
        const isOwnProfile = Boolean(userId && viewerUserId && String(userId) === String(viewerUserId));

        // Use Web Worker for comparison if lists are large
        // Process both:
        // 1) dontFollowMeBack (users you follow who don't follow you back)
        // 2) youDontFollowBack (users who follow you whom you don't follow back)
        const totalUsers = followers.length + followings.length;
        
        const attachImageDataUrls = async (list) => {
          const MAX_FETCH = 250;
          return Promise.all(list.map(async (user, idx) => {
            if (idx < MAX_FETCH) {
              const profilePic = user.profile_pic_url_hd || user.profile_pic_url;
              const profilePicDataUrl = await fetchImageAsDataUrl(profilePic);
              return { ...user, profile_pic_data_url: profilePicDataUrl || profilePic };
            }
            return user;
          }));
        };

        if (totalUsers > 10000) {
          const worker = new Worker(chrome.runtime.getURL('worker.js'));
          worker.onmessage = async (e) => {
            const { notFollowingBack, youDontFollowBack } = e.data;
            const [usersWithImages, fansWithImages] = await Promise.all([
              attachImageDataUrls(notFollowingBack || []),
              attachImageDataUrls(youDontFollowBack || [])
            ]);

            chrome.runtime.sendMessage({
              action: 'ghostedUsers',
              users: usersWithImages,
              fans: fansWithImages,
              isOwnProfile
            });
            sendResponse({ nonFollowers: usersWithImages, fans: fansWithImages, username, isOwnProfile });
            worker.terminate();
          };
          worker.postMessage({ followers, followings });
        } else {
          const followerUsernames = new Set(followers.map(f => (f.username || '').toLowerCase()));
          const dontFollowMeBack = followings.filter(f => !followerUsernames.has((f.username || '').toLowerCase()));

          const followingUsernames = new Set(followings.map(f => (f.username || '').toLowerCase()));
          const youDontFollowBack = followers.filter(f => !followingUsernames.has((f.username || '').toLowerCase()));

          const [usersWithImages, fansWithImages] = await Promise.all([
            attachImageDataUrls(dontFollowMeBack),
            attachImageDataUrls(youDontFollowBack)
          ]);

          chrome.runtime.sendMessage({
            action: 'ghostedUsers',
            users: usersWithImages,
            fans: fansWithImages,
            isOwnProfile
          });
          
          sendResponse({ nonFollowers: usersWithImages, fans: fansWithImages, username, isOwnProfile });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
