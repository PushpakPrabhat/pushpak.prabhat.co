/**
 * LinkedIn Portfolio — Main JavaScript (Enhanced)
 * Handles: Tabs, Filtering, Pagination, Media Viewer, Video Viewer,
 *          Reactions, Feed Menus, Profile Toggle, Chat, Search
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
      html = `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;"></iframe>`;
    } else if (item.type === 'gdrive') {
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

  // Reaction image URLs (LinkedIn CDN and custom SVGs)
  const reactionImages = {
    'like': 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2040%2040%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2220%22%20fill%3D%22%230a66c2%22%2F%3E%3Cg%20transform%3D%22translate%288%2C%208%29%20scale%281%29%22%3E%3Cpath%20fill%3D%22%23ffffff%22%20d%3D%22M19.46%2011l-3.91-3.91a7%207%200%2001-1.69-2.74l-.49-1.47A2.76%202.76%200%200010.76%201%202.75%202.75%200%20008%203.74v1.12a9.19%209.19%200%2000.46%202.85L8.89%209H4.12A2.12%202.12%200%20002%2011.12a2.16%202.16%200%2000.92%201.76A2.11%202.11%200%20002%2014.62a2.14%202.14%200%20001.28%202%202%202%200%2000-.28%201%202.12%202.12%200%20002%202.12v.14A2.12%202.12%200%20007.12%2022h7.49a8.08%208.08%200%20003.58-.84l.31-.16H21V11z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    'celebrate': 'https://static.licdn.com/aero-v1/sc/h/b1dl5jk88euc7e9ri50xy5qo8',
    'support': 'https://static.licdn.com/aero-v1/sc/h/3wqhxqtk2l554o70ur3kessf1',
    'love': 'https://static.licdn.com/aero-v1/sc/h/f58e354mjsjpdd67eq51cuh49',
    'insightful': 'https://static.licdn.com/aero-v1/sc/h/39axkb4qe8q95ieljrhqhkxvl',
    'funny': 'https://static.licdn.com/aero-v1/sc/h/ktcgulanbxpl0foz1uckibdl'
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
        
        if (reaction === 'like') {
          btn.classList.remove('has-custom');
          if (textEl) { textEl.textContent = 'Like'; textEl.style.color = ''; }
        } else {
          btn.classList.add('has-custom');
          if (customIconEl) {
            const imgUrl = reactionImages[reaction];
            customIconEl.innerHTML = `<img src="${imgUrl}" width="20" height="20" alt="${reaction}" style="display:block;">`;
          }
          if (textEl) {
            textEl.textContent = reaction.charAt(0).toUpperCase() + reaction.slice(1);
            const colors = { 
              celebrate: '#057642', support: '#666666', 
              love: '#df704d', insightful: '#0a66c2', funny: '#0a66c2' 
            };
            textEl.style.color = colors[reaction] || '';
          }
        }
        
        const icon = btn.querySelector('.interaction-btn__icon');
        if (icon) {
          icon.style.animation = 'none';
          icon.offsetHeight;
          icon.style.animation = 'likeHeart 0.35s ease';
        }
        showToast(`You reacted with ${reaction}!`);
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
           const defaultPic = 'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20128%20128%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2264%22%20fill%3D%22%23e7e7e7%22%2F%3E%3Cpath%20d%3D%22M64%2072c13.25%200%2024-10.75%2024-24S77.25%2024%2064%2024%2040%2034.75%2040%2048s10.75%2024%2024%2024zm0%208c-16%200-48%208-48%2024v8h96v-8c0-16-32-24-48-24z%22%20fill%3D%22%23666%22%2F%3E%3C%2Fsvg%3E';
           Object.keys(data.users || {}).forEach(uid => {
             const r = data.users[uid];
             if (filterType !== 'all' && r !== filterType) return;
             
             const rImg = window._reactionImages && window._reactionImages[r];
             const profile = profiles[uid] || {};
             const pImg = profile.photo || defaultPic;
             const pName = profile.name || 'LinkedIn Member';
             
             usersHtml += `
               <div class="reactions-modal__user">
                 <div style="position: relative;">
                   <img src="${pImg}" class="reactions-modal__user-pic" alt="${pName}" referrerpolicy="no-referrer">
                   <img src="${rImg}" class="reactions-modal__user-icon" alt="${r}">
                 </div>
                 <div>
                   <div class="reactions-modal__user-name">${pName}</div>
                   <div class="reactions-modal__user-desc">Reacted with ${r.charAt(0).toUpperCase() + r.slice(1)} on this post</div>
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

  window.copyPostLink = function(id) {
    const url = window.location.origin + '/#item-' + id;
    navigator.clipboard.writeText(url).then(() => showToast('Link copied!')).catch(() => showToast('Could not copy link'));
    document.querySelectorAll('.feed-menu.open').forEach(m => m.classList.remove('open'));
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

    const searchInput = document.getElementById('nav-search');
    if (searchInput) {
      // Create search dropdown
      let dropdown = document.getElementById('search-dropdown');
      if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'search-dropdown';
        dropdown.className = 'search-dropdown';
        searchInput.parentElement.appendChild(dropdown);
      }

      searchInput.addEventListener('input', function() {
        const q = this.value.toLowerCase().trim();
        if (!q) {
          dropdown.classList.remove('open');
          filterAndPaginate();
          // Show feed
          toggleProfile(false);
          return;
        }

        // Search feed items
        const results = [];
        document.querySelectorAll('.feed-item').forEach(item => {
          const text = item.textContent.toLowerCase();
          const type = item.dataset.type || 'posts';
          const title = item.querySelector('.feed-item__author-subtitle, .post-card__title, .feed-item__text');
          const titleText = title ? title.textContent.trim().substring(0, 60) : 'Untitled';
          if (text.includes(q)) {
            const icons = { photos: '📷', videos: '🎬', posts: '📝' };
            results.push({
              type: type,
              icon: icons[type] || '📄',
              label: type.charAt(0).toUpperCase() + type.slice(1, -1),
              title: titleText,
              element: item
            });
          }
        });

        // Search experience companies
        const expItems = document.querySelectorAll('.experience-item');
        expItems.forEach(exp => {
          const text = exp.textContent.toLowerCase();
          if (text.includes(q)) {
            const company = exp.querySelector('.experience-item__company');
            const title = exp.querySelector('.experience-item__title');
            results.push({
              type: 'experience',
              icon: '🏢',
              label: 'Company',
              title: (title ? title.textContent : '') + (company ? ' · ' + company.textContent : ''),
              element: null,
              action: 'profile'
            });
          }
        });

        // Build dropdown
        if (results.length === 0) {
          dropdown.innerHTML = '<div class="search-no-results"><div class="search-no-results__icon">🔍</div><div class="search-no-results__text">No results found</div><div class="search-no-results__hint">Try searching for something else</div></div>';
        } else {
          let html = '';
          results.slice(0, 8).forEach((r, i) => {
            html += '<button class="search-result-item" data-index="' + i + '">' +
              '<span class="search-result-item__icon">' + r.icon + '</span>' +
              '<span class="search-result-item__text">' + r.title.substring(0, 50) + '</span>' +
              '<span class="search-result-item__badge">' + r.label + '</span>' +
              '</button>';
          });
          dropdown.innerHTML = html;

          // Click handlers
          dropdown.querySelectorAll('.search-result-item').forEach((btn, i) => {
            btn.addEventListener('click', function() {
              const r = results[i];
              dropdown.classList.remove('open');
              searchInput.value = '';
              if (r.action === 'profile') {
                toggleProfile(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else if (r.element) {
                toggleProfile(false);
                filterAndPaginate();
                // Show all items, scroll to match
                document.querySelectorAll('.feed-item').forEach(it => it.style.display = 'block');
                r.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                r.element.style.boxShadow = '0 0 0 3px var(--color-primary)';
                setTimeout(() => { r.element.style.boxShadow = ''; }, 2000);
              }
            });
          });
        }

        dropdown.classList.add('open');

        // Also filter feed items
        document.querySelectorAll('.feed-item').forEach(item => {
          item.style.display = item.textContent.toLowerCase().includes(q) ? 'block' : 'none';
        });
      });

      // Close dropdown on outside click
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.nav__search')) {
          dropdown.classList.remove('open');
        }
      });

      // Close on Escape
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          dropdown.classList.remove('open');
          this.value = '';
          filterAndPaginate();
        }
      });
    }
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
  let adminPresenceUnsub = null;
  let lastMessageCount = 0;

  window.openChat = function(e) {
    if (e) e.preventDefault();
    const widget = document.getElementById('chat-widget');
    if (widget) {
      widget.classList.add('open');
      chatOpen = true;
      const fab = document.getElementById('chat-fab');
      if (fab) fab.style.display = 'none';
      // Clear unread dots and mark as read
      hideUnreadDots();
      if (PortfolioDB.markChatRead) PortfolioDB.markChatRead(latestMsgTime);
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
        
        var hasUnread = false;
        messages.forEach(function(m) {
          var ts = m.timestamp ? (m.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m.timestamp).getTime()) : Date.now();
          if (ts > latestMsgTime) latestMsgTime = ts;
          if (m.type === 'admin' && ts > lr) hasUnread = true;
        });

        if (hasUnread && !chatOpen) {
          showUnreadDots();
        } else if (chatOpen || !hasUnread) {
          hideUnreadDots();
          if (hasUnread && chatOpen && PortfolioDB.markChatRead) {
            PortfolioDB.markChatRead(latestMsgTime);
          }
        }
      });
    }

    // Watch admin presence for online/typing status
    watchAdminPresence();
  }

  function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    const mContainer = document.getElementById('mobile-chat-messages');

    if (container) {
      container.innerHTML = '';
      messages.forEach(function(msg) {
        const type = msg.type === 'admin' ? 'received' : 'sent';
        addChatBubble(msg.text, type, msg.timestamp, container);
      });
    }

    if (mContainer) {
      mContainer.innerHTML = '';
      messages.forEach(function(msg) {
        const type = msg.type === 'admin' ? 'received' : 'sent';
        addChatBubble(msg.text, type, msg.timestamp, mContainer);
      });
    }
  }

  function watchAdminPresence() {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      const fdb = firebase.firestore();
      fdb.collection('users').where('email', '==', PortfolioDB.getAdminEmail()).limit(1).get().then(function(snap) {
        if (!snap.empty) {
          const adminUid = snap.docs[0].id;
          if (adminPresenceUnsub) adminPresenceUnsub();
          adminPresenceUnsub = PortfolioDB.watchPresence(adminUid, function(presence) {
            updateAdminStatus(presence);
          });
        }
      }).catch(function() {});
    }
  }

  function updateAdminStatus(presence) {
    // Desktop chat dot
    var chatDot = document.getElementById('chat-admin-dot');
    // Mobile chat dots
    var mobileDot = document.getElementById('mobile-chat-admin-dot');
    var statusText = document.getElementById('mobile-chat-status');

    // Typing indicators
    var typingEl = document.getElementById('chat-typing-indicator');
    var mTypingEl = document.getElementById('mobile-chat-typing-indicator');

    var isOnline = presence && presence.online;

    [chatDot, mobileDot].forEach(function(dot) {
      if (dot) {
        dot.classList.toggle('online', isOnline);
      }
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

  // Unread dots
  function showUnreadDots() {
    ['desktop-unread-dot', 'mobile-header-unread-dot', 'mobile-nav-unread-dot'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
    // Also show on FAB badge
    var fab = document.getElementById('chat-fab-badge');
    if (fab) { fab.style.display = 'flex'; fab.textContent = '!'; }
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

  function addChatBubble(text, type, timestamp, container) {
    if (!container) return;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble--' + type;
    bubble.textContent = text;
    var time = document.createElement('span');
    time.className = 'chat-bubble__time';
    var d = timestamp instanceof Date ? timestamp : new Date();
    time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  // ======================== Profile / Account Menu ========================
  window.toggleProfileMenu = function(e) {
    if (e) e.preventDefault();
    var dropdown = document.getElementById('account-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      var content = document.getElementById('account-dropdown-content');
      var user = PortfolioDB.getCurrentUser ? PortfolioDB.getCurrentUser() : null;

      if (user) {
        content.innerHTML = 
          '<div class="account-dropdown__item" style="cursor:default;">' +
            '<img src="' + (user.photo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Cpath fill='%23e7e2dc' d='M0 0h128v128H0z'/%3E%3Cpath fill='%23788fa5' d='M88.41 84.67a32 32 0 1 0-48.82 0 66.13 66.13 0 0 1 48.82 0'/%3E%3Cpath fill='%239db3c8' d='M88.41 84.67a32 32 0 0 1-48.82 0A66.79 66.79 0 0 0 0 128h128a66.79 66.79 0 0 0-39.59-43.33'/%3E%3Cpath fill='%2356687a' d='M64 96a31.93 31.93 0 0 0 24.41-11.33 66.13 66.13 0 0 0-48.82 0A31.93 31.93 0 0 0 64 96'/%3E%3C/svg%3E") + '" class="account-dropdown__avatar" referrerpolicy="no-referrer">' +
            '<div><strong>' + user.name + '</strong><br><span style="font-size:12px;color:var(--color-text-secondary);">' + (user.email || '') + '</span></div>' +
          '</div>' +
          '<div class="account-dropdown__divider"></div>' +
          '<button class="account-dropdown__item" onclick="PortfolioDB.signOut().then(function(){location.reload();})">' +
            '\ud83d\udeaa Sign Out' +
          '</button>';
      } else {
        content.innerHTML = 
          '<button class="account-dropdown__item" onclick="PortfolioDB.requireAuth().catch(function(){}); toggleProfileMenu();">' +
            '\ud83d\udd11 Sign in with Google' +
          '</button>';
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
      // Update profile pics in header to show user's Google profile pic
      var desktopPic = document.getElementById('desktop-profile-pic');
      var mobilePic = document.getElementById('mobile-profile-pic');
      if (desktopPic && user.photo) desktopPic.src = user.photo;
      if (mobilePic && user.photo) mobilePic.src = user.photo;

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
    if (isMobileDevice()) {
      openMobileChat();
    } else {
      const widget = document.getElementById('chat-widget');
      if (widget) {
        widget.classList.add('open');
        chatOpen = true;
        const fab = document.getElementById('chat-fab');
        if (fab) fab.style.display = 'none';
      }
    }
  };

  function openMobileChat() {
    const page = document.getElementById('mobile-chat-page');
    if (page) page.classList.add('open');
  }

  window.closeMobileChat = function() {
    const page = document.getElementById('mobile-chat-page');
    if (page) page.classList.remove('open');
  };

  window.startMobileChat = function() {
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
    const charLimit = 160;
    document.querySelectorAll('.js-see-more:not(.initialized-see-more)').forEach(el => {
      el.classList.add('initialized-see-more');
      
      const fullText = el.textContent.trim();
      if (fullText.length > charLimit) {
        const truncatedText = fullText.substring(0, charLimit).trim() + '...';
        
        const textNode = document.createElement('span');
        textNode.textContent = truncatedText;
        
        el.dataset.fullText = fullText;
        el.dataset.truncatedText = truncatedText;
        el.innerHTML = '';
        el.appendChild(textNode);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'see-more-toggle';
        toggleBtn.textContent = 'see more';
        toggleBtn.style.color = 'var(--color-text-secondary)';
        toggleBtn.style.background = 'transparent';
        toggleBtn.style.border = 'none';
        toggleBtn.style.padding = '0 0 0 2px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.fontWeight = '600';
        toggleBtn.style.display = 'inline';
        
        toggleBtn.addEventListener('click', function(e) {
          e.stopPropagation(); // prevent card clicks
          const isTruncated = (textNode.textContent === el.dataset.truncatedText);
          if (isTruncated) {
            textNode.textContent = el.dataset.fullText;
            this.textContent = 'see less';
          } else {
            textNode.textContent = el.dataset.truncatedText;
            this.textContent = 'see more';
          }
        });
        
        // Append toggle inside the element right after the text
        el.appendChild(toggleBtn);
      }
    });
  };
  
  // Call immediately on load
  initSeeMoreText();

})();
