// content.js - WhoGhostedMe V2.0 Clean-Slate Engine
// Live Instagram GraphQL & Friendship Endpoint Manager

// Centralized Diagnostic Logger
const Logger = {
  logs: [],
  maxLogs: 1000,
  add(level, message, details = null) {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      timeStr: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      level: (level || 'info').toLowerCase(),
      message: String(message || ''),
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : null
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    // Broadcast to popup if open
    try {
      chrome.runtime.sendMessage({
        action: 'new_log_entry',
        log: entry
      }, () => { chrome.runtime.lastError; });
    } catch (e) {}

    // Persist in chrome.storage.local
    try {
      chrome.storage.local.set({ whg_debug_logs: this.logs.slice(-300) });
    } catch (e) {}

    return entry;
  },
  info(msg, det) { return this.add('info', msg, det); },
  query(msg, det) { return this.add('query', msg, det); },
  warn(msg, det) { return this.add('warn', msg, det); },
  error(msg, det) { return this.add('error', msg, det); },
  success(msg, det) { return this.add('success', msg, det); },
  clear() {
    this.logs = [];
    try {
      chrome.storage.local.set({ whg_debug_logs: [] });
      chrome.runtime.sendMessage({ action: 'logs_cleared' }, () => { chrome.runtime.lastError; });
    } catch (e) {}
  }
};

// Initialize logs from local storage if existing
try {
  chrome.storage.local.get(['whg_debug_logs'], (res) => {
    if (Array.isArray(res?.whg_debug_logs)) {
      Logger.logs = res.whg_debug_logs;
    }
  });
} catch (e) {}

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
    Logger.query(`Resolving numeric user ID for @${cleanUsername} via PolarisSearchBoxRefetchableQuery (doc_id: 27706427925724183)...`);
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
    if (!res.ok) {
      Logger.warn(`PolarisSearchBoxRefetchableQuery returned HTTP ${res.status}`, { status: res.status });
    }

    const userList = data?.data?.xdt_api__v1__fbsearch__topsearch_connection?.users || [];
    for (const item of userList) {
      const u = item?.user || item;
      if ((u?.username || '').toLowerCase() === cleanUsername) {
        const pk = String(u.pk || u.id || u.pk_id || '');
        Logger.success(`Resolved numeric ID ${pk} for @${cleanUsername} via GraphQL topsearch.`);
        return pk;
      }
    }

    if (userList.length > 0) {
      const firstUser = userList[0]?.user || userList[0];
      if ((firstUser?.username || '').toLowerCase() === cleanUsername) {
        const pk = String(firstUser.pk || firstUser.id || '');
        Logger.success(`Resolved numeric ID ${pk} for @${cleanUsername} via first topsearch match.`);
        return pk;
      }
    }
    Logger.warn(`PolarisSearchBoxRefetchableQuery returned ${userList.length} results, none matched @${cleanUsername}.`);
  } catch (e) {
    Logger.error(`PolarisSearchBoxRefetchableQuery fetch error`, { error: e.message });
  }

  return null;
}

