/**
 * Instagram Portfolio — Interactions
 * Handles: Like (heart), Comment, Reply, Share
 * Auth-gated: requires Google Sign-In for Like, Comment, Reply
 */

(function() {
  'use strict';

  const DEFAULT_AVATAR_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent('<svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="64" fill="#333"/><path d="M64 72c13.25 0 24-10.75 24-24S77.25 24 64 24 40 34.75 40 48s10.75 24 24 24zm0 8c-16 0-48 8-48 24v8h96v-8c0-16-32-24-48-24z" fill="#666"/></svg>');

  // ============================
  // Auth Helper
  // ============================
  function requireAuthThen(callback) {
    if (typeof PortfolioDB === 'undefined') {
      openAuthModal();
      return;
    }
    if (PortfolioDB.isSignedIn()) {
      callback();
      return;
    }
    PortfolioDB.requireAuth().then(function() {
      callback();
    }).catch(function(err) {
      console.warn('[Interactions] Auth error:', err);
      if (err && err.code === 'auth/popup-closed-by-user') {
        // User cancelled, do nothing
      } else {
        showToast('Sign in to interact');
      }
    });
  }

  // ============================
  // Like (Heart)
  // ============================
  window.toggleLike = function(contentId) {
    requireAuthThen(function() {
      const result = PortfolioDB.toggleLike(contentId);
      
      const btn = document.getElementById('like-btn-' + contentId);
      const countEl = document.getElementById('like-count-' + contentId);
      
      if (btn) {
        btn.classList.toggle('ig-action-btn--active', result.liked);
        
        // Animate
        if (result.liked) {
          const filled = btn.querySelector('.ig-heart-filled');
          if (filled) {
            filled.style.display = 'block';
            const svg = filled.querySelector('svg');
            if (svg) {
              svg.style.animation = 'none';
              svg.offsetHeight;
              svg.style.animation = 'likeHeart 0.35s ease';
            }
          }
          const outline = btn.querySelector('.ig-heart-outline');
          if (outline) outline.style.display = 'none';
        } else {
          const filled = btn.querySelector('.ig-heart-filled');
          if (filled) filled.style.display = 'none';
          const outline = btn.querySelector('.ig-heart-outline');
          if (outline) outline.style.display = 'block';
        }
      }
      
      if (countEl) {
        const count = result.count || 0;
        countEl.textContent = count === 0 ? '0 likes' :
          count === 1 ? '1 like' : count + ' likes';
      }
    });
  };

  // ============================
  // Comments
  // ============================
  window.addComment = function(contentId, parentId) {
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
      if (countEl) countEl.textContent = totalCount;
      
      // Show "View all" button
      var viewBtn = document.getElementById('view-comments-btn-' + contentId);
      if (viewBtn && totalCount > 0) viewBtn.style.display = 'block';
      
      // Hide post button
      var postBtn = document.getElementById('comment-post-btn-' + contentId);
      if (postBtn) postBtn.style.display = 'none';
      
      input.value = '';
      showToast('Comment posted');
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
    return 'Guest';
  }

  function createCommentElement(comment, contentId) {
    var div = document.createElement('div');
    div.className = 'ig-comment';
    div.id = 'comment-' + comment.id;
    
    var timeAgo = getTimeAgo(new Date(comment.timestamp));
    var likeCount = comment.likes || 0;
    var userId = PortfolioDB.getCurrentUser ? (PortfolioDB.getCurrentUser() || {}).uid : 'local_user';
    var isLiked = comment.likedBy && comment.likedBy.indexOf(userId) >= 0;
    
    var avatarUrl = comment.authorPhoto || DEFAULT_AVATAR_DATA_URI;
    var authorName = comment.author || 'Guest';
    
    div.innerHTML = 
      '<img src="' + avatarUrl + '" alt="' + escapeHtml(authorName) + '" class="ig-comment__avatar" referrerpolicy="no-referrer">' +
      '<div class="ig-comment__body">' +
        '<div>' +
          '<span class="ig-comment__author">' + escapeHtml(authorName) + '</span>' +
          '<span class="ig-comment__text">' + escapeHtml(comment.text) + '</span>' +
        '</div>' +
        '<div class="ig-comment__meta">' +
          '<span>' + timeAgo + '</span>' +
          '<button class="ig-comment__like-btn' + (isLiked ? ' ig-comment__like-btn--liked' : '') + '" onclick="toggleCommentLikeUI(\'' + comment.id + '\', \'' + contentId + '\', this)">' +
            (likeCount > 0 ? likeCount + ' like' + (likeCount > 1 ? 's' : '') : 'Like') +
          '</button>' +
          '<button class="ig-comment__like-btn" onclick="showReplyInput(\'' + comment.id + '\', \'' + contentId + '\')">Reply</button>' +
        '</div>' +
        '<div class="ig-comment__reply-wrapper" id="reply-wrapper-' + comment.id + '" style="display:none;">' +
          '<div class="ig-comments__add">' +
            '<input type="text" class="ig-comments__input" id="reply-input-' + comment.id + '" placeholder="Reply..." onkeypress="if(event.key===\'Enter\') addComment(\'' + contentId + '\', \'' + comment.id + '\')">' +
            '<button class="ig-comments__post-btn" style="display:block;" onclick="addComment(\'' + contentId + '\', \'' + comment.id + '\')">Post</button>' +
          '</div>' +
        '</div>' +
        '<div class="ig-comment__replies" id="replies-' + comment.id + '"></div>' +
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
        btnEl.classList.toggle('ig-comment__like-btn--liked', result.liked);
        btnEl.textContent = result.likes > 0 ? result.likes + ' like' + (result.likes > 1 ? 's' : '') : 'Like';
      }
    });
  };

  window.showReplyInput = function(commentId, contentId) {
    var wrapper = document.getElementById('reply-wrapper-' + commentId);
    if (wrapper) {
      var isVisible = wrapper.style.display !== 'none';
      wrapper.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        var input = document.getElementById('reply-input-' + commentId);
        if (input) setTimeout(function() { input.focus(); }, 50);
      }
    }
  };

  // ============================
  // Like Display on Load
  // ============================
  window.addEventListener('DOMContentLoaded', function() {
    // Load like/comment counts for all posts
    document.querySelectorAll('.ig-post').forEach(function(post) {
      var contentId = post.dataset.id;
      if (!contentId) return;
      
      // Load likes
      if (typeof PortfolioDB !== 'undefined') {
        var likes = PortfolioDB.getLikes(contentId);
        var countEl = document.getElementById('like-count-' + contentId);
        if (countEl && likes) {
          var count = likes.count || 0;
          countEl.textContent = count === 0 ? '0 likes' :
            count === 1 ? '1 like' : count + ' likes';
        }
        
        // Check if current user liked
        var userId = PortfolioDB.getCurrentUser ? (PortfolioDB.getCurrentUser() || {}).uid : null;
        if (userId && likes && likes.users && likes.users.indexOf(userId) >= 0) {
          var btn = document.getElementById('like-btn-' + contentId);
          if (btn) {
            btn.classList.add('ig-action-btn--active');
            var filled = btn.querySelector('.ig-heart-filled');
            if (filled) filled.style.display = 'block';
            var outline = btn.querySelector('.ig-heart-outline');
            if (outline) outline.style.display = 'none';
          }
        }
        
        // Load comments
        var comments = PortfolioDB.getComments(contentId);
        var totalCount = countAllComments(comments);
        var commentCount = document.getElementById('comment-count-' + contentId);
        if (commentCount) commentCount.textContent = totalCount;
        var viewBtn = document.getElementById('view-comments-btn-' + contentId);
        if (viewBtn) viewBtn.style.display = totalCount > 0 ? 'block' : 'none';
        
        // Pre-load comment list
        if (comments.length > 0) {
          var listEl = document.getElementById('comment-list-' + contentId);
          if (listEl) {
            listEl.style.display = 'none'; // Hidden initially, shown on "View all"
            comments.forEach(function(comment) {
              if (!comment.parentId) {
                var el = createCommentElement(comment, contentId);
                listEl.appendChild(el);
              }
            });
          }
        }
      }
    });
    
    // Setup like button click handlers
    document.querySelectorAll('[id^="like-btn-"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var contentId = this.dataset.contentId;
        if (contentId) window.toggleLike(contentId);
      });
    });
  });

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
