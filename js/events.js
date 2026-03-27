// Events Management Module

const Events = {
    currentFilter: '',
    currentEventId: null,
    expandedEventId: null,
    currentStatusTab: 'pending',
    eventsCache: null,
    dataContextCache: null,
    isLoading: false,

    // Clear all cached data (called during logout)
    clearCache() {
        this.eventsCache = null;
        this.dataContextCache = null;
        this.currentFilter = '';
        this.currentEventId = null;
        this.expandedEventId = null;
        this.currentStatusTab = 'pending';
    },

    invalidateCache() {
        Logger.info('[Events] Cache invalidated.');
        this.eventsCache = null;
        this.dataContextCache = null;
        if (typeof Statistics !== 'undefined') Statistics.invalidateCache();
    },

    setupStatusSwitcher() {
        const view = document.getElementById('eventsView');
        if (!view) return;

        view.querySelectorAll('[data-events-status]').forEach(button => {
            if (button.dataset.initialized) return;
            button.dataset.initialized = 'true';
            button.addEventListener('click', () => {
                this.currentStatusTab = button.dataset.eventsStatus;
                this.syncStatusPanels();
            });
        });
    },

    syncStatusPanels() {
        const view = document.getElementById('eventsView');
        if (!view) return;

        view.querySelectorAll('[data-events-status]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.eventsStatus === this.currentStatusTab);
        });

        view.querySelectorAll('[data-events-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.dataset.eventsPanel === this.currentStatusTab);
        });
    },

    updateStatusSummary(counts) {
        const countMap = {
            pending: document.getElementById('eventsStatusCountPending'),
            voted: document.getElementById('eventsStatusCountVoted'),
            resolved: document.getElementById('eventsStatusCountResolved')
        };

        Object.entries(counts).forEach(([key, value]) => {
            if (countMap[key]) {
                countMap[key].textContent = value;
            }
        });

        if (!counts[this.currentStatusTab]) {
            this.currentStatusTab = counts.pending ? 'pending' : counts.voted ? 'voted' : 'resolved';
        }

        this.setupStatusSwitcher();
        this.syncStatusPanels();
    },

    // Helper to get display name
    _getUserName(user) {
        if (!user) return 'Unbekannt';
        // Try various name fields
        if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
        if (user.first_name) return user.first_name;
        if (user.name) return user.name; // Legacy/fallback
        if (user.username) return user.username;
        return 'Unbekannt';
    },

    // Render all events
    async renderEvents(filterBandId = '', forceRefresh = false) {
        if (this.isLoading) {
            Logger.warn('[Events] Already loading, skipping.');
            return;
        }

        const user = Auth.getCurrentUser();
        if (!user) return;

        this.isLoading = true;
        UI.showLoading('Auftritte werden geladen...');
        Logger.time('Load Events');

        try {
            let events = (await Storage.getUserEvents(user.id)) || [];

            // 1. Collect all IDs for batch fetching
            const eventIds = events.map(e => e.id);
            const memberIds = [...new Set([
                ...events.flatMap(e => e.members || []),
                ...events.map(e => e.createdBy).filter(Boolean)
            ])];

            // 2. Batch Fetch everything in parallel
            const [
                songsBatch,
                membersBatch,
                absencesBatch,
                userBandsBatch, // For roles
                votesBatch,
                suggestionsBatch
            ] = await Promise.all([
                Storage.getEventSongsForMultipleEvents(eventIds),
                Storage.getBatchByIds('users', memberIds),
                Storage.getBatchByIds('absences', memberIds),
                Storage.getUserBands(user.id),
                Storage.getEventVotesForMultipleEvents(eventIds),
                Storage.getEventTimeSuggestionsForMultipleEvents(eventIds)
            ]);

            // 3. Create a data context
            const dataContext = {
                songs: (songsBatch || []).reduce((acc, s) => {
                    const eid = s.eventId || s.event_id;
                    if (eid) {
                        if (!acc[eid]) acc[eid] = [];
                        acc[eid].push(s);
                    }
                    return acc;
                }, {}),
                members: membersBatch.reduce((acc, u) => ({ ...acc, [u.id]: u }), {}),
                absences: absencesBatch.reduce((acc, a) => {
                    if (!acc[a.userId]) acc[a.userId] = [];
                    acc[a.userId].push(a);
                    return acc;
                }, {}),
                userBands: userBandsBatch.reduce((acc, b) => ({ ...acc, [b.id]: b }), {}),
                votes: (votesBatch || []).reduce((acc, v) => {
                    if (!acc[v.eventId]) acc[v.eventId] = [];
                    acc[v.eventId].push(v);
                    return acc;
                }, {}),
                suggestions: (suggestionsBatch || []).reduce((acc, s) => {
                    if (!acc[s.eventId]) acc[s.eventId] = [];
                    acc[s.eventId].push(s);
                    return acc;
                }, {})
            };

            // Set Cache
            this.eventsCache = events;
            this.dataContextCache = dataContext;

            // Apply filter
            if (filterBandId) {
                events = events.filter(e => e.bandId === filterBandId);
            }

            // Categorize events
            const pendingEvents = [];
            const votedEvents = [];
            const resolvedEvents = [];

            for (const event of events) {
                if (event.status !== 'pending') {
                    resolvedEvents.push(event);
                    continue;
                }

                const eventVotes = dataContext.votes[event.id] || [];
                const userVote = eventVotes.find(v => String(v.userId) === String(user.id));

                // Only count as voted if there is an active availability (not 'none')
                const hasVoted = userVote && userVote.availability !== 'none';

                if (hasVoted) {
                    votedEvents.push(event);
                } else {
                    pendingEvents.push(event);
                }
            }

            // Helper to sort events
            const sortByDate = (arr, ascending = true) => {
                arr.sort((a, b) => {
                    const dateA = a.date ? new Date(a.date) : (a.proposedDates?.[0] ? new Date(a.proposedDates[0].start) : new Date(0));
                    const dateB = b.date ? new Date(b.date) : (b.proposedDates?.[0] ? new Date(b.proposedDates[0].start) : new Date(0));
                    return ascending ? dateA - dateB : dateB - dateA;
                });
            };

            sortByDate(pendingEvents);
            sortByDate(votedEvents);
            sortByDate(resolvedEvents, false); // Bestätigte: Neueste zuerst

            this.updateStatusSummary({
                pending: pendingEvents.length,
                voted: votedEvents.length,
                resolved: resolvedEvents.length
            });

            // Render lists
            const pendingContainer = document.getElementById('eventsListPending');
            const votedContainer = document.getElementById('eventsListVoted');
            const resolvedContainer = document.getElementById('eventsList');

            if (pendingContainer) {
                if (pendingEvents.length > 0) {
                    pendingContainer.innerHTML = (await Promise.all(pendingEvents.map(e => this.renderEventCard(e, dataContext)))).join('');
                } else {
                    UI.showCompactEmptyState(pendingContainer, 'Keine offenen Abstimmungen 🥳');
                }
                document.getElementById('eventsListPendingHeader').style.display = 'block';
            }
            if (votedContainer) {
                if (votedEvents.length > 0) {
                    votedContainer.innerHTML = (await Promise.all(votedEvents.map(e => this.renderEventCard(e, dataContext)))).join('');
                } else {
                    UI.showCompactEmptyState(votedContainer, 'Keine abgestimmten Auftritte 🗳️');
                }
                document.getElementById('eventsListVotedHeader').style.display = 'block';
            }
            if (resolvedContainer) {
                if (resolvedEvents.length > 0) {
                    resolvedContainer.innerHTML = (await Promise.all(resolvedEvents.map(e => this.renderEventCard(e, dataContext)))).join('');
                } else {
                    UI.showCompactEmptyState(resolvedContainer, 'Keine bestätigten Auftritte ✅');
                }
                document.getElementById('eventsListResolvedHeader').style.display = 'block';
            }

            // Add click handlers
            this.attachEventHandlers();
            Logger.timeEnd('Load Events');
        } finally {
            this.isLoading = false;
            UI.hideLoading();
        }
    },

    // Render single event card
    async renderEventCard(event, dataContext = { votes: {} }) {
        const band = event.band || await Storage.getBand(event.bandId);
        const user = Auth.getCurrentUser();
        const isExpanded = this.expandedEventId === event.id;
        const bandName = band ? band.name : 'Unbekannte Band';

        let canManage = false;
        if (dataContext.userBands) {
            const userBand = dataContext.userBands[event.bandId];
            const role = userBand ? userBand.role : null;
            canManage = Auth.isAdmin() || role === 'leader' || role === 'co-leader';
        } else {
            canManage = await Auth.canManageEvents(event.bandId);
        }

        const bandColor = band ? (band.color || '#e11d48') : '#e11d48';
        const eventVotes = dataContext.votes[event.id] || [];
        const eventMembers = Array.isArray(event.members) ? event.members : [];
        const respondedCount = new Set(
            eventVotes
                .filter(vote => vote.availability && vote.availability !== 'none')
                .map(vote => vote.userId)
        ).size;
        const hasVoted = eventVotes.some(vote => String(vote.userId) === String(user.id) && vote.availability !== 'none');
        const proposals = this.getEventProposals(event);
        const firstProposal = proposals.length > 0 ? proposals[0] : null;
        let statusText = event.status === 'pending' ? 'Offen' : 'Bestätigt';
        let statusClass = `status-${event.status}`;

        let cardContent = '';
        if (event.status === 'pending') {
            cardContent = await this._renderPendingEventBody(event, dataContext, canManage, hasVoted);
        } else {
            cardContent = await this._renderConfirmedEventBody(event, dataContext, canManage);
        }

        const headerChips = [];
        if (event.status === 'confirmed' && event.date) {
            headerChips.push(`<span class="schedule-card-chip schedule-card-chip-primary">${UI.formatDateTimeRange(event.date)}</span>`);
        } else if (proposals.length > 0) {
            if (proposals.length > 1) {
                headerChips.push(`<span class="schedule-card-chip">${proposals.length} Termine</span>`);
            }
            if (firstProposal?.start) {
                headerChips.push(`<span class="schedule-card-chip schedule-card-chip-primary">${UI.formatDateTimeRange(firstProposal.start, firstProposal.end)}</span>`);
            }
        }
        if (event.location) {
            headerChips.push(`<span class="schedule-card-chip">${Bands.escapeHtml(event.location)}</span>`);
        }

        const userStateLabel = event.status === 'pending'
            ? (hasVoted ? 'Abgestimmt' : 'Antwort offen')
            : '';
        const userStateClass = event.status === 'pending'
            ? (hasVoted ? 'is-complete' : 'is-open')
            : 'is-confirmed';
        const showPrimaryStatus = !(event.status === 'pending' && userStateLabel);
        const cardStateClass = event.status === 'pending'
            ? (hasVoted ? 'schedule-state-voted' : 'schedule-state-pending')
            : 'schedule-state-resolved';

        return `
            <div class="event-card accordion-card ${event.status === 'confirmed' && new Date(event.date) < new Date() ? 'event-past' : ''} ${cardStateClass} ${isExpanded ? 'expanded' : ''}" data-event-id="${event.id}" style="--band-accent: ${bandColor}">
                <div class="accordion-header" data-event-id="${event.id}">
                    <div class="accordion-title">
                        <div class="schedule-card-title-row">
                            <h3>${Bands.escapeHtml(event.title)}</h3>
                        </div>
                        <div class="event-band schedule-card-band">
                            ${(band && band.image_url) ?
                `<img src="${band.image_url}" class="band-mini-logo" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid var(--color-border-subtle); display: block;">` :
                `<span class="schedule-card-band-dot" style="background:${bandColor};"></span>`} 
                            <span style="font-weight: 500;">${Bands.escapeHtml(bandName)}</span>
                        </div>
                        <div class="schedule-card-meta-row">
                            ${headerChips.join('')}
                        </div>
                    </div>
                    <div class="accordion-actions">
                        <div class="schedule-card-status-stack">
                            ${showPrimaryStatus ? `
                                <span class="rehearsal-status ${statusClass}">
                                    ${statusText}
                                </span>
                            ` : ''}
                            ${userStateLabel ? `<span class="schedule-card-user-state ${userStateClass}">${userStateLabel}</span>` : ''}
                        </div>
                        <button class="accordion-toggle" aria-label="Ausklappen">
                            <span class="toggle-icon">${isExpanded ? '▼' : '▶'}</span>
                        </button>
                    </div>
                </div>
                <div class="accordion-content" style="display: ${isExpanded ? 'block' : 'none'};">
                    <div class="accordion-body">
                        ${cardContent}
                    </div>
                </div>
            </div>
        `;
    },

    async _renderConfirmedEventBody(event, dataContext, canManage) {
        const eventSongs = (dataContext.songs && (dataContext.songs[event.id] || dataContext.songs[String(event.id)])) || [];

        let detailsHtml = `
            <div class="confirmed-event-details">
                ${this._renderEventDetailsGrid(event, dataContext)}
                ${this._renderEventSetlist(event, dataContext)}
            </div>
        `;

        return `
            <div class="event-details-expanded">
                ${detailsHtml}
            </div>
            ${canManage ? `
                <div class="event-action-buttons">
                    <button class="btn btn-secondary edit-event" data-event-id="${event.id}">Bearbeiten</button>
                    <button class="btn btn-danger delete-event" data-event-id="${event.id}">Löschen</button>
                </div>
            ` : ''}
        `;
    },

    async _renderPendingEventBody(event, dataContext, canManage, hasVoted = false) {
        const members = await Storage.getBandMembers(event.bandId);

        return `
            <div class="pending-event-info">
                ${this._renderEventDetailsGrid(event, dataContext)}
                
                ${this._renderEventSetlist(event, dataContext)}

                <div class="event-action-buttons" style="margin-bottom: 1.5rem;">
                    <button class="btn btn-vote-now" data-event-id="${event.id}">
                        ${hasVoted ? 'Abstimmungen bearbeiten' : 'Jetzt abstimmen'}
                    </button>
                    ${canManage ? `
                        <button class="btn btn-primary open-event-btn" data-event-id="${event.id}">
                            Termin bestätigen
                        </button>
                        <button class="btn btn-secondary edit-event" data-event-id="${event.id}">Bearbeiten</button>
                        <button class="btn btn-danger delete-event" data-event-id="${event.id}">Löschen</button>
                    ` : ''}
                </div>

                <div class="event-overview-container">
                    ${await this.renderEventOverviewTable(event, members, dataContext, canManage)}
                </div>
            </div>
        `;
    },

    _renderEventDetailsGrid(event, dataContext) {
        const proposedBy = dataContext.members[event.createdBy];
        const proposedByName = this._getUserName(proposedBy);
        const members = (event.members || []).map(memberId => {
            const member = dataContext.members ? dataContext.members[memberId] : null;
            return member ? this._getUserName(member) : 'Unbekannt';
        });

        const guests = event.guests || [];

        let html = `
            <div class="event-details-grid">
                
                <div class="detail-item">
                    <div class="detail-label">Erstellt von</div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                         <div class="creator-avatar" style="width: 24px; height: 24px; font-size: 0.65rem; background: ${proposedBy ? UI.getAvatarColor(proposedByName) : 'var(--color-primary)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                            ${proposedBy && proposedBy.profile_image_url ? `<img src="${proposedBy.profile_image_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : UI.getUserInitials(proposedByName)}
                        </div>
                        <span class="detail-value">${Bands.escapeHtml(proposedByName)}</span>
                    </div>
                </div>

                ${event.status === 'confirmed' ? `
                <div class="detail-item">
                    <div class="detail-label">Datum & Zeit</div>
                    <div class="detail-value">${UI.formatDate(event.date)}</div>
                </div>
                ` : ''}

                <div class="detail-item">
                    <div class="detail-label">📍 Ort</div>
                    <div class="detail-value">${Bands.escapeHtml(event.location || 'Nicht angegeben')}</div>
                </div>

                ${event.soundcheckLocation ? `
                <div class="detail-item">
                    <div class="detail-label">🎚️ Soundcheck</div>
                    <div class="detail-value">${Bands.escapeHtml(event.soundcheckLocation)}</div>
                </div>
                ` : ''}

                ${event.info ? `
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <div class="detail-label">ℹ️ Event-Infos</div>
                    <div class="detail-value" style="white-space: pre-wrap; font-weight: normal;">${Bands.escapeHtml(event.info)}</div>
                </div>
                ` : ''}

                ${event.techInfo ? `
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <div class="detail-label">🔧 Technik / PA</div>
                    <div class="detail-value" style="white-space: pre-wrap; font-size: 0.9rem; color: var(--color-text-secondary); font-weight: normal;">${Bands.escapeHtml(event.techInfo)}</div>
                </div>
                ` : ''}

                <div class="detail-item" style="grid-column: 1 / -1;">
                    <div class="detail-label">👥 Besetzung</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                        ${members.map(m => `<span class="member-tag" style="font-size: 0.75rem; padding: 2px 8px;">${Bands.escapeHtml(m)}</span>`).join('')}
                        ${guests.map(g => `<span class="member-tag guest-tag" style="font-size: 0.75rem; padding: 2px 8px;">🎭 ${Bands.escapeHtml(g)} (Gast)</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
        return html;
    },

    /**
     * Helper to render the setlist table for both confirmed and pending events
     */
    _renderEventSetlist(event, dataContext) {
        const eventSongs = (dataContext.songs && (dataContext.songs[event.id] || dataContext.songs[String(event.id)])) || [];
        if (!Array.isArray(eventSongs) || eventSongs.length === 0) return '';

        const sortedSongs = [...eventSongs].sort((a, b) => (a.order || 0) - (b.order || 0));

        return `
            <div class="setlist-section" style="margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem;">
                <div class="setlist-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                    <div class="setlist-title" style="font-weight: 700; color: var(--color-text);">🎵 Setlist</div>
                    <button type="button" class="btn btn-pdf download-setlist-pdf" data-event-id="${event.id}">
                         📄 PDF
                    </button>
                </div>
                <div class="setlist-grid">
                             <table class="songs-table" style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
                                <thead style="background: var(--color-bg-secondary); font-size: 0.7rem; text-transform: uppercase; color: var(--color-text-secondary);">
                                    <tr>
                                        <th style="text-align: left; padding: 6px;">Titel</th>
                                        <th style="text-align: left; padding: 6px;">Interpret</th>
                                        <th style="text-align: center; padding: 6px;">BPM</th>
                                        <th style="text-align: center; padding: 6px;">Time</th>
                                        <th style="text-align: center; padding: 6px;">Key</th>
                                        <th style="text-align: left; padding: 6px;">Lead</th>
                                        <th style="text-align: left; padding: 6px;">Sprache</th>
                                        <th style="text-align: left; padding: 6px;">Infos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${sortedSongs.map(s => `
                                        <tr style="border-bottom: 1px solid var(--color-border-subtle);">
                                            <td style="padding: 6px; font-weight: 600; color: var(--color-text);">${Bands.escapeHtml(s.title)}</td>
                                            <td style="padding: 6px; color: var(--color-text-secondary);">${Bands.escapeHtml(s.artist || '-')}</td>
                                            <td style="padding: 6px; text-align: center; color: var(--color-text-secondary);">${s.bpm || '-'}</td>
                                            <td style="padding: 6px; text-align: center; color: var(--color-text-secondary); font-size: 0.8rem;">${s.timeSignature || '-'}</td>
                                            <td style="padding: 6px; text-align: center; font-weight: 700; color: var(--color-primary);">${s.key || '-'}</td>
                                            <td style="padding: 6px; color: var(--color-text-secondary); font-size: 0.8rem;">${Bands.escapeHtml(s.leadVocal || '-')}</td>
                                            <td style="padding: 6px; color: var(--color-text-secondary); font-size: 0.8rem;">${Bands.escapeHtml(s.language || '-')}</td>
                                            <td style="padding: 6px; color: var(--color-text-secondary); font-size: 0.8rem; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${Bands.escapeHtml(Storage.getSongPlainInfo(s) || '')}">${Bands.escapeHtml(Storage.getSongInfoPreview(s) || '-')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                             </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderEventOverviewTable(event, members, dataContext, canManage) {
        const votes = dataContext.votes[event.id] || [];
        const suggestions = dataContext.suggestions[event.id] || [];
        const proposals = this.getEventProposals(event);

        const headerHtml = `
            <thead>
                <tr>
                    <th class="date-col">Termin</th>
                    ${(await Promise.all(members.map(async m => {
            const memberUser = dataContext.members[m.userId];
            const name = memberUser ? UI.getUserDisplayName(memberUser) : 'Unbekannt';
            return `
                            <th class="member-avatar-cell" title="${Bands.escapeHtml(name)}">
                                <div class="member-avatar-mini" style="background: ${UI.getAvatarColor(name)}; width: 32px; height: 32px; font-size: 0.75rem; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; overflow: hidden; border: 2px solid var(--color-surface);">
                                    ${memberUser && memberUser.profile_image_url ?
                    `<img src="${memberUser.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">` :
                    UI.getUserInitials(name)}
                                </div>
                                <div style="font-size: 0.65rem; margin-top: 4px; max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${Bands.escapeHtml(name.split(' ')[0])}</div>
                            </th>
                        `;
        }))).join('')}
                    <th class="zusage-col">Zusagen</th>
                </tr>
            </thead>
        `;

        const rowsHtml = proposals.map((date, index) => {
            const dateString = date.start;
            const formattedDate = UI.formatDateShort(dateString);

            const dateVotes = votes.filter(v => Number(v.dateIndex) === index);
            const yesCount = dateVotes.filter(v => v.availability === 'yes').length;

            const voteCells = members.map(m => {
                const vote = votes.find(v => String(v.userId) === String(m.userId) && Number(v.dateIndex) === index);
                let icon = `
                    <span class="vote-mark-icon" aria-hidden="true">
                        <svg viewBox="0 0 20 20" fill="none">
                            <path d="M6 10H14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
                        </svg>
                    </span>
                `;
                let className = 'vote-pending';

                if (vote) {
                    if (vote.availability === 'yes') {
                        icon = `
                            <span class="vote-mark-icon" aria-hidden="true">
                                <svg viewBox="0 0 20 20" fill="none">
                                    <path d="M4.5 10.5L8 14L15.5 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                        `;
                        className = 'vote-yes';
                    } else if (vote.availability === 'no') {
                        icon = `
                            <span class="vote-mark-icon" aria-hidden="true">
                                <svg viewBox="0 0 20 20" fill="none">
                                    <path d="M6 6L14 14" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                                    <path d="M14 6L6 14" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                                </svg>
                            </span>
                        `;
                        className = 'vote-no';
                    }
                }

                return `<td class="vote-icon ${className}">${icon}</td>`;
            }).join('');

            const dateSuggestions = suggestions.filter(s => Number(s.dateIndex) === index);
            const suggestionHtml = dateSuggestions.map(s => {
                const suggUser = dataContext.members[s.userId];
                const suggName = suggUser ? UI.getUserDisplayName(suggUser) : 'Unbekannt';
                return `
                    <div class="time-suggestion-pill" title="Vorschlag von ${Bands.escapeHtml(suggName)}">
                        <span class="icon">🕐</span> ${Bands.escapeHtml(s.suggestedTime)} (${Bands.escapeHtml(suggName.split(' ')[0])})
                    </div>
                `;
            }).join('');

            return `
                <tr>
                    <td class="date-col">
                        ${formattedDate} Uhr
                        ${suggestionHtml ? `
                        <div class="time-suggestions">
                            ${suggestionHtml}
                        </div>
                        ` : ''}
                    </td>
                    ${voteCells}
                    <td class="zusage-col">${yesCount}/${members.length}</td>
                </tr>
            `;
        });

        return `
            <table class="rehearsal-overview-table">
                ${headerHtml}
                <tbody>
                    ${rowsHtml.join('')}
                </tbody>
            </table>
        `;
    },

    getEventProposals(event) {
        const raw = Array.isArray(event?.proposedDates) ? event.proposedDates : [];
        const normalized = raw.map((date) => {
            if (!date) return null;
            if (typeof date === 'string') {
                return { start: date, end: date };
            }
            if (typeof date === 'object') {
                if (date.start) {
                    return { start: date.start, end: date.end || date.start };
                }
                if (date.startTime) {
                    return { start: date.startTime, end: date.endTime || date.startTime };
                }
            }
            return null;
        }).filter(Boolean);

        if (normalized.length === 0 && event?.date) {
            normalized.push({ start: event.date, end: event.date });
        }

        return normalized;
    },

    // Attach event handlers
    attachEventHandlers() {
        // Accordion toggle
        document.querySelectorAll('.event-card .accordion-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    this.toggleAccordion(header.dataset.eventId);
                }
            });
        });

        // Toggle button explicitly
        document.querySelectorAll('.accordion-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleAccordion(btn.closest('.event-card').dataset.eventId);
            });
        });

        // Vote Now button
        document.querySelectorAll('.btn-vote-now').forEach(btn => {
            btn.onclick = () => this.openVotingModal(btn.dataset.eventId);
        });

        // Finalize Event Date (Large button)
        document.querySelectorAll('.open-event-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openEventDetails(btn.dataset.eventId);
            });
        });

        // Finalize Event Date (from Overview table)
        document.querySelectorAll('.confirm-event-proposal').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { eventId, dateIndex } = btn.dataset;
                const event = await Storage.getEvent(eventId);
                const date = event.proposedDates[dateIndex].start;
                await this.openConfirmModal(eventId, parseInt(dateIndex), date);
            });
        });

        // PDF Download
        document.querySelectorAll('.download-setlist-pdf').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const eventId = btn.dataset.eventId;
                const event = await Storage.getEvent(eventId);
                const songs = await Storage.getEventSongsForMultipleEvents([eventId]);
                if (event && songs.length > 0) {
                    App.downloadSongListPDF(songs, `Setlist: ${event.title}`, event.date ? UI.formatDate(event.date) : '', true);
                } else {
                    UI.showToast('Keine Songs in der Setlist vorhanden', 'warning');
                }
            };
        });

        // Standard actions
        document.querySelectorAll('.edit-event').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.editEvent(btn.dataset.eventId);
            };
        });

        document.querySelectorAll('.delete-event').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deleteEvent(btn.dataset.eventId);
            };
        });

        // Create Event Form Logic
        const createForm = document.getElementById('createEventForm');
        if (createForm && !createForm.dataset.initialized) {
            createForm.dataset.initialized = 'true';
            createForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleSaveEvent();
            };
        }

        const addDateBtn = document.getElementById('addEventDateBtn');
        if (addDateBtn && !addDateBtn.dataset.initialized) {
            addDateBtn.dataset.initialized = 'true';
            addDateBtn.onclick = () => this.addDateProposalRow();
        }

        document.querySelectorAll('input[name="eventScheduleMode"]').forEach(input => {
            if (input.dataset.initialized) return;
            input.dataset.initialized = 'true';
            input.addEventListener('change', () => {
                this.setScheduleMode(input.value);
            });
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close, .btn.cancel').forEach(btn => {
            if (!btn.dataset.initialized) {
                btn.dataset.initialized = 'true';
                btn.addEventListener('click', () => {
                    UI.closeAllModals();
                });
            }
        });
    },

    async openVotingModal(eventId) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const event = await Storage.getEvent(eventId);
        if (!event) return;

        const votes = (await Storage.getEventVotesForMultipleEvents([eventId])) || [];
        const userVotes = votes.filter(v => String(v.userId) === String(user.id));

        const content = document.getElementById('eventVotingContent');
        const rows = await Promise.all(event.proposedDates.map(async (date, index) => {
            const dateString = date.start;
            const currentVote = userVotes.find(v => Number(v.dateIndex) === index);
            const availability = currentVote ? currentVote.availability : 'none';
            const userSuggestion = (await Storage.getUserEventTimeSuggestionForDate(user.id, eventId, index));
            const allSuggestions = (await Storage.getEventTimeSuggestions(eventId, index)) || [];

            const otherSuggestionsHtml = allSuggestions.length > 0 ? `
                <div class="modal-time-suggestions">
                    ${(await Promise.all(allSuggestions.map(async s => {
                const suggUser = await Storage.getById('users', s.userId);
                const suggName = UI.getUserDisplayName(suggUser);
                return `<span class="time-suggestion-pill">${Bands.escapeHtml(s.suggestedTime)} · ${Bands.escapeHtml(suggName.split(' ')[0])}</span>`;
            }))).join('')}
                </div>
            ` : '';

            return `
                <div class="voting-row" data-date-index="${index}">
                    <div class="voting-row-main">
                        <div class="voting-date-info">
                            <span class="date">${UI.formatDateOnly(dateString)}</span>
                            <span class="time">${new Date(dateString).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
                        </div>
                        <button type="button" class="btn-suggest-time-modal ${userSuggestion ? 'has-suggestion' : ''}" 
                                title="${userSuggestion ? 'Zeitvorschlag bearbeiten: ' + userSuggestion.suggestedTime : 'Andere Zeit vorschlagen'}" 
                                data-event-id="${eventId}" 
                                data-date-index="${index}">
                            <span class="btn-suggest-time-icon">🕐</span>
                            <span class="btn-suggest-time-label">${userSuggestion ? Bands.escapeHtml(userSuggestion.suggestedTime) : 'Zeit vorschlagen'}</span>
                        </button>
                    </div>
                    ${otherSuggestionsHtml}
                    <div class="voting-options" role="group" aria-label="Verfügbarkeit wählen">
                        <button type="button" class="voting-option-btn yes ${availability === 'yes' ? 'active' : ''}" data-value="yes" title="Ich kann">
                            <span class="vote-choice-icon">✓</span>
                            <span class="vote-choice-label">Ja</span>
                        </button>
                        <button type="button" class="voting-option-btn no ${availability === 'no' ? 'active' : ''}" data-value="no" title="Ich kann nicht">
                            <span class="vote-choice-icon">✕</span>
                            <span class="vote-choice-label">Nein</span>
                        </button>
                        <button type="button" class="voting-option-btn none ${availability === 'none' ? 'active' : ''}" data-value="none" title="Keine Angabe">
                            <span class="vote-choice-icon">–</span>
                            <span class="vote-choice-label">Offen</span>
                        </button>
                    </div>
                </div>
            `;
        }));
        content.innerHTML = rows.join('');

        // Attach listeners to voting buttons in modal
        const buttons = content.querySelectorAll('.voting-option-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.voting-row');
                row.querySelectorAll('.voting-option-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Attach listeners to time suggest buttons in modal
        content.querySelectorAll('.btn-suggest-time-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openTimeSuggestionModal(btn.dataset.eventId, parseInt(btn.dataset.dateIndex));
            });
        });

        // Set up save button
        const saveForm = document.getElementById('eventVotingForm');
        saveForm.onsubmit = async (e) => {
            e.preventDefault();
            const newVotes = [];
            content.querySelectorAll('.voting-row').forEach(row => {
                const index = parseInt(row.dataset.dateIndex);
                const activeBtn = row.querySelector('.voting-option-btn.active');
                if (activeBtn) {
                    newVotes.push({
                        dateIndex: index,
                        availability: activeBtn.dataset.value
                    });
                }
            });

            UI.showLoading('Speichere Abstimmungen...');
            try {
                await this.handleSaveVotes(eventId, newVotes);
                UI.closeModal('eventVotingModal');
                UI.showToast('Abstimmungen gespeichert', 'success');
                await this.renderEvents(this.currentFilter, true);
            } catch (error) {
                UI.showToast('Fehler beim Speichern', 'error');
            } finally {
                UI.hideLoading();
            }
        };

        UI.openModal('eventVotingModal');
    },

    async handleSaveVotes(eventId, votes) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        this.invalidateCache();
        const existingVotes = await Storage.getUserEventVotes(user.id, eventId);

        for (const vote of votes) {
            const targetDateIndex = Number(vote.dateIndex);
            const existingForDate = existingVotes.filter(existingVote => Number(existingVote.dateIndex) === targetDateIndex);

            if (existingForDate.length > 0) {
                for (const existingVote of existingForDate) {
                    const deleted = await Storage.deleteVote(existingVote.id);
                    if (!deleted) {
                        throw new Error('Vorhandene Abstimmung konnte nicht aktualisiert werden.');
                    }
                }
            }

            if (vote.availability !== 'none') {
                const createdVote = await Storage.createEventVote({
                    userId: user.id,
                    eventId: String(eventId),
                    dateIndex: targetDateIndex,
                    availability: vote.availability
                });
                if (!createdVote) {
                    throw new Error('Abstimmung konnte nicht gespeichert werden.');
                }
            }
        }
    },

    openTimeSuggestionModal(eventId, dateIndex) {
        document.getElementById('suggestTimeEventId').value = eventId;
        document.getElementById('suggestTimeEventDateIndex').value = dateIndex;
        document.getElementById('eventSuggestedTimeInput').value = '';
        UI.openModal('eventTimeSuggestionModal');
    },

    getScheduleMode() {
        return document.querySelector('input[name="eventScheduleMode"]:checked')?.value === 'proposals'
            ? 'proposals'
            : 'fixed';
    },

    resolveScheduleModeFromEvent(event, confirmDate = null) {
        if (confirmDate) return 'fixed';

        if (Array.isArray(event?.proposedDates) && event.proposedDates.length > 0 && event.status !== 'confirmed') {
            return 'proposals';
        }

        return 'fixed';
    },

    collectDateProposals() {
        const proposals = [];

        document.querySelectorAll('#eventDateProposals .date-proposal-item').forEach(row => {
            const date = row.querySelector('.event-date-input-date')?.value;
            const start = row.querySelector('.event-date-input-start')?.value;

            if (date && start) {
                proposals.push({
                    start: `${date}T${start}`,
                    end: `${date}T${start}`
                });
            }
        });

        return proposals;
    },

    resetDateProposalRows() {
        const container = document.getElementById('eventDateProposals');
        if (!container) return;

        container.innerHTML = '';
        this.addDateProposalRow();
    },

    setScheduleMode(mode = 'fixed', options = {}) {
        const normalizedMode = mode === 'proposals' ? 'proposals' : 'fixed';
        const fixedRadio = document.getElementById('eventScheduleModeFixed');
        const proposalsRadio = document.getElementById('eventScheduleModeProposals');
        const modeSection = document.getElementById('eventScheduleModeSection');
        const fixedSection = document.getElementById('eventFixedDateSection');
        const proposalsSection = document.getElementById('eventDateProposalsSection');
        const fixedDateInput = document.getElementById('eventDate');
        const fixedDateIndicator = document.getElementById('eventFixedDateAvailability');
        const proposalsContainer = document.getElementById('eventDateProposals');

        if (fixedRadio) fixedRadio.checked = normalizedMode === 'fixed';
        if (proposalsRadio) proposalsRadio.checked = normalizedMode === 'proposals';

        if (modeSection) {
            modeSection.style.display = options.lockMode ? 'none' : '';
        }

        if (fixedSection) {
            fixedSection.style.display = normalizedMode === 'fixed' ? '' : 'none';
        }

        if (proposalsSection) {
            proposalsSection.style.display = normalizedMode === 'proposals' ? 'block' : 'none';
        }

        if (fixedDateInput) {
            fixedDateInput.required = normalizedMode === 'fixed';
        }

        if (fixedDateIndicator && normalizedMode !== 'fixed') {
            fixedDateIndicator.textContent = '';
            fixedDateIndicator.className = 'date-availability';
        }

        if (normalizedMode === 'proposals' && proposalsContainer && !proposalsContainer.querySelector('.date-proposal-item')) {
            this.addDateProposalRow();
        }

        if (options.refreshAvailability !== false) {
            this.updateAvailabilityIndicators();
        }
    },

    async openConfirmModal(eventId, dateIndex) {
        const event = await Storage.getEvent(eventId);
        if (!event) return;

        const prop = event.proposedDates[dateIndex];

        document.getElementById('confirmEventId').value = eventId;
        document.getElementById('confirmEventDateIndex').value = dateIndex;
        document.getElementById('confirmEventTitle').value = event.title;
        document.getElementById('confirmEventLocation').value = event.location || '';
        document.getElementById('confirmEventStartTime').value = prop.start.slice(0, 16);
        document.getElementById('confirmEventEndTime').value = prop.end.slice(0, 16);

        UI.openModal('confirmEventModal');
    },

    addDateProposalRow() {
        const container = document.getElementById('eventDateProposals');
        const row = document.createElement('div');
        row.className = 'date-proposal-item';
        row.innerHTML = `
            <div class="date-time-range">
                <input type="date" class="event-date-input-date">
                <input type="time" class="event-date-input-start">
            </div>
            <span class="event-date-availability date-availability" style="margin-left:8px"></span>
            <button type="button" class="btn-icon remove-event-date">🗑️</button>
        `;
        container.appendChild(row);

        row.querySelector('.remove-event-date').onclick = () => {
             row.remove();
             this.updateAvailabilityIndicators();
        };

        row.querySelectorAll('input').forEach(input => {
             input.addEventListener('change', () => this.updateAvailabilityIndicators());
        });
    },

    async openEventDetails(eventId) {
        const event = await Storage.getEvent(eventId);
        if (!event) return;

        this.currentEventId = eventId;
        const band = await Storage.getBand(event.bandId);
        const members = await Storage.getBandMembers(event.bandId);
        const votes = (await Storage.getEventVotesForMultipleEvents([eventId])) || [];

        // Calculate statistics and get time suggestions for each date
        const dateStats = await Promise.all((event.proposedDates || []).map(async (date, index) => {
            const dateVotes = votes.filter(v => v.dateIndex === index);
            const yesCount = dateVotes.filter(v => v.availability === 'yes').length;
            const noCount = dateVotes.filter(v => v.availability === 'no').length;

            // Get time suggestions for this date
            const timeSuggestions = await Storage.getEventTimeSuggestions(eventId, index);
            const suggestionsByTime = {};
            for (const suggestion of timeSuggestions) {
                const time = suggestion.suggestedTime;
                if (!suggestionsByTime[time]) suggestionsByTime[time] = [];
                const suggUser = await Storage.getById('users', suggestion.userId);
                if (suggUser) {
                    const name = UI.getUserDisplayName(suggUser);
                    if (!suggestionsByTime[time].includes(name)) suggestionsByTime[time].push(name);
                }
            }

            return { date, index, yesCount, noCount, score: yesCount, timeSuggestions: suggestionsByTime };
        }));

        const votedUserIds = new Set(votes.map(v => v.userId));
        const notVoted = members.filter(m => !votedUserIds.has(m.userId));

        document.getElementById('eventDetailsTitle').textContent = event.title;
        document.getElementById('eventDetailsContent').innerHTML = `
            <div class="rehearsal-details-view">
                <div class="detail-section">
                    <h3>📊 Abstimmungsübersicht</h3>
                    <p><strong>Band:</strong> ${Bands.escapeHtml(band?.name || '')}</p>
                    <p><strong>Abgestimmt:</strong> ${votedUserIds.size} von ${members.length} Mitgliedern</p>
                    ${notVoted.length > 0 ? `
                        <p><strong>Noch nicht abgestimmt:</strong> ${await Promise.all(notVoted.map(async m => {
            const u = await Storage.getById('users', m.userId);
            return Bands.escapeHtml(u ? UI.getUserDisplayName(u) : 'Unbekannt');
        })).then(names => names.join(', '))}</p>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h3>🏆 Termine zur Auswahl</h3>
                    ${dateStats.sort((a, b) => b.score - a.score).map((stat, idx) => `
                        <div class="best-date-option ${idx === 0 ? 'is-best' : ''}">
                            <div class="date-header">
                                ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📅'} 
                                ${UI.formatDate(stat.date.start)}
                            </div>
                            <div class="vote-breakdown">
                                ✅ ${stat.yesCount} können • ❌ ${stat.noCount} können nicht
                            </div>
                            ${Object.keys(stat.timeSuggestions).length > 0 ? `
                                <div class="time-suggestions-compact">
                                    <strong>🕐 Zeitvorschläge:</strong>
                                    ${Object.entries(stat.timeSuggestions).map(([time, users]) => `
                                        <span class="time-suggestion-tag">${time} (${users.join(', ')})</span>
                                    `).join('')}
                                </div>
                            ` : ''}
                            <button class="btn btn-primary select-event-date-btn" 
                                    data-date-index="${stat.index}"
                                    data-date="${stat.date.start}">
                                Diesen Termin auswählen
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.querySelectorAll('.select-event-date-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await this.openConfirmModal(eventId, parseInt(btn.dataset.dateIndex), btn.dataset.date);
            });
        });

        UI.openModal('eventDetailsModal');
    },

    async openConfirmModal(eventId, dateIndex, date) {
        // Close the selection details modal first
        UI.closeModal('eventDetailsModal');

        // Reuse edit modal but prefill the confirmed date
        // 'date' can be string or object. If object, take start.
        const dateString = (typeof date === 'object' && date.start) ? date.start : date;

        await this.editEvent(eventId, dateString);
    },

    async confirmEventProposal(eventId, dateIndex) {
        if (!await UI.confirm('Diesen Termin endgültig bestätigen?')) return;

        try {
            const event = await Storage.getEvent(eventId);
            if (!event || !event.proposedDates || !event.proposedDates[dateIndex]) {
                UI.showToast('Termin nicht gefunden', 'error');
                return;
            }

            const chosenDate = event.proposedDates[dateIndex].start;

            await Storage.updateEvent(eventId, {
                status: 'confirmed',
                date: chosenDate,
                proposedDates: [] // Clear proposals after confirmation
            });

            UI.showToast('Auftritt wurde bestätigt!', 'success');
            await this.renderEvents(this.currentFilter, true);
        } catch (error) {
            console.error('Error confirming event:', error);
            UI.showToast('Fehler beim Bestätigen', 'error');
        }
    },

    async handleSaveEvent() {
        const eventId = document.getElementById('editEventId').value;
        const bandId = document.getElementById('eventBand').value;
        const title = document.getElementById('eventTitle').value;
        const scheduleMode = this.getScheduleMode();
        const fixedDate = scheduleMode === 'fixed' ? document.getElementById('eventDate').value : '';
        const location = document.getElementById('eventLocation').value;

        if (!bandId) {
            UI.showToast('Bitte wähle eine Band aus.', 'warning');
            return;
        }

        if (!await Auth.canManageEvents(bandId)) {
            UI.showToast('Keine Berechtigung – nur Leiter und Co-Leiter dürfen Auftritte für diese Band erstellen oder bearbeiten.', 'error');
            return;
        }

        const proposals = scheduleMode === 'proposals' ? this.collectDateProposals() : [];

        if (scheduleMode === 'fixed' && !fixedDate) {
            UI.showToast('Bitte trage den festen Termin ein.', 'warning');
            return;
        }

        if (scheduleMode === 'proposals' && proposals.length === 0) {
            UI.showToast('Bitte gib mindestens einen Terminvorschlag mit Uhrzeit an.', 'warning');
            return;
        }

        const user = Auth.getCurrentUser();
        const eventData = {
            bandId,
            title,
            location,
            soundcheckLocation: document.getElementById('eventSoundcheckLocation')?.value,
            status: scheduleMode === 'fixed' ? 'confirmed' : 'pending',
            date: scheduleMode === 'fixed' ? fixedDate : (proposals.length > 0 ? proposals[0].start : null),
            proposedDates: scheduleMode === 'proposals' ? proposals : [],
            info: document.getElementById('eventInfo').value,
            techInfo: document.getElementById('eventTechInfo').value,
            members: this.getSelectedMembers(),
            guests: this.getGuests()
        };

        if (!eventId) {
            eventData.createdBy = user.id;
        }

        const persistEvent = async () => {
            try {
                let savedEventId = eventId;
                if (eventId) {
                    await Storage.updateEvent(eventId, eventData);
                    UI.showToast('Auftritt aktualisiert', 'success');
                } else {
                    const newEvent = await Storage.createEvent(eventData);
                    savedEventId = newEvent?.id;
                    UI.showToast('Auftritt erstellt', 'success');
                }

                // Save Songs
                if (savedEventId && typeof App !== 'undefined') {
                    // Use syncEventSongs to handle additions, deletions, and ordering
                    // We pass draftEventSongIds which contains mixture of existing IDs and new BandSong IDs
                    await App.syncEventSongs(savedEventId, App.draftEventSongIds || []);

                    // Clear draft
                    App.draftEventSongIds = [];
                    App.draftEventSongOverrides = {};
                    App.deletedEventSongs = [];

                    if (App.updateDashboard) await App.updateDashboard();
                }

                UI.closeModal('createEventModal');
                await this.renderEvents(this.currentFilter, true);
            } catch (error) {
                console.error('Error saving event:', error);
                UI.showToast('Fehler beim Speichern', 'error');
            }
        };

        const datesToCheck = scheduleMode === 'fixed'
            ? (fixedDate ? [fixedDate] : [])
            : proposals.map(proposal => proposal.start);
        const absenceConflicts = await this.collectSelectedMemberAbsenceConflicts(datesToCheck);

        if (absenceConflicts.length > 0) {
            const lines = absenceConflicts.map(conflict => `• ${conflict.name}: ${conflict.dates.join(', ')}`);
            const msg = `Folgende Mitglieder haben für die ausgewählten Auftrittstermine Abwesenheiten eingetragen:\n\n${lines.join('\n')}\n\nMöchtest du den Auftritt trotzdem speichern?`;
            UI.showConfirm(msg, async () => {
                await persistEvent();
            }, null, {
                kicker: 'Abwesenheiten',
                title: 'Mitglieder nicht verfügbar',
                confirmText: 'Trotzdem speichern',
                confirmClass: 'btn-warning'
            });
            return;
        }

        await persistEvent();
    },

    toggleAccordion(eventId) {
        const card = document.querySelector(`.event-card[data-event-id="${eventId}"]`);
        if (!card) return;

        const content = card.querySelector('.accordion-content');
        const wasExpanded = this.expandedEventId === eventId;

        document.querySelectorAll('.event-card').forEach(c => {
            c.classList.remove('expanded');
            const cont = c.querySelector('.accordion-content');
            if (cont) cont.style.display = 'none';
            const icon = c.querySelector('.toggle-icon');
            if (icon) icon.textContent = '▶';
        });

        if (!wasExpanded) {
            card.classList.add('expanded');
            if (content) content.style.display = 'block';
            const icon = card.querySelector('.toggle-icon');
            if (icon) icon.textContent = '▼';
            this.expandedEventId = eventId;
        } else {
            this.expandedEventId = null;
        }
    },

    async deleteEvent(eventId) {
        if (await UI.confirmDelete('Wirklich löschen?')) {
            await Storage.deleteEvent(eventId);
            UI.showToast('Gelöscht', 'success');
            await this.renderEvents(this.currentFilter, true);
        }
    },

    async editEvent(eventId, confirmDate = null) {
        const event = await Storage.getEvent(eventId);
        if (!event) return;

        this.currentEventId = eventId;
        document.getElementById('editEventId').value = eventId;
        document.getElementById('eventModalTitle').textContent = confirmDate ? 'Auftritt bestätigen' : 'Auftritt bearbeiten';

        await this.populateBandSelect();
        document.getElementById('eventBand').value = event.bandId;
        document.getElementById('eventTitle').value = event.title;

        // If confirming, use the passed date. Otherwise, use existing date if confirmed.
        const dateValue = confirmDate || ((event.status === 'confirmed' && event.date) ? event.date.slice(0, 16) : '');
        document.getElementById('eventDate').value = dateValue;

        document.getElementById('eventLocation').value = event.location || '';
        document.getElementById('eventSoundcheckLocation').value = event.soundcheckLocation || '';
        document.getElementById('eventInfo').value = event.info || '';
        document.getElementById('eventTechInfo').value = event.techInfo || '';
        document.getElementById('eventGuests').value = (event.guests || []).join('\n');

        // Toggle sections if they have content
        const extrasCheck = document.getElementById('eventShowExtras');
        if (extrasCheck) {
            extrasCheck.checked = !!(event.soundcheckLocation || event.info || event.techInfo);
            document.getElementById('eventExtrasFields').style.display = extrasCheck.checked ? 'block' : 'none';
        }
        const guestsCheck = document.getElementById('eventShowGuests');
        if (guestsCheck) {
            guestsCheck.checked = !!(event.guests && event.guests.length > 0);
            document.getElementById('eventGuestsField').style.display = guestsCheck.checked ? 'block' : 'none';
        }

        // Reset button text to 'Speichern' or 'Bestätigen'
        const saveBtn = document.getElementById('saveEventBtn');
        if (saveBtn) saveBtn.textContent = confirmDate ? 'Bestätigen' : 'Speichern';

        await this.loadBandMembers(event.bandId, event.members);

        // Load songs for this event into the App pool for the modal
        const eventSongs = await Storage.getEventSongs(eventId);
        if (typeof App !== 'undefined') {
            App.draftEventSongIds = (eventSongs || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(s => s.id);
            App.draftEventSongOverrides = {};
            await App.renderDraftEventSongs();
        }

        const container = document.getElementById('eventDateProposals');
        container.innerHTML = '';
        const scheduleMode = this.resolveScheduleModeFromEvent(event, confirmDate);

        if (confirmDate) {
            this.setScheduleMode('fixed', { lockMode: true, refreshAvailability: false });
        } else {
            if (event.proposedDates && event.proposedDates.length > 0) {
                event.proposedDates.forEach(prop => {
                    const row = document.createElement('div');
                    row.className = 'date-proposal-item';
                    const d = prop.start.split('T')[0];
                    const s = prop.start.split('T')[1].slice(0, 5);
                    row.innerHTML = `
                        <div class="date-time-range">
                            <input type="date" class="event-date-input-date" value="${d}">
                            <input type="time" class="event-date-input-start" value="${s}">
                        </div>
                        <span class="event-date-availability date-availability" style="margin-left:8px"></span>
                        <button type="button" class="btn-icon remove-event-date">🗑️</button>
                    `;
                    container.appendChild(row);
                    row.querySelector('.remove-event-date').onclick = () => {
                        row.remove();
                        this.updateAvailabilityIndicators();
                    };
                    row.querySelectorAll('input').forEach(input => {
                        input.addEventListener('change', () => this.updateAvailabilityIndicators());
                    });
                });
            } else if (scheduleMode === 'proposals') {
                this.addDateProposalRow();
            }

            this.setScheduleMode(scheduleMode, { lockMode: false, refreshAvailability: false });
        }

        const songPoolBtn = document.getElementById('copyBandSongsBtn');
        if (songPoolBtn) songPoolBtn.style.display = 'block';

        UI.openModal('createEventModal');
        this.updateAvailabilityIndicators();
    },

    getSelectedMembers() {
        return Array.from(document.querySelectorAll('#eventBandMembers input:checked')).map(cb => cb.value);
    },

    getGuests() {
        const text = document.getElementById('eventGuests')?.value || '';
        return text.split('\n').filter(l => l.trim());
    },

    getInstrumentLabels(user = {}) {
        if (typeof Bands !== 'undefined' && typeof Bands.getInstrumentLabels === 'function') {
            const direct = Bands.getInstrumentLabels(user.instrument);
            if (direct && direct.length > 0) return direct;
        }

        const rawValues = [];
        if (typeof user.instrument === 'string' && user.instrument.trim()) rawValues.push(user.instrument);
        if (Array.isArray(user.instruments)) rawValues.push(...user.instruments);

        const parsed = rawValues.flatMap(value => {
            if (typeof value !== 'string') return [];
            const trimmed = value.trim();
            if (!trimmed) return [];

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try {
                    const json = JSON.parse(trimmed);
                    return Array.isArray(json) ? json : [];
                } catch (error) {
                    // ignore invalid JSON and fall back to CSV parsing
                }
            }

            return trimmed.split(',').map(part => part.trim());
        });

        return [...new Set(parsed.filter(Boolean))];
    },

    getMemberConflictSummaryLabel(memberConflicts = []) {
        const memberConflictCount = memberConflicts.length || 1;
        return memberConflictCount === 1
            ? '1 ausgewähltes Mitglied ist nicht verfügbar'
            : `${memberConflictCount} ausgewählte Mitglieder sind nicht verfügbar`;
    },

    getMemberStatusMeta(memberConflicts = []) {
        if (memberConflicts.length > 0) {
            return null;
        }

        return {
            tone: 'success',
            text: 'Mitglieder: alle ausgewählten Mitglieder sind verfügbar'
        };
    },

    buildMemberStatusMarkup(memberConflicts = []) {
        const memberStatus = this.getMemberStatusMeta(memberConflicts);
        if (!memberStatus) return '';

        return `
            <div class="proposal-status-stack">
                <span class="proposal-status-line is-${memberStatus.tone}">✓ ${memberStatus.text}</span>
            </div>
        `;
    },

    collectMemberConflicts(startDateTime, endDateTime) {
        if (typeof App === 'undefined' || !App.checkMembersAvailabilityLocally || !Array.isArray(this.currentBandMemerAbsences)) {
            return [];
        }

        const selectedMembers = typeof this.getSelectedMembers === 'function' ? this.getSelectedMembers() : [];
        const relevantAbsences = this.currentBandMemerAbsences.filter(absence => selectedMembers.includes(String(absence.userId)));

        return App.checkMembersAvailabilityLocally(relevantAbsences, startDateTime, endDateTime).map(conflict => {
            const card = document.querySelector(`.member-select-card[data-user-id="${conflict.userId}"]`);
            const userName = card?.querySelector('.member-select-name')?.textContent?.trim() || 'Ein Mitglied';

            return {
                ...conflict,
                name: userName,
                reason: conflict.reason || 'Abwesend'
            };
        });
    },

    buildMemberConflictDetailsSection(memberConflicts = []) {
        if (!Array.isArray(memberConflicts) || memberConflicts.length === 0) return '';

        const headerText = memberConflicts.length === 1
            ? 'Dieses ausgewählte Mitglied ist in diesem Zeitraum nicht verfügbar:'
            : 'Diese ausgewählten Mitglieder sind in diesem Zeitraum nicht verfügbar:';

        return `
            <div class="conflict-details-header">${headerText}</div>
            ${memberConflicts.map(conflict => {
                const name = Bands.escapeHtml(conflict.name || 'Ein Mitglied');
                const reason = conflict.reason ? ` (${Bands.escapeHtml(conflict.reason)})` : '';
                return `<div class="conflict-item">• ${name}${reason}</div>`;
            }).join('')}
        `;
    },

    buildAvailabilityDetailsHtml(memberConflicts = []) {
        if (!Array.isArray(memberConflicts) || memberConflicts.length === 0) return '';
        return `<div class="member-details-box">${this.buildMemberConflictDetailsSection(memberConflicts)}</div>`;
    },

    async collectSelectedMemberAbsenceConflicts(dateValues = []) {
        const selectedMembers = typeof this.getSelectedMembers === 'function' ? this.getSelectedMembers() : [];
        if (!Array.isArray(dateValues) || dateValues.length === 0 || selectedMembers.length === 0) {
            return [];
        }

        const conflicts = [];

        for (const memberId of selectedMembers) {
            const [user, absences] = await Promise.all([
                Storage.getById('users', memberId),
                Storage.getUserAbsences(memberId)
            ]);

            const userConflicts = dateValues
                .filter(dateToCheck => {
                    const eventDate = new Date(dateToCheck);
                    return (absences || []).some(absence => {
                        const start = new Date(absence.startDate);
                        const end = new Date(absence.endDate);

                        if (!(typeof absence.startDate === 'string' && absence.startDate.includes('T'))) {
                            start.setHours(0, 0, 0, 0);
                        }

                        const endIsMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0;
                        if (!(typeof absence.endDate === 'string' && absence.endDate.includes('T')) || endIsMidnight) {
                            end.setHours(23, 59, 59, 999);
                        }

                        return eventDate >= start && eventDate <= end;
                    });
                })
                .map(dateToCheck => UI.formatDateOnly(new Date(dateToCheck).toISOString()));

            if (userConflicts.length > 0) {
                conflicts.push({
                    name: UI.getUserDisplayName(user),
                    dates: [...new Set(userConflicts)]
                });
            }
        }

        return conflicts;
    },

    async loadBandMembers(bandId, selectedMembers = null) {
        const container = document.getElementById('eventBandMembers');
        if (!container) return;
        if (!bandId) {
            container.innerHTML = '<div class="member-selection-empty">Bitte zuerst eine Band auswählen.</div>';
            return;
        }

        const members = await Storage.getBandMembers(bandId);
        const users = await Promise.all(members.map(member => Storage.getById('users', member.userId)));
        const selectableUsers = users.filter(Boolean);

        if (selectableUsers.length === 0) {
            container.innerHTML = '<div class="member-selection-empty">In dieser Band sind noch keine Mitglieder hinterlegt.</div>';
            return;
        }

        const toSelect = new Set((selectedMembers || selectableUsers.map(user => user.id)).map(id => String(id)));
        container.innerHTML = users.map((user, index) => {
            const membership = members[index];
            if (!user || !membership) return '';

            const displayName = UI.getUserDisplayName(user);
            const profileImage = user.profile_image_url
                ? `<img src="${Bands.escapeHtml(user.profile_image_url)}" alt="${Bands.escapeHtml(displayName)}">`
                : `<span class="member-select-initials">${Bands.escapeHtml(UI.getUserInitials(displayName))}</span>`;

            const roleLabel = UI.getRoleDisplayName(membership.role || 'member');
            const instrumentLabels = this.getInstrumentLabels(user);
            const instrumentHtml = instrumentLabels.length > 0
                ? `
                    <span class="member-select-instrument-list">
                        ${instrumentLabels.map(label => `<span class="member-select-instrument-pill">${Bands.escapeHtml(label)}</span>`).join('')}
                    </span>
                `
                : '<span class="member-select-meta is-empty">Kein Instrument hinterlegt</span>';

            const isChecked = toSelect.has(String(user.id));

            return `
                <label class="member-select-card ${isChecked ? 'is-selected' : ''}" for="member_${user.id}" data-user-id="${user.id}">
                    <input
                        class="member-select-checkbox"
                        type="checkbox"
                        id="member_${user.id}"
                        value="${user.id}"
                        ${isChecked ? 'checked' : ''}
                    >
                    <span class="member-select-body">
                        <span class="member-select-avatar" style="${user.profile_image_url ? '' : `background: ${UI.getAvatarColor(displayName)};`}">
                            ${profileImage}
                        </span>
                        <span class="member-select-copy">
                            <span class="member-select-name-row">
                                <span class="member-select-name">${Bands.escapeHtml(displayName)}</span>
                                <span class="member-select-role">${Bands.escapeHtml(roleLabel)}</span>
                            </span>
                            ${instrumentHtml}
                        </span>
                        <span class="member-select-check" aria-hidden="true">✓</span>
                    </span>
                </label>
            `;
        }).join('');

        const userIds = users.filter(Boolean).map(u => u.id);
        this.currentBandMemerAbsences = await Storage.getAbsencesForUsers(userIds);

        container.querySelectorAll('.member-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const card = checkbox.closest('.member-select-card');
                if (card) {
                    card.classList.toggle('is-selected', checkbox.checked);
                }
                this.updateAvailabilityIndicators();
            });
        });

        this.updateAvailabilityIndicators();
    },

    async updateAvailabilityIndicators() {
        const scheduleMode = this.getScheduleMode();
        const fixedDateInput = document.getElementById('eventDate');
        const fixedDateIndicator = document.getElementById('eventFixedDateAvailability');
        const fixedDateSection = document.getElementById('eventFixedDateSection');

        if (fixedDateIndicator && (scheduleMode !== 'fixed' || !fixedDateInput?.value)) {
            fixedDateIndicator.textContent = '';
            fixedDateIndicator.className = 'date-availability';
        }

        if (fixedDateSection) {
            fixedDateSection.querySelectorAll('.availability-details-stack').forEach(details => details.remove());
        }

        if (typeof App === 'undefined' || !App.checkMembersAvailabilityLocally || !this.currentBandMemerAbsences) return;

        // 1. Fixed Date
        if (fixedDateInput && fixedDateIndicator) {
            if (scheduleMode === 'fixed' && fixedDateInput.value) {
                const dateValue = new Date(fixedDateInput.value).toISOString();
                const memberConflicts = this.collectMemberConflicts(dateValue, dateValue);

                fixedDateIndicator.innerHTML = this.buildMemberStatusMarkup(memberConflicts);
                fixedDateIndicator.className = `date-availability ${memberConflicts.length > 0 ? 'has-conflict' : 'is-available'}`;

                const detailsHtml = this.buildAvailabilityDetailsHtml(memberConflicts);
                if (detailsHtml) {
                    fixedDateIndicator.insertAdjacentHTML('afterend', `<div class="availability-details-stack">${detailsHtml}</div>`);
                }
            } else {
                fixedDateIndicator.textContent = '';
                fixedDateIndicator.className = 'date-availability';
            }
        }

        // 2. Proposed Dates
        const items = document.querySelectorAll('#eventDateProposals .date-proposal-item');
        for (const item of items) {
            const dateInput = item.querySelector('.event-date-input-date');
            const startInput = item.querySelector('.event-date-input-start');
            const indicator = item.querySelector('.event-date-availability');

            if (!indicator) continue;

            const existingDetails = item.querySelector('.availability-details-stack, .member-details-box');
            if (existingDetails) {
                existingDetails.remove();
            }

            if (scheduleMode !== 'proposals') {
                indicator.textContent = '';
                indicator.className = 'date-availability';
                continue;
            }

            if (!dateInput || !dateInput.value || !startInput || !startInput.value) {
                indicator.textContent = '';
                indicator.className = 'date-availability';
                continue;
            }

            const startDateTime = new Date(`${dateInput.value}T${startInput.value}`).toISOString();
            const memberConflicts = this.collectMemberConflicts(startDateTime, startDateTime);

            indicator.innerHTML = this.buildMemberStatusMarkup(memberConflicts);
            indicator.className = `date-availability ${memberConflicts.length > 0 ? 'has-conflict' : 'is-available'}`;

            const detailsHtml = this.buildAvailabilityDetailsHtml(memberConflicts);
            if (detailsHtml) {
                item.insertAdjacentHTML('beforeend', `<div class="availability-details-stack">${detailsHtml}</div>`);
            }
        }
    },


    async populateBandSelect() {
        const user = Auth.getCurrentUser();
        const select = document.getElementById('eventBand');
        if (!user || !select) return;

        const bands = (await Auth.getBandsUserCanManagePlanning()) || [];

        select.disabled = bands.length === 0;
        select.innerHTML = bands.length > 0
            ? '<option value="">Band wählen</option>' +
                bands.map(b => `<option value="${b.id}">${Bands.escapeHtml(b.name)}</option>`).join('')
            : '<option value="">Keine freigegebene Band verfügbar</option>';

        if (bands.length === 1) {
            select.value = bands[0].id;
            select.dispatchEvent(new Event('change'));
        }
    }
};

// Global Listeners for the Confirm & Time Suggestion Modals
document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('saveEventTimeSuggestionBtn')?.addEventListener('click', async () => {
        const eventId = document.getElementById('suggestTimeEventId').value;
        const dateIndex = parseInt(document.getElementById('suggestTimeEventDateIndex').value);
        const suggestedTime = document.getElementById('eventSuggestedTimeInput').value;
        const user = Auth.getCurrentUser();

        if (!suggestedTime) return;

        try {
            await Storage.createEventTimeSuggestion({
                eventId,
                userId: user.id,
                dateIndex,
                suggestedTime
            });
            UI.showToast('Vorschlag gespeichert', 'success');
            UI.closeModal('eventTimeSuggestionModal');
            await Events.renderEvents(Events.currentFilter, true);
        } catch (error) {
            UI.showToast('Fehler', 'error');
        }
    });
});
