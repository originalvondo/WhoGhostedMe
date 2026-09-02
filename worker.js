// worker.js - Web Worker for comparing followers and followings
// This runs in a separate thread to avoid blocking the main UI thread

self.onmessage = function(e) {
  const { followers, followings } = e.data;
  
  const followerUsernames = new Set(followers.map(f => f.username));
  const notFollowingBack = followings.filter(f => !followerUsernames.has(f.username));

  const followingUsernames = new Set(followings.map(f => f.username));
  const youDontFollowBack = followers.filter(f => !followingUsernames.has(f.username));
  
  self.postMessage({ notFollowingBack, youDontFollowBack });
};