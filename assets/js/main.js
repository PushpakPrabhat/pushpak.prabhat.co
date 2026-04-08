/* ============================================
   Instagram-Inspired Portfolio — Main JavaScript
   ============================================ */

/* ===== GLOBAL STATE ===== */
const state = {
  currentPage: 'home',      // home | profile | reels | explore
  currentTab: 'all',        // feed tabs
  currentCategory: null,
  itemsPerPage: 6,
  shownItems: 0,
  allItems: [],
  filteredItems: [],
  isAdmin: false,
  searchHistory: JSON.parse(localStorage.getItem('ig-search-history') || '[]'),
  pinnedPosts: JSON.parse(localStorage.getItem('ig-pinned-posts') || '[]'),
  searchPanelOpen: false,
  currentProfileTab: 'grid',
};

/* ===== INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  collectFeedItems();
  filterAndPaginate();
  initSeeMore();
  initFeedTabs();
  initCategoryChips();
  initCarousels();
  initMediaViewer();
  initVideoViewer();
  observePostAnimations();
  initSearch();
  applyPinnedBadges();
  initContextProtection();
  initAdminThemeIcons();
  
  // Comment input show/hide post button
  document.querySelectorAll('.ig-comments__input').forEach(input => {
    input.addEventListener('input', function() {
      const btn = this.parentElement.querySelector('.ig-comments__post-btn');
      if (btn) btn.style.display = this.value.trim() ? 'block' : 'none';
    });
  });
  
  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    // Close feed menus
    document.querySelectorAll('.ig-feed-menu.open').forEach(m => {
      if (!m.parentElement.contains(e.target)) m.classList.remove('open');
    });
    // Close more menu
    const moreMenu = document.getElementById('ig-more-menu');
    const moreBtn = document.getElementById('nav-more');
    if (moreMenu && moreMenu.style.display !== 'none' && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
      moreMenu.style.display = 'none';
    }
    // Close user menu
    const userMenu = document.getElementById('ig-user-menu');
    if (userMenu && userMenu.style.display !== 'none' && !userMenu.contains(e.target)) {
      userMenu.style.display = 'none';
    }
    // Close search panel on outside click
    const search = document.getElementById('ig-search-panel');
    const searchBtn = document.getElementById('nav-search');
    if (search && search.classList.contains('open') && !search.contains(e.target) && !searchBtn?.contains(e.target)) {
      search.classList.remove('open');
      state.searchPanelOpen = false;
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStoryViewer();
      closeMediaViewer();
      closeVideoViewer();
      closeCreateModal();
      closeAuthModal();
      closeReactionsModal();
      closeProfilePreview();
      const search = document.getElementById('ig-search-panel');
      if (search) { search.classList.remove('open'); state.searchPanelOpen = false; }
    }
  });
});

/* ===== THEME MANAGEMENT ===== */
function initTheme() {
  const theme = localStorage.getItem('ig-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcons(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ig-theme', next);
  updateThemeIcons(next);
}

function updateThemeIcons(theme) {
  document.querySelectorAll('.theme-icon-dark').forEach(el => {
    el.style.display = theme === 'dark' ? 'flex' : 'none';
  });
  document.querySelectorAll('.theme-icon-light').forEach(el => {
    el.style.display = theme === 'light' ? 'flex' : 'none';
  });
}

function initAdminThemeIcons() {
  // Show correct theme icon initially
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeIcons(theme);
}

/* ===== FEED SYSTEM ===== */
function collectFeedItems() {
  state.allItems = Array.from(document.querySelectorAll('.ig-post'));
  state.allItems.forEach(item => {
    item.style.display = 'none';
    item.style.opacity = '0';
  });
}

