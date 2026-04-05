/**
 * LinkedIn Portfolio — Firebase / Data Layer
 * 
 * Uses Firebase Firestore when configured, falls back to localStorage.
 * Setup: create a Firebase project, enable Firestore + Anonymous Auth,
 * then add your config to hugo.toml [params.firebase].
 */

(function() {
  'use strict';

  const STORAGE_PREFIX = 'pp_portfolio_';
  let db = null;
  let auth = null;
  let currentUserId = null;
  let firebaseReady = false;

  // ============================
  // Firebase Initialization
  // ============================
  function initFirebase() {
    try {
      // Read config from meta tags
      const apiKey = document.querySelector('meta[name="firebase-api-key"]')?.content;
      const authDomain = document.querySelector('meta[name="firebase-auth-domain"]')?.content;
      const projectId = document.querySelector('meta[name="firebase-project-id"]')?.content;

      if (!apiKey || !projectId || apiKey === 'YOUR_API_KEY' || projectId === 'YOUR_PROJECT_ID') {
        console.info('[PortfolioDB] Firebase not configured — using localStorage fallback.');
        return;
      }

      if (typeof firebase === 'undefined') {
        console.warn('[PortfolioDB] Firebase SDK not loaded — using localStorage fallback.');
        return;
      }

      const config = {
        apiKey: apiKey,
        authDomain: authDomain,
        projectId: projectId,
        storageBucket: document.querySelector('meta[name="firebase-storage-bucket"]')?.content || '',
        messagingSenderId: document.querySelector('meta[name="firebase-messaging-sender-id"]')?.content || '',
        appId: document.querySelector('meta[name="firebase-app-id"]')?.content || ''
      };

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      db = firebase.firestore();
      auth = firebase.auth();

      // Anonymous sign-in
      auth.signInAnonymously().then(function(cred) {
        currentUserId = cred.user.uid;
        firebaseReady = true;
        console.info('[PortfolioDB] Firebase ready. User:', currentUserId);
        // Re-initialize page data from Firestore
        syncPageData();
      }).catch(function(err) {
        console.warn('[PortfolioDB] Auth failed, using localStorage:', err.message);
      });

    } catch (e) {
      console.warn('[PortfolioDB] Firebase init error, using localStorage:', e.message);
    }
  }

  // ============================
  // Sync page data from Firestore
  // ============================
  function syncPageData() {
    document.querySelectorAll('.feed-item').forEach(function(item) {
      var id = item.dataset.id;
      if (!id) return;

      // Sync like count + user's reaction
      if (db) {
        db.collection('reactions').doc(id).get().then(function(doc) {
          if (doc.exists) {
            var data = doc.data();
            var countEl = document.getElementById('like-count-' + id);
            var iconsEl = document.getElementById('reaction-icons-' + id);
            var likeBtn = document.getElementById('like-btn-' + id);
            var totalLikes = data.count || 0;

            if (countEl) {
              countEl.textContent = totalLikes === 0 ? '0 Reactions' : totalLikes;
            }

            // Check if current user reacted
            var userReaction = data.users && data.users[currentUserId];
            if (userReaction) {
              lsSet('reaction_' + id, userReaction);
            } else {
              lsRemove('reaction_' + id);
            }

            if (userReaction && likeBtn) {
              likeBtn.classList.add('interaction-btn--active');
              if (userReaction !== 'like') {
                likeBtn.classList.add('has-custom');
              }
              // Restore icon visually on load
              var textEl = likeBtn.querySelector('.interaction-btn__text');
              var customIconEl = likeBtn.querySelector('.like-icon-custom');
              if (userReaction !== 'like' && customIconEl && textEl) {
                var imgUrl = window._reactionImages && window._reactionImages[userReaction];
                customIconEl.innerHTML = '<img src="' + imgUrl + '" width="20" height="20" alt="' + userReaction + '" style="display:block;">';
                customIconEl.style.display = 'inline-block';
                textEl.textContent = userReaction.charAt(0).toUpperCase() + userReaction.slice(1);
                var colors = { celebrate: '#057642', support: '#666666', love: '#df704d', insightful: '#0a66c2', funny: '#0a66c2' };
                textEl.style.color = colors[userReaction] || '';
              } else if (userReaction === 'like' && textEl) {
                textEl.textContent = 'Like';
                textEl.style.color = '';
                if(customIconEl) customIconEl.style.display = 'none';
              }
            }

            // Show reaction icons
            if (iconsEl && data.reactionTypes) {
              var html = '';
              var types = Object.keys(data.reactionTypes);
              // Sort types so most common appear first
              types.sort(function(a, b) {
                 return data.reactionTypes[b] - data.reactionTypes[a];
              });
              types.slice(0, 3).forEach(function(type) {
                var imgUrl = window._reactionImages && window._reactionImages[type];
                if (imgUrl) {
                  html += '<img src="' + imgUrl + '" alt="' + type + '">';
                }
              });
              if (html) iconsEl.innerHTML = html;
            }
          }
        }).catch(function() {});

        // Sync comment count AND data
        db.collection('comments').doc(id).collection('items')
          .orderBy('timestamp', 'asc').get().then(function(snap) {
            var countEl = document.getElementById('comment-count-' + id);
            var count = snap.size;
            if (countEl) {
              countEl.textContent = count + ' comment' + (count !== 1 ? 's' : '');
            }
            
            // Save comments locally so UI can render them from PortfolioDB.getComments
            var comments = [];
            snap.forEach(function(doc) {
              var d = doc.data();
              d.id = doc.id;
              d.timestamp = d.timestamp ? d.timestamp.toDate().toISOString() : new Date().toISOString();
              comments.push(d);
            });
            
            // Reconstruct nested replies
            var rootComments = [];
            var commentMap = {};
            comments.forEach(function(c) {
              c.replies = [];
              commentMap[c.id] = c;
            });
            comments.forEach(function(c) {
              if (c.parentId && commentMap[c.parentId]) {
                commentMap[c.parentId].replies.push(c);
              } else {
                rootComments.push(c);
              }
            });
            lsSetJSON('comments_' + id, rootComments);
            
            // If the section is already open, rendering might be out of sync until next toggle,
            // but this ensures they exist for next time user toggles.
          }).catch(function() {});
      }
    });
  }

  // ============================
  // localStorage helpers
  // ============================
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(STORAGE_PREFIX + key); return v !== null ? v : fallback; }
    catch(e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(STORAGE_PREFIX + key, val); } catch(e) {}
  }
  function lsRemove(key) {
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch(e) {}
  }
  function lsGetJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || JSON.stringify(fallback)); }
    catch(e) { return fallback; }
  }
  function lsSetJSON(key, val) {
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)); } catch(e) {}
  }

  // ============================
  // PortfolioDB — Public API
  // ============================
  window.PortfolioDB = {

    // --- Likes / Reactions ---

    getLikes: function(contentId) {
      return parseInt(lsGet('likes_' + contentId, '0'), 10);
    },

    hasLiked: function(contentId) {
      return lsGet('liked_' + contentId, null) === 'true';
    },

    getReactionType: function(contentId) {
      return lsGet('reaction_' + contentId, null);
    },

    toggleLike: function(contentId, reactionType) {
      var liked = this.hasLiked(contentId);
      var count = this.getLikes(contentId);
      var currentReaction = this.getReactionType(contentId) || 'like';
      var newReaction = reactionType || 'like';
      var isSwapping = liked && reactionType && (currentReaction !== newReaction);

      if (liked && !isSwapping) {
        count = Math.max(0, count - 1);
        lsRemove('liked_' + contentId);
        lsRemove('reaction_' + contentId);
      } else {
        if (!liked) count += 1;
        lsSet('liked_' + contentId, 'true');
        lsSet('reaction_' + contentId, newReaction);
      }
      lsSet('likes_' + contentId, count.toString());

      // Firestore sync
      if (firebaseReady && db && currentUserId) {
        var ref = db.collection('reactions').doc(contentId);
        db.runTransaction(function(tx) {
          return tx.get(ref).then(function(doc) {
            var data = doc.exists ? doc.data() : { count: 0, users: {}, reactionTypes: {} };
            var oldUserReaction = data.users[currentUserId];
            
            if (liked && !isSwapping) {
              // Remove reaction
              data.count = Math.max(0, (data.count || 0) - 1);
              delete data.users[currentUserId];
              if (oldUserReaction && data.reactionTypes[oldUserReaction]) {
                data.reactionTypes[oldUserReaction] = Math.max(0, data.reactionTypes[oldUserReaction] - 1);
                if (data.reactionTypes[oldUserReaction] === 0) delete data.reactionTypes[oldUserReaction];
              }
            } else {
              // Add or Swap reaction
              if (!liked || !oldUserReaction) {
                 data.count = (data.count || 0) + 1;
              } else if (oldUserReaction && oldUserReaction !== newReaction) {
                 // Swap old reaction out
                 if (data.reactionTypes[oldUserReaction]) {
                    data.reactionTypes[oldUserReaction] = Math.max(0, data.reactionTypes[oldUserReaction] - 1);
                    if (data.reactionTypes[oldUserReaction] === 0) delete data.reactionTypes[oldUserReaction];
                 }
              }
              data.users[currentUserId] = newReaction;
              data.reactionTypes[newReaction] = (data.reactionTypes[newReaction] || 0) + 1;
            }
            tx.set(ref, data);
          });
        }).catch(function(err) {
          console.warn('[PortfolioDB] Firestore reaction error:', err.message);
        });
      }

      return { liked: !liked, count: count };
    },

    // --- Comments ---

    getComments: function(contentId) {
      return lsGetJSON('comments_' + contentId, []);
    },

    addComment: function(contentId, text, parentId) {
      var comments = this.getComments(contentId);
      var comment = {
        id: Date.now().toString(),
        text: text,
        author: lsGet('chat_name', '') || 'Guest User',
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        parentId: parentId || null,
        replies: []
      };

      if (parentId) {
        // Add as reply to parent
        function addReply(list) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === parentId) {
              if (!list[i].replies) list[i].replies = [];
              list[i].replies.push(comment);
              return true;
            }
            if (list[i].replies && addReply(list[i].replies)) return true;
          }
          return false;
        }
        addReply(comments);
      } else {
        comments.push(comment);
      }

      lsSetJSON('comments_' + contentId, comments);

      // Firestore sync
      if (firebaseReady && db) {
        db.collection('comments').doc(contentId).collection('items').doc(comment.id).set({
          text: comment.text,
          author: comment.author,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          likes: 0,
          likedBy: [],
          parentId: comment.parentId
        }).catch(function(err) {
          console.warn('[PortfolioDB] Firestore comment error:', err.message);
        });
      }

      return comment;
    },

    toggleCommentLike: function(commentId, contentId) {
      var comments = this.getComments(contentId);
      var userId = currentUserId || 'local_user';
      var result = { liked: false, likes: 0 };

      function findAndToggle(list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === commentId) {
            var c = list[i];
            if (!c.likedBy) c.likedBy = [];
            var idx = c.likedBy.indexOf(userId);
            if (idx >= 0) {
              c.likedBy.splice(idx, 1);
              c.likes = Math.max(0, (c.likes || 0) - 1);
              result = { liked: false, likes: c.likes };
            } else {
              c.likedBy.push(userId);
              c.likes = (c.likes || 0) + 1;
              result = { liked: true, likes: c.likes };
            }
            return true;
          }
          if (list[i].replies && findAndToggle(list[i].replies)) return true;
        }
        return false;
      }

      findAndToggle(comments);
      lsSetJSON('comments_' + contentId, comments);

      // Firestore sync
      if (firebaseReady && db) {
        var ref = db.collection('comments').doc(contentId).collection('items').doc(commentId);
        ref.get().then(function(doc) {
          if (doc.exists) {
            var data = doc.data();
            var likedBy = data.likedBy || [];
            var idx = likedBy.indexOf(currentUserId);
            if (idx >= 0) {
              likedBy.splice(idx, 1);
            } else {
              likedBy.push(currentUserId);
            }
            ref.update({ likedBy: likedBy, likes: likedBy.length });
          }
        }).catch(function() {});
      }

      return result;
    },

    // --- Chat ---

    getChatMessages: function() {
      return lsGetJSON('chat_msgs', []);
    },

    saveChatMessage: function(msg) {
      var msgs = this.getChatMessages();
      msgs.push(msg);
      lsSetJSON('chat_msgs', msgs);

      // Firestore sync
      if (firebaseReady && db) {
        db.collection('chat_messages').add({
          text: msg.text,
          type: msg.type,
          author: lsGet('chat_name', 'Guest'),
          contact: lsGet('chat_contact', ''),
          userId: currentUserId || 'anonymous',
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function() {});
      }
    },

    // --- Saved / Shares (unchanged, localStorage only) ---

    isSaved: function(contentId) {
      return lsGet('saved_' + contentId, null) === 'true';
    },

    toggleSave: function(contentId) {
      var saved = this.isSaved(contentId);
      if (saved) { lsRemove('saved_' + contentId); } else { lsSet('saved_' + contentId, 'true'); }
      return !saved;
    },

    getShares: function(contentId) {
      return parseInt(lsGet('shares_' + contentId, '0'), 10);
    },

    incrementShare: function(contentId) {
      var count = this.getShares(contentId) + 1;
      lsSet('shares_' + contentId, count.toString());
      return count;
    }
  };

  // ============================
  // Page load: init Firebase then restore UI
  // ============================
  document.addEventListener('DOMContentLoaded', function() {
    initFirebase();

    // Restore from localStorage immediately (Firebase will override later)
    document.querySelectorAll('.feed-item').forEach(function(item) {
      var id = item.dataset.id;
      if (!id) return;

      var likeCount = PortfolioDB.getLikes(id);
      var likeCountEl = document.getElementById('like-count-' + id);
      if (likeCountEl) {
        likeCountEl.textContent = likeCount > 0 ? likeCount : '0 Reactions';
      }

      if (PortfolioDB.hasLiked(id)) {
        var likeBtn = document.getElementById('like-btn-' + id);
        var reaction = PortfolioDB.getReactionType(id) || 'like';
        
        if (likeBtn) {
          likeBtn.classList.add('interaction-btn--active');
          if (reaction !== 'like') {
            likeBtn.classList.add('has-custom');
            var textEl = likeBtn.querySelector('.interaction-btn__text');
            var customIconEl = likeBtn.querySelector('.like-icon-custom');
            if (customIconEl && textEl) {
              var imgUrl = window._reactionImages && window._reactionImages[reaction];
              customIconEl.innerHTML = '<img src="' + imgUrl + '" width="20" height="20" alt="' + reaction + '" style="display:block;">';
              customIconEl.style.display = 'inline-block';
              textEl.textContent = reaction.charAt(0).toUpperCase() + reaction.slice(1);
              var colors = { celebrate: '#057642', support: '#666666', love: '#df704d', insightful: '#0a66c2', funny: '#0a66c2' };
              textEl.style.color = colors[reaction] || '';
            }
          }
        }
      }

      var comments = PortfolioDB.getComments(id);
      var commentCountEl = document.getElementById('comment-count-' + id);
      if (commentCountEl && comments.length > 0) {
        var totalC = 0;
        function countR(arr) { arr.forEach(function(x) { totalC++; if(x.replies) countR(x.replies); }); }
        countR(comments);
        commentCountEl.textContent = totalC + ' comment' + (totalC !== 1 ? 's' : '');
      }
    });
  });

})();
