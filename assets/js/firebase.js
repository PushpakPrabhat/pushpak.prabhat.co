/**
 * Instagram Portfolio — Firebase / Data Layer
 * 
 * Uses Firebase Firestore for data, Auth for Google Sign-In,
 * and Realtime Database for presence (online/offline/typing).
 * Falls back to localStorage when Firebase is not configured.
 */

(function() {
  'use strict';

  const STORAGE_PREFIX = 'pp_portfolio_';
  const ADMIN_EMAIL = 'prabhat.pushpak@gmail.com';
  const CHAT_MSG_LIMIT = 25;

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

          // Check if admin
          const isAdmin = user.email === ADMIN_EMAIL;
          if (typeof setAdminMode === 'function') setAdminMode(isAdmin);

          // Update user UI
          updateUserUI(currentUser, isAdmin);

          // Dispatch event
          window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: currentUser } }));
        } else {
          currentUser = null;
          console.info('[PortfolioDB] Not signed in. Viewing as guest.');
          if (typeof setAdminMode === 'function') setAdminMode(false);

          // Still sync page data for viewing (read-only)
          if (db) syncPageData();

          // Update user UI
          updateUserUI(null, false);

          window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: null } }));
        }
      });

      // Handle redirect result
      handleRedirectResult();

    } catch (e) {
      console.warn('[PortfolioDB] Firebase init error:', e.message);
    }
  }

  // ============================
  // User UI Updates (Instagram-style)
  // ============================
  function updateUserUI(user, isAdmin) {
    // Update sidebar profile pic
    const sidebarPic = document.getElementById('sidebar-profile-pic');
    // Keep profile pic as site owner's pic always

    // More menu logout
    const logoutItem = document.getElementById('more-menu-logout');
    if (logoutItem) logoutItem.style.display = user ? 'flex' : 'none';

    // Aside login button
    const asideBtn = document.getElementById('aside-login-btn');
    if (asideBtn) {
      if (user) {
        asideBtn.textContent = user.name.split(' ')[0];
        asideBtn.onclick = function() { toggleUserMenu(); };
      } else {
        asideBtn.textContent = 'Sign in';
        asideBtn.onclick = function() { handleGoogleSignIn(); };
      }
    }

    // User menu
    if (user) {
      const avatar = document.getElementById('user-menu-avatar');
      const name = document.getElementById('user-menu-name');
      const email = document.getElementById('user-menu-email');
      if (avatar) avatar.src = user.photo;
      if (name) name.textContent = user.name;
      if (email) email.textContent = user.email;
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
        presenceRef.onDisconnect().set({
          online: false,
          typing: false,
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        }).then(function() {
          presenceRef.set({
            online: true,
            typing: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          });
        });
      }
    });

    // Watch admin presence for chat UI
    watchAdminPresence();
  }

  function setTyping(isTyping) {
    if (!presenceRef) return;
    presenceRef.update({ typing: isTyping });
  }

  // ============================
  // Watch Admin Presence (for chat header)
  // ============================
  function watchAdminPresence() {
    if (!rtdb) return;

    // We need admin UID - we'll get it from Firestore users collection
    if (db) {
      db.collection('users').where('email', '==', ADMIN_EMAIL).limit(1).get().then(function(snap) {
        if (!snap.empty) {
          var adminUid = snap.docs[0].id;
          var adminRef = rtdb.ref('presence/' + adminUid);
          adminRef.on('value', function(presSnap) {
            var pres = presSnap.val();
            updateChatPresenceUI(pres);
          });
        }
      }).catch(function() {});
    }
  }

  function updateChatPresenceUI(presence) {
    var isOnline = presence && presence.online;
    var lastSeen = presence && presence.lastSeen;

    // Desktop chat
    var statusText = document.getElementById('chat-status-text');
    var adminDot = document.getElementById('chat-admin-dot');
    
    if (statusText) {
      if (isOnline) {
        statusText.textContent = 'Active now';
        statusText.style.color = 'var(--color-online)';
      } else if (lastSeen) {
        statusText.textContent = 'Last seen ' + formatLastSeen(lastSeen);
        statusText.style.color = '';
      } else {
        statusText.textContent = 'Offline';
        statusText.style.color = '';
      }
    }

    if (adminDot) {
      adminDot.style.background = isOnline ? 'var(--color-online)' : 'var(--color-text-tertiary)';
    }

    // Mobile chat
    var mobileStatus = document.getElementById('mobile-chat-status');
    var mobileDot = document.getElementById('mobile-chat-admin-dot');
    
    if (mobileStatus) {
      mobileStatus.textContent = isOnline ? 'Active now' : (lastSeen ? 'Last seen ' + formatLastSeen(lastSeen) : 'Offline');
    }
    if (mobileDot) {
      mobileDot.style.background = isOnline ? 'var(--color-online)' : 'var(--color-text-tertiary)';
    }
  }

  function formatLastSeen(timestamp) {
    var now = Date.now();
    var diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return new Date(timestamp).toLocaleDateString();
  }

  // ============================
  // Idle Detection / Quota Protection
  // ============================
  function setupIdleDetection() {
    if (!rtdb) return;

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        if (rtdb) { try { firebase.database().goOffline(); } catch(e) {} }
      } else {
        if (rtdb) { try { firebase.database().goOnline(); } catch(e) {} }
        if (currentUser) { setupPresence(currentUser.uid); }
      }
    });
  }

  // ============================
  // Google Sign-In
  // ============================
  function signInWithGoogle() {
    if (!auth) {
      showToast('Firebase not configured. Please try again later.');
      return Promise.reject(new Error('No auth'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).catch(function(err) {
      if (err.code === 'auth/popup-blocked' || 
          err.code === 'auth/unauthorized-domain' ||
          err.code === 'auth/operation-not-supported-in-this-environment') {
        return auth.signInWithRedirect(provider);
      }
      throw err;
    });
  }

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
    if (presenceRef) {
      presenceRef.set({ online: false, typing: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
    return auth.signOut();
  }

  // ============================
  // Sync Page Data from Firestore
  // ============================
  function syncPageData() {
    document.querySelectorAll('.ig-post').forEach(function(item) {
      var id = item.dataset.id;
      if (!id) return;

      if (db) {
        // Sync reactions
        db.collection('reactions').doc(id).get().then(function(doc) {
          if (doc.exists) {
            var data = doc.data();
            var countEl = document.getElementById('like-count-' + id);
            var likeBtn = document.getElementById('like-btn-' + id);
            var totalLikes = data.count || 0;

            if (countEl) {
              countEl.textContent = totalLikes === 0 ? '0 likes' :
                totalLikes === 1 ? '1 like' : totalLikes + ' likes';
            }

            // Check if current user liked
            if (currentUser) {
              var userReaction = data.users && data.users[currentUser.uid];
              if (userReaction) {
                lsSet('liked_' + id, 'true');
                lsSet('reaction_' + id, userReaction);
              } else {
                lsRemove('liked_' + id);
                lsRemove('reaction_' + id);
              }

              if (userReaction && likeBtn) {
                likeBtn.classList.add('ig-action-btn--active');
                var filled = likeBtn.querySelector('.ig-heart-filled');
                var outline = likeBtn.querySelector('.ig-heart-outline');
                if (filled) filled.style.display = 'block';
                if (outline) outline.style.display = 'none';
              }
            }

            // Cache likes count
            lsSet('likes_' + id, totalLikes.toString());
          }
        }).catch(function() {});

        // Sync comments
        db.collection('comments').doc(id).collection('items')
          .orderBy('timestamp', 'asc').get().then(function(snap) {
            var count = snap.size;
            var countEl = document.getElementById('comment-count-' + id);
            if (countEl) countEl.textContent = count;
            
            var viewBtn = document.getElementById('view-comments-btn-' + id);
            if (viewBtn) viewBtn.style.display = count > 0 ? 'block' : 'none';

            var comments = [];
            snap.forEach(function(doc) {
              var d = doc.data();
              d.id = doc.id;
              d.timestamp = d.timestamp ? d.timestamp.toDate().toISOString() : new Date().toISOString();
              comments.push(d);
            });

            var rootComments = [];
            var commentMap = {};
            comments.forEach(function(c) { c.replies = []; commentMap[c.id] = c; });
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
    getCurrentUser: function() { return currentUser; },
    isSignedIn: function() { return !!currentUser; },
    
    requireAuth: function() {
      if (currentUser) return Promise.resolve(currentUser);
      return signInWithGoogle().then(function() { return currentUser; });
    },

    signOut: function() { return signOut(); },
    getAdminEmail: function() { return ADMIN_EMAIL; },

    // --- Presence ---
    setTyping: function(isTyping) {
      if (typingTimeout) clearTimeout(typingTimeout);
      setTyping(isTyping);
      if (isTyping) {
        typingTimeout = setTimeout(function() { setTyping(false); }, 2000);
      }
    },

    watchPresence: function(uid, callback) {
      if (!rtdb) return function() {};
      var ref = rtdb.ref('presence/' + uid);
      var listener = ref.on('value', function(snap) { callback(snap.val()); });
      return function() { ref.off('value', listener); };
    },

    // --- Likes ---
    getLikes: function(contentId) {
      var stored = lsGet('likes_' + contentId, '0');
      return { count: parseInt(stored, 10), users: [] };
    },

    hasLiked: function(contentId) {
      return lsGet('liked_' + contentId, null) === 'true';
    },

    toggleLike: function(contentId) {
      if (!currentUser) return { liked: false, count: 0 };

      var liked = this.hasLiked(contentId);
      var count = parseInt(lsGet('likes_' + contentId, '0'), 10);

      if (liked) {
        count = Math.max(0, count - 1);
        lsRemove('liked_' + contentId);
        lsRemove('reaction_' + contentId);
      } else {
        count += 1;
        lsSet('liked_' + contentId, 'true');
        lsSet('reaction_' + contentId, 'like');
      }
      lsSet('likes_' + contentId, count.toString());

      // Firestore sync
      if (firebaseReady && db && currentUser) {
        var userProfile = { name: currentUser.name, photo: currentUser.photo };
        var ref = db.collection('reactions').doc(contentId);
        db.runTransaction(function(tx) {
          return tx.get(ref).then(function(doc) {
            var data = doc.exists ? doc.data() : { count: 0, users: {}, userProfiles: {} };
            if (!data.userProfiles) data.userProfiles = {};

            if (liked) {
              data.count = Math.max(0, (data.count || 0) - 1);
              delete data.users[currentUser.uid];
              delete data.userProfiles[currentUser.uid];
            } else {
              data.count = (data.count || 0) + 1;
              data.users[currentUser.uid] = 'like';
              data.userProfiles[currentUser.uid] = userProfile;
            }
            tx.set(ref, data);
          });
        }).catch(function(err) {
          console.warn('[PortfolioDB] Reaction error:', err.message);
        });
      }

      return { liked: !liked, count: count };
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
          console.warn('[PortfolioDB] Comment error:', err.message);
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
            if (idx >= 0) likedBy.splice(idx, 1);
            else likedBy.push(userId);
            ref.update({ likedBy: likedBy, likes: likedBy.length });
          }
        }).catch(function() {});
      }

      return result;
    },

    // --- Chat ---
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

    listenToChat: function(callback) {
      if (!db || !currentUser) return function() {};

      if (chatUnsubscribe) chatUnsubscribe();

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
        messages.reverse();
        callback(messages);
      }, function(err) {
        console.warn('[PortfolioDB] Chat listener error:', err.message);
        if (err.code === 'failed-precondition') {
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

    markChatRead: function(latestMsgTime) {
      if (!db || !currentUser) return;
      localStorage.setItem('chat_read_' + currentUser.uid, (latestMsgTime || Date.now()).toString());
      db.collection('chat_read').doc(currentUser.uid).set({
        lastRead: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    },

    // --- Story Views ---
    recordStoryView: function(storyId) {
      if (!db || !currentUser) return;
      db.collection('story_views').doc(storyId).set({
        viewers: firebase.firestore.FieldValue.arrayUnion({
          uid: currentUser.uid,
          name: currentUser.name,
          photo: currentUser.photo,
          timestamp: Date.now()
        })
      }, { merge: true }).catch(function() {});
    },

    getStoryViews: function(storyId, callback) {
      if (!db) { callback([]); return; }
      db.collection('story_views').doc(storyId).get().then(function(doc) {
        if (doc.exists) {
          callback(doc.data().viewers || []);
        } else {
          callback([]);
        }
      }).catch(function() { callback([]); });
    },

    // --- Shares ---
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
  // Global functions for HTML onclick handlers
  // ============================
  window.handleGoogleSignIn = function() {
    if (!auth) {
      // Use auth modal approach
      var modal = document.getElementById('ig-auth-modal');
      if (modal) modal.style.display = 'flex';
      return;
    }
    
    signInWithGoogle().catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showToast('Sign-in failed');
      }
    });
  };

  window.handleLogout = function() {
    signOut().then(function() {
      showToast('Signed out');
      location.reload();
    });
  };

  window.startChat = function() {
    window.handleGoogleSignIn();
    // Auth state change will set up chat
    window.addEventListener('authStateChanged', function handler(e) {
      if (e.detail.user) {
        initChatUI();
        window.removeEventListener('authStateChanged', handler);
      }
    });
  };

  window.startMobileChat = function() {
    window.handleGoogleSignIn();
    window.addEventListener('authStateChanged', function handler(e) {
      if (e.detail.user) {
        initMobileChatUI();
        window.removeEventListener('authStateChanged', handler);
      }
    });
  };

  window.sendChatMessage = function() {
    var input = document.getElementById('chat-msg-input');
    if (!input || !input.value.trim()) return;
    PortfolioDB.sendChatMessage(input.value.trim());
    input.value = '';
  };

  window.sendMobileChatMessage = function() {
    var input = document.getElementById('mobile-chat-msg-input');
    if (!input || !input.value.trim()) return;
    PortfolioDB.sendChatMessage(input.value.trim());
    input.value = '';
  };

  window.toggleUserMenu = function() {
    var menu = document.getElementById('ig-user-menu');
    if (menu) {
      var isShowing = menu.style.display !== 'none';
      menu.style.display = isShowing ? 'none' : 'block';
      // Position it near the switch button
      if (!isShowing) {
        var btn = document.getElementById('aside-login-btn');
        if (btn) {
          var rect = btn.getBoundingClientRect();
          menu.style.top = (rect.bottom + 8) + 'px';
          menu.style.right = '20px';
        }
      }
    }
  };

  window.recordStoryView = function(storyId) {
    PortfolioDB.recordStoryView(storyId);
  };

  // ============================
  // Chat UI Initialization
  // ============================
  function initChatUI() {
    var onboarding = document.getElementById('chat-onboarding');
    var body = document.getElementById('chat-body');
    if (onboarding) onboarding.style.display = 'none';
    if (body) body.style.display = 'flex';

    PortfolioDB.listenToChat(function(messages) {
      renderChatMessages('chat-messages', messages);
    });
  }

  function initMobileChatUI() {
    var onboarding = document.getElementById('mobile-chat-onboarding');
    var messages = document.getElementById('mobile-chat-messages');
    var footer = document.getElementById('mobile-chat-footer');
    if (onboarding) onboarding.style.display = 'none';
    if (messages) messages.style.display = 'flex';
    if (footer) footer.style.display = 'flex';

    PortfolioDB.listenToChat(function(msgs) {
      renderChatMessages('mobile-chat-messages', msgs);
    });
  }

  function renderChatMessages(containerId, messages) {
    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = messages.map(function(msg) {
      var isSent = msg.authorUid === (currentUser ? currentUser.uid : '');
      var time = msg.timestamp instanceof Date 
        ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : '';
      return '<div class="chat-bubble chat-bubble--' + (isSent ? 'sent' : 'received') + '">' +
        msg.text +
        '<span class="chat-bubble__time">' + time + '</span>' +
      '</div>';
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  // Auto-init chat if user is already signed in on load
  window.addEventListener('authStateChanged', function(e) {
    if (e.detail.user) {
      // Desktop chat - if chat widget is open, init
      var chat = document.getElementById('chat-widget');
      if (chat && chat.classList.contains('open')) {
        initChatUI();
      }
    }
  });

  // ============================
  // Page Load
  // ============================
  document.addEventListener('DOMContentLoaded', function() {
    initFirebase();
    setupIdleDetection();

    // Restore likes from localStorage immediately
    document.querySelectorAll('.ig-post').forEach(function(item) {
      var id = item.dataset.id;
      if (!id) return;

      var likeCount = parseInt(lsGet('likes_' + id, '0'), 10);
      var likeCountEl = document.getElementById('like-count-' + id);
      if (likeCountEl) {
        likeCountEl.textContent = likeCount === 0 ? '0 likes' :
          likeCount === 1 ? '1 like' : likeCount + ' likes';
      }

      if (lsGet('liked_' + id, null) === 'true') {
        var likeBtn = document.getElementById('like-btn-' + id);
        if (likeBtn) {
          likeBtn.classList.add('ig-action-btn--active');
          var filled = likeBtn.querySelector('.ig-heart-filled');
          var outline = likeBtn.querySelector('.ig-heart-outline');
          if (filled) filled.style.display = 'block';
          if (outline) outline.style.display = 'none';
        }
      }

      var comments = lsGetJSON('comments_' + id, []);
      var commentCountEl = document.getElementById('comment-count-' + id);
      var viewBtn = document.getElementById('view-comments-btn-' + id);
      if (comments.length > 0) {
        var totalC = 0;
        function countR(arr) { arr.forEach(function(x) { totalC++; if(x.replies) countR(x.replies); }); }
        countR(comments);
        if (commentCountEl) commentCountEl.textContent = totalC;
        if (viewBtn) viewBtn.style.display = 'block';
      }
    });
  });

})();