async function fetchProfileData(targetUsername) {
  const cleanUsername = targetUsername.toLowerCase().trim().replace(/^@/, '');
  const viewerUserId = getViewerUserId();

  Logger.info(`Fetching profile details for @${cleanUsername}...`);

  // 1. Instant extraction from page scripts if currently on that user's page
  let resolvedId = extractUserIdFromPageScripts(cleanUsername);
  if (resolvedId) {
    Logger.info(`Found ID ${resolvedId} for @${cleanUsername} directly in page scripts.`);
  }

  // 2. Resolve target numeric ID via PolarisSearchBoxRefetchableQuery
  if (!resolvedId) {
    resolvedId = await resolveUserIdViaSearch(cleanUsername);
  }

  // 3. Direct fallback via web_profile_info
  if (!resolvedId) {
    try {
      Logger.query(`Fallback: requesting web_profile_info for @${cleanUsername}...`);
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
      if (infoRes.ok) {
        const u = infoData?.data?.user;
        if (u?.id || u?.pk) {
          resolvedId = String(u.id || u.pk);
          Logger.success(`Resolved ID ${resolvedId} via web_profile_info.`);
        }
      }
    } catch (e) {
      Logger.warn(`web_profile_info error`, { error: e.message });
    }
  }

  if (!resolvedId) {
    Logger.error(`Could not resolve numeric ID for @${targetUsername}.`);
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

  Logger.query(`Fetching profile content from PolarisProfilePageContentQuery (doc_id: 28036671149327607) for ID ${resolvedId}...`);
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
    Logger.error(`PolarisProfilePageContentQuery failed: HTTP ${res.status}`, { status: res.status });
    throw new Error(`Failed to load profile data from Instagram (Status: ${res.status}).`);
  }

  const payload = await res.json();
  const user = payload?.data?.user;
  if (!user) {
    Logger.error(`PolarisProfilePageContentQuery payload had no user data.`);
    throw new Error(`Instagram profile @${targetUsername} could not be retrieved.`);
  }

  const viewerPk = payload?.data?.viewer?.user?.pk || viewerUserId;
  const isOwnProfile = Boolean(viewerPk && String(viewerPk) === String(user.pk));

  const profileData = {
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

  Logger.success(`Profile loaded: @${profileData.username}`, {
    pk: profileData.pk,
    followers: profileData.follower_count,
    following: profileData.following_count,
    is_private: profileData.is_private,
    isOwnProfile: profileData.isOwnProfile
  });

  return profileData;
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

// 3. Generic Friendship Paginator with Adaptive Pacing, Intelligent Retry & Recovery
async function fetchFriendshipStream(type, userId, expectedTotal, isOwnProfile, onProgress) {
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
  let pageIndex = 0;
  let recoveryAttempted = false;

  Logger.info(`[${type.toUpperCase()}] Starting stream for user ID ${userId}. Expected: ${expectedTotal ?? 'unknown'}.`);

  while (hasMore) {
    pageIndex++;
    let url = `https://www.instagram.com/api/v1/friendships/${userId}/${type}/?count=12&search_surface=follow_list_page`;
    if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

    Logger.query(`[${type.toUpperCase()}] Requesting page ${pageIndex}: count=12, max_id=${maxId || 'START'}`);

    let data = null;
    let batchUsers = [];
    let addedInBatch = 0;
    let duplicatesInBatch = 0;

    // Retry loop for the current page (handles HTTP 429, network glitches, or stale duplicate responses)
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: baseHeaders,
          credentials: 'include'
        });

        if (res.ok) {
          data = await res.json();
          batchUsers = Array.isArray(data?.users) ? data.users : [];

          // Check for duplicates in the incoming batch
          duplicatesInBatch = 0;
          for (const u of batchUsers) {
            const id = String(u.pk || u.id || u.pk_id || u.strong_id__ || '').trim();
            if (id && seenIds.has(id)) duplicatesInBatch++;
          }

          // If Instagram returned heavy duplicates or incomplete items when more are expected, cool down and retry
          const hasMoreFlag = data?.has_more !== false;
          if (attempt < 2 && hasMoreFlag && duplicatesInBatch >= 3 && expectedTotal && users.length < expectedTotal - 15) {
            Logger.warn(`[${type.toUpperCase()}] Page ${pageIndex}: Stale cache detected (${duplicatesInBatch} duplicates). Cooling down 1.2s before retry...`, {
              attempt: attempt + 1,
              duplicates: duplicatesInBatch
            });
            await new Promise(r => setTimeout(r, 1200 + attempt * 500));
            continue;
          }

          Logger.success(`[${type.toUpperCase()}] Page ${pageIndex}: HTTP 200 OK (${batchUsers.length} raw users received).`);
          break;
        } else {
          let errText = '';
          try { errText = await res.text(); } catch (_) {}

          if (res.status === 429) {
            const cooldown = 2500 * (attempt + 1);
            Logger.error(`[${type.toUpperCase()}] RATE LIMITED (HTTP 429): Throttled on page ${pageIndex}! Backing off ${cooldown / 1000}s...`, {
              status: 429,
              attempt: attempt + 1,
              cooldownMs: cooldown
            });
            await new Promise(r => setTimeout(r, cooldown));
          } else if (res.status === 403) {
            Logger.error(`[${type.toUpperCase()}] ACCESS FORBIDDEN (HTTP 403) on page ${pageIndex}! Pausing 1.5s...`, {
              status: 403,
              attempt: attempt + 1
            });
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          } else {
            Logger.warn(`[${type.toUpperCase()}] Page ${pageIndex} returned HTTP ${res.status} ${res.statusText}`, {
              status: res.status,
              attempt: attempt + 1
            });
            await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
          }
        }
      } catch (e) {
        Logger.error(`[${type.toUpperCase()}] Page ${pageIndex} network error (attempt ${attempt + 1})`, { error: e.message });
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }

    if (batchUsers.length === 0) {
      // Check if we should attempt a recovery pass before giving up
      if (expectedTotal && users.length < expectedTotal - 10 && !recoveryAttempted) {
        recoveryAttempted = true;
        Logger.warn(`[${type.toUpperCase()}] Premature stream stop at ${users.length} vs expected ${expectedTotal}. Cooling down 2.5s for recovery query...`);
        await new Promise(r => setTimeout(r, 2500));
        maxId = String(users.length);
        continue;
      }

      Logger.warn(`[${type.toUpperCase()}] Page ${pageIndex} returned 0 users. End of pagination reached.`, {
        maxId,
        hasMoreFlag: data?.has_more,
        fetchedSoFar: users.length,
        expectedTotal
      });
      hasMore = false;
      if (onProgress) onProgress(users.length, true);
      break;
    }

    // Only query show_many for viewer's own profile
    let statuses = {};
    if (isOwnProfile) {
      const batchIds = batchUsers.map(u => String(u.pk || u.id || u.pk_id || u.strong_id__ || '')).filter(Boolean);
      statuses = await fetchFriendshipStatuses(batchIds);
    }

    addedInBatch = 0;
    duplicatesInBatch = 0;

    for (const u of batchUsers) {
      const id = String(u.pk || u.id || u.pk_id || u.strong_id__ || '').trim();
      if (!id) continue;
      if (seenIds.has(id)) {
        duplicatesInBatch++;
        continue;
      }
      seenIds.add(id);
      addedInBatch++;

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

    if (duplicatesInBatch > 0) {
      Logger.warn(`[${type.toUpperCase()}] Page ${pageIndex}: Filtered ${duplicatesInBatch} duplicate users returned by Instagram API.`);
    }

    const hasMoreFlag = data?.has_more !== false;
    let nextMaxId = null;

    if (data?.next_max_id != null && String(data.next_max_id).trim() !== '') {
      nextMaxId = String(data.next_max_id).trim();
    } else if (hasMoreFlag && batchUsers.length > 0) {
      nextMaxId = String(pageIndex * 12);
    }

    hasMore = Boolean(hasMoreFlag && nextMaxId && nextMaxId !== maxId);
    maxId = nextMaxId;

    Logger.info(`[${type.toUpperCase()}] Page ${pageIndex}: Received +${batchUsers.length} raw (${addedInBatch} new, Total: ${users.length}${expectedTotal ? ' / ' + expectedTotal : ''}). Next offset: ${nextMaxId || 'NONE'}, has_more: ${hasMore}`);

    if (onProgress) {
      onProgress(users.length, !hasMore);
    }

    if (!hasMore || batchUsers.length === 0) {
      break;
    }

    // Human-like pacing delay with slight randomized jitter (650ms - 900ms) to prevent server throttling
    const pacingDelay = 650 + Math.floor(Math.random() * 250);
    await new Promise(r => setTimeout(r, pacingDelay));
  }

  // Final discrepancy check
  if (expectedTotal && users.length < expectedTotal) {
    const diff = expectedTotal - users.length;
    Logger.warn(`[${type.toUpperCase()}] Count mismatch detected: Profile reports ${expectedTotal}, but API returned ${users.length} active users (${diff} accounts unreachable). Potential causes: deactivated/suspended accounts, privacy filters, or followed hashtags.`, {
      expectedTotal,
      retrievedTotal: users.length,
      difference: diff
    });
  } else {
    Logger.success(`[${type.toUpperCase()}] Stream finished: Successfully retrieved all ${users.length} accounts.`);
  }

  return users;
}

