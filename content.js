// content.js - WhoGhostedMe V2.0 Clean-Slate Engine
// Live Instagram GraphQL & Friendship Endpoint Manager

function getCsrfToken() {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

function getViewerUserId() {
  const match = document.cookie.match(/ds_user_id=([^;]+)/);
  return match ? match[1] : '';
}

function getFbDtsg() {
  const input = document.querySelector('input[name="fb_dtsg"]');
  if (input && input.value) return input.value;
  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text) continue;
      const match = text.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/) ||
                    text.match(/"token":"(NA[a-zA-Z0-9_:-]+)"/) ||
                    text.match(/name="fb_dtsg"[^>]*value="([^"]+)"/) ||
                    text.match(/"dtsg":\{"token":"([^"]+)"\}/);
      if (match) return match[1];
    }
  } catch (e) {}
  return '';
}

function getJazoest(fbDtsg) {
  const input = document.querySelector('input[name="jazoest"]');
  if (input && input.value) return input.value;
  if (fbDtsg) {
    let sum = 0;
    for (let i = 0; i < fbDtsg.length; i++) {
      sum += fbDtsg.charCodeAt(i);
    }
    return '2' + sum;
  }
  return '22714';
}

function getLsd() {
  const input = document.querySelector('input[name="lsd"]');
  if (input && input.value) return input.value;
  try {
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text) continue;
      const match = text.match(/"LSD"[^}]*"token":"([^"]+)"/) ||
                    text.match(/"lsd":"([^"]+)"/);
      if (match) return match[1];
    }
  } catch (e) {}
  return '';
}

// Extract user numeric PK from page scripts if currently on that user's profile
function extractUserIdFromPageScripts(username) {
  try {
    const clean = username.toLowerCase().trim().replace(/^@/, '');
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent;
      if (!text || !text.toLowerCase().includes(clean)) continue;

      // Pattern: "username":"<clean>",..."pk":"<id>" or "id":"<id>"
      const match1 = text.match(new RegExp(`"username"\\s*:\\s*"${clean}"[\\s\\S]{1,400}?"(?:pk|id)"\\s*:\\s*"(\\d{5,})"`, 'i'));
      if (match1 && match1[1]) return match1[1];

      // Pattern: "(?:pk|id)":"<id>",..."username":"<clean>"
      const match2 = text.match(new RegExp(`"(?:pk|id)"\\s*:\\s*"(\\d{5,})"[\\s\\S]{1,400}?"username"\\s*:\\s*"${clean}"`, 'i'));
      if (match2 && match2[1]) return match2[1];
    }
  } catch (e) {}
  return null;
}

// 1. Resolve Profile & Exact Counts via PolarisSearchBoxRefetchableQuery & PolarisProfilePageContentQuery
async function resolveUserIdViaSearch(targetUsername) {
  const cleanUsername = targetUsername.toLowerCase().trim().replace(/^@/, '');
  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);
  const lsd = getLsd();
  const viewerUserId = getViewerUserId();

  const searchSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const rankToken = `${Date.now()}|${Math.random().toString(36).substring(2, 15)}`;

  const variables = {
    data: {
      context: 'blended',
      include_reel: 'true',
      query: cleanUsername,
      rank_token: rankToken,
      search_session_id: searchSessionId,
      search_surface: 'web_top_search'
    },
    hasQuery: true
  };

  const body = new URLSearchParams();
  if (viewerUserId) body.append('av', viewerUserId);
  body.append('__d', 'www');
  body.append('__user', '0');
  body.append('__a', '1');
  body.append('__req', 'y');
  if (fbDtsg) body.append('fb_dtsg', fbDtsg);
  if (jazoest) body.append('jazoest', jazoest);
  if (lsd) body.append('lsd', lsd);
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('fb_api_req_friendly_name', 'PolarisSearchBoxRefetchableQuery');
  body.append('server_timestamps', 'true');
  body.append('variables', JSON.stringify(variables));
  body.append('doc_id', '27706427925724183');

  try {
    const res = await fetch('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '359341',
        'X-FB-Friendly-Name': 'PolarisSearchBoxRefetchableQuery',
        ...(lsd ? { 'X-FB-LSD': lsd } : {})
      },
      body: body.toString(),
      credentials: 'include'
    });

    const data = await res.json().catch(() => null);
    console.log('[WhoGhostedMe] PolarisSearchBoxRefetchableQuery response:', res.status, data);

    const userList = data?.data?.xdt_api__v1__fbsearch__topsearch_connection?.users || [];
    for (const item of userList) {
      const u = item?.user || item;
      if ((u?.username || '').toLowerCase() === cleanUsername) {
        const pk = String(u.pk || u.id || u.pk_id || '');
        console.log('[WhoGhostedMe] Matched user PK from search:', pk);
        return pk;
      }
    }

    if (userList.length > 0) {
      const firstUser = userList[0]?.user || userList[0];
      if ((firstUser?.username || '').toLowerCase() === cleanUsername) {
        return String(firstUser.pk || firstUser.id || '');
      }
    }
  } catch (e) {
    console.warn('[WhoGhostedMe] PolarisSearchBoxRefetchableQuery error:', e);
  }

  return null;
}

