/**
 * ProxyService - Centralized management for CORS proxies
 * Handles automatic proxy selection based on environment and provides fallback logic.
 */
const ProxyService = {
    // List of available proxies
    proxies: {
        codeTabs: {
            name: 'codetabs.com',
            getUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            isRaw: true
        },
        corsProxyIo: {
            name: 'corsproxy.io',
            getUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            isRaw: true
        },
        allOrigins: {
            name: 'allorigins.win',
            getUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            isRaw: false
        },
        allOriginsRaw: {
            name: 'allorigins.win (raw)',
            getUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            isRaw: true
        }
    },

    /**
     * Fetch data via a proxy
     * @param {string} url - Target URL
     * @returns {Promise<string>} - The response body as text
     */
    async fetch(url) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Strategy: Use codetabs first, then corsproxy.io, then allOrigins
        let proxySelection = isLocal 
            ? [this.proxies.corsProxyIo, this.proxies.codeTabs, this.proxies.allOriginsRaw] 
            : [this.proxies.codeTabs, this.proxies.corsProxyIo, this.proxies.allOriginsRaw];

        let lastError = null;

        for (const proxy of proxySelection) {
            try {
                const proxyUrl = proxy.getUrl(url);
                const response = await fetch(proxyUrl);

                if (!response.ok) {
                    throw new Error(`Proxy ${proxy.name} returned HTTP ${response.status}`);
                }

                if (proxy.isRaw) {
                    const text = await response.text();
                    if (text) return text;
                } else {
                    const data = await response.json();
                    if (data && data.contents) return data.contents;
                }
            } catch (error) {
                Logger.warn(`Proxy ${proxy.name} failed for ${url}:`, error.message);
                lastError = error;
                continue; // Try next proxy
            }
        }

        throw lastError || new Error('All proxies failed');
    }
};

window.ProxyService = ProxyService;
