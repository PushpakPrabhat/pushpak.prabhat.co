/**
 * Moderator Dashboard — JavaScript v3
 * Fixes: real-time updates, typing/online indicators, unread tracking,
 * mobile chat slider, edit/delete messages, comment loading, user management.
 */
(function() {
  'use strict';

  const CFG = {
    apiKey: 'AIzaSyDxR6Dz0XoJRuswDHsGqAIs_ucBUD8-TfE',
    authDomain: 'pushpak-prabhat-co.firebaseapp.com',
    projectId: 'pushpak-prabhat-co',
    storageBucket: 'pushpak-prabhat-co.firebasestorage.app',
    messagingSenderId: '944681087908',
    appId: '1:944681087908:web:60db180f7c954a064a8731',
    databaseURL: 'https://pushpak-prabhat-co-default-rtdb.firebaseio.com'
  };
  const ADMIN_EMAIL = 'prabhat.pushpak@gmail.com';
  const LIMIT = 50;
  const AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cpath fill='%23e7e2dc' d='M0 0h128v128H0z'/%3E%3Cpath fill='%23788fa5' d='M88.41 84.67a32 32 0 1 0-48.82 0 66.13 66.13 0 0 1 48.82 0'/%3E%3Cpath fill='%239db3c8' d='M88.41 84.67a32 32 0 0 1-48.82 0A66.79 66.79 0 0 0 0 128h128a66.79 66.79 0 0 0-39.59-43.33'/%3E%3Cpath fill='%2356687a' d='M64 96a31.93 31.93 0 0 0 24.41-11.33 66.13 66.13 0 0 0-48.82 0A31.93 31.93 0 0 0 64 96'/%3E%3C/svg%3E";
  const RIMG = {
    'like': 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2040%2040%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2220%22%20fill%3D%22%230a66c2%22%2F%3E%3C%2Fsvg%3E',
    'celebrate': 'https://static.licdn.com/aero-v1/sc/h/b1dl5jk88euc7e9ri50xy5qo8',
    'support': 'https://static.licdn.com/aero-v1/sc/h/3wqhxqtk2l554o70ur3kessf1',
    'love': 'https://static.licdn.com/aero-v1/sc/h/f58e354mjsjpdd67eq51cuh49',
    'insightful': 'https://static.licdn.com/aero-v1/sc/h/39axkb4qe8q95ieljrhqhkxvl',
    'funny': 'https://static.licdn.com/aero-v1/sc/h/ktcgulanbxpl0foz1uckibdl'
  };

  var db, rtdb, auth;
  var activeConv = null;
  var chatUnsub = null;
  var presWatchers = {};
  var adminRef = null;
  var typingTimer = null;
  var idleTimer = null;
  var allComments = [];
  var convData = {};

  if (!firebase.apps.length) firebase.initializeApp(CFG);
  db = firebase.firestore();
  auth = firebase.auth();
  rtdb = firebase.database();

  // ===== AUTH =====
  window.adminLogin = function() {
    var e = el('login-email').value.trim(), p = el('login-password').value;
    var err = el('login-error'), btn = el('login-btn');
    if (!e || !p) { err.textContent = 'Enter email and password'; return; }
    btn.disabled = true; btn.textContent = 'Signing in...';
    auth.signInWithEmailAndPassword(e, p).then(function(c) {
      if (c.user.email !== ADMIN_EMAIL) { err.textContent = 'Access denied.'; auth.signOut(); btn.disabled = false; btn.textContent = 'Sign In'; return; }
      boot();
    }).catch(function(ex) { err.textContent = ex.message.replace('Firebase: ', ''); btn.disabled = false; btn.textContent = 'Sign In'; });
  };
  window.adminLogout = function() {
    if (adminRef) adminRef.set({ online: false, typing: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    auth.signOut().then(function() { location.reload(); });
  };
  auth.onAuthStateChanged(function(u) { if (u && u.email === ADMIN_EMAIL) boot(); });

  function boot() {
    el('login-screen').style.display = 'none';
    el('dashboard').style.display = 'flex';
    var mt = el('dash-mobile-tabs'); if (mt) mt.style.display = '';
    setupPresence();
    setupIdle();
    loadConvs();
    loadComments();
    loadReactions();
    loadUsers();
  }

  // ===== ADMIN PRESENCE =====
  function setupPresence() {
    var uid = auth.currentUser.uid;
    adminRef = rtdb.ref('presence/' + uid);
    adminRef.set({ online: true, typing: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    adminRef.onDisconnect().set({ online: false, typing: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    // Save admin to Firestore users so visitors can find admin UID
    db.collection('users').doc(uid).set({
      displayName: 'Pushpak Prabhat', email: ADMIN_EMAIL, photoURL: '',
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  function setTyping(v) { if (adminRef) adminRef.update({ typing: v }); }

  // ===== IDLE =====
  function setupIdle() {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) { try { firebase.database().goOffline(); } catch(e) {} }
      else { try { firebase.database().goOnline(); } catch(e) {} setupPresence(); }
    });
    function r() { clearTimeout(idleTimer); idleTimer = setTimeout(function() { try { firebase.database().goOffline(); } catch(e) {} }, 5*60*1000); }
    document.addEventListener('mousemove', r); document.addEventListener('keypress', r); r();
  }

  // ===== TABS =====
  window.switchDashTab = function(t) {
    qa('.dash-tab').forEach(function(x) { x.classList.remove('active'); });
    qa('.sidebar__item').forEach(function(x) { x.classList.remove('active'); });
    qa('.dash-mobile-tab').forEach(function(x) { x.classList.remove('active'); });
    el('tab-' + t).classList.add('active');
    var s = q('.sidebar__item[data-tab="' + t + '"]'); if (s) s.classList.add('active');
    var tabs = ['chat', 'comments', 'reactions', 'users'];
    var mt = qa('.dash-mobile-tab'); var i = tabs.indexOf(t); if (i >= 0 && mt[i]) mt[i].classList.add('active');
  };

  // ===== CONVERSATIONS =====
  function loadConvs() {
    db.collection('chat_messages').orderBy('timestamp', 'desc').onSnapshot(function(snap) {
      var cs = {}, lm = {};
      snap.forEach(function(doc) {
        var d = doc.data(); if (!d.conversationId) return;
        if (!lm[d.conversationId]) lm[d.conversationId] = { text: d.text || '', ts: d.timestamp ? d.timestamp.toDate() : new Date(), type: d.type };
        if (d.type !== 'admin' && !cs[d.conversationId]) {
          cs[d.conversationId] = { uid: d.conversationId, name: d.authorName || '?', photo: d.authorPhoto || AVATAR, lastMsg: lm[d.conversationId].text, ts: lm[d.conversationId].ts };
        }
      });
      Object.keys(lm).forEach(function(uid) {
        if (!cs[uid]) { cs[uid] = { uid: uid, name: '...', photo: AVATAR, lastMsg: lm[uid].text, ts: lm[uid].ts };
          db.collection('users').doc(uid).get().then(function(d) { if (d.exists) { cs[uid].name = d.data().displayName || 'User'; cs[uid].photo = d.data().photoURL || AVATAR; } renderConvs(Object.values(cs)); });
        }
        cs[uid].lastMsg = lm[uid].text;
        cs[uid].lastMsgType = lm[uid].type;
      });
      convData = cs;
      renderConvs(Object.values(cs));
    });
  }

  function renderConvs(list) {
    var c = el('conversations');
    if (!list.length) { c.innerHTML = '<div class="empty-state">No conversations yet</div>'; return; }
    // Load unread status
    list.forEach(function(cv) {
      db.collection('chat_read').doc('admin_' + cv.uid).get().then(function(doc) {
        var lr = doc.exists && doc.data().lastRead ? doc.data().lastRead.toDate() : new Date(0);
        var dot = document.getElementById('conv-unread-' + cv.uid);
        if (dot) dot.style.display = cv.ts > lr && cv.lastMsgType !== 'admin' ? 'block' : 'none';
      }).catch(function() {});
    });
    var h = '';
    list.forEach(function(cv) {
      var act = activeConv === cv.uid;
      h += '<div class="conv-item' + (act ? ' active' : '') + '" onclick="openConv(\'' + cv.uid + '\')">'
        + '<div style="position:relative;"><img src="' + cv.photo + '" class="conv-item__avatar" referrerpolicy="no-referrer">'
        + '<span class="conv-unread-dot" id="conv-unread-' + cv.uid + '" style="display:none;"></span></div>'
        + '<div class="conv-item__info"><div class="conv-item__name">' + esc(cv.name) + '</div>'
        + '<div class="conv-item__preview">' + esc(cv.lastMsg.substring(0, 40)) + '</div></div>'
        + '<span class="conv-item__status" id="conv-s-' + cv.uid + '"></span></div>';
    });
    c.innerHTML = h;
    list.forEach(function(cv) { watchPres(cv.uid); });
  }

  function watchPres(uid) {
    if (presWatchers[uid]) return;
    presWatchers[uid] = true;
    rtdb.ref('presence/' + uid).on('value', function(s) {
      var p = s.val();
      var dot = document.getElementById('conv-s-' + uid);
      if (dot) dot.classList.toggle('online', !!(p && p.online));
      // Show typing in thread header
      if (uid === activeConv) {
        var ti = el('admin-typing-indicator');
        if (ti) ti.style.display = (p && p.typing) ? 'flex' : 'none';
        // Update online status text
        var st = el('thread-status-text');
        if (st) st.textContent = (p && p.online) ? 'Online' : 'Offline';
        var sd = el('thread-status-dot');
        if (sd) sd.classList.toggle('online', !!(p && p.online));
      }
    });
  }

  // ===== OPEN CONVERSATION =====
  window.openConv = function(uid) {
    activeConv = uid;
    qa('.conv-item').forEach(function(x) { x.classList.remove('active'); });

    // Hide unread dot instantly
    var dot = document.getElementById('conv-unread-' + uid);
    if (dot) dot.style.display = 'none';

    // Mobile: slide to thread
    var studio = el('chat-studio');
    if (studio) studio.classList.add('thread-open');

    // header
    var hdr = el('thread-header');
    db.collection('users').doc(uid).get().then(function(doc) {
      var d = doc.exists ? doc.data() : {};
      hdr.innerHTML = '<button class="thread-back-btn" onclick="closeThread()" title="Back">←</button>'
        + '<img src="' + (d.photoURL || AVATAR) + '" style="width:36px;height:36px;border-radius:50%;" referrerpolicy="no-referrer">'
        + '<div style="flex:1;"><div class="thread-header__name">' + esc(d.displayName || 'User') + '</div>'
        + '<div style="display:flex;align-items:center;gap:4px;"><span class="status-dot" id="thread-status-dot"></span>'
        + '<span style="font-size:11px;color:var(--mod-text-secondary);" id="thread-status-text">Offline</span></div></div>';
      // Start watching presence
      watchPres(uid);
      // Trigger initial presence check
      rtdb.ref('presence/' + uid).once('value', function(s) {
        var p = s.val();
        var dot = document.getElementById('thread-status-dot');
        var txt = document.getElementById('thread-status-text');
        if (dot) dot.classList.toggle('online', !!(p && p.online));
        if (txt) txt.textContent = (p && p.online) ? 'Online' : 'Offline';
      });
    });

    el('thread-input').style.display = 'flex';

    // Mark admin read of this conversation
    db.collection('chat_read').doc('admin_' + uid).set({ lastRead: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Listen to messages
    if (chatUnsub) chatUnsub();
    chatUnsub = db.collection('chat_messages')
      .where('conversationId', '==', uid)
      .orderBy('timestamp', 'desc')
      .limit(LIMIT)
      .onSnapshot(function(snap) {
        var msgs = [];
        snap.forEach(function(doc) { var d = doc.data(); d._id = doc.id; msgs.push(d); });
        msgs.reverse();
        renderThread(msgs);
      }, function(err) {
        // Fallback without ordering
        if (err.code === 'failed-precondition') {
          chatUnsub = db.collection('chat_messages').where('conversationId', '==', uid).limit(LIMIT).onSnapshot(function(snap) {
            var msgs = [];
            snap.forEach(function(doc) { var d = doc.data(); d._id = doc.id; msgs.push(d); });
            msgs.sort(function(a, b) { return (a.timestamp ? a.timestamp.toDate() : new Date()) - (b.timestamp ? b.timestamp.toDate() : new Date()); });
            renderThread(msgs);
          });
        }
      });
  };

  // Mobile: back to conversation list
  window.closeThread = function() {
    var studio = el('chat-studio');
    if (studio) studio.classList.remove('thread-open');
  };

  function renderThread(msgs) {
    var c = el('thread-messages');
    c.innerHTML = '';
    msgs.forEach(function(d) {
      var isA = d.type === 'admin';
      var b = document.createElement('div');
      b.className = 'admin-bubble admin-bubble--' + (isA ? 'admin' : 'user');
      b.textContent = d.text;
      var t = document.createElement('span');
      t.className = 'admin-bubble__time';
      t.textContent = d.timestamp ? d.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      b.appendChild(t);
      if (isA) {
        var a = document.createElement('div');
        a.className = 'admin-bubble__actions';
        a.innerHTML = '<button class="admin-bubble__action-btn" title="Edit" onclick="editMsg(\'' + d._id + '\',\'' + esc(d.text).replace(/'/g, "\\'") + '\')">✏️</button>'
          + '<button class="admin-bubble__action-btn" title="Delete" onclick="delMsg(\'' + d._id + '\')">🗑️</button>';
        b.appendChild(a);
      }
      c.appendChild(b);
    });
    c.scrollTop = c.scrollHeight;
  }

  window.sendAdminReply = function() {
    if (!activeConv) return;
    var inp = el('admin-chat-input');
    var txt = inp.value.trim(); if (!txt) return;
    db.collection('chat_messages').add({
      text: txt, type: 'admin', authorName: 'Pushpak Prabhat', authorPhoto: '',
      authorUid: auth.currentUser.uid, conversationId: activeConv,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    inp.value = ''; setTyping(false);
  };

  window.editMsg = function(id, currentText) {
    var n = prompt('Edit message:', currentText);
    if (n === null || !n.trim()) return;
    db.collection('chat_messages').doc(id).update({ text: n.trim() })
      .then(function() { toast('Message updated'); })
      .catch(function(e) { alert('Error: ' + e.message); });
  };

  window.delMsg = function(id) {
    if (!confirm('Delete this message?')) return;
    db.collection('chat_messages').doc(id).delete()
      .then(function() { toast('Message deleted'); })
      .catch(function(e) { alert('Error: ' + e.message); });
  };

  // Admin typing
  document.addEventListener('DOMContentLoaded', function() {
    var inp = el('admin-chat-input');
    if (inp) inp.addEventListener('input', function() {
      setTyping(true); clearTimeout(typingTimer);
      typingTimer = setTimeout(function() { setTyping(false); }, 2000);
    });
  });

  // ===== COMMENTS =====
  function loadComments() {
    db.collection('comments').onSnapshot(function(snap) {
      allComments = [];
      if (snap.empty) { renderComments([]); return; }
      var total = snap.size, done = 0;
      snap.forEach(function(pDoc) {
        db.collection('comments').doc(pDoc.id).collection('items').orderBy('timestamp', 'desc').get().then(function(items) {
          items.forEach(function(doc) {
            var d = doc.data(); d._id = doc.id; d._postId = pDoc.id;
            d._timestamp = d.timestamp ? d.timestamp.toDate() : new Date();
            allComments.push(d);
          });
          done++; if (done >= total) renderComments(allComments);
        }).catch(function() { done++; if (done >= total) renderComments(allComments); });
      });
    });
  }

  function renderComments(list) {
    var tb = el('comments-tbody');
    if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-state">No comments yet</td></tr>'; return; }
    var h = '';
    list.forEach(function(c) {
      h += '<tr><td><div class="dash-table__name"><img src="' + (c.authorPhoto || AVATAR) + '" class="dash-table__avatar" referrerpolicy="no-referrer"><span>' + esc(c.author || 'Guest') + '</span></div></td>'
        + '<td>' + esc(c.text || '') + '</td>'
        + '<td><code style="font-size:11px;">' + esc(c._postId) + '</code></td>'
        + '<td>' + c._timestamp.toLocaleDateString() + '</td>'
        + '<td><button class="dash-btn" onclick="editCmt(\'' + c._postId + '\',\'' + c._id + '\')">Edit</button>'
        + '<button class="dash-btn dash-btn--danger" onclick="delCmt(\'' + c._postId + '\',\'' + c._id + '\')">Delete</button></td></tr>';
    });
    tb.innerHTML = h;
  }
  window.filterComments = function() {
    var q = el('comment-search').value.toLowerCase().trim();
    if (!q) { renderComments(allComments); return; }
    renderComments(allComments.filter(function(c) { return (c.text || '').toLowerCase().includes(q) || (c.author || '').toLowerCase().includes(q); }));
  };
  window.editCmt = function(pid, cid) {
    var n = prompt('Edit comment:'); if (!n || !n.trim()) return;
    db.collection('comments').doc(pid).collection('items').doc(cid).update({ text: n.trim() }).then(function() { toast('Comment updated'); });
  };
  window.delCmt = function(pid, cid) {
    if (!confirm('Delete comment?')) return;
    db.collection('comments').doc(pid).collection('items').doc(cid).delete().then(function() { toast('Comment deleted'); });
  };

  // ===== REACTIONS =====
  function loadReactions() {
    db.collection('reactions').onSnapshot(function(snap) {
      var g = el('reactions-grid');
      if (snap.empty) { g.innerHTML = '<div class="empty-state">No reactions yet</div>'; return; }
      var h = '';
      snap.forEach(function(doc) {
        var d = doc.data(), pid = doc.id, total = d.count || 0;
        var types = d.reactionTypes || {}, profs = d.userProfiles || {}, users = d.users || {};
        var th = ''; Object.keys(types).forEach(function(t) { th += '<span class="reaction-card__type"><img src="' + (RIMG[t] || '') + '"> ' + types[t] + '</span>'; });
        var uh = ''; Object.keys(users).forEach(function(uid) {
          var p = profs[uid] || {};
          uh += '<div class="reaction-card__user"><img src="' + (p.photo || AVATAR) + '" referrerpolicy="no-referrer">'
            + '<span class="reaction-card__user-name">' + esc(p.name || '?') + '</span>'
            + '<span class="reaction-card__user-type">' + users[uid] + '</span>'
            + '<button class="dash-btn dash-btn--danger" style="margin-left:auto;font-size:10px;" onclick="delReact(\'' + pid + '\',\'' + uid + '\')">Remove</button></div>';
        });
        h += '<div class="reaction-card"><div class="reaction-card__header">' + esc(pid) + ' — ' + total + '</div>'
          + '<div class="reaction-card__types">' + (th || 'None') + '</div>'
          + '<div class="reaction-card__users">' + (uh || '<div class="empty-state" style="padding:12px;">No users</div>') + '</div></div>';
      });
      g.innerHTML = h;
    });
  }
  window.delReact = function(pid, uid) {
    if (!confirm('Remove reaction?')) return;
    var ref = db.collection('reactions').doc(pid);
    db.runTransaction(function(tx) {
      return tx.get(ref).then(function(doc) {
        if (!doc.exists) return; var d = doc.data();
        var rt = d.users[uid]; delete d.users[uid]; delete d.userProfiles[uid];
        if (rt && d.reactionTypes[rt]) { d.reactionTypes[rt]--; if (d.reactionTypes[rt] <= 0) delete d.reactionTypes[rt]; }
        d.count = Math.max(0, (d.count || 1) - 1);
        tx.set(ref, d);
      });
    }).then(function() { toast('Removed'); });
  };

  // ===== USERS =====
  function loadUsers() {
    db.collection('users').orderBy('lastSeen', 'desc').onSnapshot(function(snap) {
      var tb = el('users-tbody');
      if (snap.empty) { tb.innerHTML = '<tr><td colspan="6" class="empty-state">No users</td></tr>'; return; }
      var h = '';
      snap.forEach(function(doc) {
        var d = doc.data(), uid = doc.id;
        if (d.email === ADMIN_EMAIL) return;
        var ls = d.lastSeen ? d.lastSeen.toDate().toLocaleDateString() + ' ' + d.lastSeen.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?';
        var blocked = d.blocked ? ' (Blocked)' : '';
        h += '<tr><td><img src="' + (d.photoURL || AVATAR) + '" class="dash-table__avatar" referrerpolicy="no-referrer"></td>'
          + '<td>' + esc(d.displayName || '?') + blocked + '</td>'
          + '<td style="font-size:12px;">' + esc(d.email || '') + '</td>'
          + '<td style="font-size:12px;">' + ls + '</td>'
          + '<td><span class="status-dot" id="us-' + uid + '"></span></td>'
          + '<td><button class="dash-btn dash-btn--danger" onclick="delUser(\'' + uid + '\')">Delete</button>'
          + '<button class="dash-btn dash-btn--block" onclick="blockUser(\'' + uid + '\')">' + (d.blocked ? 'Unblock' : 'Block') + '</button></td></tr>';
      });
      if (!h) h = '<tr><td colspan="6" class="empty-state">No users</td></tr>';
      tb.innerHTML = h;
      snap.forEach(function(doc) {
        rtdb.ref('presence/' + doc.id).on('value', function(s) {
          var dot = document.getElementById('us-' + doc.id);
          if (dot) dot.classList.toggle('online', !!(s.val() && s.val().online));
        });
      });
    });
  }
  window.delUser = function(uid) {
    if (!confirm('Delete user data? (Auth account remains but data will be removed)')) return;
    db.collection('users').doc(uid).delete().then(function() { toast('User data deleted'); });
  };
  window.blockUser = function(uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
      var isBlocked = doc.exists && doc.data().blocked;
      db.collection('users').doc(uid).update({ blocked: !isBlocked }).then(function() {
        toast(isBlocked ? 'User unblocked' : 'User blocked');
      });
    });
  };

  // ===== UTILS =====
  function el(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return document.querySelectorAll(s); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function toast(m) {
    var e = document.createElement('div');
    e.style.cssText = 'position:fixed;top:16px;right:16px;background:#057642;color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;font-family:var(--mod-font);box-shadow:0 2px 8px rgba(0,0,0,.15);';
    e.textContent = m; document.body.appendChild(e);
    setTimeout(function() { e.remove(); }, 2500);
  }
})();
