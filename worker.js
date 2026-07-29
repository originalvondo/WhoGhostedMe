// worker.js - Web Worker for comparing followers and followings
// This runs in a separate thread to avoid blocking the main UI thread

self.onmessage = function(e) {
  const { followers, followings } = e.data;
  
  // Use Set for O(1) lookup
  const followerUsernames = new Set(followers.map(f => f.username));
  
  // Filter followings to find those who don't follow back
  // Keep the full user object including profile pictures
  const notFollowingBack = followings.filter(f => !followerUsernames.has(f.username));
  
  // Send result back to main thread
  self.postMessage({ notFollowingBack });
};