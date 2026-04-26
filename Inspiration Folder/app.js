/* =============================================
   LinkedIn × Apple — Liquid Glass Interactions
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  // --- Nav scroll effect ---
  const nav = document.getElementById('main-nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY > 10) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  }, { passive: true });

  // --- Tab switching ---
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Haptic-style micro animation
      tab.style.transform = 'scale(0.92)';
      setTimeout(() => {
        tab.style.transform = 'scale(1)';
      }, 120);
    });
  });

  // --- Like button toggle ---
  const likeButtons = document.querySelectorAll('[id$="-like"]');
  likeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('liked');

      // Find the reaction count in the same post
      const postCard = btn.closest('.post-card');
      const countEl = postCard.querySelector('.reaction-count');
      if (countEl) {
        let count = parseInt(countEl.textContent.replace(/,/g, ''));
        if (btn.classList.contains('liked')) {
          count++;
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg> Liked`;
        } else {
          count--;
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg> Like`;
        }
        countEl.textContent = count.toLocaleString();
      }

      // Bounce animation
      btn.style.transform = 'scale(1.15)';
      setTimeout(() => {
        btn.style.transform = 'scale(1)';
      }, 200);
    });
  });

  // --- Connect button toggle ---
  const connectBtns = document.querySelectorAll('.connect-btn');
  connectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('connected')) {
        btn.classList.remove('connected');
        btn.textContent = '+ Connect';
      } else {
        btn.classList.add('connected');
        btn.textContent = '✓ Connected';

        // Scale pop
        btn.style.transform = 'scale(1.08)';
        setTimeout(() => {
          btn.style.transform = 'scale(1)';
        }, 200);
      }
    });
  });

  // --- Compose button interaction ---
  const composeBtn = document.getElementById('compose-button');
  if (composeBtn) {
    composeBtn.addEventListener('click', () => {
      composeBtn.style.borderColor = 'var(--blue)';
      composeBtn.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.12)';
      composeBtn.textContent = 'What do you want to talk about?';
      setTimeout(() => {
        composeBtn.style.borderColor = '';
        composeBtn.style.boxShadow = '';
        composeBtn.textContent = 'Start a post...';
      }, 2000);
    });
  }

  // --- Search focus animation ---
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('focus', () => {
      searchInput.placeholder = 'Search people, jobs, posts...';
    });
    searchInput.addEventListener('blur', () => {
      searchInput.placeholder = 'Search';
    });
  }

  // --- Intersection Observer for reveal animations ---
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // --- Subtle parallax on ambient blobs ---
  const blobs = document.querySelectorAll('.blob');
  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        blobs.forEach((blob, i) => {
          const speed = (i + 1) * 0.03;
          blob.style.transform = `translateY(${scrollY * speed}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

});