function filterAndPaginate() {
  const tab = state.currentTab;
  const category = state.currentCategory;
  
  let items = [...state.allItems];
  
  // Filter by tab
  if (tab !== 'all') {
    items = items.filter(item => item.dataset.type === tab);
  }
  
  // Filter by category
  if (category && !category.startsWith('all-')) {
    items = items.filter(item => item.dataset.category === category);
  }
  
  // Sort pinned first
  items.sort((a, b) => {
    const aPinned = state.pinnedPosts.includes(a.dataset.id);
    const bPinned = state.pinnedPosts.includes(b.dataset.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });
  
  state.filteredItems = items;
  state.shownItems = 0;
  
  // Hide all items
  state.allItems.forEach(item => {
    item.style.display = 'none';
    item.style.opacity = '0';
  });
  
  loadMore();
}

function loadMore() {
  const start = state.shownItems;
  const end = start + state.itemsPerPage;
  const toShow = state.filteredItems.slice(start, end);
  
  toShow.forEach((item, i) => {
    setTimeout(() => {
      item.style.display = 'block';
      item.style.animation = `fadeIn 0.3s ease forwards`;
    }, i * 60);
  });
  
  state.shownItems = end;
  
  // Toggle load more button
  const loadMoreBtn = document.getElementById('load-more-wrapper');
  if (loadMoreBtn) {
    loadMoreBtn.style.display = state.shownItems >= state.filteredItems.length ? 'none' : 'block';
  }
}

/* ===== FEED TABS ===== */
function initFeedTabs() {
  document.querySelectorAll('.ig-feed-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.ig-feed-tab').forEach(t => t.classList.remove('ig-feed-tab--active'));
      this.classList.add('ig-feed-tab--active');
      
      state.currentTab = this.dataset.tab;
      state.currentCategory = null;
      
      // Show/hide category filters
      document.getElementById('photo-categories').classList.remove('active');
      document.getElementById('video-categories').classList.remove('active');
      
      if (state.currentTab === 'photos') {
        document.getElementById('photo-categories').classList.add('active');
      } else if (state.currentTab === 'videos') {
        document.getElementById('video-categories').classList.add('active');
      }
      
      // Reset category selection
      document.querySelectorAll('.ig-category-chip').forEach(c => c.classList.remove('ig-category-chip--active'));
      document.querySelectorAll('.ig-category-chip[data-category^="all-"]').forEach(c => c.classList.add('ig-category-chip--active'));
      
      filterAndPaginate();
    });
  });
}

/* ===== CATEGORY CHIPS ===== */
function initCategoryChips() {
  document.querySelectorAll('.ig-category-chip').forEach(chip => {
    chip.addEventListener('click', function() {
      const parent = this.parentElement;
      parent.querySelectorAll('.ig-category-chip').forEach(c => c.classList.remove('ig-category-chip--active'));
      this.classList.add('ig-category-chip--active');
      state.currentCategory = this.dataset.category;
      filterAndPaginate();
    });
  });
}

/* ===== CAROUSEL ===== */
function initCarousels() {
  document.querySelectorAll('.ig-carousel').forEach(carousel => {
    const track = carousel.querySelector('.ig-carousel__track');
    if (!track) return;
    
    // Touch/swipe support
    let startX = 0, startY = 0, isDragging = false;
    
    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });
    
    track.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      const id = carousel.id.replace('carousel-', '');
      if (Math.abs(diff) > 50) {
        carouselNav(id, diff > 0 ? 1 : -1);
      }
    }, { passive: true });
  });
}

function carouselNav(id, dir) {
  const carousel = document.getElementById(`carousel-${id}`);
  if (!carousel) return;
  
  const track = carousel.querySelector('.ig-carousel__track');
  const slides = carousel.querySelectorAll('.ig-carousel__slide');
  const dots = carousel.querySelectorAll('.ig-carousel__dot');
  const prevBtn = carousel.querySelector('.ig-carousel__btn--prev');
  const nextBtn = carousel.querySelector('.ig-carousel__btn--next');
  
  let idx = parseInt(carousel.dataset.index || 0) + dir;
  idx = Math.max(0, Math.min(idx, slides.length - 1));
  carousel.dataset.index = idx;
  
  track.style.transform = `translateX(-${idx * 100}%)`;
  
  dots.forEach((d, i) => d.classList.toggle('ig-carousel__dot--active', i === idx));
  if (prevBtn) prevBtn.style.display = idx === 0 ? 'none' : 'flex';
  if (nextBtn) nextBtn.style.display = idx === slides.length - 1 ? 'none' : 'flex';
}

/* ===== DOUBLE TAP TO LIKE ===== */
function doubleTapLike(contentId) {
  const heartEl = document.getElementById(`double-tap-heart-${contentId}`);
  if (!heartEl) return;
  
  heartEl.style.display = 'block';
  setTimeout(() => { heartEl.style.display = 'none'; }, 900);
  
  // Trigger like
  const likeBtn = document.getElementById(`like-btn-${contentId}`);
  if (likeBtn && !likeBtn.classList.contains('ig-action-btn--active')) {
    if (typeof window.toggleLike === 'function') {
      window.toggleLike(contentId);
    }
  }
}

