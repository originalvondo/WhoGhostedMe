// content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  debugger; // breakpoint: message received

  if (msg.action !== 'getNonFollowers') {
    console.warn('Unknown action:', msg.action);
    return;
  }

  (async () => {
    try {
      debugger; // breakpoint: before extracting username

      // 1) Extract username from URL
      const path = window.location.pathname; // e.g. "/username/"
      const username = path.split('/').filter(Boolean)[0];
      if (!username) throw new Error('Username not found in URL');
      debugger; // breakpoint: username extracted
      console.log('Username:', username);

      // 2) Fetch user ID via search endpoint
      debugger; // breakpoint: before search fetch
      const searchRes = await fetch(
        `https://www.instagram.com/web/search/topsearch/?query=${username}`
      );
      const searchJson = await searchRes.json();
      debugger; // breakpoint: after search response parsed
      const userObj = searchJson.users
        .map(u => u.user)
        .find(u => u.username === username);
      if (!userObj) throw new Error('User not found via search');
      const userId = userObj.pk;
      debugger; // breakpoint: userId found
      console.log('User ID:', userId);

      // helper to page through edges
      async function fetchEdges(queryHash, edgeKey) {
        let items = [];
        let after = null, hasNext = true;

        while (hasNext) {
          debugger; // breakpoint: before each paged fetch
          const vars = { id: userId, include_reel: true, fetch_mutual: true, first: 50, after };
          const url =
            `https://www.instagram.com/graphql/query/` +
            `?query_hash=${queryHash}` +
            `&variables=${encodeURIComponent(JSON.stringify(vars))}`;

          const res = await fetch(url).then(r => r.json());
          const page = res.data.user[edgeKey];
          hasNext = page.page_info.has_next_page;
          after = page.page_info.end_cursor;
          items = items.concat(
            page.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name
            }))
          );
          debugger; // breakpoint: after processing this page
          console.log(`Fetched ${page.edges.length} items for ${edgeKey}`);
        }

        return items;
      }

      // 3) Fetch followers & followings
      debugger; // breakpoint: before fetching followers
      const followers = await fetchEdges(
        'c76146de99bb02f6415203be841dd25a',
        'edge_followed_by'
      );
      debugger; // breakpoint: followers fetched
      console.log('Total followers:', followers.length);

      debugger; // breakpoint: before fetching followings
      const followings = await fetchEdges(
        'd04b0a864b4b54837c0d870b0e77e076',
        'edge_follow'
      );
      debugger; // breakpoint: followings fetched
      console.log('Total followings:', followings.length);

      // 4) Compute non‑followers
      debugger; // breakpoint: before computing difference
      const dontFollowMeBack = followings.filter(
        f => !followers.some(x => x.username === f.username)
      );
      debugger; // breakpoint: after computing non-followers
      console.log('Non-followers:', dontFollowMeBack.length);

      sendResponse({ success: true, data: dontFollowMeBack });
    } catch (err) {
      debugger; // breakpoint: in catch block
      console.error('Content script error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // keep sendResponse channel open
});