async function fetchProfileData(targetUsername) {
  const cleanUsername = targetUsername.toLowerCase().trim().replace(/^@/, '');
  const viewerUserId = getViewerUserId();

  // 1. Instant extraction from page scripts if currently on that user's page
  let resolvedId = extractUserIdFromPageScripts(cleanUsername);
  if (resolvedId) {
    console.log('[WhoGhostedMe] Resolved ID from page scripts:', resolvedId);
  }

  // 2. Resolve target numeric ID via PolarisSearchBoxRefetchableQuery
  if (!resolvedId) {
    resolvedId = await resolveUserIdViaSearch(cleanUsername);
    console.log('[WhoGhostedMe] Resolved ID after search:', resolvedId);
  }

  // 2. Direct fallback via web_profile_info
  if (!resolvedId) {
    try {
      const csrfToken = getCsrfToken();
      const infoRes = await fetch(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUsername)}`,
        {
          headers: {
            'X-CSRFToken': csrfToken,
            'X-IG-App-ID': '936619743392459',
            'X-ASBD-ID': '359341',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include'
        }
      );
      const infoData = await infoRes.json().catch(() => null);
      console.log('[WhoGhostedMe] web_profile_info response:', infoRes.status, infoData);
      if (infoRes.ok) {
        const u = infoData?.data?.user;
        if (u?.id || u?.pk) {
          resolvedId = String(u.id || u.pk);
          console.log('[WhoGhostedMe] Resolved ID from web_profile_info:', resolvedId);
        }
      }
    } catch (e) {
      console.warn('[WhoGhostedMe] web_profile_info error:', e);
    }
  }

  if (!resolvedId) {
    throw new Error(`Could not find profile ID for @${targetUsername}. Make sure the username is correct.`);
  }

  // Query Polaris GraphQL with target ID
  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);
  const lsd = getLsd();

  const body = new URLSearchParams();
  body.append('fb_api_req_friendly_name', 'PolarisProfilePageContentQuery');
  body.append('fb_api_caller_class', 'RelayModern');
  body.append('doc_id', '28036671149327607');
  body.append('server_timestamps', 'true');
  if (fbDtsg) body.append('fb_dtsg', fbDtsg);
  if (jazoest) body.append('jazoest', jazoest);
  if (lsd) body.append('lsd', lsd);
  body.append('variables', JSON.stringify({
    enable_integrity_filters: true,
    id: String(resolvedId),
    __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: true,
    __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
    __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
    __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: true,
    __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false
  }));

  const res = await fetch('https://www.instagram.com/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrfToken,
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '359341',
      'X-FB-Friendly-Name': 'PolarisProfilePageContentQuery',
      ...(lsd ? { 'X-FB-LSD': lsd } : {})
    },
    body: body.toString(),
    credentials: 'include'
  });

  if (!res.ok) {
    throw new Error(`Failed to load profile data from Instagram (Status: ${res.status}).`);
  }

  const payload = await res.json();
  const user = payload?.data?.user;
  if (!user) {
    throw new Error(`Instagram profile @${targetUsername} could not be retrieved.`);
  }

  const viewerPk = payload?.data?.viewer?.user?.pk || viewerUserId;
  const isOwnProfile = Boolean(viewerPk && String(viewerPk) === String(user.pk));

  return {
    pk: String(user.pk || resolvedId),
    id: String(user.pk || resolvedId),
    username: user.username || targetUsername,
    full_name: user.full_name || '',
    biography: user.biography || '',
    profile_pic_url: user.profile_pic_url || '',
    follower_count: typeof user.follower_count === 'number' ? user.follower_count : 0,
    following_count: typeof user.following_count === 'number' ? user.following_count : 0,
    is_private: Boolean(user.is_private),
    is_verified: Boolean(user.is_verified),
    friendship_status: user.friendship_status || null,
    isOwnProfile
  };
}

// 2. Fetch Friendship Statuses via show_many (Rich Metadata: Close Friends, Requests)
async function fetchFriendshipStatuses(userIds) {
  if (!userIds || userIds.length === 0) return {};
  if (userIds.length > 25) {
    const results = {};
    for (let i = 0; i < userIds.length; i += 25) {
      const chunk = userIds.slice(i, i + 25);
      const chunkRes = await fetchFriendshipStatuses(chunk);
      Object.assign(results, chunkRes);
    }
    return results;
  }

  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);

  const postBody = new URLSearchParams();
  postBody.append('user_ids', userIds.join(','));
  if (jazoest) postBody.append('jazoest', jazoest);
  if (fbDtsg) postBody.append('fb_dtsg', fbDtsg);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://www.instagram.com/api/v1/friendships/show_many/', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-IG-App-ID': '936619743392459',
          'X-ASBD-ID': '359341',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postBody.toString(),
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.friendship_statuses) {
          return data.friendship_statuses;
        }
      }
    } catch (err) {}
    await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
  }
  return {};
}

// 3. Generic Friendship Paginator with High-Speed Batching (count=50)
async function fetchFriendshipStream(type, userId, onProgress) {
  const isFollowers = type === 'followers';
  const csrfToken = getCsrfToken();
  const baseHeaders = {
    'X-CSRFToken': csrfToken,
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*'
  };

  const users = [];
  const seenIds = new Set();
  let maxId = null;
  let hasMore = true;

  while (hasMore) {
    let url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?count=50`;
    if (isFollowers) url += `&search_surface=follow_list_page`;
    if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: baseHeaders,
          credentials: 'include'
        });
        if (res.ok) {
          data = await res.json();
          break;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    }

    const batchUsers = Array.isArray(data?.users) ? data.users : [];
    if (batchUsers.length === 0) {
      hasMore = false;
      if (onProgress) onProgress(users.length, true);
      break;
    }

    const batchIds = batchUsers.map(u => String(u.pk || u.id || u.pk_id || u.strong_id__ || '')).filter(Boolean);
    const statuses = await fetchFriendshipStatuses(batchIds);

    for (const u of batchUsers) {
      const id = String(u.pk || u.id || u.pk_id || u.strong_id__ || '').trim();
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);

      const status = statuses[id] || {};
      users.push({
        id,
        pk: id,
        username: u.username || '',
        full_name: u.full_name || '',
        profile_pic_url: u.profile_pic_url || '',
        is_private: status.is_private !== undefined ? Boolean(status.is_private) : Boolean(u.is_private),
        is_verified: Boolean(u.is_verified),
        is_bestie: Boolean(status.is_bestie),
        following: status.following !== undefined ? Boolean(status.following) : (type === 'following'),
        followed_by: status.followed_by !== undefined ? Boolean(status.followed_by) : (type === 'followers'),
        incoming_request: Boolean(status.incoming_request),
        outgoing_request: Boolean(status.outgoing_request),
        is_feed_favorite: Boolean(status.is_feed_favorite),
        is_restricted: Boolean(status.is_restricted)
      });
    }

    const nextMaxId = data?.next_max_id ? String(data.next_max_id) : null;
    hasMore = Boolean(nextMaxId && data?.has_more !== false && nextMaxId !== maxId);
    maxId = nextMaxId;

    if (onProgress) {
      onProgress(users.length, !hasMore);
    }

    if (!hasMore || batchUsers.length === 0) {
      break;
    }
  }

  return users;
}