/* ===== SEE MORE / LESS ===== */
function initSeeMore() {
  document.querySelectorAll('.js-see-more').forEach(el => {
    const text = el.textContent.trim();
    if (text.length > 120) {
      const short = text.substring(0, 120);
      el.dataset.full = text;
      el.innerHTML = short + '<span class="see-more-btn" onclick="expandText(this)">... more</span>';
    }
  });
}

function expandText(btn) {
  const parent = btn.parentElement;
  if (parent.dataset.full) {
    parent.textContent = parent.dataset.full;
  }
}

/* ===== NAVIGATION ===== */
function navigateToProfile(e) {
  if (e) e.preventDefault();
  showPage('profile');
}

function showHomeFeed(e) {
  if (e) e.preventDefault();
  showPage('home');
}

function showReelsPage(e) {
  if (e) e.preventDefault();
  showPage('reels');
}

function showExplorePage(e) {
  if (e) e.preventDefault();
  showPage('explore');
  // Load trending posts
  if (typeof loadTrendingPosts === 'function') loadTrendingPosts();
}

function showPage(page) {
  state.currentPage = page;
  
  // Hide all sections
  const sections = ['feed-section', 'profile-section', 'reels-section', 'explore-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  // Show target section
  switch (page) {
    case 'home':
      document.getElementById('feed-section').style.display = 'block';
      break;
    case 'profile':
      document.getElementById('profile-section').style.display = 'block';
      break;
    case 'reels':
      document.getElementById('reels-section').style.display = 'block';
      break;
    case 'explore':
      document.getElementById('explore-section').style.display = 'block';
      break;
  }
  
  // Update nav active states
  updateNavActive(page);
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateNavActive(page) {
  // Sidebar
  document.querySelectorAll('.ig-sidebar__item').forEach(item => {
    item.classList.remove('ig-sidebar__item--active');
    const itemPage = item.dataset.page;
    if (itemPage === page) item.classList.add('ig-sidebar__item--active');
  });
  
  // Bottom nav
  document.querySelectorAll('.ig-bottom-nav__item').forEach(item => {
    item.classList.remove('ig-bottom-nav__item--active');
  });
  
  const navMap = {
    'home': 'mob-nav-home',
    'explore': 'mob-nav-search',
    'reels': 'mob-nav-reels',
    'profile': 'mob-nav-profile'
  };
  
  const activeNavId = navMap[page];
  if (activeNavId) {
    const el = document.getElementById(activeNavId);
    if (el) el.classList.add('ig-bottom-nav__item--active');
  }
}

/* ===== PROFILE TABS ===== */
function switchProfileTab(tab) {
  state.currentProfileTab = tab;
  
  document.querySelectorAll('.ig-profile__tab').forEach(t => {
    t.classList.toggle('ig-profile__tab--active', t.dataset.profileTab === tab);
  });
  
  document.getElementById('profile-grid').style.display = tab === 'grid' ? 'grid' : 'none';
  document.getElementById('profile-reels').style.display = tab === 'reels' ? 'grid' : 'none';
  document.getElementById('profile-portfolio').style.display = tab === 'portfolio' ? 'block' : 'none';
}

function scrollToPost(postId) {
  showPage('home');
  
  setTimeout(() => {
    // Make sure the post is visible
    const post = document.getElementById(`item-${postId}`);
    if (post) {
      // Show it if hidden
      if (post.style.display === 'none') {
        // Reset filters to show all
        state.currentTab = 'all';
        state.currentCategory = null;
        document.querySelectorAll('.ig-feed-tab').forEach(t => t.classList.remove('ig-feed-tab--active'));
        const allTab = document.querySelector('.ig-feed-tab[data-tab="all"]');
        if (allTab) allTab.classList.add('ig-feed-tab--active');
        
        // Show all items temporarily
        state.allItems.forEach(item => {
          item.style.display = 'block';
          item.style.opacity = '1';
        });
      }
      
      post.scrollIntoView({ behavior: 'smooth', block: 'center' });
      post.style.animation = 'pulse 0.5s ease';
    }
  }, 100);
}

/* ===== SEARCH ===== */
function toggleSearchPanel(e) {
  if (e) e.preventDefault();
  const panel = document.getElementById('ig-search-panel');
  if (!panel) return;
  
  state.searchPanelOpen = !state.searchPanelOpen;
  panel.classList.toggle('open', state.searchPanelOpen);
  
  if (state.searchPanelOpen) {
    document.getElementById('ig-search-input').focus();
  }
}

function initSearch() {
  const input = document.getElementById('ig-search-input');
  const clearBtn = document.getElementById('ig-search-clear');
  const clearAllBtn = document.getElementById('ig-clear-recent');
  
  if (!input) return;
  
  input.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    clearBtn.style.display = q ? 'flex' : 'none';
    
    if (q.length >= 1) {
      performSearch(q);
    } else {
      document.getElementById('ig-search-results').style.display = 'none';
      document.getElementById('ig-search-recent').style.display = 'block';
    }
  });
  
  clearBtn?.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  
  clearAllBtn?.addEventListener('click', () => {
    state.searchHistory = [];
    localStorage.setItem('ig-search-history', '[]');
    renderRecentSearches();
  });
  
  renderRecentSearches();
}

