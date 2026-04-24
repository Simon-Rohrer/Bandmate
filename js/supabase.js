// Supabase client initialization and helpers
// Reads URL and anon key from localStorage settings

const SupabaseClient = {
    client: null,
    REMEMBER_ME_KEY: 'auth.rememberMe',
    SESSION_EXPIRY_KEY: 'auth.sessionExpiry',

    buildProjectPageUrl(targetPage = 'index.html') {
        try {
            const url = new URL(window.location.href);
            url.search = '';
            url.hash = '';

            const pathname = url.pathname || '/';
            if (pathname.endsWith('/')) {
                url.pathname = `${pathname}${targetPage}`;
            } else if (/\.[a-z0-9]+$/i.test(pathname)) {
                url.pathname = pathname.replace(/[^/]+$/, targetPage);
            } else {
                url.pathname = `${pathname}/${targetPage}`;
            }

            return url.toString();
        } catch (error) {
            return targetPage;
        }
    },

    isConfigured() {
        if (this.client) return true;
        if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) return true;
        const url = localStorage.getItem('supabase.url');
        const key = localStorage.getItem('supabase.anonKey');
        return !!(url && key);
    },

    getProjectRef() {
        try {
            const url = localStorage.getItem('supabase.url');
            if (!url) return null;
            return new URL(url).hostname.split('.')[0] || null;
        } catch (e) {
            return null;
        }
    },

    getAuthStoragePrefix() {
        const projectRef = this.getProjectRef();
        return projectRef ? `sb-${projectRef}-` : 'sb-';
    },

    hasLegacyPersistentSession() {
        const prefix = this.getAuthStoragePrefix();
        return Object.keys(localStorage).some(key => key.startsWith(prefix) && key.includes('auth-token'));
    },

    getRememberPreference() {
        const saved = localStorage.getItem(this.REMEMBER_ME_KEY);
        if (saved === 'true') return true;
        if (saved === 'false') return false;
        return this.hasLegacyPersistentSession();
    },

    setRememberPreference(remember) {
        localStorage.setItem(this.REMEMBER_ME_KEY, remember ? 'true' : 'false');
    },

    getAuthStorage() {
        return this.getRememberPreference() ? window.localStorage : window.sessionStorage;
    },

    getInactiveAuthStorage() {
        return this.getRememberPreference() ? window.sessionStorage : window.localStorage;
    },

    getStorageAdapter() {
        return {
            getItem: (key) => {
                return this.getAuthStorage().getItem(key);
            },
            setItem: (key, value) => {
                this.getAuthStorage().setItem(key, value);
                this.getInactiveAuthStorage().removeItem(key);
            },
            removeItem: (key) => {
                window.localStorage.removeItem(key);
                window.sessionStorage.removeItem(key);
            }
        };
    },

    setSessionExpiry(remember) {
        const expiresAt = Date.now() + (remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
        const activeStorage = this.getAuthStorage();
        const inactiveStorage = this.getInactiveAuthStorage();
        activeStorage.setItem(this.SESSION_EXPIRY_KEY, String(expiresAt));
        inactiveStorage.removeItem(this.SESSION_EXPIRY_KEY);
    },

    getSessionExpiry() {
        const value = this.getAuthStorage().getItem(this.SESSION_EXPIRY_KEY);
        if (!value) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    },

    isStoredSessionExpired() {
        const expiry = this.getSessionExpiry();
        if (!expiry) return false;
        return Date.now() > expiry;
    },

    clearStoredAuthSession() {
        const prefix = this.getAuthStoragePrefix();
        [window.localStorage, window.sessionStorage].forEach(storage => {
            const keysToRemove = [];
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (!key) continue;
                if (key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => storage.removeItem(key));
            storage.removeItem(this.SESSION_EXPIRY_KEY);
        });
    },

    prepareSessionPersistence(remember) {
        this.setRememberPreference(remember);
        this.clearStoredAuthSession();
    },

    init() {
        try {
            // Use CONFIG if available, fallback to localStorage or defaults
            let url = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) ? CONFIG.SUPABASE_URL : localStorage.getItem('supabase.url');
            let key = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY) ? CONFIG.SUPABASE_ANON_KEY : localStorage.getItem('supabase.anonKey');

            // Prefill defaults if both are missing
            if (!url && !key) {
                url = 'https://brkapsnrdewuualhsmcr.supabase.co';
                key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJya2Fwc25yZGV3dXVhbGhzbWNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjgyNTEsImV4cCI6MjA4MDI0NDI1MX0.X78zASumSTzTa1n3tk9BdwMuQSvXIWTDLUiBTg--FCs';
            }

            if (url && key && window.supabase) {
                this.client = window.supabase.createClient(url, key, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        storage: this.getStorageAdapter()
                    }
                });

            } else {
                this.client = null;
            }
        } catch (e) {
            console.error('Failed to init Supabase', e);
            this.client = null;
        }
    },

    getClient() {
        if (!this.client) this.init();
        return this.client;
    },

    async testConnection() {
        if (!this.isConfigured()) return { success: false, message: 'Supabase ist nicht konfiguriert.' };
        const sb = this.getClient();
        try {
            // Test with a simple query to users table (or just health check if possible)
            const { data, error } = await sb.from('users').select('id').limit(1);
            if (error) {
                if (error.message && error.message.includes('Load failed')) {
                    return { success: false, message: 'Netzwerkfehler: Bitte überprüfe deine Internetverbindung oder ob die URL korrekt ist (CORS-Blockierung?).' };
                }
                return { success: false, message: `Fehler: ${error.message}` };
            }
            return { success: true, message: 'Verbindung zu Supabase erfolgreich hergestellt!' };
        } catch (e) {
            return { success: false, message: `Unerwarteter Fehler: ${e.message}` };
        }
    }
};

// Wire up settings form if present
(function attachSupabaseSettings() {
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('supabaseSettingsForm');
        const urlInput = document.getElementById('supabaseUrl');
        const keyInput = document.getElementById('supabaseAnonKey');
        if (!form || !urlInput || !keyInput) return;

        // Prefill from localStorage
        urlInput.value = localStorage.getItem('supabase.url') || '';
        keyInput.value = localStorage.getItem('supabase.anonKey') || '';

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = urlInput.value.trim();
            const key = keyInput.value.trim();
            localStorage.setItem('supabase.url', url);
            localStorage.setItem('supabase.anonKey', key);
            SupabaseClient.init();
            if (typeof UI !== 'undefined') {
                UI.showToast('Supabase Einstellungen gespeichert', 'success');
            } else {
                console.log('Supabase settings saved');
            }
        });

        // Add test connection button
        const testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.className = 'btn btn-secondary';
        testBtn.style.marginTop = '10px';
        testBtn.textContent = 'Verbindung testen';
        testBtn.onclick = async () => {
            testBtn.disabled = true;
            testBtn.textContent = 'Teste...';
            const result = await SupabaseClient.testConnection();
            if (typeof UI !== 'undefined') {
                UI.showToast(result.message, result.success ? 'success' : 'error');
            } else {
                alert(result.message);
            }
            testBtn.disabled = false;
            testBtn.textContent = 'Verbindung testen';
        };
        form.appendChild(testBtn);
    });
})();
