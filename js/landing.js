const LandingPage = {
    hideLoadingOverlay() {
        const overlay = document.getElementById('globalLoadingOverlay');
        if (!overlay) return;

        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 350);
    },

    async init() {
        const landingPage = document.getElementById('landingPage');
        if (!landingPage) return;

        landingPage.classList.add('active');
        document.body.classList.add('landing-active');
        
        // Setup Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Setup Auth Form Listeners (Legacy app.js logic)
        if (typeof App !== 'undefined' && typeof App.setupAuthFormEventListeners === 'function') {
            App.setupAuthFormEventListeners();
        }

        // Setup Intersection Observer for counters
        this.setupCounters();
        
        // Setup smooth scroll for internal links
        this.setupSmoothScroll();

        // Setup dynamic header animation
        this.setupHeaderAnimation();

        // Check authentication
        try {
            if (typeof Auth !== 'undefined') {
                await Auth.init();

                // Check for verified parameter (from confirm-email.html)
                const urlParams = new URLSearchParams(window.location.search);
                const isVerifiedRedirect = urlParams.get('verified') === 'true';

                if (isVerifiedRedirect) {
                    // Force logout to ensure they see the landing page and have to log in manually
                    await Auth.logout();
                    // Re-init after logout to be clean
                    await Auth.init();
                }

                if (Auth.isAuthenticated() && !isVerifiedRedirect) {
                    window.location.replace('html/app.html');
                    return;
                }

                if (isVerifiedRedirect) {
                    if (typeof UI !== 'undefined' && typeof UI.toggleAuthOverlay === 'function') {
                        UI.toggleAuthOverlay(true, 'login');
                        if (typeof App !== 'undefined' && typeof App.showAuthStatusNotice === 'function') {
                            App.showAuthStatusNotice('Deine E-Mail wurde erfolgreich bestätigt. Du kannst dich jetzt einloggen.', 'success');
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('[LandingPage] Auth bootstrap failed:', error);
        } finally {
            // Fade in landing page
            setTimeout(() => {
                landingPage.style.opacity = '1';
            }, 100);
            this.hideLoadingOverlay();
        }
    },

    setupCounters() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const counters = entry.target.querySelectorAll('.counter');
                    counters.forEach(counter => {
                        const target = parseInt(counter.getAttribute('data-target'));
                        let count = 0;
                        const duration = 2000;
                        const increment = target / (duration / 16);
                        const timer = setInterval(() => {
                            count += increment;
                            if (count >= target) {
                                counter.innerText = target;
                                clearInterval(timer);
                            } else {
                                counter.innerText = Math.floor(count);
                            }
                        }, 16);
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        const statsSection = document.getElementById('stats');
        if (statsSection) observer.observe(statsSection);
    },

    setupSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                if (targetId === '#') return;
                const target = document.querySelector(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    },

    setupHeaderAnimation() {
        const header = document.getElementById('mainHeader');
        const inner = document.getElementById('headerInner');
        if (!header || !inner) return;

        const updateHeaderState = () => {
            if (window.scrollY > 50) {
                // Scrolled state: Floating Pill
                inner.classList.remove('max-w-full', 'bg-transparent', 'border-transparent', 'shadow-none', 'rounded-none');
                inner.classList.add('max-w-7xl', 'glass', 'rounded-[2rem]', 'shadow-2xl');
                header.classList.remove('md:px-12');
            } else {
                // Top state: Expanded
                inner.classList.remove('max-w-7xl', 'glass', 'rounded-[2rem]', 'shadow-2xl');
                inner.classList.add('max-w-full', 'bg-transparent', 'border-transparent', 'shadow-none', 'rounded-none');
                header.classList.add('md:px-12');
            }
        };

        // Initial check and scroll listener
        updateHeaderState();
        window.addEventListener('scroll', updateHeaderState, { passive: true });
    }
};

window.LandingPage = LandingPage;

document.addEventListener('DOMContentLoaded', () => {
    LandingPage.init();
});