function performSearch(query) {
  const results = [];
  
  state.allItems.forEach(item => {
    const id = item.dataset.id;
    const type = item.dataset.type;
    const category = item.dataset.category;
    const textContent = item.textContent.toLowerCase();
    
    if (textContent.includes(query) || (category && category.includes(query))) {
      let thumb = '';
      const img = item.querySelector('.ig-post__image, .ig-carousel__slide img');
      if (img) thumb = img.src;
      
      const titleEl = item.querySelector('.ig-post__caption-title, .ig-post__caption-text');
      const title = titleEl ? titleEl.textContent.substr(0, 50) : id;
      
      results.push({ id, type, category, thumb, title });
    }
  });
  
  renderSearchResults(results);
}

function renderSearchResults(results) {
  const container = document.getElementById('ig-search-results');
  const recent = document.getElementById('ig-search-recent');
  
  recent.style.display = 'none';
  container.style.display = 'block';
  
  if (results.length === 0) {
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--color-text-tertiary);">No results found</div>';
    return;
  }
  
  container.innerHTML = results.map(r => {
    const typeIcon = r.type === 'photos' ? '📸' : r.type === 'videos' ? '🎬' : '📝';
    return `
      <div class="ig-search-result" onclick="selectSearchResult('${r.id}', '${r.title}')">
        <div class="ig-search-result__thumb">
          ${r.thumb ? `<img src="${r.thumb}" alt="">` : typeIcon}
        </div>
        <div class="ig-search-result__info">
          <div class="ig-search-result__title">${r.title}</div>
          <div class="ig-search-result__sub">${r.category || r.type}</div>
        </div>
      </div>
    `;
  }).join('');
}

function selectSearchResult(id, title) {
  // Save to history
  state.searchHistory = state.searchHistory.filter(h => h.id !== id);
  state.searchHistory.unshift({ id, title });
  state.searchHistory = state.searchHistory.slice(0, 10);
  localStorage.setItem('ig-search-history', JSON.stringify(state.searchHistory));
  
  // Close search panel
  const panel = document.getElementById('ig-search-panel');
  if (panel) panel.classList.remove('open');
  state.searchPanelOpen = false;
  
  // Scroll to post
  scrollToPost(id);
}

function renderRecentSearches() {
  const container = document.getElementById('ig-search-recent-list');
  if (!container) return;
  
  if (state.searchHistory.length === 0) {
    container.innerHTML = '<p class="ig-search-panel__empty">No recent searches.</p>';
    return;
  }
  
  container.innerHTML = state.searchHistory.map(h => `
    <div class="ig-search-result" onclick="selectSearchResult('${h.id}', '${h.title}')">
      <div class="ig-search-result__thumb">🕐</div>
      <div class="ig-search-result__info">
        <div class="ig-search-result__title">${h.title}</div>
      </div>
    </div>
  `).join('');
}

/* ===== PIN TO TOP ===== */
function togglePinPost(postId) {
  const idx = state.pinnedPosts.indexOf(postId);
  if (idx > -1) {
    state.pinnedPosts.splice(idx, 1);
    showToast('Post unpinned');
  } else {
    state.pinnedPosts.push(postId);
    showToast('Post pinned to top');
  }
  
  localStorage.setItem('ig-pinned-posts', JSON.stringify(state.pinnedPosts));
  applyPinnedBadges();
  filterAndPaginate();
  
  // Close menu
  document.querySelectorAll('.ig-feed-menu.open').forEach(m => m.classList.remove('open'));
}