// 4. Action Handlers: Follow, Unfollow, Remove Follower
async function followUser(userId) {
  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);

  const postBody = new URLSearchParams();
  postBody.append('user_id', String(userId));
  postBody.append('container_module', 'profile');
  if (jazoest) postBody.append('jazoest', jazoest);
  if (fbDtsg) postBody.append('fb_dtsg', fbDtsg);

  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/create/${userId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '359341',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postBody.toString(),
      credentials: 'include'
    });
    const data = await res.json().catch(() => null);
    const following = Boolean(data?.friendship_status?.following);
    const isRequested = Boolean(data?.friendship_status?.outgoing_request);
    return {
      success: Boolean(res.ok && (data?.status === 'ok' || following || isRequested)),
      following,
      isRequested
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function unfollowUser(userId) {
  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);

  const postBody = new URLSearchParams();
  postBody.append('user_id', String(userId));
  if (jazoest) postBody.append('jazoest', jazoest);
  if (fbDtsg) postBody.append('fb_dtsg', fbDtsg);

  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '359341',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postBody.toString(),
      credentials: 'include'
    });
    const data = await res.json().catch(() => null);
    return {
      success: Boolean(res.ok && (data?.status === 'ok' || data?.friendship_status?.following === false)),
      following: false,
      isRequested: false
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function removeFollower(userId) {
  const csrfToken = getCsrfToken();
  const fbDtsg = getFbDtsg();
  const jazoest = getJazoest(fbDtsg);

  const postBody = new URLSearchParams();
  postBody.append('user_id', String(userId));
  if (jazoest) postBody.append('jazoest', jazoest);
  if (fbDtsg) postBody.append('fb_dtsg', fbDtsg);

  try {
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`, {
      method: 'POST',
      headers: {
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '359341',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: postBody.toString(),
      credentials: 'include'
    });
    const data = await res.json().catch(() => null);
    return {
      success: Boolean(res.ok && data?.status === 'ok')
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 5. Message Dispatcher for Extension Side Panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'detectProfile') {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const path = parts[0] || '';
    const reserved = new Set(['explore', 'reels', 'stories', 'direct', 'p', 'reel', 'accounts', 'developer', 'about', 'legal', 'home', 'api', 'graphql']);
    if (path && !reserved.has(path.toLowerCase())) {
      sendResponse({ detectedUsername: path });
    } else {
      sendResponse({ detectedUsername: null });
    }
    return true;
  }

  if (message.action === 'followUser') {
    followUser(message.userId).then(sendResponse);
    return true;
  }

  if (message.action === 'unfollowUser') {
    unfollowUser(message.userId).then(sendResponse);
    return true;
  }

  if (message.action === 'removeFollower') {
    removeFollower(message.userId).then(sendResponse);
    return true;
  }

  if (message.action === 'scanProfile') {
    (async () => {
      try {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const currentPathUsername = parts[0] || '';
        let username = (message.username || currentPathUsername || '').trim().replace(/^@/, '');

        const reserved = new Set(['explore', 'reels', 'stories', 'direct', 'p', 'reel', 'accounts', 'developer', 'about', 'legal', 'home', 'api', 'graphql', 'emails']);
        if (!username || reserved.has(username.toLowerCase())) {
          sendResponse({ success: false, error: 'Please enter a valid Instagram @username or navigate to a profile page.' });
          return;
        }

        // Fetch Profile Details & Counts
        const profile = await fetchProfileData(username);

        // Check if target is a private account not followed by viewer
        const isRestrictedPrivate = Boolean(
          profile.is_private &&
          !profile.isOwnProfile &&
          profile.friendship_status?.following !== true
        );

        if (isRestrictedPrivate) {
          sendResponse({
            success: true,
            isRestrictedPrivate: true,
            profile
          });
          return;
        }

        // Notify UI that scan progress is starting
        const sendProgress = (p) => {
          try {
            chrome.runtime.sendMessage({ action: 'scan_progress', ...p }, () => {
              chrome.runtime.lastError;
            });
          } catch (e) {}
        };

        sendProgress({
          followingFetched: 0,
          followingTotal: profile.following_count,
          followingDone: false,
          followersFetched: 0,
          followersTotal: profile.follower_count,
          followersDone: false
        });

        // Parallel streams for following and followers
        let curFollowingCount = 0;
        let curFollowersCount = 0;
        let isFollowingDone = false;
        let isFollowersDone = false;

        const [followers, followings] = await Promise.all([
          fetchFriendshipStream('followers', profile.pk, (fetched, done) => {
            curFollowersCount = fetched;
            isFollowersDone = done;
            sendProgress({
              followingFetched: curFollowingCount,
              followingTotal: profile.following_count,
              followingDone: isFollowingDone,
              followersFetched: curFollowersCount,
              followersTotal: profile.follower_count,
              followersDone: isFollowersDone
            });
          }),
          fetchFriendshipStream('following', profile.pk, (fetched, done) => {
            curFollowingCount = fetched;
            isFollowingDone = done;
            sendProgress({
              followingFetched: curFollowingCount,
              followingTotal: profile.following_count,
              followingDone: isFollowingDone,
              followersFetched: curFollowersCount,
              followersTotal: profile.follower_count,
              followersDone: isFollowersDone
            });
          })
        ]);

        sendProgress({
          followingFetched: followings.length,
          followingTotal: profile.following_count,
          followingDone: true,
          followersFetched: followers.length,
          followersTotal: profile.follower_count,
          followersDone: true,
          done: true
        });

        // Compute Universal Relationship Sets strictly by ID after fully collecting both lists
        const getNormalizedId = (u) => String(u.id || u.pk || u.pk_id || u.strong_id__ || '').trim();

        const followerIdSet = new Set(followers.map(getNormalizedId).filter(Boolean));
        const followingIdSet = new Set(followings.map(getNormalizedId).filter(Boolean));

        let notFollowingBack = [];
        let fans = [];
        let mutual = [];

        if (profile.isOwnProfile) {
          // --- OWN PROFILE SCENARIO ---
          // show_many statuses authoritatively declare viewer's direct relationships
          for (const u of followers) {
            const id = getNormalizedId(u);
            if (id && u.following === true) {
              followingIdSet.add(id);
              if (!followings.some(f => getNormalizedId(f) === id)) {
                followings.push(u);
              }
            }
          }
          for (const u of followings) {
            const id = getNormalizedId(u);
            if (id && u.followed_by === true) {
              followerIdSet.add(id);
              if (!followers.some(f => getNormalizedId(f) === id)) {
                followers.push(u);
              }
            }
          }

          // 1. Not following you: in followings, but doesn't follow back
          notFollowingBack = followings.filter(u => {
            const id = getNormalizedId(u);
            return id && !followerIdSet.has(id) && u.followed_by !== true;
          });

          // 2. You don't follow back: in followers, but viewer does not follow them back
          fans = followers.filter(u => {
            const id = getNormalizedId(u);
            return id && !followingIdSet.has(id) && u.following !== true;
          });

          // 3. Mutual: in followings AND in followers
          mutual = followings.filter(u => {
            const id = getNormalizedId(u);
            return id && (followerIdSet.has(id) || u.followed_by === true);
          });
        } else {
          // --- OTHER PERSON'S PROFILE SCENARIO ---
          // Strictly compare THAT PERSON'S collected followings and followers lists by user ID:
          // 1. Who doesn't follow THEM back: in their followings, but NOT in their followers
          notFollowingBack = followings.filter(u => {
            const id = getNormalizedId(u);
            return id && !followerIdSet.has(id);
          });

          // 2. Who THEY don't follow back: in their followers, but NOT in their followings
          fans = followers.filter(u => {
            const id = getNormalizedId(u);
            return id && !followingIdSet.has(id);
          });

          // 3. Mutual: in their followings AND in their followers
          mutual = followings.filter(u => {
            const id = getNormalizedId(u);
            return id && followerIdSet.has(id);
          });
        }

        sendResponse({
          success: true,
          isRestrictedPrivate: false,
          profile,
          notFollowingBack,
          fans,
          mutual,
          followings,
          followers
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message || 'An error occurred while scanning profile.' });
      }
    })();
    return true;
  }
});

// Active URL & Profile Change Detection for SPA Navigation
const RESERVED_URL_ROUTES = new Set([
  'explore', 'reels', 'stories', 'direct', 'p', 'reel', 'accounts',
  'developer', 'about', 'legal', 'home', 'api', 'graphql', 'emails'
]);

function getProfileFromCurrentPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const path = parts[0] || '';
  if (path && !RESERVED_URL_ROUTES.has(path.toLowerCase())) {
    return path;
  }
  return null;
}

let lastBroadcastUrl = window.location.href;

function notifyIfUrlChanged() {
  if (window.location.href !== lastBroadcastUrl) {
    lastBroadcastUrl = window.location.href;
    const detectedUsername = getProfileFromCurrentPath();
    try {
      chrome.runtime.sendMessage({
        action: 'profile_changed',
        username: detectedUsername,
        pathname: window.location.pathname,
        url: window.location.href
      }, () => {
        chrome.runtime.lastError;
      });
    } catch (e) {}
  }
}

// 1. Navigation API for instant in-page pushState / replaceState detection
if (window.navigation) {
  try {
    window.navigation.addEventListener('currententrychange', notifyIfUrlChanged);
  } catch (e) {}
}

// 2. Browser history popstate
window.addEventListener('popstate', notifyIfUrlChanged);

// 3. User interaction click listener with debounced checks
document.addEventListener('click', () => {
  setTimeout(notifyIfUrlChanged, 100);
  setTimeout(notifyIfUrlChanged, 400);
});

// 4. Fallback interval
setInterval(notifyIfUrlChanged, 300);
