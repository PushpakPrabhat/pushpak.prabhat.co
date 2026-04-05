/**
 * LinkedIn Portfolio — Interactions
 * Handles: Like, Comment (with reactions & replies), Share
 * Auth-gated: requires Google Sign-In for Like, Comment, Reply
 */

(function() {
  'use strict';

  // LinkedIn default user avatar SVG (gray silhouette)
  const DEFAULT_AVATAR_SVG = '<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="128" height="128" rx="64" fill="#e7e7e7"/><path d="M64 72c13.25 0 24-10.75 24-24S77.25 24 64 24 40 34.75 40 48s10.75 24 24 24zm0 8c-16 0-48 8-48 24v8h96v-8c0-16-32-24-48-24z" fill="#666"/></svg>';

  const DEFAULT_AVATAR_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent('<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="64" fill="#e7e7e7"/><path d="M64 72c13.25 0 24-10.75 24-24S77.25 24 64 24 40 34.75 40 48s10.75 24 24 24zm0 8c-16 0-48 8-48 24v8h96v-8c0-16-32-24-48-24z" fill="#666"/></svg>');

  // ============================
  // Auth Helper
  // ============================
  function requireAuthThen(callback) {
    if (PortfolioDB.isSignedIn()) {
      callback();
      return;
    }
    PortfolioDB.requireAuth().then(function() {
      callback();
    }).catch(function(err) {
      console.warn('[Interactions] Auth error:', err);
      if (err && err.code === 'auth/unauthorized-domain') {
        showToast('⚠️ Add this domain to Firebase authorized domains');
      } else if (err && err.code === 'auth/popup-closed-by-user') {
        // User cancelled sign-in, do nothing
      } else {
        showToast('Sign in to interact');
      }
    });
  }

  // ============================
  // Like
  // ============================
  window.toggleLike = function(contentId) {
    requireAuthThen(function() {
      const result = PortfolioDB.toggleLike(contentId);
      
      const btn = document.getElementById('like-btn-' + contentId);
      const countEl = document.getElementById('like-count-' + contentId);
      const iconsEl = document.getElementById('reaction-icons-' + contentId);
      
      if (btn) {
        btn.classList.toggle('interaction-btn--active', result.liked);
        
        if (!result.liked) {
          btn.classList.remove('has-custom');
          const textEl = btn.querySelector('.interaction-btn__text');
          if (textEl) {
            textEl.textContent = 'Like';
            textEl.style.color = '';
          }
          const customEl = btn.querySelector('.like-icon-custom');
          if (customEl) { customEl.innerHTML = ''; customEl.style.display = 'none'; }
        }
        
        // Animate
        const icon = btn.querySelector('.interaction-btn__icon');
        if (icon) {
          icon.style.animation = 'none';
          icon.offsetHeight;
          icon.style.animation = 'likeHeart 0.35s ease';
        }
      }
      
      if (countEl) {
        countEl.textContent = result.count === 0 ? '0 Reactions' : result.count;
      }

      if (!result.liked && iconsEl) {
        if (result.count === 0) iconsEl.innerHTML = '';
      } else if (result.liked && iconsEl && iconsEl.innerHTML.trim() === '') {
        var likeImg = window._reactionImages && window._reactionImages['like'];
        if (likeImg) {
          iconsEl.innerHTML = '<img src="' + likeImg + '" alt="Like">';
        }
      }
      
      showToast(result.liked ? 'You liked this post 👍' : 'Reaction removed');
    });
  };

  // ============================
  // Comments
  // ============================
  window.toggleComments = function(contentId) {
    const section = document.getElementById('comments-' + contentId);
    if (!section) return;
    section.classList.toggle('open');
    
    // Load existing comments (anyone can VIEW without sign-in)
    if (section.classList.contains('open')) {
      const listEl = document.getElementById('comment-list-' + contentId);
      if (listEl && listEl.children.length === 0) {
        const comments = PortfolioDB.getComments(contentId);
        comments.forEach(function(comment) {
          if (!comment.parentId) {
            var el = createCommentElement(comment, contentId);
            listEl.appendChild(el);
          }
        });
      }
      // Focus input
      var input = document.getElementById('comment-input-' + contentId);
      if (input) setTimeout(function() { input.focus(); }, 100);
    }
  };

  window.addComment = function(contentId, parentId) {
    // Gate behind auth
    requireAuthThen(function() {
      var inputId = parentId 
        ? 'reply-input-' + parentId 
        : 'comment-input-' + contentId;
      var input = document.getElementById(inputId);
      if (!input) return;
      
      var text = input.value.trim();
      if (!text) return;
      
      var comment = PortfolioDB.addComment(contentId, text, parentId || null);
      if (!comment) return;
      
      if (parentId) {
        var repliesEl = document.getElementById('replies-' + parentId);
        if (repliesEl) {
          var el = createCommentElement(comment, contentId);
          repliesEl.appendChild(el);
        }
        var replyWrapper = document.getElementById('reply-wrapper-' + parentId);
        if (replyWrapper) replyWrapper.style.display = 'none';
      } else {
        var listEl = document.getElementById('comment-list-' + contentId);
        if (listEl) {
          var el = createCommentElement(comment, contentId);
          listEl.appendChild(el);
        }
      }
      
      // Update count
      var allComments = PortfolioDB.getComments(contentId);
      var totalCount = countAllComments(allComments);
      var countEl = document.getElementById('comment-count-' + contentId);
      if (countEl) {
        countEl.textContent = totalCount + ' comment' + (totalCount !== 1 ? 's' : '');
      }
      
      input.value = '';
      showToast('Comment posted! 💬');
    });
  };

  function countAllComments(comments) {
    var count = 0;
    comments.forEach(function(c) {
      count++;
      if (c.replies) count += countAllComments(c.replies);
    });
    return count;
  }

  function getUserAvatar() {
    var user = PortfolioDB.getCurrentUser ? PortfolioDB.getCurrentUser() : null;
    if (user && user.photo) return user.photo;
    return DEFAULT_AVATAR_DATA_URI;
  }

  function getUserName() {
    var user = PortfolioDB.getCurrentUser ? PortfolioDB.getCurrentUser() : null;
    if (user && user.name) return user.name;
    return 'Guest User';
  }

  function createCommentElement(comment, contentId) {
    var div = document.createElement('div');
    div.className = 'comment';
    div.id = 'comment-' + comment.id;
    
    var timeAgo = getTimeAgo(new Date(comment.timestamp));
    var likeCount = comment.likes || 0;
    var userId = PortfolioDB.getCurrentUser ? (PortfolioDB.getCurrentUser() || {}).uid : 'local_user';
    var isLiked = comment.likedBy && comment.likedBy.indexOf(userId) >= 0;
    
    // Use the commenter's real profile picture if available
    var avatarUrl = comment.authorPhoto || DEFAULT_AVATAR_DATA_URI;
    var authorName = comment.author || 'Guest User';
    
    div.innerHTML = 
      '<div class="comment__avatar-wrap">' +
        '<img src="' + avatarUrl + '" alt="' + escapeHtml(authorName) + '" class="comment__avatar" referrerpolicy="no-referrer">' +
      '</div>' +
      '<div class="comment__content-wrapper">' +
        '<div class="comment__body">' +
          '<div class="comment__author">' +
            escapeHtml(authorName) +
            '<span class="comment__author-title"> · ' + timeAgo + '</span>' +
          '</div>' +
          '<div class="comment__text">' + escapeHtml(comment.text) + '</div>' +
        '</div>' +
        '<div class="comment__actions">' +
          '<button class="comment__action comment__action--like' + (isLiked ? ' comment__action--liked' : '') + '" onclick="toggleCommentLikeUI(\'' + comment.id + '\', \'' + contentId + '\', this)">' +
            'Like' + (likeCount > 0 ? ' · ' + likeCount : '') +
          '</button>' +
          '<span class="comment__action-divider">|</span>' +
          '<button class="comment__action" onclick="showReplyInput(\'' + comment.id + '\', \'' + contentId + '\')">' +
            'Reply' +
          '</button>' +
        '</div>' +
        '<div class="comment__reply-wrapper" id="reply-wrapper-' + comment.id + '" style="display:none;">' +
          '<div class="comment__reply-input-row">' +
            '<img src="' + getUserAvatar() + '" alt="You" class="comment__reply-avatar" referrerpolicy="no-referrer">' +
            '<input type="text" class="comment__reply-input" id="reply-input-' + comment.id + '" placeholder="Reply..." onkeypress="if(event.key===\'Enter\') addComment(\'' + contentId + '\', \'' + comment.id + '\')">' +
            '<button class="comment__reply-btn" onclick="addComment(\'' + contentId + '\', \'' + comment.id + '\')">Post</button>' +
          '</div>' +
        '</div>' +
        '<div class="comment__replies" id="replies-' + comment.id + '"></div>' +
      '</div>';

    // Render existing replies
    if (comment.replies && comment.replies.length > 0) {
      var repliesEl = div.querySelector('#replies-' + comment.id);
      comment.replies.forEach(function(reply) {
        var replyEl = createCommentElement(reply, contentId);
        repliesEl.appendChild(replyEl);
      });
    }
    
    return div;
  }

  window.toggleCommentLikeUI = function(commentId, contentId, btnEl) {
    requireAuthThen(function() {
      var result = PortfolioDB.toggleCommentLike(commentId, contentId);
      if (btnEl) {
        btnEl.classList.toggle('comment__action--liked', result.liked);
        btnEl.textContent = 'Like' + (result.likes > 0 ? ' · ' + result.likes : '');
      }
    });
  };

  window.showReplyInput = function(commentId, contentId) {
    var wrapper = document.getElementById('reply-wrapper-' + commentId);
    if (wrapper) {
      var isVisible = wrapper.style.display !== 'none';
      wrapper.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        var input = document.getElementById('reply-input-' + commentId);
        if (input) setTimeout(function() { input.focus(); }, 50);
      }
    }
  };

  // ============================
  // Share
  // ============================
  window.shareContent = function(contentId) {
    var url = window.location.origin + '/#item-' + contentId;
    
    if (navigator.share) {
      navigator.share({
        title: document.title,
        url: url
      }).then(function() {
        showToast('Shared! 🔗');
      }).catch(function() {});
    } else {
      navigator.clipboard.writeText(url).then(function() {
        showToast('Link copied! 🔗');
      }).catch(function() {
        showToast('Could not copy link');
      });
    }
    
    PortfolioDB.incrementShare(contentId);
  };

  // ============================
  // Helpers
  // ============================
  function getTimeAgo(date) {
    var now = new Date();
    var diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    if (diff < 2592000) return Math.floor(diff / 604800) + 'w';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