function applyPinnedBadges() {
  state.allItems.forEach(item => {
    const isPinned = state.pinnedPosts.includes(item.dataset.id);
    const badge = item.querySelector('.ig-post__pin-badge');
    if (badge) {
      badge.style.display = isPinned ? 'flex' : 'none';
    }
    // Update menu text
    const menuItem = item.querySelector('.ig-feed-menu__item:last-child');
    if (menuItem) {
      const svg = menuItem.querySelector('svg');
      menuItem.innerHTML = '';
      if (svg) menuItem.appendChild(svg);
      menuItem.append(isPinned ? ' Unpin' : ' Pin to top');
    }
  });
}

/* ===== FEED MENU ===== */
function toggleFeedMenu(id) {
  const menu = document.getElementById(`feed-menu-${id}`);
  if (!menu) return;
  
  // Close all others
  document.querySelectorAll('.ig-feed-menu.open').forEach(m => {
    if (m !== menu) m.classList.remove('open');
  });
  
  menu.classList.toggle('open');
}

function copyPostLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard');
  }).catch(() => {
    showToast('Failed to copy link');
  });
  document.querySelectorAll('.ig-feed-menu.open').forEach(m => m.classList.remove('open'));
}

function downloadImage(imageUrl, id) {
  if (!imageUrl) return;
  const a = document.createElement('a');
  a.href = imageUrl;
  a.download = `${id}.jpg`;
  a.click();
  document.querySelectorAll('.ig-feed-menu.open').forEach(m => m.classList.remove('open'));
}

/* ===== SHARE ===== */
function shareContent(url) {
  if (navigator.share) {
    navigator.share({ url: url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied!');
    });
  }
}

/* ===== MEDIA VIEWER ===== */
let mediaViewerImages = [];
let mediaViewerIndex = 0;
let mediaViewerZoom = 1;