// Check direct friendship relationship between viewer and target user
async function checkFriendshipStatus(targetUserId) {
  try {
    const csrfToken = getCsrfToken();
    const res = await fetch(`https://www.instagram.com/api/v1/friendships/show/${targetUserId}/`, {
      headers: {
        'X-CSRFToken': csrfToken,
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '359341',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return data;
    }
  } catch (e) {}
  return null;
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

  if (message.action === 'get_logs') {
    sendResponse({ success: true, logs: Logger.logs });
    return true;
  }

  if (message.action === 'clear_logs') {
    Logger.clear();
    sendResponse({ success: true });
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

        // Sequential streams to prevent Instagram server-side rate limits & duplicate slices
        let curFollowingCount = 0;
        let curFollowersCount = 0;
        let isFollowingDone = false;
        let isFollowersDone = false;

        Logger.info(`=== STARTING SCAN FOR @${profile.username} ===`);
        Logger.info(`Target Account Stats: Followers=${profile.follower_count}, Following=${profile.following_count}, isOwnProfile=${profile.isOwnProfile}`);

        // 1. Fetch Followings first
        Logger.info(`[Step 1/2] Fetching followings list for @${profile.username}...`);
        const followings = await fetchFriendshipStream('following', profile.pk, profile.following_count, profile.isOwnProfile, (fetched, done) => {
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
        });

        // Gentle pause between following and followers to let Instagram backend session settle
        await new Promise(r => setTimeout(r, 600));

        // 2. Fetch Followers second
        Logger.info(`[Step 2/2] Fetching followers list for @${profile.username}...`);
        const followers = await fetchFriendshipStream('followers', profile.pk, profile.follower_count, profile.isOwnProfile, (fetched, done) => {
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
        });

        sendProgress({
          followingFetched: followings.length,
          followingTotal: profile.following_count,
          followingDone: true,
          followersFetched: followers.length,
          followersTotal: profile.follower_count,
          followersDone: true,
          done: true
        });

        // Compute Universal Relationship Sets
        const getNormalizedId = (u) => String(u.id || u.pk || u.pk_id || u.strong_id__ || '').trim();

        const followerIdSet = new Set(followers.map(getNormalizedId).filter(Boolean));
        const followingIdSet = new Set(followings.map(getNormalizedId).filter(Boolean));

        let notFollowingBack = [];
        let fans = [];
        let mutual = [];

        Logger.info(`Beginning relationship calculations: ${followers.length} followers collected, ${followings.length} following collected.`);

        if (profile.isOwnProfile) {
          // --- OWN PROFILE SCENARIO ---
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

          // Initial candidate filtering
          let ghostCandidates = followings.filter(u => {
            const id = getNormalizedId(u);
            return id && !followerIdSet.has(id) && u.followed_by !== true;
          });

          // Safeguard: Verify candidate ghosts via direct status check to ensure NO ONE who follows you back is falsely flagged
          if (ghostCandidates.length > 0 && ghostCandidates.length <= 60) {
            Logger.info(`Verifying ${ghostCandidates.length} unconfirmed relationships via direct status check...`);
            const verifiedGhosts = [];
            for (const u of ghostCandidates) {
              const id = getNormalizedId(u);
              const statusData = await checkFriendshipStatus(id);
              if (statusData?.followed_by === true) {
                Logger.success(`[VERIFIED RECOVERY] @${u.username || id} ACTUALLY follows you back! Recovered from Instagram API drop.`);
                followerIdSet.add(id);
                u.followed_by = true;
                if (!followers.some(f => getNormalizedId(f) === id)) {
                  followers.push(u);
                }
              } else {
                verifiedGhosts.push(u);
              }
              await new Promise(r => setTimeout(r, 120));
            }
            notFollowingBack = verifiedGhosts;
          } else {
            notFollowingBack = ghostCandidates;
          }

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
          // Dual-Key Matching: Check both User ID and normalized username to eliminate false positives
          const followerUsernameSet = new Set(followers.map(u => (u.username || '').toLowerCase()).filter(Boolean));
          const followingUsernameSet = new Set(followings.map(u => (u.username || '').toLowerCase()).filter(Boolean));

          // 1. Who doesn't follow THEM back: in their followings, but NOT in their followers
          notFollowingBack = followings.filter(u => {
            const id = getNormalizedId(u);
            const un = (u.username || '').toLowerCase();
            const followsBack = (id && followerIdSet.has(id)) || (un && followerUsernameSet.has(un));
            return !followsBack;
          });

          // 2. Who THEY don't follow back: in their followers, but NOT in their followings
          fans = followers.filter(u => {
            const id = getNormalizedId(u);
            const un = (u.username || '').toLowerCase();
            const followed = (id && followingIdSet.has(id)) || (un && followingUsernameSet.has(un));
            return !followed;
          });

          // 3. Mutual: in their followings AND in their followers
          mutual = followings.filter(u => {
            const id = getNormalizedId(u);
            const un = (u.username || '').toLowerCase();
            return (id && followerIdSet.has(id)) || (un && followerUsernameSet.has(un));
          });
        }

        Logger.success(`Scan complete for @${profile.username}! Results: ${notFollowingBack.length} don't follow back, ${fans.length} fans, ${mutual.length} mutual.`);

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
        Logger.error(`Scan failed: ${err.message || err}`, { stack: err.stack });
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
