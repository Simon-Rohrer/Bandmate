// Statistics Module

const Statistics = {
    loadingStates: {},
    statsCache: {}, // { [bandId || 'all']: { data, timestamp } }

    escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    pluralize(count, singular, plural = `${singular}en`) {
        return count === 1 ? singular : plural;
    },

    getStatIcon(type = 'default') {
        const icons = {
            events: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m12 8-9.04 9.06a2.82 2.82 0 1 0 3.98 3.98l9.06-9.06"></path>
                    <path d="M12 8a2.82 2.82 0 1 0 3.98 3.98l9.06-9.06"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `,
            rehearsals: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
            `,
            repertoire: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
            `,
            bands: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            `,
            feature: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M8 21h8"></path>
                    <path d="M12 17v4"></path>
                    <path d="M7 4h10v3a5 5 0 0 1-10 0Z"></path>
                    <path d="M17 5h2a2 2 0 0 1 0 4h-2"></path>
                    <path d="M7 5H5a2 2 0 0 0 0 4h2"></path>
                </svg>
            `,
            location: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10Z"></path>
                    <circle cx="12" cy="11" r="2.5"></circle>
                </svg>
            `
        };

        return icons[type] || icons.repertoire;
    },

    getSelectedBandLabel(bandId = null) {
        if (!bandId) return 'Alle Bands';
        const select = document.getElementById('statsBandSelect');
        if (!select) return 'Ausgewählte Band';
        const option = Array.from(select.options).find(entry => String(entry.value) === String(bandId));
        return option?.textContent?.trim() || 'Ausgewählte Band';
    },

    invalidateCache() {
        Logger.info('[Statistics] Cache invalidated.');
        this.statsCache = {};
    },

    clearCache() {
        this.invalidateCache();
    },

    // Initialize statistics filters (dropdowns)
    async initStatisticsFilters() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const bandSelect = document.getElementById('statsBandSelect');
        if (!bandSelect) return;

        // Prevent double initialization
        if (this._filtersInitialized) return;
        this._filtersInitialized = true;

        // Populate band dropdown
        const bands = await Storage.getUserBands(user.id);
        bandSelect.innerHTML = '<option value="">Band auswählen</option>' +
            bands.map(b => `<option value="${b.id}">${Bands.escapeHtml(b.name)}</option>`).join('');

        // Band filter change
        bandSelect.addEventListener('change', async (e) => {
            const bandId = e.target.value;
            Logger.userAction('Select', 'statsBandSelect', 'Change', { bandId, action: 'Filter Statistics by Band' });

            if (bandId) {
                // Show band statistics (Bento Grid numbers)
                await this.renderGeneralStatistics(bandId);
            } else {
                // Show general stats
                await this.renderGeneralStatistics();
            }
        });
    },

    // NEW: Render General Statistics Dashboard
    async renderGeneralStatistics(bandId = null) {
        const cacheKey = bandId || 'all';
        const bandLabel = this.getSelectedBandLabel(bandId);
        const summaryContainer = document.getElementById('statsSummaryContainer');

        // Check Cache
        if (this.statsCache[cacheKey]) {
            Logger.info(`[Statistics] Using cached data for ${cacheKey}.`);
            this._renderDashboard({
                ...this.statsCache[cacheKey].data,
                bandLabel,
                currentYear: new Date().getFullYear()
            });
            return;
        }

        Logger.info('Statistics: renderGeneralStatistics called', { bandId });
        Logger.time('Statistics Load (General)');
        const container = document.getElementById('statsDashboardContainer');
        if (!container) return; // Should exist if HTML is updated

        // Show loading state
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="stats-overview-panel stats-overview-panel-loading">
                    <div class="stats-overview-copy">
                        <span class="stats-panel-kicker">Überblick</span>
                        <h3>Wird geladen</h3>
                        <p>${this.escapeHtml(bandLabel)}</p>
                    </div>
                    <div class="stats-overview-meta">
                        <span class="stats-scope-chip">${this.escapeHtml(bandLabel)}</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="stats-loading-state">
                <div class="stats-loading-spinner" aria-hidden="true"></div>
                <div class="stats-loading-copy">
                    <strong>Statistiken werden geladen</strong>
                    <span>Die Kennzahlen werden gerade für dich zusammengestellt.</span>
                </div>
            </div>
        `;

        try {
            const user = Auth.getCurrentUser();
            if (!user) return;

            // 1. Fetch Data
            let [bands, events, rehearsals, locations] = await Promise.all([
                Storage.getUserBands(user.id),
                Storage.getUserEvents(user.id),     // Gets all events accessible to user
                Storage.getUserRehearsals(user.id), // Gets all rehearsals
                Storage.getLocations()
            ]);

            // Filter by band if selected
            if (bandId) {
                const targetBandId = String(bandId); events = events.filter(e => String(e.bandId) === targetBandId);
                rehearsals = rehearsals.filter(r => String(r.bandId) === targetBandId);
                bands = bands.filter(b => String(b.id) === targetBandId);
            }

            // 2. Calculate Key Metrics
            const totalEvents = events.length;
            const totalRehearsals = rehearsals.length;
            const totalBands = bands.length;

            // Calculate "Songs Repertoire Size" (Unique songs in all bands)
            // Note: This relies on songs being fetched per band or globally. 
            // For now, let's estimate or fetch if possible.
            // Let's iterate all bands and fetch songs to get a true unique count.
            const allSongs = new Set();
            for (const band of bands) {
                const bandSongs = await Storage.getBandSongs(band.id);
                bandSongs.forEach(s => allSongs.add(s.title.toLowerCase().trim()));
            }
            const repertoireSize = allSongs.size;

            // 3. Fun Stats: Top Song & Favorite Location
            const songCounts = {};
            const locationCounts = {};

            // Analyze Events
            events.forEach(e => {
                if (e.setlist) {
                    e.setlist.forEach(s => {
                        const title = s.title || s.name || 'Unknown';
                        songCounts[title] = (songCounts[title] || 0) + 1;
                    });
                }
                if (e.locationId) {
                    locationCounts[e.locationId] = (locationCounts[e.locationId] || 0) + 1;
                }
            });

            // Analyze Rehearsals (for location only, typically no setlist stored directly as simple array yet? 
            // Actually rehearsal might have song list. Let's assume yes if available)
            rehearsals.forEach(r => {
                if (r.locationId) {
                    locationCounts[r.locationId] = (locationCounts[r.locationId] || 0) + 1;
                }
            });

            // Find Top Song
            let topSong = { name: '-', count: 0 };
            Object.entries(songCounts).forEach(([name, count]) => {
                if (count > topSong.count) topSong = { name, count };
            });

            // Find Favorite Location
            let favLocation = { name: '-', count: 0 };
            Object.entries(locationCounts).forEach(([id, count]) => {
                if (count > favLocation.count) {
                    // Try to find name in locations list
                    const locObj = locations.find(l => l.id === id);
                    const name = locObj ? locObj.name : 'Unbekannter Ort';
                    favLocation = { name, count };
                }
            });

            const dashboardData = {
                totalEvents,
                totalRehearsals,
                totalBands,
                repertoireSize,
                topSong,
                favLocation,
                eventsYear: events.filter(e => new Date(e.date).getFullYear() === new Date().getFullYear()).length,
                bandLabel,
                currentYear: new Date().getFullYear()
            };

            // Set Cache
            this.statsCache[cacheKey] = { data: dashboardData, timestamp: Date.now() };

            this._renderDashboard(dashboardData);
        } catch (error) {
            Logger.error('[Statistics] Error rendering general stats:', error);
            if (summaryContainer) {
                summaryContainer.innerHTML = `
                    <div class="stats-overview-panel stats-overview-panel-error">
                        <div class="stats-overview-copy">
                            <span class="stats-panel-kicker">Überblick</span>
                            <h3>Nicht verfügbar</h3>
                            <p>Bitte später erneut versuchen.</p>
                        </div>
                    </div>
                `;
            }
            const container = document.getElementById('statsDashboardContainer');
            if (container) {
                container.innerHTML = `
                    <div class="stats-empty-state">
                        <span class="stats-panel-kicker">Fehler</span>
                        <h3>Statistiken konnten nicht geladen werden</h3>
                        <p>Bitte versuche es in einem Moment erneut. Falls das Problem bestehen bleibt, hilft ein kurzes Neuladen der Seite.</p>
                    </div>
                `;
            }
        } finally {
            Logger.timeEnd('Statistics Load (General)');
        }
    },

    // Helper: Render the dashboard from data
    _renderDashboard(data) {
        const container = document.getElementById('statsDashboardContainer');
        const summaryContainer = document.getElementById('statsSummaryContainer');
        if (!container) return;

        const bandLabel = this.escapeHtml(data.bandLabel || 'Alle Bands');
        const year = data.currentYear || new Date().getFullYear();
        const topSongName = data.topSong.count > 0 ? this.escapeHtml(data.topSong.name) : 'Noch keine Daten';
        const favLocationName = data.favLocation.count > 0 ? this.escapeHtml(data.favLocation.name) : 'Noch keine Daten';
        const eventSentence = data.totalEvents > 0
            ? `${data.eventsYear} in ${year}.`
            : 'Noch keine Auftritte.';
        const rehearsalSentence = data.totalRehearsals > 0
            ? `${data.totalRehearsals} geplant.`
            : 'Noch keine Proben.';
        const repertoireSentence = data.repertoireSize > 0
            ? `${data.repertoireSize} Songs gesamt.`
            : 'Noch kein Repertoire.';
        const bandSentence = data.totalBands > 0
            ? `${data.totalBands} aktive ${this.pluralize(data.totalBands, 'Band', 'Bands')}.`
            : 'Noch keine Band.';
        const topSongSentence = data.topSong.count > 0
            ? `${data.topSong.count} Einsätze bisher.`
            : 'Noch keine Daten.';
        const favLocationSentence = data.favLocation.count > 0
            ? `${data.favLocation.count} ${this.pluralize(data.favLocation.count, 'Termin', 'Termine')} dort.`
            : 'Noch keine Daten.';
        const summarySentence = data.totalEvents + data.totalRehearsals > 0
            ? `${data.totalEvents} ${this.pluralize(data.totalEvents, 'Auftritt', 'Auftritte')} · ${data.totalRehearsals} ${this.pluralize(data.totalRehearsals, 'Probe', 'Proben')}`
            : 'Noch keine Termine';
        const overviewSentence = data.totalEvents + data.totalRehearsals + data.repertoireSize > 0
            ? `${summarySentence} · ${data.repertoireSize} ${this.pluralize(data.repertoireSize, 'Song', 'Songs')} im Repertoire.`
            : 'Sobald Auftritte, Proben oder Songs vorhanden sind, füllt sich dieser Überblick automatisch.';

        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <section class="stats-overview-panel">
                    <div class="stats-overview-copy">
                        <span class="stats-panel-kicker">Überblick</span>
                        <h3>${bandLabel}</h3>
                        <p>${this.escapeHtml(overviewSentence)}</p>
                    </div>
                    <div class="stats-overview-meta">
                        <span class="stats-scope-chip">${bandLabel}</span>
                        <span class="stats-year-chip">${year}</span>
                    </div>
                </section>
            `;
        }

        container.innerHTML = `
            <div class="stats-shell">
                <div class="stats-kpi-grid">
                    <article class="stats-kpi-card stats-kpi-card-events">
                        <div class="stats-card-head">
                            <span class="stats-kpi-kicker">Auftritte</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('events')}</span>
                        </div>
                        <div class="stats-kpi-value">${data.totalEvents}</div>
                        <p>${this.escapeHtml(eventSentence)}</p>
                    </article>

                    <article class="stats-kpi-card stats-kpi-card-rehearsals">
                        <div class="stats-card-head">
                            <span class="stats-kpi-kicker">Proben</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('rehearsals')}</span>
                        </div>
                        <div class="stats-kpi-value">${data.totalRehearsals}</div>
                        <p>${this.escapeHtml(rehearsalSentence)}</p>
                    </article>

                    <article class="stats-kpi-card stats-kpi-card-repertoire">
                        <div class="stats-card-head">
                            <span class="stats-kpi-kicker">Repertoire</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('repertoire')}</span>
                        </div>
                        <div class="stats-kpi-value">${data.repertoireSize}</div>
                        <p>${this.escapeHtml(repertoireSentence)}</p>
                    </article>

                    <article class="stats-kpi-card stats-kpi-card-bands">
                        <div class="stats-card-head">
                            <span class="stats-kpi-kicker">Bands</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('bands')}</span>
                        </div>
                        <div class="stats-kpi-value">${data.totalBands}</div>
                        <p>${this.escapeHtml(bandSentence)}</p>
                    </article>
                </div>

                <div class="stats-insights-grid">
                    <article class="stats-insight-card stats-insight-card-feature">
                        <div class="stats-card-head">
                            <span class="stats-panel-kicker">Meistgespielt</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('feature')}</span>
                        </div>
                        <h4>${topSongName}</h4>
                        <p>${this.escapeHtml(topSongSentence)}</p>
                    </article>

                    <article class="stats-insight-card stats-insight-card-location">
                        <div class="stats-card-head">
                            <span class="stats-panel-kicker">Lieblings-Location</span>
                            <span class="stats-card-icon" aria-hidden="true">${this.getStatIcon('location')}</span>
                        </div>
                        <h4>${favLocationName}</h4>
                        <p>${this.escapeHtml(favLocationSentence)}</p>
                    </article>
                </div>

            </div>
        `;
    },
    // Calculate best dates (used by other modules)
    async getBestDates(rehearsalId, limit = 3) {
        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (!rehearsal) return [];

        const members = await Storage.getBandMembers(rehearsal.bandId);
        const votes = (await Storage.getRehearsalVotes(rehearsalId)) || [];

        const dateStats = rehearsal.proposedDates.map((date, index) => {
            const dateVotes = votes.filter(v => v.dateIndex === index);
            const yesCount = dateVotes.filter(v => v.availability === 'yes').length;
            const maybeCount = dateVotes.filter(v => v.availability === 'maybe').length;
            const score = yesCount + (maybeCount * 0.5);

            return {
                date,
                index,
                yesCount,
                maybeCount,
                score
            };
        });

        return dateStats
            .sort((a, b) => b.score - a.score)
            .filter(d => d.score > 0)
            .slice(0, limit);
    }
};