function initMediaViewer() {
  const viewer = document.getElementById('media-viewer');
  if (!viewer) return;
  
  viewer.querySelector('.ig-media-viewer__overlay').addEventListener('click', closeMediaViewer);
  document.getElementById('mv-close').addEventListener('click', closeMediaViewer);
  document.getElementById('mv-prev').addEventListener('click', () => navigateMediaViewer(-1));
  document.getElementById('mv-next').addEventListener('click', () => navigateMediaViewer(1));
  document.getElementById('mv-zoom-in').addEventListener('click', () => zoomMediaViewer(0.25));
  document.getElementById('mv-zoom-out').addEventListener('click', () => zoomMediaViewer(-0.25));
  document.getElementById('mv-download')?.addEventListener('click', downloadCurrentMedia);
  document.getElementById('mv-fullscreen')?.addEventListener('click', toggleFullscreen);
  
  // Keyboard nav
  document.addEventListener('keydown', (e) => {
    if (!viewer.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') navigateMediaViewer(-1);
    else if (e.key === 'ArrowRight') navigateMediaViewer(1);
    else if (e.key === '+') zoomMediaViewer(0.25);
    else if (e.key === '-') zoomMediaViewer(-0.25);
  });
}

function openMediaViewer(type, category, startId) {
  const viewer = document.getElementById('media-viewer');
  if (!viewer) return;
  
  // Collect images of the same type/category
  mediaViewerImages = [];
  const items = document.querySelectorAll(`.ig-post[data-type="${type}"]`);
  
  items.forEach(item => {
    const img = item.querySelector('.ig-post__image');
    if (img && img.src) {
      mediaViewerImages.push({
        src: img.src,
        id: item.dataset.id,
        category: item.dataset.category
      });
    }
  });
  
  // If filtering by category
  if (category) {
    const filtered = mediaViewerImages.filter(img => img.category === category);
    if (filtered.length > 0) mediaViewerImages = filtered;
  }
  
  // Find start index
  mediaViewerIndex = Math.max(0, mediaViewerImages.findIndex(img => img.id === startId));
  mediaViewerZoom = 1;
  
  updateMediaViewer();
  viewer.classList.add('open');
  document.body.classList.add('noscroll');
}

function closeMediaViewer() {
  const viewer = document.getElementById('media-viewer');
  if (viewer) viewer.classList.remove('open');
  document.body.classList.remove('noscroll');
}

function navigateMediaViewer(dir) {
  mediaViewerIndex = Math.max(0, Math.min(mediaViewerIndex + dir, mediaViewerImages.length - 1));
  mediaViewerZoom = 1;
  updateMediaViewer();
}

function updateMediaViewer() {
  if (mediaViewerImages.length === 0) return;
  const img = document.getElementById('mv-img');
  const counter = document.getElementById('mv-counter');
  const prev = document.getElementById('mv-prev');
  const next = document.getElementById('mv-next');
  
  img.src = mediaViewerImages[mediaViewerIndex].src;
  img.style.transform = `scale(1)`;
  counter.textContent = `${mediaViewerIndex + 1} / ${mediaViewerImages.length}`;
  prev.style.display = mediaViewerIndex > 0 ? 'flex' : 'none';
  next.style.display = mediaViewerIndex < mediaViewerImages.length - 1 ? 'flex' : 'none';
}

function zoomMediaViewer(delta) {
  mediaViewerZoom = Math.max(0.5, Math.min(mediaViewerZoom + delta, 4));
  const img = document.getElementById('mv-img');
  if (img) img.style.transform = `scale(${mediaViewerZoom})`;
}

function downloadCurrentMedia() {
  if (mediaViewerImages[mediaViewerIndex]) {
    const a = document.createElement('a');
    a.href = mediaViewerImages[mediaViewerIndex].src;
    a.download = 'download.jpg';
    a.click();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.getElementById('media-viewer')?.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

/* ===== VIDEO VIEWER ===== */
let videoViewerItems = [];
let videoViewerIndex = 0;

function initVideoViewer() {
  const viewer = document.getElementById('video-viewer');
  if (!viewer) return;
  
  viewer.querySelector('.ig-media-viewer__overlay').addEventListener('click', closeVideoViewer);
  document.getElementById('vv-close').addEventListener('click', closeVideoViewer);
  document.getElementById('vv-prev')?.addEventListener('click', () => navigateVideoViewer(-1));
  document.getElementById('vv-next')?.addEventListener('click', () => navigateVideoViewer(1));
}

function openVideoViewer(category, startId) {
  const viewer = document.getElementById('video-viewer');
  if (!viewer) return;
  
  videoViewerItems = [];
  document.querySelectorAll('.ig-post[data-type="videos"]').forEach(item => {
    const vUrl = item.dataset.videoUrl;
    const vType = item.dataset.videoType || 'file';
    if (vUrl) {
      videoViewerItems.push({ url: vUrl, type: vType, id: item.dataset.id, category: item.dataset.category });
    }
  });
  
  if (category) {
    const filtered = videoViewerItems.filter(v => v.category === category);
    if (filtered.length > 0) videoViewerItems = filtered;
  }
  
  videoViewerIndex = Math.max(0, videoViewerItems.findIndex(v => v.id === startId));
  
  updateVideoViewer();
  viewer.classList.add('open');
  document.body.classList.add('noscroll');
}

function closeVideoViewer() {
  const viewer = document.getElementById('video-viewer');
  if (viewer) viewer.classList.remove('open');
  document.getElementById('vv-embed').innerHTML = '';
  document.body.classList.remove('noscroll');
}

function navigateVideoViewer(dir) {
  videoViewerIndex = Math.max(0, Math.min(videoViewerIndex + dir, videoViewerItems.length - 1));
  updateVideoViewer();
}

function updateVideoViewer() {
  if (videoViewerItems.length === 0) return;
  const item = videoViewerItems[videoViewerIndex];
  const embed = document.getElementById('vv-embed');
  const counter = document.getElementById('vv-counter');
  const prev = document.getElementById('vv-prev');
  const next = document.getElementById('vv-next');
  
  counter.textContent = `${videoViewerIndex + 1} / ${videoViewerItems.length}`;
  prev.style.display = videoViewerIndex > 0 ? 'flex' : 'none';
  next.style.display = videoViewerIndex < videoViewerItems.length - 1 ? 'flex' : 'none';
  
  if (item.type === 'youtube') {
    let videoId = '';
    const matchV = item.url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    const matchShort = item.url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    videoId = matchV ? matchV[1] : matchShort ? matchShort[1] : '';
    embed.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px;"></iframe>`;
  } else if (item.type === 'gdrive') {
    embed.innerHTML = `<iframe src="${item.url}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;aspect-ratio:16/9;border:none;border-radius:8px;"></iframe>`;
  } else {
    embed.innerHTML = `<video controls autoplay playsinline style="max-width:90vw;max-height:80vh;border-radius:8px;"><source src="${item.url}" type="video/mp4"></video>`;
  }
}

/* ===== STORIES ===== */
let storyData = [];
let currentStoryGroupIdx = 0;
let currentStorySlideIdx = 0;
let storyTimer = null;
let storyPaused = false;

function openStoryViewer(groupIdx) {
  currentStoryGroupIdx = groupIdx;
  currentStorySlideIdx = 0;
  storyPaused = false;
  
  const viewer = document.getElementById('ig-story-viewer');
  if (!viewer) return;
  viewer.style.display = 'flex';
  document.body.classList.add('noscroll');
  
  loadStorySlide();
}

function closeStoryViewer() {
  const viewer = document.getElementById('ig-story-viewer');
  if (viewer) viewer.style.display = 'none';
  document.body.classList.remove('noscroll');
  clearTimeout(storyTimer);
}

function loadStorySlide() {
  if (storyData.length === 0 || currentStoryGroupIdx >= storyData.length) {
    closeStoryViewer();
    return;
  }
  
  const group = storyData[currentStoryGroupIdx];
  const slide = group.slides[currentStorySlideIdx];
  if (!slide) { nextStory(); return; }
  
  // Update UI
  document.getElementById('story-viewer-avatar').src = group.avatar;
  document.getElementById('story-viewer-name').textContent = group.name;
  document.getElementById('story-viewer-time').textContent = slide.timeAgo || '';
  
  // Progress bars
  const progressContainer = document.getElementById('story-progress-bar');
  progressContainer.innerHTML = group.slides.map((_, i) => {
    let fillClass = '';
    if (i < currentStorySlideIdx) fillClass = 'complete';
    else if (i === currentStorySlideIdx) fillClass = 'active';
    return `<div class="ig-story-progress-bar"><div class="ig-story-progress-bar__fill ${fillClass}"></div></div>`;
  }).join('');
  
  // Content
  const img = document.getElementById('story-viewer-img');
  const video = document.getElementById('story-viewer-video');
  
  if (slide.type === 'video') {
    img.style.display = 'none';
    video.style.display = 'block';
    video.src = slide.url;
    video.play();
  } else {
    video.style.display = 'none';
    img.style.display = 'block';
    img.src = slide.url;
  }
  
  // Nav buttons
  document.getElementById('story-prev-btn').style.display = currentStoryGroupIdx > 0 ? 'flex' : 'none';
  document.getElementById('story-next-btn').style.display = currentStoryGroupIdx < storyData.length - 1 ? 'flex' : 'none';
  
  // Record view
  if (typeof recordStoryView === 'function' && slide.id) {
    recordStoryView(slide.id);
  }
  
  // Auto advance
  clearTimeout(storyTimer);
  if (!storyPaused) {
    const duration = slide.type === 'video' ? (slide.duration || 15) * 1000 : 5000;
    storyTimer = setTimeout(() => nextStorySlide(), duration);
  }
}

function nextStorySlide() {
  const group = storyData[currentStoryGroupIdx];
  if (!group) return;
  
  if (currentStorySlideIdx < group.slides.length - 1) {
    currentStorySlideIdx++;
    loadStorySlide();
  } else {
    nextStory();
  }
}

function prevStorySlide() {
  if (currentStorySlideIdx > 0) {
    currentStorySlideIdx--;
    loadStorySlide();
  } else {
    prevStory();
  }
}

function nextStory() {
  if (currentStoryGroupIdx < storyData.length - 1) {
    currentStoryGroupIdx++;
    currentStorySlideIdx = 0;
    loadStorySlide();
  } else {
    closeStoryViewer();
  }
}

function prevStory() {
  if (currentStoryGroupIdx > 0) {
    currentStoryGroupIdx--;
    currentStorySlideIdx = 0;
    loadStorySlide();
  }
}

function toggleStoryPause() {
  storyPaused = !storyPaused;
  
  const bar = document.querySelector('.ig-story-progress-bar__fill.active');
  if (storyPaused) {
    clearTimeout(storyTimer);
    if (bar) bar.style.animationPlayState = 'paused';
  } else {
    if (bar) bar.style.animationPlayState = 'running';
    storyTimer = setTimeout(() => nextStorySlide(), 3000);
  }
}

function toggleStoryVolume() {
  const video = document.getElementById('story-viewer-video');
  if (video) {
    video.muted = !video.muted;
  }
}

function toggleSeenBy() {
  const panel = document.getElementById('story-seen-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

/* ===== MORE MENU ===== */
function toggleMoreMenu(e) {
  if (e) e.preventDefault();
  const menu = document.getElementById('ig-more-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

/* ===== CREATE MODAL ===== */
function openCreateModal(e, type) {
  if (e) e.preventDefault();
  const modal = document.getElementById('ig-create-modal');
  if (modal) {
    modal.style.display = 'flex';
    if (type) selectCreateType(type);
  }
}

function closeCreateModal() {
  const modal = document.getElementById('ig-create-modal');
  if (modal) modal.style.display = 'none';
}

function selectCreateType(type) {
  document.querySelectorAll('.ig-create-modal__type').forEach(btn => {
    btn.classList.toggle('ig-create-modal__type--active', btn.dataset.type === type);
  });
}

/* ===== CHAT ===== */
function openChat(e) {
  if (e) e.preventDefault();
  
  // Mobile: open full-page chat
  if (window.innerWidth < 768) {
    openMobileChat();
    return;
  }
  
  // Desktop: toggle chat widget
  const chat = document.getElementById('chat-widget');
  if (chat) {
    chat.classList.toggle('open');
    chat.classList.remove('minimized');
  }
}

function toggleChatMinimize() {
  const chat = document.getElementById('chat-widget');
  if (chat) chat.classList.toggle('minimized');
}

function openMobileChat() {
  const chat = document.getElementById('mobile-chat-page');
  if (chat) chat.classList.add('open');
}

function closeMobileChat() {
  const chat = document.getElementById('mobile-chat-page');
  if (chat) chat.classList.remove('open');
}

/* ===== AUTH MODAL ===== */
function openAuthModal() {
  const modal = document.getElementById('ig-auth-modal');
  if (modal) modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('ig-auth-modal');
  if (modal) modal.style.display = 'none';
}

/* ===== PROFILE PREVIEW ===== */
function openProfilePreview(src) {
  const modal = document.getElementById('profile-preview-modal');
  const img = document.getElementById('profile-preview-img');
  if (modal && img) {
    img.src = src;
    modal.classList.add('open');
  }
}

function closeProfilePreview() {
  const modal = document.getElementById('profile-preview-modal');
  if (modal) modal.classList.remove('open');
}

/* ===== REACTIONS MODAL ===== */
function showReactionsModal(contentId) {
  const modal = document.getElementById('reactions-modal');
  if (modal) modal.classList.add('open');
  // Content will be loaded by interactions.js
}

function closeReactionsModal() {
  const modal = document.getElementById('reactions-modal');
  if (modal) modal.classList.remove('open');
}

/* ===== REELS ===== */
function openReelViewer(reelId) {
  // For now, scroll to the reel in the feed
  scrollToPost(reelId);
}

/* ===== EXPLORE / TRENDING ===== */
function loadTrendingPosts() {
  // Load trending based on interaction counts from Firebase
  // This will be populated by interactions.js when Firebase data is available
}

/* ===== TOAST ===== */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ===== POST ANIMATION OBSERVER ===== */
function observePostAnimations() {
  if (!('IntersectionObserver' in window)) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.animation = 'fadeIn 0.3s ease forwards';
      }
    });
  }, { threshold: 0.1 });
  
  state.allItems.forEach(item => observer.observe(item));
}

/* ===== CONTEXT PROTECTION ===== */
function initContextProtection() {
  // Disable right-click on images
  document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
    }
  });
}

/* ===== ADMIN CHECK ===== */
function setAdminMode(isAdmin) {
  state.isAdmin = isAdmin;
  if (isAdmin) {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }
}

/* ===== COMMENTS TOGGLE ===== */
function toggleComments(contentId) {
  const section = document.getElementById(`comments-${contentId}`);
  const list = section?.querySelector('.ig-comments__list');
  const btn = document.getElementById(`view-comments-btn-${contentId}`);
  if (list) {
    list.style.display = list.style.display === 'none' ? 'flex' : 'none';
    if (btn) btn.style.display = list.style.display === 'none' ? 'block' : 'none';
  }
  const input = document.getElementById(`comment-input-${contentId}`);
  if (input) input.focus();
}
