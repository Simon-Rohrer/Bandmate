const LandingPage = {
    hideLoadingOverlay() {
        const overlay = document.getElementById('globalLoadingOverlay');
        if (!overlay) return;

        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 250);
    },

    async init() {
        const landingPage = document.getElementById('landingPage');
        if (!landingPage) return;

        landingPage.classList.add('active');
        document.body.classList.add('landing-active');
        document.documentElement.classList.add('landing-active-root');

        if (typeof App !== 'undefined' && typeof App.setupAuthFormEventListeners === 'function') {
            App.setupAuthFormEventListeners();
        }

        const rememberCheckbox = document.getElementById('loginRememberMe');
        if (rememberCheckbox && typeof SupabaseClient !== 'undefined' && SupabaseClient.getRememberPreference) {
            rememberCheckbox.checked = SupabaseClient.getRememberPreference();
        }

        try {
            await Auth.init();
            if (Auth.isAuthenticated()) {
                window.location.replace(SupabaseClient.buildProjectPageUrl('app.html'));
                return;
            }
        } catch (error) {
            console.warn('[LandingPage] Auth bootstrap failed:', error);
        } finally {
            this.hideLoadingOverlay();
        }
    }
};

window.LandingPage = LandingPage;

document.addEventListener('DOMContentLoaded', () => {
    LandingPage.init();
});
