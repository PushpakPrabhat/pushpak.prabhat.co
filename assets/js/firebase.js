/**
 * Apple HIG Portfolio — Firebase / Data Layer
 * 
 * Uses Firebase Firestore for data, Auth for Google Sign-In,
 * and Realtime Database for presence (online/offline/typing).
 * Falls back to localStorage when Firebase is not configured.
 */

(function() {
  'use strict';

  const STORAGE_PREFIX = 'pp_portfolio_';
  const ADMIN_EMAILS = ['prabhat.pushpak@gmail.com', 'prabhatpushpak@gmail.com'];
  const CHAT_MSG_LIMIT = 25;
  let adminInboxUnsub = null;
  let adminConvUnsub = null;

  let db = null;
  let rtdb = null;
  let auth = null;
  let currentUser = null;
  let firebaseReady = false;
  let chatUnsubscribe = null;
  let presenceRef = null;
  let typingTimeout = null;

  // ============================
  // Firebase Initialization
  // ============================
  function initFirebase() {
    try {
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
        appId: document.querySelector('meta[name="firebase-app-id"]')?.content || '',
        databaseURL: 'https://' + projectId + '-default-rtdb.asia-southeast1.firebasedatabase.app'
      };

      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      db = firebase.firestore();
      auth = firebase.auth();

      // Init Realtime Database for presence
      if (firebase.database) {
        rtdb = firebase.database();
      }

      // Listen for auth state changes
      auth.onAuthStateChanged(function(user) {
        if (user) {
          currentUser = {
            uid: user.uid,
            name: user.displayName || 'User',
            photo: user.photoURL || '',
            email: user.email || ''
          };
          firebaseReady = true;
          console.info('[PortfolioDB] Signed in as:', currentUser.name);

          // Save/update user profile in Firestore
          saveUserProfile(user);

          // Set up presence
          setupPresence(user.uid);

          // Sync page data
          syncPageData();

          // Dispatch event so main.js can update UI
          window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: currentUser } }));
        } else {
          currentUser = null;
          console.info('[PortfolioDB] Not signed in. Viewing as guest.');

          // Still sync page data for viewing (read-only)
          if (db) syncPageData();

          window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: null } }));
        }
      });

      // Handle redirect result (for when signInWithRedirect is used as fallback)
      handleRedirectResult();

    } catch (e) {
      console.warn('[PortfolioDB] Firebase init error:', e.message);
    }
  }

  // ============================
  // User Profile Management
  // ============================
  function saveUserProfile(user) {
    if (!db || !user) return;
    db.collection('users').doc(user.uid).set({
      displayName: user.displayName || 'User',
      email: user.email || '',
      photoURL: user.photoURL || '',
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function() {});
  }

  // ============================
  // Presence System (Realtime DB)
  // ============================
  function setupPresence(uid) {
    if (!rtdb) return;

    presenceRef = rtdb.ref('presence/' + uid);
    
    var connectedRef = rtdb.ref('.info/connected');
    connectedRef.on('value', function(snap) {
      if (snap.val() === true) {
        // We are connected! Queue the disconnect payload first.
        presenceRef.onDisconnect().set({
          online: false,
          typing: false,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).then(function() {
          // Once the disconnect hook is ready, commit the online status.
          presenceRef.set({
            online: true,
            typing: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          });
        });
      }
    });
  }

  function setTyping(isTyping) {
    if (!presenceRef) return;
    presenceRef.update({ typing: isTyping });
  }

  // ============================
  // Idle Detection / Quota Protection
  // ============================
  function setupIdleDetection() {
    if (!rtdb) return;

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // Tab hidden — disconnect to free up connection slot
        if (rtdb) {
          try { firebase.database().goOffline(); } catch(e) {}
        }
      } else {
        // Tab visible — reconnect
        if (rtdb) {
          try { firebase.database().goOnline(); } catch(e) {}
        }
        // Re-set presence
        if (currentUser) {
          setupPresence(currentUser.uid);
        }
      }
    });
  }

  // ============================
  // Google Sign-In (popup with redirect fallback)
  // ============================
  function signInWithGoogle() {
    if (!auth) {
      alert('Firebase not configured. Please try again later.');
      return Promise.reject(new Error('No auth'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).catch(function(err) {
      // If popup was blocked or domain not authorized, try redirect
      if (err.code === 'auth/popup-blocked' || 
          err.code === 'auth/unauthorized-domain' ||
          err.code === 'auth/operation-not-supported-in-this-environment') {
        console.info('[PortfolioDB] Popup failed, trying redirect...');
        return auth.signInWithRedirect(provider);
      }
      throw err;
    });
  }

  // Handle redirect result on page load
  function handleRedirectResult() {
    if (!auth) return;
    auth.getRedirectResult().then(function(result) {
      if (result && result.user) {
        console.info('[PortfolioDB] Redirect sign-in successful:', result.user.displayName);
      }
    }).catch(function(err) {
      console.warn('[PortfolioDB] Redirect result error:', err.message);
    });
  }

  function signOut() {
    if (!auth) return Promise.resolve();
    // Clean up presence
    if (presenceRef) {
      presenceRef.set({
        online: false,
        typing: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }
    return auth.signOut();
  }

  // ============================
  // Sync page data from Firestore (read-only, no auth required)
  // ============================
  function syncPageData() {
    document.querySelectorAll('.feed-item').forEach(function(item) {
      var id = item.dataset.id;
      if (!id) return;

      if (db) {
        // Sync reactions
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
            if (currentUser) {
              var userReaction = data.users && data.users[currentUser.uid];
              if (userReaction) {
                lsSet('reaction_' + id, userReaction);
                lsSet('liked_' + id, 'true');
              } else {
                lsRemove('reaction_' + id);
                lsRemove('liked_' + id);
              }

              if (userReaction && likeBtn) {
                likeBtn.classList.add('interaction-btn--active');
                likeBtn.classList.add('has-custom');
                var textEl = likeBtn.querySelector('.interaction-btn__text');
                var customIconEl = likeBtn.querySelector('.like-icon-custom');
                if (customIconEl && textEl) {
                  var imgUrl = window._reactionImages && window._reactionImages[userReaction];
                  customIconEl.innerHTML = '<img src="' + imgUrl + '" width="20" height="20" alt="' + userReaction + '" style="display:block;">';
                  customIconEl.style.display = 'inline-block';
                  textEl.textContent = ({like:'Like', love:'Love', care:'Care', haha:'Haha', wow:'Wow', sad:'Sad', angry:'Angry', celebrate:'Haha', support:'Care', insightful:'Wow', funny:'Sad'})[userReaction] || userReaction.charAt(0).toUpperCase() + userReaction.slice(1);
                  var colors = { like: '#0571ED', love: '#F02849', care: '#F7B125', haha: '#F7B125', wow: '#F7B125', sad: '#F7B125', angry: '#E84A3B', celebrate: '#F7B125', support: '#F7B125', insightful: '#F7B125', funny: '#F7B125' };
                  textEl.style.color = colors[userReaction] || '';
                }
              }
            }

            // Show reaction icons
            if (iconsEl && data.reactionTypes) {
              var html = '';
              var types = Object.keys(data.reactionTypes);
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

        // Sync comments
        db.collection('comments').doc(id).collection('items')
          .orderBy('timestamp', 'asc').get().then(function(snap) {
            var countEl = document.getElementById('comment-count-' + id);
            var count = snap.size;
            if (countEl) {
              countEl.textContent = count + ' comment' + (count !== 1 ? 's' : '');
            }

            var comments = [];
            snap.forEach(function(doc) {
              var d = doc.data();
              d.id = doc.id;
              d.timestamp = d.timestamp ? d.timestamp.toDate().toISOString() : new Date().toISOString();
              comments.push(d);
            });

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

    // --- Auth ---

    getCurrentUser: function() {
      return currentUser;
    },

    isSignedIn: function() {
      return !!currentUser;
    },

    requireAuth: function() {
      if (currentUser) return Promise.resolve(currentUser);
      return signInWithGoogle().then(function() {
        return currentUser;
      });
    },

    signOut: function() {
      return signOut();
    },

    getAdminEmail: function() {
      return ADMIN_EMAILS[0];
    },

    // --- Presence ---

    setTyping: function(isTyping) {
      if (typingTimeout) clearTimeout(typingTimeout);
      setTyping(isTyping);
      if (isTyping) {
        typingTimeout = setTimeout(function() {
          setTyping(false);
        }, 2000);
      }
    },

    watchPresence: function(uid, callback) {
      if (!rtdb) return function() {};
      var ref = rtdb.ref('presence/' + uid);
      ref.on('value', function(snap) {
        callback(snap.val());
      });
      return function() { ref.off(); };
    },

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
      if (!currentUser) return { liked: false, count: this.getLikes(contentId) };

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
      if (firebaseReady && db && currentUser) {
        var userProfile = { name: currentUser.name, photo: currentUser.photo };
        var ref = db.collection('reactions').doc(contentId);
        db.runTransaction(function(tx) {
          return tx.get(ref).then(function(doc) {
            var data = doc.exists ? doc.data() : { count: 0, users: {}, reactionTypes: {}, userProfiles: {} };
            if (!data.userProfiles) data.userProfiles = {};
            var oldUserReaction = data.users[currentUser.uid];

            if (liked && !isSwapping) {
              data.count = Math.max(0, (data.count || 0) - 1);
              delete data.users[currentUser.uid];
              delete data.userProfiles[currentUser.uid];
              if (oldUserReaction && data.reactionTypes[oldUserReaction]) {
                data.reactionTypes[oldUserReaction] = Math.max(0, data.reactionTypes[oldUserReaction] - 1);
                if (data.reactionTypes[oldUserReaction] === 0) delete data.reactionTypes[oldUserReaction];
              }
            } else {
              if (!liked || !oldUserReaction) {
                data.count = (data.count || 0) + 1;
              } else if (oldUserReaction && oldUserReaction !== newReaction) {
                if (data.reactionTypes[oldUserReaction]) {
                  data.reactionTypes[oldUserReaction] = Math.max(0, data.reactionTypes[oldUserReaction] - 1);
                  if (data.reactionTypes[oldUserReaction] === 0) delete data.reactionTypes[oldUserReaction];
                }
              }
              data.users[currentUser.uid] = newReaction;
              data.userProfiles[currentUser.uid] = userProfile;
              data.reactionTypes[newReaction] = (data.reactionTypes[newReaction] || 0) + 1;
            }
            tx.set(ref, data);
          });
        }).catch(function(err) {
          console.warn('[PortfolioDB] Firestore reaction error:', err.message);
        });
      }

      return { liked: liked && !isSwapping ? false : true, count: count };
    },

    // --- Comments ---

    getComments: function(contentId) {
      return lsGetJSON('comments_' + contentId, []);
    },

    addComment: function(contentId, text, parentId) {
      if (!currentUser) return null;

      var comments = this.getComments(contentId);
      var comment = {
        id: Date.now().toString(),
        text: text,
        author: currentUser.name,
        authorPhoto: currentUser.photo,
        authorUid: currentUser.uid,
        timestamp: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        parentId: parentId || null,
        replies: []
      };

      if (parentId) {
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

      if (firebaseReady && db) {
        // Create/update parent doc so mods dashboard can find it
        db.collection('comments').doc(contentId).set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        db.collection('comments').doc(contentId).collection('items').doc(comment.id).set({
          text: comment.text,
          author: comment.author,
          authorPhoto: comment.authorPhoto,
          authorUid: comment.authorUid,
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
      var userId = currentUser ? currentUser.uid : 'local_user';
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

      if (firebaseReady && db) {
        var ref = db.collection('comments').doc(contentId).collection('items').doc(commentId);
        ref.get().then(function(doc) {
          if (doc.exists) {
            var data = doc.data();
            var likedBy = data.likedBy || [];
            var idx = likedBy.indexOf(userId);
            if (idx >= 0) {
              likedBy.splice(idx, 1);
            } else {
              likedBy.push(userId);
            }
            ref.update({ likedBy: likedBy, likes: likedBy.length });
          }
        }).catch(function() {});
      }

      return result;
    },

    // --- Chat (Real-time with Firestore) ---

    sendChatMessage: function(text) {
      if (!currentUser || !db) return;

      var msg = {
        text: text,
        type: 'user',
        authorName: currentUser.name,
        authorPhoto: currentUser.photo,
        authorUid: currentUser.uid,
        conversationId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      db.collection('chat_messages').add(msg).catch(function(err) {
        console.warn('[PortfolioDB] Chat send error:', err.message);
      });
    },

    getAdminEmail: function() {
      return ADMIN_EMAILS[0];
    },

    getAdminEmails: function() {
      return ADMIN_EMAILS;
    },

    isAdmin: function() {
      return currentUser && ADMIN_EMAILS.indexOf(currentUser.email) >= 0;
    },

    watchPresence: function(uid, callback) {
      if (!rtdb) return function() {};
      var ref = rtdb.ref('presence/' + uid);
      var listener = ref.on('value', function(snap) {
        callback(snap.val());
      });
      return function() {
        ref.off('value', listener);
      };
    },

    listenToChat: function(callback) {
      if (!db || !currentUser) {
        console.warn('[PortfolioDB] listenToChat: no db or user');
        return function() {};
      }

      // Unsubscribe from previous listener
      if (chatUnsubscribe) {
        chatUnsubscribe();
      }

      // Use desc + limit to get latest msgs, then reverse for display order
      var query = db.collection('chat_messages')
        .where('conversationId', '==', currentUser.uid)
        .orderBy('timestamp', 'desc')
        .limit(CHAT_MSG_LIMIT);

      chatUnsubscribe = query.onSnapshot(function(snap) {
        var messages = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          d.timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
          messages.push(d);
        });
        // Reverse to show oldest first
        messages.reverse();
        callback(messages);
      }, function(err) {
        console.warn('[PortfolioDB] Chat listener error:', err.message);
        // If index missing, try without ordering
        if (err.code === 'failed-precondition') {
          console.info('[PortfolioDB] Falling back to unordered chat query');
          var fallback = db.collection('chat_messages')
            .where('conversationId', '==', currentUser.uid)
            .limit(CHAT_MSG_LIMIT);
          chatUnsubscribe = fallback.onSnapshot(function(snap) {
            var messages = [];
            snap.forEach(function(doc) {
              var d = doc.data();
              d.id = doc.id;
              d.timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
              messages.push(d);
            });
            messages.sort(function(a, b) { return a.timestamp - b.timestamp; });
            callback(messages);
          });
        }
      });

      return chatUnsubscribe;
    },

    // Mark chat as read (for unread tracking)
    markChatRead: function(latestMsgTime) {
      if (!db || !currentUser) return;
      var newTime = latestMsgTime || Date.now();
      localStorage.setItem('chat_read_' + currentUser.uid, newTime.toString());
      db.collection('chat_read').doc(currentUser.uid).set({
        lastRead: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    },


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
    },

    // --- Admin Inbox ---

    listenToAllConversations: function(callback) {
      if (!db || !this.isAdmin()) return function() {};
      if (adminInboxUnsub) adminInboxUnsub();

      // Get recent messages across all conversations to build conversation list
      var query = db.collection('chat_messages')
        .orderBy('timestamp', 'desc')
        .limit(200);

      adminInboxUnsub = query.onSnapshot(function(snap) {
        var conversationsMap = {};
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          d.timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
          var convId = d.conversationId;
          if (!convId) return;
          if (!conversationsMap[convId]) {
            conversationsMap[convId] = {
              conversationId: convId,
              userName: d.authorName || 'User',
              userPhoto: d.authorPhoto || '',
              userUid: d.authorUid || convId,
              lastMessage: d.text,
              lastMessageType: d.type,
              lastTimestamp: d.timestamp,
              messages: [],
              unreadCount: 0
            };
          }
          conversationsMap[convId].messages.push(d);
          // Track the user info from user messages (not admin ones)
          if (d.type === 'user') {
            conversationsMap[convId].userName = d.authorName || 'User';
            conversationsMap[convId].userPhoto = d.authorPhoto || '';
            conversationsMap[convId].userUid = d.authorUid || convId;
          }
        });

        // Calculate unread (user messages admin hasn't read)
        var conversations = Object.values(conversationsMap);
        conversations.forEach(function(conv) {
          var adminLastRead = parseInt(localStorage.getItem('admin_read_' + conv.conversationId) || '0', 10);
          conv.unreadCount = 0;
          conv.messages.forEach(function(m) {
            if (m.type === 'user' && m.timestamp.getTime() > adminLastRead) {
              conv.unreadCount++;
            }
          });
        });

        // Sort by most recent message
        conversations.sort(function(a, b) { return b.lastTimestamp - a.lastTimestamp; });
        callback(conversations);
      }, function(err) {
        console.warn('[PortfolioDB] Admin inbox listener error:', err.message);
      });

      return adminInboxUnsub;
    },

    listenToConversation: function(conversationId, callback) {
      if (!db || !this.isAdmin()) return function() {};
      if (adminConvUnsub) adminConvUnsub();

      var query = db.collection('chat_messages')
        .where('conversationId', '==', conversationId)
        .orderBy('timestamp', 'desc')
        .limit(50);

      adminConvUnsub = query.onSnapshot(function(snap) {
        var messages = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          d.timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
          messages.push(d);
        });
        messages.reverse();
        callback(messages);
      }, function(err) {
        console.warn('[PortfolioDB] Conversation listener error:', err.message);
        if (err.code === 'failed-precondition') {
          var fallback = db.collection('chat_messages')
            .where('conversationId', '==', conversationId)
            .limit(50);
          adminConvUnsub = fallback.onSnapshot(function(snap) {
            var messages = [];
            snap.forEach(function(doc) {
              var d = doc.data();
              d.id = doc.id;
              d.timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
              messages.push(d);
            });
            messages.sort(function(a, b) { return a.timestamp - b.timestamp; });
            callback(messages);
          });
        }
      });

      return adminConvUnsub;
    },

    stopConversationListener: function() {
      if (adminConvUnsub) { adminConvUnsub(); adminConvUnsub = null; }
    },

    sendAdminReply: function(conversationId, text) {
      if (!db || !currentUser || !this.isAdmin()) return;
      var msg = {
        text: text,
        type: 'admin',
        authorName: currentUser.name,
        authorPhoto: currentUser.photo,
        authorUid: currentUser.uid,
        conversationId: conversationId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      db.collection('chat_messages').add(msg).catch(function(err) {
        console.warn('[PortfolioDB] Admin reply error:', err.message);
      });
    },

    markAdminConversationRead: function(conversationId) {
      localStorage.setItem('admin_read_' + conversationId, Date.now().toString());
    }
  };

  // ============================
  // Page load
  // ============================
  document.addEventListener('DOMContentLoaded', function() {
    initFirebase();
    setupIdleDetection();

    // Restore from localStorage immediately
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
          likeBtn.classList.add('has-custom');
          var textEl = likeBtn.querySelector('.interaction-btn__text');
          var customIconEl = likeBtn.querySelector('.like-icon-custom');
          if (customIconEl && textEl) {
            var imgUrl = window._reactionImages && window._reactionImages[reaction];
            customIconEl.innerHTML = '<img src="' + imgUrl + '" width="20" height="20" alt="' + reaction + '" style="display:block;">';
            customIconEl.style.display = 'inline-block';
            textEl.textContent = ({like:'Like', love:'Love', care:'Care', haha:'Haha', wow:'Wow', sad:'Sad', angry:'Angry', celebrate:'Haha', support:'Care', insightful:'Wow', funny:'Sad'})[reaction] || reaction.charAt(0).toUpperCase() + reaction.slice(1);
            var colors = { like: '#0571ED', love: '#F02849', care: '#F7B125', haha: '#F7B125', wow: '#F7B125', sad: '#F7B125', angry: '#E84A3B', celebrate: '#F7B125', support: '#F7B125', insightful: '#F7B125', funny: '#F7B125' };
            textEl.style.color = colors[reaction] || '';
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
