/**
 * Apple HIG Portfolio — Main JavaScript (Enhanced)
 * Handles: Tabs, Filtering, Pagination, Media Viewer, Video Viewer,
 *          Reactions, Feed Menus, Profile Toggle, Chat, Search, Dark Mode
 */

(function() {
  'use strict';

  const ITEMS_PER_PAGE = 6;
  let currentTab = 'all';
  let currentPhotoCategory = 'all-photos';
  let currentVideoCategory = 'all-videos';
  let visibleCount = ITEMS_PER_PAGE;
  let showingProfile = false;

  // Media viewer state
  let mvItems = [];
  let mvIndex = 0;
  let mvScale = 1;
  let mvPanX = 0, mvPanY = 0;
  let mvIsPanning = false;
  let mvStartX = 0, mvStartY = 0;
  let mvPinchDist = 0;

  // Video viewer state
  let vvItems = [];
  let vvIndex = 0;

  // ======================== DOM Ready ========================
  document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initCategories();
    initPagination();
    initMediaViewer();
    initVideoViewer();
    initReactions();
    initNavigation();
    initAnimations();
    initFeedMenus();
    initProtection();
    
    if (window.location.hash === '#profile') {
      toggleProfile(true);
    }

    // Always watch admin presence globally
    watchAdminPresence();
  });

  // ======================== Protection (right-click, long-press) ========================
  function initProtection() {
    // Disable right-click context menu
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });
  }

  // ======================== Tabs ========================
  function initTabs() {
    document.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        switchTab(this.dataset.tab);
      });
    });
  }

  function switchTab(tabName) {
    currentTab = tabName;
    visibleCount = ITEMS_PER_PAGE;

    document.querySelectorAll('.feed-tab').forEach(t => {
      t.classList.toggle('feed-tab--active', t.dataset.tab === tabName);
      t.setAttribute('aria-selected', t.dataset.tab === tabName);
    });

    const photoCats = document.getElementById('photo-categories');
    const videoCats = document.getElementById('video-categories');
    if (photoCats) photoCats.classList.toggle('active', tabName === 'photos');
    if (videoCats) videoCats.classList.toggle('active', tabName === 'videos');

    if (tabName === 'photos') {
      currentPhotoCategory = 'all-photos';
      resetCategoryChips('photo-categories', 'all-photos');
    } else if (tabName === 'videos') {
      currentVideoCategory = 'all-videos';
      resetCategoryChips('video-categories', 'all-videos');
    }

    toggleProfile(false);
    filterAndPaginate();
  }

  function resetCategoryChips(containerId, defaultCategory) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.category-chip').forEach(chip => {
      chip.classList.toggle('category-chip--active', chip.dataset.category === defaultCategory);
    });
  }

  // ======================== Categories ========================
  function initCategories() {
    document.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        const category = this.dataset.category;
        const parent = this.closest('.category-filter');
        parent.querySelectorAll('.category-chip').forEach(c => c.classList.remove('category-chip--active'));
        this.classList.add('category-chip--active');
        if (parent.id === 'photo-categories') currentPhotoCategory = category;
        else if (parent.id === 'video-categories') currentVideoCategory = category;
        visibleCount = ITEMS_PER_PAGE;
        filterAndPaginate();
      });
    });
  }

  // ======================== Filter & Paginate ========================
  function filterAndPaginate() {
    const items = document.querySelectorAll('.feed-item');
    let matching = [];

    items.forEach(item => {
      const type = item.dataset.type;
      const category = item.dataset.category;
      let show = false;

      if (currentTab === 'all') show = true;
      else if (currentTab === 'photos' && type === 'photos') {
        show = currentPhotoCategory === 'all-photos' || currentPhotoCategory === category;
      } else if (currentTab === 'videos' && type === 'videos') {
        show = currentVideoCategory === 'all-videos' || currentVideoCategory === category;
      } else if (currentTab === 'posts' && type === 'posts') show = true;

      if (show) matching.push(item);
      item.style.display = 'none';
      item.classList.remove('fade-in');
    });

    matching.forEach((item, i) => {
      if (i < visibleCount) {
        item.style.display = 'block';
        item.style.animationDelay = (i * 0.05) + 's';
        item.classList.add('fade-in');
      }
    });

    const wrapper = document.getElementById('load-more-wrapper');
    const btn = document.getElementById('load-more-btn');
    if (wrapper && btn) {
      if (matching.length > visibleCount) {
        wrapper.style.display = 'block';
        btn.textContent = `Show more results (${matching.length - visibleCount} remaining)`;
      } else {
        wrapper.style.display = 'none';
      }
    }
  }

  function initPagination() { filterAndPaginate(); }
  window.loadMore = function() { visibleCount += ITEMS_PER_PAGE; filterAndPaginate(); };

  // ======================== MEDIA VIEWER (Images) ========================
  function initMediaViewer() {
    const viewer = document.getElementById('media-viewer');
    if (!viewer) return;

    document.getElementById('mv-close').addEventListener('click', closeMediaViewer);
    document.getElementById('mv-prev').addEventListener('click', () => navigateMedia(-1));
    document.getElementById('mv-next').addEventListener('click', () => navigateMedia(1));
    document.getElementById('mv-zoom-in').addEventListener('click', () => zoomMedia(0.3));
    document.getElementById('mv-zoom-out').addEventListener('click', () => zoomMedia(-0.3));
    document.getElementById('mv-download').addEventListener('click', downloadCurrentImage);
    document.getElementById('mv-fullscreen').addEventListener('click', toggleMVFullscreen);

    viewer.querySelector('.media-viewer__overlay').addEventListener('click', closeMediaViewer);

    // Close when clicking empty space around the image
    document.getElementById('mv-content').addEventListener('click', function(e) {
      if (e.target === this) closeMediaViewer();
    });

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (!viewer.classList.contains('open')) return;
      if (e.key === 'Escape') closeMediaViewer();
      if (e.key === 'ArrowLeft') navigateMedia(-1);
      if (e.key === 'ArrowRight') navigateMedia(1);
      if (e.key === '+' || e.key === '=') zoomMedia(0.3);
      if (e.key === '-') zoomMedia(-0.3);
    });

    // Touch gestures for zoom and pan
    const content = document.getElementById('mv-content');
    const img = document.getElementById('mv-img');

    // Mouse wheel zoom
    content.addEventListener('wheel', function(e) {
      e.preventDefault();
      zoomMedia(e.deltaY < 0 ? 0.2 : -0.2);
    }, { passive: false });

    // Touch pinch zoom
    content.addEventListener('touchstart', function(e) {
      if (e.touches.length === 2) {
        mvPinchDist = getTouchDist(e.touches);
      } else if (e.touches.length === 1 && mvScale > 1) {
        mvIsPanning = true;
        mvStartX = e.touches[0].clientX - mvPanX;
        mvStartY = e.touches[0].clientY - mvPanY;
      }
    }, { passive: false });

    content.addEventListener('touchmove', function(e) {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = getTouchDist(e.touches);
        const delta = (dist - mvPinchDist) * 0.01;
        mvPinchDist = dist;
        zoomMedia(delta);
      } else if (e.touches.length === 1 && mvIsPanning && mvScale > 1) {
        mvPanX = e.touches[0].clientX - mvStartX;
        mvPanY = e.touches[0].clientY - mvStartY;
        applyTransform();
      }
    }, { passive: false });

    content.addEventListener('touchend', function() {
      mvIsPanning = false;
    });

    // Swipe for next/prev (single finger when not zoomed)
    let swipeStartX = 0;
    content.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1 && mvScale <= 1) {
        swipeStartX = e.touches[0].clientX;
      }
    });
    content.addEventListener('touchend', function(e) {
      if (mvScale <= 1 && swipeStartX) {
        const dx = e.changedTouches[0].clientX - swipeStartX;
        if (Math.abs(dx) > 60) {
          navigateMedia(dx > 0 ? -1 : 1);
        }
        swipeStartX = 0;
      }
    });
  }

  function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function zoomMedia(delta) {
    mvScale = Math.max(0.5, Math.min(5, mvScale + delta));
    if (mvScale <= 1) { mvPanX = 0; mvPanY = 0; }
    applyTransform();
  }

  function applyTransform() {
    const img = document.getElementById('mv-img');
    if (img) img.style.transform = `translate(${mvPanX}px, ${mvPanY}px) scale(${mvScale})`;
  }

  window.openMediaViewer = function(type, category, currentId) {
    const items = document.querySelectorAll(`.feed-item[data-type="${type}"]`);
    mvItems = [];
    let idx = 0;
    items.forEach((item, i) => {
      const img = item.dataset.image || item.querySelector('.feed-item__image')?.src;
      if (img) {
        if (item.dataset.id === currentId) idx = mvItems.length;
        mvItems.push({ src: img, id: item.dataset.id });
      }
    });
    mvIndex = idx;
    mvScale = 1; mvPanX = 0; mvPanY = 0;
    showMediaImage();
    document.getElementById('media-viewer').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  function showMediaImage() {
    if (!mvItems.length) return;
    const img = document.getElementById('mv-img');
    img.src = mvItems[mvIndex].src;
    img.style.transform = 'translate(0,0) scale(1)';
    mvScale = 1; mvPanX = 0; mvPanY = 0;
    document.getElementById('mv-counter').textContent = `${mvIndex + 1} / ${mvItems.length}`;
    document.getElementById('mv-prev').style.display = mvItems.length > 1 ? '' : 'none';
    document.getElementById('mv-next').style.display = mvItems.length > 1 ? '' : 'none';
  }

  function navigateMedia(dir) {
    mvIndex = (mvIndex + dir + mvItems.length) % mvItems.length;
    showMediaImage();
  }

  function closeMediaViewer() {
    document.getElementById('media-viewer').classList.remove('open');
    document.body.style.overflow = '';
  }

  function downloadCurrentImage() {
    if (!mvItems.length) return;
    downloadImage(mvItems[mvIndex].src, mvItems[mvIndex].id);
  }

  function toggleMVFullscreen() {
    const el = document.getElementById('media-viewer');
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // Legacy lightbox compat
  window.openLightbox = function(src) {
    mvItems = [{ src: src, id: 'single' }];
    mvIndex = 0; mvScale = 1; mvPanX = 0; mvPanY = 0;
    showMediaImage();
    document.getElementById('media-viewer').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  // ======================== VIDEO VIEWER ========================
  function initVideoViewer() {
    const viewer = document.getElementById('video-viewer');
    if (!viewer) return;

    document.getElementById('vv-close').addEventListener('click', closeVideoViewer);
    document.getElementById('vv-prev').addEventListener('click', () => navigateVideo(-1));
    document.getElementById('vv-next').addEventListener('click', () => navigateVideo(1));
    document.getElementById('vv-fullscreen').addEventListener('click', toggleVVFullscreen);
    viewer.querySelector('.media-viewer__overlay').addEventListener('click', closeVideoViewer);

    // Close when clicking empty space around the video
    document.getElementById('vv-content').addEventListener('click', function(e) {
      if (e.target === this) closeVideoViewer();
    });

    document.addEventListener('keydown', function(e) {
      if (!viewer.classList.contains('open')) return;
      if (e.key === 'Escape') closeVideoViewer();
      if (e.key === 'ArrowLeft') navigateVideo(-1);
      if (e.key === 'ArrowRight') navigateVideo(1);
    });
  }

  window.openVideoViewer = function(type, category, currentId) {
    const items = document.querySelectorAll(`.feed-item[data-type="${type}"]`);
    vvItems = [];
    let idx = 0;
    items.forEach(item => {
      const url = item.dataset.videoUrl;
      const vtype = item.dataset.videoType;
      if (url) {
        if (item.dataset.id === currentId) idx = vvItems.length;
        vvItems.push({ url, type: vtype, id: item.dataset.id });
      }
    });
    vvIndex = idx;
    showVideoEmbed();
    document.getElementById('video-viewer').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  function showVideoEmbed() {
    if (!vvItems.length) return;
    const embed = document.getElementById('vv-embed');
    const item = vvItems[vvIndex];
    let html = '';

    if (item.type === 'youtube') {
      let vid = '';
      const m1 = item.url.match(/v=([a-zA-Z0-9_-]+)/);
      const m2 = item.url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
      vid = m1 ? m1[1] : (m2 ? m2[1] : '');
      html = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;"></iframe>`;
    } else if (item.type === 'gdrive' || item.type === 'drive') {
      html = `<iframe src="${item.url}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;"></iframe>`;
    } else {
      html = `<video controls autoplay style="width:100%;max-height:80vh;"><source src="${item.url}" type="video/mp4"></video>`;
    }

    embed.innerHTML = html;
    document.getElementById('vv-counter').textContent = `${vvIndex + 1} / ${vvItems.length}`;
    document.getElementById('vv-prev').style.display = vvItems.length > 1 ? '' : 'none';
    document.getElementById('vv-next').style.display = vvItems.length > 1 ? '' : 'none';
  }

  function navigateVideo(dir) {
    vvIndex = (vvIndex + dir + vvItems.length) % vvItems.length;
    showVideoEmbed();
  }

  function closeVideoViewer() {
    document.getElementById('video-viewer').classList.remove('open');
    document.getElementById('vv-embed').innerHTML = '';
    document.body.style.overflow = '';
  }

  function toggleVVFullscreen() {
    const el = document.getElementById('video-viewer');
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // ======================== Reactions (Desktop hover / Mobile longpress) ========================
  function initReactions() {
    document.querySelectorAll('.like-btn-wrapper').forEach(wrapper => {
      const btn = wrapper.querySelector('.interaction-btn');
      const popup = wrapper.querySelector('.reaction-popup');
      const contentId = btn?.dataset.contentId;
      if (!btn || !popup || !contentId) return;

      let longPressTimer = null;
      let hoverTimeout = null;
      let hideTimeout = null;
      const isMobile = 'ontouchstart' in window;

      // ---- DESKTOP: click to like, hover to show reactions ----
      if (!isMobile) {
        btn.addEventListener('click', () => toggleLike(contentId));

        wrapper.addEventListener('mouseenter', () => {
          clearTimeout(hideTimeout);
          hoverTimeout = setTimeout(() => popup.classList.add('show'), 400);
        });
        wrapper.addEventListener('mouseleave', () => {
          clearTimeout(hoverTimeout);
          hideTimeout = setTimeout(() => {
            popup.classList.remove('show');
          }, 300);
        });
        popup.addEventListener('mouseenter', () => {
          clearTimeout(hideTimeout);
        });
        popup.addEventListener('mouseleave', () => {
          hideTimeout = setTimeout(() => {
            popup.classList.remove('show');
          }, 200);
        });
      }

      // ---- MOBILE: tap to like, long press for reactions ----
      if (isMobile) {
        btn.addEventListener('touchstart', function(e) {
          longPressTimer = setTimeout(() => {
            popup.classList.add('show');
            longPressTimer = null;
          }, 500);
        }, { passive: true });

        btn.addEventListener('touchend', function(e) {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            toggleLike(contentId);
          }
        });

        btn.addEventListener('touchmove', function() {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        });
      }

      // Reaction buttons
      popup.querySelectorAll('.reaction-popup__btn').forEach(rbtn => {
        rbtn.addEventListener('click', function() {
          const reaction = this.dataset.reaction;
          const id = this.dataset.id;
          applyReaction(id, reaction);
          popup.classList.remove('show');
        });
      });
    });

    // Close popups on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.like-btn-wrapper')) {
        document.querySelectorAll('.reaction-popup.show').forEach(p => p.classList.remove('show'));
      }
    });
  }

  // Auth-gated toggleLike
  function toggleLike(contentId) {
    if (!PortfolioDB.isSignedIn()) {
      PortfolioDB.requireAuth().then(function() {
        applyReaction(contentId, 'like');
      }).catch(function() {});
      return;
    }
    applyReaction(contentId, 'like');
  }

  // Reaction image URLs (Facebook-style SVGs)
  const reactionImages = {
    'like': '/images/reactions/like.svg',
    'love': '/images/reactions/love.svg',
    'care': '/images/reactions/care.svg',
    'haha': '/images/reactions/haha.svg',
    'wow': '/images/reactions/wow.svg',
    'sad': '/images/reactions/sad.svg',
    'angry': '/images/reactions/angry.svg',
    // Legacy fallbacks
    'celebrate': '/images/reactions/haha.svg',
    'support': '/images/reactions/care.svg',
    'insightful': '/images/reactions/wow.svg',
    'funny': '/images/reactions/haha.svg'
  };
  // Expose globally for firebase.js sync
  window._reactionImages = reactionImages;

  function applyReaction(contentId, reaction) {
    if (!PortfolioDB.isSignedIn()) {
      PortfolioDB.requireAuth().then(function() {
        applyReaction(contentId, reaction);
      }).catch(function() {});
      return;
    }

    let result = PortfolioDB.toggleLike(contentId, reaction);
    
    localStorage.setItem('pp_portfolio_reaction_' + contentId, reaction);

    const btn = document.getElementById('like-btn-' + contentId);
    const countEl = document.getElementById('like-count-' + contentId);
    const iconsEl = document.getElementById('reaction-icons-' + contentId);
    
    if (btn) {
      if (result.liked) {
        btn.classList.add('interaction-btn--active');
        const textEl = btn.querySelector('.interaction-btn__text');
        const customIconEl = btn.querySelector('.like-icon-custom');
        
        btn.classList.add('has-custom');
        if (customIconEl) {
          const imgUrl = reactionImages[reaction];
          customIconEl.innerHTML = `<img src="${imgUrl}" width="20" height="20" alt="${reaction}" style="display:block;">`;
        }
        if (textEl) {
          const displayNames = { 
            like: 'Like', love: 'Love', care: 'Care', haha: 'Haha',
            wow: 'Wow', sad: 'Sad', angry: 'Angry',
            celebrate: 'Haha', support: 'Care', insightful: 'Wow', funny: 'Sad'
          };
          textEl.textContent = displayNames[reaction] || reaction.charAt(0).toUpperCase() + reaction.slice(1);
          const colors = { 
            like: '#0571ED', love: '#F02849', care: '#F7B125',
            haha: '#F7B125', wow: '#F7B125', sad: '#F7B125', angry: '#E84A3B',
            celebrate: '#F7B125', support: '#F7B125', insightful: '#F7B125', funny: '#F7B125'
          };
          textEl.style.color = colors[reaction] || '';
        }
        
        const icon = btn.querySelector('.interaction-btn__icon');
        if (icon) {
          icon.style.animation = 'none';
          icon.offsetHeight;
          icon.style.animation = 'likeHeart 0.35s ease';
        }
        const _dn = {like:'Like', love:'Love', care:'Care', haha:'Haha', wow:'Wow', sad:'Sad', angry:'Angry', celebrate:'Haha', support:'Care', insightful:'Wow', funny:'Sad'};
        showToast(`You reacted with ${_dn[reaction] || reaction}!`);
      } else {
        btn.classList.remove('interaction-btn--active');
        btn.classList.remove('has-custom');
        const textEl = btn.querySelector('.interaction-btn__text');
        if (textEl) { textEl.textContent = 'Like'; textEl.style.color = ''; }
        showToast('Reaction removed');
      }
    }
    
    if (countEl) {
      if (result.count === 0) {
        countEl.textContent = '0 Reactions';
        if (iconsEl) iconsEl.innerHTML = '';
      } else {
        countEl.textContent = result.count + (result.count === 1 ? ' Reaction' : ' Reactions');
      }
    }
  }

  // ======================== Reactions Modal ========================
  window.showReactionsModal = function(id) {
    const modal = document.getElementById('reactions-modal');
    if (!modal) return;
    
    const tabsCont = document.getElementById('reactions-modal-tabs');
    const bodyCont = document.getElementById('reactions-modal-body');
    tabsCont.innerHTML = '<div class="reactions-modal__tab active">Loading...</div>';
    bodyCont.innerHTML = '<div style="padding: 24px; text-align: center;">Loading reactions...</div>';
    
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      db.collection('reactions').doc(id).get().then(doc => {
        if (!doc.exists) {
          tabsCont.innerHTML = '';
          bodyCont.innerHTML = '<div style="padding: 24px; text-align: center;">No reactions yet</div>';
          return;
        }
        const data = doc.data();
        const total = data.count || 0;
        const types = data.reactionTypes || {};
        
        let tabsHtml = `<div class="reactions-modal__tab active" data-type="all">All ${total}</div>`;
        const sortedTypes = Object.keys(types).sort((a,b) => types[b] - types[a]);
        
        sortedTypes.forEach(type => {
           const count = types[type];
           const imgUrl = window._reactionImages && window._reactionImages[type];
           tabsHtml += `<div class="reactions-modal__tab" data-type="${type}"><img src="${imgUrl}" alt="${type}"> ${count}</div>`;
        });
        
        tabsCont.innerHTML = tabsHtml;
        
        function renderUsers(filterType) {
           let usersHtml = '';
           const profiles = data.userProfiles || {};
           const defaultPic = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='60' y1='0' x2='60' y2='120' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23C8C8CC'/%3E%3Cstop offset='1' stop-color='%238E8E93'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='60' cy='60' r='60' fill='url(%23g)'/%3E%3Ccircle cx='60' cy='46' r='18' fill='white'/%3E%3Cpath d='M24 102c0-16.57 16.12-30 36-30s36 13.43 36 30' fill='white'/%3E%3C/svg%3E";
           Object.keys(data.users || {}).forEach(uid => {
             const r = data.users[uid];
             if (filterType !== 'all' && r !== filterType) return;
             
             const rImg = window._reactionImages && window._reactionImages[r];
             const profile = profiles[uid] || {};
             const pImg = profile.photo || defaultPic;
             const pName = profile.name || 'Member';
             
             usersHtml += `
               <div class="reactions-modal__user">
                 <div style="position: relative;">
                   <img src="${pImg}" class="reactions-modal__user-pic" alt="${pName}" referrerpolicy="no-referrer">
                   <img src="${rImg}" class="reactions-modal__user-icon" alt="${r}">
                 </div>
                 <div>
                   <div class="reactions-modal__user-name">${pName}</div>
                   <div class="reactions-modal__user-desc">Reacted with ${({like:'Like', love:'Love', care:'Care', haha:'Haha', wow:'Wow', sad:'Sad', angry:'Angry', celebrate:'Haha', support:'Care', insightful:'Wow', funny:'Sad'}[r]) || r} on this post</div>
                 </div>
               </div>
             `;
           });
           bodyCont.innerHTML = usersHtml || '<div style="padding: 24px; text-align: center;">No members found for this reaction.</div>';
        }
        
        renderUsers('all');
        
        tabsCont.querySelectorAll('.reactions-modal__tab').forEach(tab => {
          tab.addEventListener('click', function() {
            tabsCont.querySelectorAll('.reactions-modal__tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            renderUsers(this.dataset.type);
          });
        });
      });
    } else {
      const total = PortfolioDB.getLikes(id);
      tabsCont.innerHTML = `<div class="reactions-modal__tab active">All ${total}</div>`;
      bodyCont.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-text-secondary);">Firebase not connected. User details unavailable.</div>';
    }
  };

  window.closeReactionsModal = function() {
    const modal = document.getElementById('reactions-modal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  // ======================== Feed Menu ========================
  function initFeedMenus() {
    // Close all menus on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.feed-item__menu-wrapper')) {
        document.querySelectorAll('.feed-menu.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  window.toggleFeedMenu = function(id) {
    const menu = document.getElementById('feed-menu-' + id);
    if (!menu) return;
    // Close others
    document.querySelectorAll('.feed-menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
    menu.classList.toggle('open');
  };

  window.copyPostLink = function(url) {
    if (url && url.startsWith('/')) {
      url = window.location.origin + url;
    }
    
    const el = document.createElement('textarea');
    el.value = url;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    
    const selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : false;
    el.select();
    
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (err) {}
    
    document.body.removeChild(el);
    if (selected) {
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(selected);
    }
    
    document.querySelectorAll('.feed-menu.open').forEach(m => m.classList.remove('open'));
    
    if (success) {
      showToast('Link copied!');
    } else if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => showToast('Could not copy link'));
    } else {
      showToast('Could not copy link');
    }
  };

  window.downloadImage = function(url, id) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image-' + id + '.jpg';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloading image...');
    document.querySelectorAll('.feed-menu.open').forEach(m => m.classList.remove('open'));
  };

  window.downloadAsPdf = function(id) {
    const item = document.getElementById('item-' + id);
    if (!item) return;
    // Use browser print dialog as PDF export
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Post</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;}
      img{max-width:100%;height:auto;}
      .feed-item__header,.interactions,.comments-section,.feed-item__menu-wrapper,.feed-menu{display:none!important;}
      </style></head><body>${item.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    showToast('Opening print dialog...');
    document.querySelectorAll('.feed-menu.open').forEach(m => m.classList.remove('open'));
  };

  // ======================== Profile Toggle ========================
  function toggleProfile(show) {
    const profileSection = document.getElementById('profile-section');
    const feedSection = document.getElementById('feed-section');
    const sidebarLeft = document.getElementById('sidebar-left');
    const mainLayout = document.getElementById('main-layout');
    const mainFeed = document.getElementById('feed');
    
    if (!profileSection || !feedSection) return;
    showingProfile = show;

    if (show) {
      profileSection.style.display = 'block';
      feedSection.style.display = 'none';
      profileSection.classList.add('fade-in-up');
      if (mainLayout) mainLayout.classList.add('layout--profile');
      // Hide left sidebar on profile page
      if (sidebarLeft) sidebarLeft.style.display = 'none';
      // Expand main to full width for profile
      if (mainFeed) mainFeed.style.maxWidth = '100%';
    } else {
      profileSection.style.display = 'none';
      feedSection.style.display = 'block';
      if (mainLayout) mainLayout.classList.remove('layout--profile');
      if (sidebarLeft) sidebarLeft.style.display = '';
      if (mainFeed) mainFeed.style.maxWidth = '';
    }
  }

  // ======================== Navigation ========================
  function initNavigation() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href*="profile"], a[href="/#profile"], a[href="#profile"], [data-profile-link]');
      if (link && (link.getAttribute('href') || '').includes('profile') && !link.getAttribute('target')) {
        const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '';
        if (!isHome) {
          if (!link.getAttribute('href') || link.getAttribute('href') === '#profile') {
            e.preventDefault(); window.location.href = '/#profile';
          }
          return;
        }
        e.preventDefault();
        toggleProfile(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('nav__item--active'));
        document.querySelectorAll('.mobile-nav__item').forEach(n => n.classList.remove('mobile-nav__item--active'));
        const mobP = document.getElementById('mob-nav-profile');
        if (mobP) mobP.classList.add('mobile-nav__item--active');
      }
    });

    document.querySelectorAll('#nav-home, #mob-nav-home').forEach(link => {
      link.addEventListener('click', function(e) {
        const isHome = window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '';
        if (!isHome) return;
        e.preventDefault();
        toggleProfile(false);
        switchTab('all');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.querySelectorAll('.nav__item').forEach(n => n.classList.remove('nav__item--active'));
        this.classList.add('nav__item--active');
        document.querySelectorAll('.mobile-nav__item').forEach(n => n.classList.remove('mobile-nav__item--active'));
        const mobH = document.getElementById('mob-nav-home');
        if (mobH) mobH.classList.add('mobile-nav__item--active');
      });
    });
  }
  // ======================== Animations ========================
  function initAnimations() {
    document.querySelectorAll('.feed-item').forEach((item, i) => {
      item.style.animationDelay = (i * 0.08) + 's';
    });
    filterAndPaginate();
  }

  // ======================== Toast ========================
  let toastTimer = null;
  window.showToast = function(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(function() {
      toast.classList.remove('show');
      toastTimer = null;
    }, 2000);
  };

  // ======================== Chat Widget (Real-time Firebase) ========================
  let chatOpen = false;
  let chatListenerActive = false;
  let chatInitialLoad = true;
  let adminPresenceUnsub = null;
  let lastMessageCount = 0;

  function askNotificationPerm() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function playNotification(title, body) {
    if (document.hidden || !chatOpen) {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } catch(e) {}
    }

    if ("Notification" in window && Notification.permission === "granted") {
      if (document.hidden) {
        new Notification(title, { body: body, icon: '/images/profile/pushpak.jpg' });
      }
    }
  }

  // Shared read-tracking logic for both mobile and desktop
  function markChatAsRead() {
    localStorage.setItem('pp_chat_last_read', Date.now().toString());
    hideUnreadDots();
    chatOpen = true;
    if (PortfolioDB.markChatRead) PortfolioDB.markChatRead(latestMsgTime);
  }

  window.openChat = function(e) {
    if (e) e.preventDefault();
    askNotificationPerm();
    markChatAsRead();
    const widget = document.getElementById('chat-widget');
    if (widget) {
      widget.classList.add('open');
      const fab = document.getElementById('chat-fab');
      if (fab) fab.style.display = 'none';
    }
  };

  window.closeChat = function() {
    const widget = document.getElementById('chat-widget');
    if (widget) {
      widget.classList.remove('open', 'minimized');
      chatOpen = false;
      const fab = document.getElementById('chat-fab');
      if (fab) fab.style.display = '';
    }
  };

  window.toggleChatMinimize = function() {
    const widget = document.getElementById('chat-widget');
    if (widget) widget.classList.toggle('minimized');
  };

  // Sign in with Google to start chatting
  window.startChat = function() {
    askNotificationPerm();
    if (!PortfolioDB.isSignedIn()) {
      PortfolioDB.requireAuth().then(function() {
        initChatAfterAuth();
      }).catch(function(err) {
        if (err && err.code !== 'auth/popup-closed-by-user') {
          showToast('Sign-in required to chat');
        }
      });
    } else {
      initChatAfterAuth();
    }
  };

  let latestMsgTime = 0;

  function initChatAfterAuth() {
    const user = PortfolioDB.getCurrentUser();
    if (!user) return;

    // Desktop
    const onb = document.getElementById('chat-onboarding');
    const body = document.getElementById('chat-body');
    if (onb) onb.style.display = 'none';
    if (body) body.style.display = 'flex';

    // Mobile
    const mOnb = document.getElementById('mobile-chat-onboarding');
    const mMsgs = document.getElementById('mobile-chat-messages');
    const mFooter = document.getElementById('mobile-chat-footer');
    if (mOnb) mOnb.style.display = 'none';
    if (mMsgs) mMsgs.style.display = 'flex';
    if (mFooter) mFooter.style.display = 'flex';

    // Start real-time listener
    if (!chatListenerActive) {
      chatListenerActive = true;
      PortfolioDB.listenToChat(function(messages) {
        renderChatMessages(messages);
        
        var lsKey = 'chat_read_' + user.uid;
        var lr = parseInt(localStorage.getItem(lsKey) || '0', 10);
        
        var unreadMsgCount = 0;
        messages.forEach(function(m) {
          var ts = m.timestamp ? (m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) : Date.now();
          if (ts > latestMsgTime) {
            if (!chatInitialLoad && m.type === 'admin') {
              playNotification("Pushpak Prabhat (Admin)", m.text);
            }
            latestMsgTime = ts;
          }
          if (m.type === 'admin' && ts > lr) unreadMsgCount++;
        });

        chatInitialLoad = false;

        if (unreadMsgCount > 0 && !chatOpen) {
          showUnreadDots(unreadMsgCount);
        } else if (chatOpen || unreadMsgCount === 0) {
          hideUnreadDots();
          if (unreadMsgCount > 0 && chatOpen && PortfolioDB.markChatRead) {
            PortfolioDB.markChatRead(latestMsgTime);
          }
        }
      });
    }

    // Watch admin presence for online/typing status (Moved to global init)
  }

  function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    const mContainer = document.getElementById('mobile-chat-messages');

    // Get last read timestamp from localStorage
    var lastReadTime = parseInt(localStorage.getItem('pp_chat_last_read') || '0');

    // If chat is currently open, update the read timestamp so separator hides on next render
    if (chatOpen) {
      var now = Date.now();
      localStorage.setItem('pp_chat_last_read', now.toString());
      lastReadTime = now;
    }

    [container, mContainer].forEach(function(c) {
      if (!c) return;

      var isNearBottom = (c.scrollHeight - c.scrollTop - c.clientHeight) < 50;
      var currentScrollTop = c.scrollTop;

      c.innerHTML = '';
      var lastDateStr = '';
      var unreadSeparatorAdded = false;
      var unreadCount = 0;

      // Count unread messages first (only when chat is NOT open)
      if (!chatOpen) {
        messages.forEach(function(msg) {
          if (msg.type === 'admin') {
            var msgTime = msg.timestamp instanceof Date ? msg.timestamp.getTime() : 0;
            if (msgTime > lastReadTime) unreadCount++;
          }
        });
      }

      messages.forEach(function(msg) {
        var type = msg.type === 'admin' ? 'received' : 'sent';
        var d = msg.timestamp instanceof Date ? msg.timestamp : new Date();
        var dateStr = getDateLabel(d);
        
        // Date separator
        if (dateStr !== lastDateStr) {
          var sep = document.createElement('div');
          sep.className = 'chat-date-separator';
          sep.innerHTML = '<span class="chat-date-separator__text">' + dateStr + '</span>';
          c.appendChild(sep);
          lastDateStr = dateStr;
        }

        // Unread separator (before first unread admin message, only when chat is NOT open)
        if (!chatOpen && !unreadSeparatorAdded && msg.type === 'admin' && unreadCount > 0) {
          var msgTime = msg.timestamp instanceof Date ? msg.timestamp.getTime() : 0;
          if (msgTime > lastReadTime) {
            var unreadSep = document.createElement('div');
            unreadSep.className = 'chat-unread-separator';
            unreadSep.innerHTML = '<span class="chat-unread-separator__text">' + unreadCount + ' unread message' + (unreadCount > 1 ? 's' : '') + '</span>';
            c.appendChild(unreadSep);
            unreadSeparatorAdded = true;
          }
        }

        addChatBubble(msg.text, type, msg.timestamp, c);
      });

      // Maintain scroll position
      if (isNearBottom || messages.length === 0) {
        c.scrollTop = c.scrollHeight;
      } else {
        c.scrollTop = currentScrollTop;
      }

      // Configure scroll-to-bottom button
      var scrollBtn = document.getElementById(c.id === 'chat-messages' ? 'chat-scroll-bottom' : 'mobile-chat-scroll-bottom');
      if (scrollBtn && !c.dataset.scrollListenerAdded) {
        c.dataset.scrollListenerAdded = 'true';
        scrollBtn.style.display = 'none';
        c.addEventListener('scroll', function() {
          var nearBottom = (c.scrollHeight - c.scrollTop - c.clientHeight) < 50;
          scrollBtn.style.display = nearBottom ? 'none' : 'flex';
        });
      }
    });
  }

  function getDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function linkifyText(text) {
    var urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function addChatBubble(text, type, timestamp, container) {
    if (!container) return;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--' + type;
    // Auto-link URLs
    var textEl = document.createElement('span');
    textEl.innerHTML = linkifyText(text);
    bubble.appendChild(textEl);
    var time = document.createElement('span');
    time.className = 'chat-bubble__time';
    var d = timestamp instanceof Date ? timestamp : new Date();
    time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);
    container.appendChild(bubble);
  }

  function watchAdminPresence() {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const fdb = firebase.firestore();
      const adminEmail = PortfolioDB.getAdminEmail();
      console.log("[Presence] Querying for admin:", adminEmail);
      
      fdb.collection('users').where('email', '==', adminEmail).limit(1).get()
      .then(function(snap) {
        if (!snap.empty) {
          const adminUid = snap.docs[0].id;
          console.log("[Presence] Found admin UID:", adminUid);
          if (adminPresenceUnsub) adminPresenceUnsub();
          adminPresenceUnsub = PortfolioDB.watchPresence(adminUid, function(presence) {
            console.log("[Presence] Presence callback updated:", presence);
            updateAdminStatus(presence);
          });
        } else {
          console.warn("[Presence] No admin found with email:", adminEmail);
        }
      }).catch(function(err) {
        console.error("[Presence] Query failed:", err);
      });
    }
  }

  function updateAdminStatus(presence) {
    var chatDot = document.getElementById('chat-admin-dot');
    var mobileDot = document.getElementById('mobile-chat-admin-dot');
    var statusText = document.getElementById('mobile-chat-status');
    var typingEl = document.getElementById('chat-typing-indicator');
    var mTypingEl = document.getElementById('mobile-chat-typing-indicator');
    var isOnline = presence && presence.online;

    [chatDot, mobileDot].forEach(function(dot) {
      if (dot) dot.classList.toggle('online', isOnline);
    });

    if (statusText) {
      statusText.textContent = isOnline ? 'Online' : 'Offline';
      statusText.style.color = isOnline ? '#057642' : '';
    }

    if (presence && presence.typing) {
      if (typingEl) typingEl.style.display = 'flex';
      if (mTypingEl) mTypingEl.style.display = 'flex';
    } else {
      if (typingEl) typingEl.style.display = 'none';
      if (mTypingEl) mTypingEl.style.display = 'none';
    }
  }

  // Unread dots — now with count inside
  function showUnreadDots(count) {
    count = count || 1;
    var badgeText = count > 9 ? '9+' : String(count);
    ['desktop-unread-dot', 'mobile-header-unread-dot', 'mobile-nav-unread-dot'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.style.display = 'flex'; el.textContent = badgeText; }
    });
    var fab = document.getElementById('chat-fab-badge');
    if (fab) { fab.style.display = 'flex'; fab.textContent = badgeText; }
  }

  function hideUnreadDots() {
    ['desktop-unread-dot', 'mobile-header-unread-dot', 'mobile-nav-unread-dot'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var fab = document.getElementById('chat-fab-badge');
    if (fab) fab.style.display = 'none';
  }

  window.sendChatMessage = function() {
    if (!PortfolioDB.isSignedIn()) {
      showToast('Please sign in to chat');
      return;
    }
    const input = document.getElementById('chat-msg-input');
    const text = input?.value.trim();
    if (!text) return;
    PortfolioDB.sendChatMessage(text);
    input.value = '';
  };

  // Typing indicator for visitor
  document.addEventListener('DOMContentLoaded', function() {
    var typingTimer;
    function handleTyping() {
      if (PortfolioDB.isSignedIn()) {
        PortfolioDB.setTyping(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function() {
          PortfolioDB.setTyping(false);
        }, 2000);
      }
    }

    var chatInput = document.getElementById('chat-msg-input');
    if (chatInput) {
      chatInput.addEventListener('input', handleTyping);
    }
    var mobileChatInput = document.getElementById('mobile-chat-msg-input');
    if (mobileChatInput) {
      mobileChatInput.addEventListener('input', handleTyping);
    }
  });

  // (addChatBubble is defined earlier at ~line 1127 with linkify support)

  // ======================== Profile / Account Menu ========================
  window.toggleProfileMenu = function(e) {
    if (e) e.preventDefault();
    var dropdown = document.getElementById('account-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      var content = document.getElementById('account-dropdown-content');
      var user = PortfolioDB.getCurrentUser ? PortfolioDB.getCurrentUser() : null;
      var isMobile = window.innerWidth < 769;
      
      var moonIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      var signOutIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
      var signInIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';

      var linkIcons = {
        person: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
        briefcase: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
        mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
        link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px;flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'
      };

      // Build owner links from profile.yaml data
      var ownerLinksHtml = '';
      if (window.__OWNER && window.__OWNER.links) {
        window.__OWNER.links.forEach(function(l) {
          var ico = linkIcons[l.icon] || linkIcons.link;
          ownerLinksHtml += '<a class="account-dropdown__item" href="' + l.url + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">' + ico + '<span>' + l.title + '</span></a>';
        });
      }

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var toggleHtml = '<div class="account-dropdown__toggle ' + (isDark ? 'active' : '') + '"><div class="account-dropdown__toggle-knob"></div></div>';

      if (user) {
        content.innerHTML = 
          '<div class="account-dropdown__header">' +
            '<img src="' + (user.photo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='60' y1='0' x2='60' y2='120' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23C8C8CC'/%3E%3Cstop offset='1' stop-color='%238E8E93'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='60' cy='60' r='60' fill='url(%23g)'/%3E%3Ccircle cx='60' cy='46' r='18' fill='white'/%3E%3Cpath d='M24 102c0-16.57 16.12-30 36-30s36 13.43 36 30' fill='white'/%3E%3C/svg%3E") + '" class="account-dropdown__header-avatar" referrerpolicy="no-referrer">' +
            '<div class="account-dropdown__header-info">' +
              '<div style="display:flex;align-items:center;gap:6px;"><strong>' + user.name + '</strong></div>' +
              '<span class="account-dropdown__header-email">' + (user.email || '') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="account-dropdown__divider"></div>' +
          ownerLinksHtml +
          '<div class="account-dropdown__divider"></div>' +
          '<button class="account-dropdown__item" onclick="toggleTheme(); toggleProfileMenu();">' + moonIcon + '<span style="flex:1;">Dark mode</span>' + toggleHtml + '</button>' +
          '<div class="account-dropdown__divider"></div>' +
          '<button class="account-dropdown__item" onclick="PortfolioDB.signOut().then(function(){location.reload();})">' + signOutIcon + '<span>Logout</span></button>';
      } else {
        content.innerHTML = 
          ownerLinksHtml +
          (ownerLinksHtml ? '<div class="account-dropdown__divider"></div>' : '') +
          '<button class="account-dropdown__item" onclick="toggleTheme(); toggleProfileMenu();">' + moonIcon + '<span style="flex:1;">Dark mode</span>' + toggleHtml + '</button>' +
          '<div class="account-dropdown__divider"></div>' +
          '<button class="account-dropdown__item" onclick="PortfolioDB.requireAuth().catch(function(){}); toggleProfileMenu();">' + signInIcon + '<span>Sign in with Google</span></button>';
      }
      dropdown.style.display = 'block';
    } else {
      dropdown.style.display = 'none';
    }
  };

  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#nav-me, #mobile-profile-btn, #account-dropdown')) {
      var dropdown = document.getElementById('account-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    }
  });

  // On auth state change — update UI everywhere
  window.addEventListener('authStateChanged', function(e) {
    var user = e.detail.user;
    if (user) {
      // Update profile pics in header and comments to show user's Google profile pic
      function updateAvatar(el, photoUrl) {
        if (!el || !photoUrl) return;
        if (el.tagName.toLowerCase() === 'svg') {
          var img = document.createElement('img');
          img.src = photoUrl;
          if (el.id) img.id = el.id;
          img.className = el.className.baseVal || el.className;
          if (el.getAttribute('width')) img.setAttribute('width', el.getAttribute('width'));
          if (el.getAttribute('height')) img.setAttribute('height', el.getAttribute('height'));
          img.setAttribute('referrerpolicy', 'no-referrer');
          img.style.objectFit = 'cover';
          img.style.borderRadius = '50%';
          el.parentNode.replaceChild(img, el);
        } else if (el.tagName.toLowerCase() === 'img') {
          el.src = photoUrl;
        }
      }

      updateAvatar(document.getElementById('desktop-profile-pic'), user.photo);
      updateAvatar(document.getElementById('mobile-profile-pic'), user.photo);
      document.querySelectorAll('.comment-avatar').forEach(function(el) {
        updateAvatar(el, user.photo);
      });

      // Update Me label
      var meLabel = document.getElementById('desktop-me-label');
      if (meLabel) meLabel.textContent = user.name.split(' ')[0] + ' \u25be';

      // Update chat onboarding — auto-skip if already signed in
      document.querySelectorAll('.chat-widget__start-btn').forEach(function(btn) {
        btn.textContent = 'Start Chat as ' + user.name;
      });

      // Auto-init chat (show chat body, hide onboarding)
      initChatAfterAuth();
    }
  });

  // ======================== Profile Preview Modal ========================
  window.openProfilePreview = function(imageUrl) {
    const modal = document.getElementById('profile-preview-modal');
    const img = document.getElementById('profile-preview-img');
    if (modal && img) {
      img.src = imageUrl;
      modal.classList.add('open');
    }
  };

  window.closeProfilePreview = function() {
    const modal = document.getElementById('profile-preview-modal');
    if (modal) modal.classList.remove('open');
  };

  // Escape key closes
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeProfilePreview();
      closeMobileChat();
    }
  });

  // ======================== Mobile Chat (Full Page) ========================
  const isMobileDevice = function() {
    return window.innerWidth <= 767;
  };

  // Override openChat for mobile
  const origOpenChat = window.openChat;
  window.openChat = function(e) {
    if (e) e.preventDefault();
    // Always run read-tracking logic
    markChatAsRead();
    askNotificationPerm();
    if (isMobileDevice()) {
      openMobileChat();
    } else {
      const widget = document.getElementById('chat-widget');
      if (widget) {
        widget.classList.add('open');
        const fab = document.getElementById('chat-fab');
        if (fab) fab.style.display = 'none';
      }
    }
  };

  function openMobileChat() {
    const page = document.getElementById('mobile-chat-page');
    if (page) {
      page.classList.add('open');
      // Prevent body from scrolling behind the chat
      document.body.style.overflow = 'hidden';
    }
    askNotificationPerm();

    // VisualViewport fallback: reposition header/footer when keyboard resizes viewport
    if (window.visualViewport) {
      var chatPage = document.getElementById('mobile-chat-page');
      function onViewportResize() {
        if (!chatPage || !chatPage.classList.contains('open')) return;
        var vv = window.visualViewport;
        // Offset from top of page that the visual viewport starts
        var offsetTop = vv.offsetTop;
        var vpHeight = vv.height;
        chatPage.style.top = offsetTop + 'px';
        chatPage.style.height = vpHeight + 'px';
      }
      window.visualViewport.addEventListener('resize', onViewportResize);
      window.visualViewport.addEventListener('scroll', onViewportResize);
    }
  }

  window.closeMobileChat = function() {
    const page = document.getElementById('mobile-chat-page');
    if (page) {
      page.classList.remove('open');
      // Reset any visualViewport adjustments
      page.style.top = '';
      page.style.height = '';
      document.body.style.overflow = '';
    }
  };

  window.startMobileChat = function() {
    askNotificationPerm();
    if (!PortfolioDB.isSignedIn()) {
      PortfolioDB.requireAuth().then(function() {
        initChatAfterAuth();
        openMobileChat();
      }).catch(function() {
        showToast('Sign-in required to chat');
      });
    } else {
      initChatAfterAuth();
    }
  };

  window.sendMobileChatMessage = function() {
    if (!PortfolioDB.isSignedIn()) {
      showToast('Please sign in to chat');
      return;
    }
    const input = document.getElementById('mobile-chat-msg-input');
    const text = input?.value.trim();
    if (!text) return;
    PortfolioDB.sendChatMessage(text);
    input.value = '';
    // Keep keyboard open by refocusing immediately
    if (input) {
      setTimeout(function() { input.focus(); }, 50);
    }
  };



  // ======================== Featured Section ========================
  window.showAllFeatured = function() {
    toggleProfile(false);
    switchTab('all');
    // Show only featured items (first 3 of any type for now)
    const items = document.querySelectorAll('.feed-item');
    items.forEach((item, i) => {
      if (item.dataset.featured === 'true' || i < 3) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Showing featured posts');
  };

  // ======================== Text Truncation See More/Less ========================
  window.initSeeMoreText = function() {
    document.querySelectorAll('.js-see-more:not(.initialized-see-more)').forEach(function(el) {
      el.classList.add('initialized-see-more');
      
      var innerLink = el.querySelector('a');
      var linkHref = innerLink ? innerLink.href : null;
      var fullText = el.textContent.trim();
      
      // Line-based: 2 lines desktop, 3 lines mobile
      var isMobile = window.innerWidth < 769;
      var maxLines = isMobile ? 3 : 2;
      
      var computedStyle = window.getComputedStyle(el);
      var lineHeight = parseFloat(computedStyle.lineHeight) || (parseFloat(computedStyle.fontSize) * 1.5);
      var maxHeight = lineHeight * maxLines;
      
      el.style.overflow = 'hidden';
      var actualHeight = el.scrollHeight;
      
      if (actualHeight <= maxHeight + 2) { el.style.overflow = ''; return; }
      
      el.dataset.fullText = fullText;
      
      // Binary search for cutoff — test with inline "... see more" placeholder
      var lo = 0, hi = fullText.length;
      var placeholder = '... see more';
      
      while (lo < hi) {
        var mid = Math.floor((lo + hi) / 2);
        el.textContent = fullText.substring(0, mid) + placeholder;
        if (el.scrollHeight > maxHeight + 2) {
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
      
      var cutoff = Math.max(lo - 1, 20);
      var truncated = fullText.substring(0, cutoff).trim();
      el.dataset.truncatedText = truncated;
      el.style.overflow = '';
      
      // Render: truncated text + inline "... see more" span
      function renderTruncated() {
        if (linkHref) {
          el.innerHTML = '<a href="' + linkHref + '" class="feed-item__text-link">' + truncated + '...</a> <span class="see-more-toggle" role="button" tabindex="0">see more</span>';
        } else {
          el.innerHTML = truncated + '... <span class="see-more-toggle" role="button" tabindex="0">see more</span>';
        }
      }
      
      function renderFull() {
        if (linkHref) {
          el.innerHTML = '<a href="' + linkHref + '" class="feed-item__text-link">' + fullText + '</a> <span class="see-more-toggle" role="button" tabindex="0">see less</span>';
        } else {
          el.innerHTML = fullText + ' <span class="see-more-toggle" role="button" tabindex="0">see less</span>';
        }
      }
      
      renderTruncated();
      
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('see-more-toggle')) {
          e.stopPropagation();
          e.preventDefault();
          if (e.target.textContent === 'see more') {
            renderFull();
          } else {
            renderTruncated();
          }
        }
      });
    });
  };
  
  // Call immediately on load
  initSeeMoreText();

  // ======================== Dynamic Duration Calculation ========================
  window.initDynamicDuration = function() {
    document.querySelectorAll('.js-calc-duration').forEach(el => {
      const startStr = el.dataset.start;
      const endStr = el.dataset.end;
      if (!startStr) return;
      
      const parseDate = (dStr) => {
        if (!dStr || dStr.toLowerCase() === 'present' || dStr.toLowerCase() === 'current') return new Date();
        const pd = new Date(dStr);
        return isNaN(pd.getTime()) ? null : pd;
      };

      const startDate = parseDate(startStr);
      let endDate = parseDate(endStr);
      
      if (!startDate) return;
      if (!endDate) endDate = new Date();
      
      // Calculate diff in months
      let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
      months -= startDate.getMonth();
      months += endDate.getMonth();
      
      // Add 1 to make it inclusive (e.g., matching LinkedIn's Jan to Jan = 1 month logic)
      months += 1;
      
      if (months <= 0) return;
      
      const yrs = Math.floor(months / 12);
      const mos = months % 12;
      
      let durStr = '';
      if (yrs > 0) durStr += yrs + (yrs === 1 ? ' yr' : ' yrs');
      if (mos > 0) durStr += (yrs > 0 ? ' ' : '') + mos + (mos === 1 ? ' mo' : ' mos');
      
      el.textContent = ' · ' + durStr;
    });
  };
  initDynamicDuration();

  // ======================== Dark Mode Toggle ========================
  function updateThemeColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    // Update both light and dark theme-color meta tags
    if (metas.length >= 2) {
      metas[0].content = isDark ? '#000000' : '#F2F2F7';
      metas[1].content = isDark ? '#000000' : '#F2F2F7';
    } else if (metas.length === 1) {
      metas[0].content = isDark ? '#000000' : '#F2F2F7';
    }
  }

  window.toggleTheme = function() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeColor();
    updateThemeToggleIcons(newTheme);
    
    // Animate the toggle button
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.style.animation = 'none';
      btn.offsetHeight;
      btn.style.animation = 'iosBounce 0.4s ease';
    }
    const profileBtn = document.querySelector('.profile-full__theme-toggle');
    if (profileBtn) {
      profileBtn.style.animation = 'none';
      profileBtn.offsetHeight;
      profileBtn.style.animation = 'iosBounce 0.4s ease';
    }
  };

  function updateThemeToggleIcons(theme) {
    document.querySelectorAll('.theme-toggle__moon').forEach(el => {
      el.style.display = theme === 'dark' ? 'none' : 'inline-flex';
    });
    document.querySelectorAll('.theme-toggle__sun').forEach(el => {
      el.style.display = theme === 'dark' ? 'inline-flex' : 'none';
    });
  }
  // Init on load
  updateThemeToggleIcons(document.documentElement.getAttribute('data-theme') || 'light');

  // Listen for system dark mode changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      // Only auto-switch if user hasn't set a manual preference
      const stored = localStorage.getItem('theme');
      if (!stored) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateThemeColor();
      }
    });
  }

  // ======================== NOTIFICATION SYSTEM ========================
  window.toggleNotifications = function(e) {
    if (e) e.preventDefault();
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) generateNotifications();
  };

  window.closeNotifications = function() {
    const panel = document.getElementById('notification-panel');
    if (panel) panel.style.display = 'none';
  };

  window.clearAllNotifications = function() {
    const list = document.getElementById('notification-list');
    const empty = document.getElementById('notif-empty');
    if (list) {
      list.querySelectorAll('.notification-item').forEach(function(item) { item.remove(); });
    }
    if (empty) empty.style.display = 'flex';
    // Update badges
    updateNotifBadge(0);
  };

  window.notifSignIn = function() {
    if (typeof PortfolioDB !== 'undefined') {
      PortfolioDB.requireAuth().then(function() {
        generateNotifications();
      });
    }
  };

  window.requestBrowserNotifPermission = function() {
    if ('Notification' in window) {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
          showToast('Browser notifications enabled!');
        }
      });
    }
  };

  function generateNotifications() {
    const list = document.getElementById('notification-list');
    const empty = document.getElementById('notif-empty');
    const signinBtn = document.getElementById('notif-signin-btn');
    const browserBtn = document.getElementById('notif-browser-btn');

    if (!list) return;

    // Remove old notification items
    list.querySelectorAll('.notification-item').forEach(function(item) { item.remove(); });

    const user = typeof PortfolioDB !== 'undefined' ? PortfolioDB.getCurrentUser() : null;

    if (!user) {
      // Not signed in
      if (empty) {
        empty.style.display = 'flex';
        document.getElementById('notif-empty-text').textContent = 'Sign in to see your notifications.';
      }
      if (signinBtn) signinBtn.style.display = 'inline-flex';
      if (browserBtn) browserBtn.style.display = 'none';
      updateNotifBadge(0);
      return;
    }

    // Signed in — check if first-time user
    const lastSignedIn = localStorage.getItem('pp_last_signed_in');
    const isNewUser = !lastSignedIn;

    // Store current sign-in time for next session
    localStorage.setItem('pp_last_signed_in', new Date().toISOString());

    if (isNewUser) {
      if (empty) {
        empty.style.display = 'flex';
        document.getElementById('notif-empty-text').textContent = 'No new notifications yet.';
      }
      if (signinBtn) signinBtn.style.display = 'none';
      if (browserBtn) {
        browserBtn.style.display = 'Notification' in window && Notification.permission !== 'granted' ? 'inline-flex' : 'none';
      }
      updateNotifBadge(0);
      return;
    }

    // Returning user — build notifications from feed items
    const lastDate = new Date(lastSignedIn);
    const notifications = [];

    document.querySelectorAll('.feed-item').forEach(function(item) {
      const timeEl = item.querySelector('.feed-item__time');
      if (!timeEl) return;

      const dateText = timeEl.textContent.trim().split('·')[0].trim();
      const itemDate = new Date(dateText);

      if (itemDate > lastDate) {
        const type = item.dataset.type || 'posts';
        const id = item.dataset.id;
        const category = item.dataset.category || '';
        const title = item.querySelector('.post-card__title a, .feed-item__text, .feed-item__text-link');
        const titleText = title ? title.textContent.trim().substring(0, 60) : 'New content';
        const thumb = item.querySelector('.feed-item__image');
        const permalink = item.querySelector('a[href]');

        notifications.push({
          type: type,
          id: id,
          title: titleText,
          category: category,
          thumb: thumb ? thumb.src : '',
          link: permalink ? permalink.href : '#',
          date: itemDate
        });
      }
    });

    // Check for unread messages
    const unreadDot = document.getElementById('desktop-unread-dot');
    if (unreadDot && unreadDot.style.display !== 'none') {
      notifications.unshift({
        type: 'message',
        title: 'You have unread messages',
        thumb: '',
        link: '#',
        date: new Date(),
        isMessage: true
      });
    }

    if (notifications.length === 0) {
      if (empty) {
        empty.style.display = 'flex';
        document.getElementById('notif-empty-text').textContent = 'You\'re all caught up!';
      }
      if (signinBtn) signinBtn.style.display = 'none';
      if (browserBtn) {
        browserBtn.style.display = 'Notification' in window && Notification.permission !== 'granted' ? 'inline-flex' : 'none';
      }
      updateNotifBadge(0);
      return;
    }

    // Hide empty state
    if (empty) empty.style.display = 'none';
    if (signinBtn) signinBtn.style.display = 'none';

    notifications.forEach(function(n) {
      const el = document.createElement('div');
      el.className = 'notification-item notification-item--unread';

      const typeIcons = { photos: '📸', videos: '🎥', posts: '📝', message: '💬' };

      el.innerHTML = '<div class="notification-item__icon">' + (typeIcons[n.type] || '📢') + '</div>' +
        '<div class="notification-item__content">' +
          '<div class="notification-item__text"><strong>Pushpak Prabhat</strong> ' +
            (n.isMessage ? n.title : 'added new ' + n.type + ': ' + n.title) +
          '</div>' +
          '<div class="notification-item__time">' + timeAgo(n.date) + '</div>' +
        '</div>' +
        (n.link !== '#' ? '<button class="notification-item__action" onclick="window.location.href=\'' + n.link + '\'">View</button>' : '');

      el.addEventListener('click', function() {
        closeNotifications();
        if (n.isMessage) { openChat(); return; }
        // Try to find and scroll to the feed item on current page
        var feedItem = n.id ? document.querySelector('.feed-item[data-id="' + n.id + '"]') : null;
        if (feedItem) {
          feedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          feedItem.style.transition = 'box-shadow 0.3s ease';
          feedItem.style.boxShadow = '0 0 0 2px var(--color-primary)';
          setTimeout(function() { feedItem.style.boxShadow = ''; }, 2000);
        } else if (n.link !== '#') {
          window.location.href = n.link;
        }
      });

      list.insertBefore(el, empty);
    });

    updateNotifBadge(notifications.length);
  }

  function updateNotifBadge(count) {
    const desktopBadge = document.getElementById('desktop-notif-badge');
    const mobileBadge = document.getElementById('mob-notif-badge');
    [desktopBadge, mobileBadge].forEach(function(b) {
      if (b) {
        b.textContent = count > 9 ? '9+' : count;
        b.style.display = count > 0 ? 'flex' : 'none';
      }
    });
  }

  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  // ======================== ENHANCED SEARCH ========================
  (function() {
    const searchInput = document.getElementById('nav-search');
    if (!searchInput) return;

    let dropdown = document.querySelector('.search-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'search-dropdown';
      dropdown.style.display = 'none';
      searchInput.parentElement.style.position = 'relative';
      searchInput.parentElement.appendChild(dropdown);
    }

    searchInput.addEventListener('input', function() {
      const query = this.value.trim().toLowerCase();
      if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
      }

      const results = [];
      document.querySelectorAll('.feed-item').forEach(function(item) {
        const text = item.textContent.toLowerCase();
        if (text.includes(query)) {
          const title = item.querySelector('.post-card__title a, .feed-item__text, .feed-item__text-link');
          const thumb = item.querySelector('.feed-item__image');
          const desc = item.querySelector('.post-card__excerpt, .feed-item__text');
          const link = item.querySelector('.post-card__title a, .feed-item__text-link');

          results.push({
            title: title ? title.textContent.trim().substring(0, 80) : 'Untitled',
            thumb: thumb ? thumb.src : '',
            desc: desc ? desc.textContent.trim().substring(0, 120) : '',
            link: link ? link.href : '#',
            type: item.dataset.type || 'post',
            element: item
          });
        }
      });

      if (results.length === 0) {
        dropdown.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-footnote);">No results found</div>';
      } else {
        dropdown.innerHTML = results.slice(0, 8).map(function(r, i) {
          return '<a href="' + r.link + '" class="search-result-item" data-index="' + i + '" style="display: flex; padding: 10px 16px; text-decoration: none; cursor: pointer;">' +
            (r.thumb ? '<img src="' + r.thumb + '" class="search-result-item__thumb" alt="">' : '<div class="search-result-item__thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:transparent;">' + (r.type === 'videos' ? '🎥' : r.type === 'photos' ? '📸' : '📝') + '</div>') +
            '<div class="search-result-item__info">' +
              '<div class="search-result-item__title">' + r.title + '</div>' +
              '<div class="search-result-item__desc">' + r.desc + '</div>' +
            '</div>' +
          '</a>';
        }).join('');
      }

        // Bind click handlers to results
        dropdown.querySelectorAll('.search-result-item').forEach(function(btn) {
          btn.addEventListener('mousedown', function(e) {
            // Prevent the search input from losing focus, which would hide the dropdown
            // before the click registers!
            e.preventDefault(); 
          });
          btn.addEventListener('click', function(e) {
            dropdown.style.display = 'none';
            searchInput.value = '';
          });
        });

      dropdown.style.display = 'block';
    });

    searchInput.addEventListener('blur', function() {
      setTimeout(function() { dropdown.style.display = 'none'; }, 200);
    });

    searchInput.addEventListener('focus', function() {
      if (this.value.trim().length >= 2) dropdown.style.display = 'block';
    });
  })();

  // ======================== CHAT IMPROVEMENTS ========================
  // Scroll to bottom button
  window.scrollChatToBottom = function() {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  };

  window.scrollMobileChatToBottom = function() {
    const msgs = document.getElementById('mobile-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  };

  // Auto-link URLs in chat text
  window.linkifyText = function(text) {
    if (!text) return text;
    return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  };

  // ======================== MOD TOOLS (inline) ========================
  window.isMod = function() {
    return typeof PortfolioDB !== 'undefined' && PortfolioDB.isAdmin && PortfolioDB.isAdmin();
  };
  window.addEventListener('authStateChanged', function(e) {
    if (e.detail && e.detail.user) {
      if (isMod()) { document.body.classList.add('mod-mode'); }
      else { document.body.classList.remove('mod-mode'); }
    }
  });

  // ======================== ADMIN INBOX (iMessage) ========================
  let adminInboxOpen = false;
  let adminCurrentConvId = null;
  let adminConversations = [];
  let adminPresenceUnsubs = {};
  const _origOpenChat = window.openChat;
  window.openChat = function(e) {
    if (e) e.preventDefault();
    if (typeof PortfolioDB !== 'undefined' && PortfolioDB.isAdmin && PortfolioDB.isAdmin()) { openAdminInbox(); return; }
    _origOpenChat && _origOpenChat(e);
  };
  window.openAdminInbox = function() {
    var inbox = document.getElementById('admin-inbox');
    if (!inbox) return;
    inbox.style.display = 'flex';
    adminInboxOpen = true;
    document.body.style.overflow = 'hidden';
    document.getElementById('admin-inbox-list-view').style.display = 'flex';
    document.getElementById('admin-inbox-chat-view').style.display = 'none';
    adminCurrentConvId = null;
    if (typeof adminUpdateChatVisibility === 'function') adminUpdateChatVisibility();
    PortfolioDB.listenToAllConversations(function(convs) { adminConversations = convs; renderAdminConvList(convs); });
  };
  window.closeAdminInbox = function() {
    var inbox = document.getElementById('admin-inbox');
    if (!inbox) return;
    inbox.style.display = 'none';
    adminInboxOpen = false;
    document.body.style.overflow = '';
    if (PortfolioDB.stopConversationListener) PortfolioDB.stopConversationListener();
    Object.values(adminPresenceUnsubs).forEach(function(fn) { if (fn) fn(); });
    adminPresenceUnsubs = {};
  };
  var _defAvatar = "data:image/svg+xml,%3Csvg viewBox='0 0 410 410' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M410 205C410 91.78 318.22 0 205 0 91.78 0 0 91.78 0 205s91.78 205 205 205 205-91.78 205-205z' fill='%23a5a5a5'/%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M83.16 332.25c27.63-38.28 72.63-63.19 123.44-63.19 50 0 94.38 24.12 122.11 61.37-31.81 31.38-75.5 50.74-123.71 50.74-47.27 0-90.2-18.62-121.84-48.92zm192.31-167.29c0 39.8-30.83 72.07-68.87 72.07s-68.87-32.27-68.87-72.07c0-39.8 30.83-72.07 68.87-72.07s68.87 32.27 68.87 72.07z' fill='white'/%3E%3C/svg%3E";
  function renderAdminConvList(conversations) {
    var container = document.getElementById('admin-inbox-conversations');
    var emptyEl = document.getElementById('admin-inbox-empty');
    if (!container) return;
    var si = document.getElementById('admin-inbox-search');
    var sq = si ? si.value.trim().toLowerCase() : '';
    var filtered = conversations;
    if (sq) { filtered = conversations.filter(function(c) { return c.userName.toLowerCase().indexOf(sq) >= 0 || c.lastMessage.toLowerCase().indexOf(sq) >= 0; }); }
    if (filtered.length === 0) { container.innerHTML = ''; if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.querySelector('p').textContent = sq ? 'No results found' : 'No conversations yet'; } return; }
    if (emptyEl) emptyEl.style.display = 'none';
    var html = '';
    filtered.forEach(function(conv) {
      var photo = conv.userPhoto || _defAvatar;
      var ts = _fmtConvTime(conv.lastTimestamp);
      var prev = conv.lastMessage || '';
      if (conv.lastMessageType === 'admin') prev = 'You: ' + prev;
      if (prev.length > 60) prev = prev.substring(0, 60) + '...';
      var ub = conv.unreadCount > 0 ? '<span class="admin-inbox__unread-badge">' + (conv.unreadCount > 9 ? '9+' : conv.unreadCount) + '</span>' : '';
      var uc = conv.unreadCount > 0 ? ' admin-inbox__item--unread' : '';
      html += '<div class="admin-inbox__item' + uc + '" onclick="openAdminConversation(\'' + conv.conversationId + '\')" data-conv-id="' + conv.conversationId + '">' +
        '<div class="admin-inbox__item-avatar-wrapper"><img src="' + photo + '" class="admin-inbox__item-avatar" alt="' + conv.userName + '" referrerpolicy="no-referrer"><span class="admin-inbox__presence-dot" id="admin-presence-' + conv.conversationId + '"></span></div>' +
        '<div class="admin-inbox__item-info"><div class="admin-inbox__item-top"><span class="admin-inbox__item-name">' + conv.userName + '</span><span class="admin-inbox__item-time">' + ts + '</span></div>' +
        '<div class="admin-inbox__item-bottom"><span class="admin-inbox__item-preview">' + prev + '</span>' + ub + '</div></div>' +
        '<span class="admin-inbox__item-chevron"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg></span></div>';
    });
    container.innerHTML = html;
    filtered.forEach(function(conv) { _watchConvP(conv.conversationId, conv.userUid); });
  }
  function adminUpdateChatVisibility() {
    var p = document.getElementById('admin-inbox-chat-placeholder');
    var h = document.getElementById('admin-inbox-chat-header');
    var m = document.getElementById('admin-inbox-chat-messages');
    var f = document.getElementById('admin-inbox-chat-footer');
    var t = document.getElementById('admin-inbox-typing-indicator');
    if (adminCurrentConvId) {
      if (p) p.style.display = 'none';
      if (h) h.style.display = 'flex';
      if (m) m.style.display = 'flex';
      if (f) f.style.display = 'flex';
    } else {
      if (p) p.style.display = 'flex';
      if (h) h.style.display = 'none';
      if (m) m.style.display = 'none';
      if (f) f.style.display = 'none';
      if (t) t.style.display = 'none';
    }
  }

  function _watchConvP(cid, uid) {
    if (!uid || adminPresenceUnsubs[cid]) return;
    if (typeof PortfolioDB !== 'undefined' && PortfolioDB.watchPresence) {
      adminPresenceUnsubs[cid] = PortfolioDB.watchPresence(uid, function(p) {
        var dot = document.getElementById('admin-presence-' + cid);
        if (dot) { dot.classList.toggle('online', !!(p && p.online)); dot.classList.toggle('offline', !(p && p.online)); }
        if (adminCurrentConvId === cid) { 
          var hd = document.getElementById('admin-inbox-chat-presence'); 
          if (hd) { hd.classList.toggle('online', !!(p && p.online)); hd.classList.toggle('offline', !(p && p.online)); } 
          var typ = document.getElementById('admin-inbox-typing-indicator');
          if (typ) { typ.style.display = (p && p.typing) ? 'flex' : 'none'; }
        }
      });
    }
  }
  function _fmtConvTime(d) {
    if (!d) return '';
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yest = new Date(today); yest.setDate(today.getDate() - 1);
    var wk = new Date(today); wk.setDate(today.getDate() - 7);
    if (d >= today) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d >= yest) return 'Yesterday';
    if (d >= wk) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  
  var adminTypingTimer;
  function handleAdminTyping() {
    if (typeof PortfolioDB !== 'undefined' && PortfolioDB.setTyping) {
      PortfolioDB.setTyping(true);
      clearTimeout(adminTypingTimer);
      adminTypingTimer = setTimeout(function() { PortfolioDB.setTyping(false); }, 3000);
    }
  }

  window.openAdminConversation = function(cid) {
    adminCurrentConvId = cid;
    adminUpdateChatVisibility();
    var conv = adminConversations.find(function(c) { return c.conversationId === cid; });
    document.getElementById('admin-inbox-list-view').style.display = 'none';
    document.getElementById('admin-inbox-chat-view').style.display = 'flex';
    var ne = document.getElementById('admin-inbox-chat-user-name');
    if (ne) ne.textContent = conv ? conv.userName : 'User';
    var ui = document.getElementById('admin-inbox-chat-user-info');
    if (ui && conv) {
      var aw = ui.querySelector('.admin-inbox__chat-avatar-wrapper');
      if (aw) aw.innerHTML = '<img src="' + (conv.userPhoto || _defAvatar) + '" class="admin-inbox__chat-avatar" referrerpolicy="no-referrer"><span class="admin-inbox__presence-dot admin-inbox__presence-dot--header" id="admin-inbox-chat-presence"></span>';
    }
    PortfolioDB.markAdminConversationRead(cid);
    if (conv) _watchConvP(cid, conv.userUid);
    PortfolioDB.listenToConversation(cid, function(msgs) { _renderAdminMsgs(msgs); });
    setTimeout(function() { var inp = document.getElementById('admin-inbox-chat-input'); if (inp) inp.focus(); }, 100);
  };
  window.adminInboxBackToList = function() {
    adminCurrentConvId = null;
    if (typeof adminUpdateChatVisibility === 'function') adminUpdateChatVisibility();
    if (PortfolioDB.stopConversationListener) PortfolioDB.stopConversationListener();
    document.getElementById('admin-inbox-list-view').style.display = 'flex';
    document.getElementById('admin-inbox-chat-view').style.display = 'none';
  };
  function _renderAdminMsgs(messages) {
    var c = document.getElementById('admin-inbox-chat-messages');
    if (!c) return;
    var wasNear = (c.scrollHeight - c.scrollTop - c.clientHeight) < 50;
    c.innerHTML = '';
    var lds = '';
    messages.forEach(function(m) {
      var ia = m.type === 'admin';
      var d = m.timestamp instanceof Date ? m.timestamp : new Date();
      var ds = getDateLabel(d);
      if (ds !== lds) {
        var sep = document.createElement('div');
        sep.className = 'admin-inbox__date-sep';
        sep.textContent = ds + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        c.appendChild(sep);
        lds = ds;
      }
      var b = document.createElement('div');
      b.className = 'admin-inbox__bubble admin-inbox__bubble--' + (ia ? 'sent' : 'received');
      var s = document.createElement('span');
      s.innerHTML = linkifyText(m.text);
      b.appendChild(s);
      c.appendChild(b);
    });
    if (wasNear || messages.length <= 1) c.scrollTop = c.scrollHeight;
  }
  window.sendAdminInboxMessage = function() {
    if (!adminCurrentConvId) return;
    var inp = document.getElementById('admin-inbox-chat-input');
    var txt = inp ? inp.value.trim() : '';
    if (!txt) return;
    PortfolioDB.sendAdminReply(adminCurrentConvId, txt);
    inp.value = '';
    inp.focus();
  };
  document.addEventListener('DOMContentLoaded', function() {
    var si = document.getElementById('admin-inbox-search');
    if (si) si.addEventListener('input', function() { renderAdminConvList(adminConversations); });
    var ci = document.getElementById('admin-inbox-chat-input');
    if (ci) ci.addEventListener('input', handleAdminTyping);
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && adminInboxOpen) {
      if (adminCurrentConvId) adminInboxBackToList();
      else closeAdminInbox();
    }
  });

})();
