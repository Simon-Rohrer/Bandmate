// Rehearsals Management Module

const Rehearsals = {
    // Attach listeners to date/time inputs for availability checks
    attachAvailabilityListeners(context = document) {
        const availabilityInputs = [
            ...context.querySelectorAll('.date-input-date'),
            ...context.querySelectorAll('.date-input-start'),
            ...context.querySelectorAll('.date-input-end'),
            ...context.querySelectorAll('#rehearsalFixedDate, #rehearsalFixedStartTime, #rehearsalFixedEndTime')
        ];

        availabilityInputs.forEach(input => {
            if (!input._availabilityBound) {
                input.addEventListener('change', () => this.updateAvailabilityIndicators());
                input._availabilityBound = true;
            }
        });
    },
    rehearsalsCache: null,
    dataContextCache: null,
    currentStatusTab: 'pending',

    bindTimeRangeValidation(startInput, endInput) {
        if (!startInput || !endInput || startInput._timeValidationBound || endInput._timeValidationBound) {
            return;
        }

        const validateTimes = () => {
            if (!startInput.value || !endInput.value) {
                endInput.setCustomValidity('');
                return;
            }

            if (endInput.value <= startInput.value) {
                endInput.setCustomValidity('Endzeit muss nach Startzeit liegen');
                endInput.reportValidity();
            } else {
                endInput.setCustomValidity('');
            }
        };

        startInput.addEventListener('change', validateTimes);
        endInput.addEventListener('change', validateTimes);
        startInput._timeValidationBound = true;
        endInput._timeValidationBound = true;
    },

    clearFixedDateAvailability() {
        const fixedSection = document.getElementById('rehearsalFixedDateSection');
        const fixedIndicator = document.getElementById('rehearsalFixedDateAvailability');

        if (fixedIndicator) {
            fixedIndicator.innerHTML = '';
            fixedIndicator.className = 'date-availability';
        }

        if (fixedSection) {
            fixedSection.querySelectorAll('.availability-details-stack').forEach(details => details.remove());
        }
    },

    getScheduleMode() {
        return document.querySelector('input[name="rehearsalScheduleMode"]:checked')?.value === 'proposals'
            ? 'proposals'
            : 'fixed';
    },

    resolveScheduleModeFromRehearsal(rehearsal) {
        if (!rehearsal) return 'fixed';

        if (rehearsal.status === 'confirmed' || rehearsal.confirmedDate) {
            return 'fixed';
        }

        if (Array.isArray(rehearsal.proposedDates) && rehearsal.proposedDates.length > 0) {
            return 'proposals';
        }

        return 'fixed';
    },

    getProposalInputValues(proposal = null) {
        const startTime = proposal?.startTime || proposal?.start || '';
        let endTime = proposal?.endTime || proposal?.end || '';

        if (startTime && !endTime) {
            endTime = new Date(new Date(startTime).getTime() + 2 * 60 * 60 * 1000).toISOString();
        }

        return {
            date: startTime ? startTime.slice(0, 10) : '',
            start: startTime ? startTime.slice(11, 16) : '18:30',
            end: endTime ? endTime.slice(11, 16) : '21:30'
        };
    },

    setFixedDateFields(values = {}) {
        const dateInput = document.getElementById('rehearsalFixedDate');
        const startInput = document.getElementById('rehearsalFixedStartTime');
        const endInput = document.getElementById('rehearsalFixedEndTime');
        const normalized = {
            date: values?.date || '',
            start: values?.start || '18:30',
            end: values?.end || '21:30'
        };

        if (dateInput) dateInput.value = normalized.date;
        if (startInput) startInput.value = normalized.start;
        if (endInput) endInput.value = normalized.end;
    },

    getFixedDateFromForm() {
        const date = document.getElementById('rehearsalFixedDate')?.value || '';
        const start = document.getElementById('rehearsalFixedStartTime')?.value || '';
        const end = document.getElementById('rehearsalFixedEndTime')?.value || '';

        if (!date || !start || !end || end <= start) {
            return [];
        }

        return [{
            startTime: `${date}T${start}`,
            endTime: `${date}T${end}`,
            confirmed: true
        }];
    },

    getDateProposalRemoveIcon() {
        if (typeof App !== 'undefined' && typeof App.getRundownInlineIcon === 'function') {
            return App.getRundownInlineIcon('trash');
        }

        return `
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4.75 6h10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                <path d="M7.25 6V4.75c0-.41.34-.75.75-.75h4c.41 0 .75.34.75.75V6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                <path d="M6.25 6.75 6.9 14.7c.05.74.67 1.3 1.4 1.3h3.4c.73 0 1.35-.56 1.4-1.3l.65-7.95" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                <path d="M8.35 9.15v4.2M11.65 9.15v4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
            </svg>
        `;
    },

    createDateProposalItem(values = {}) {
        const newItem = document.createElement('div');
        const normalized = {
            date: values?.date || '',
            start: values?.start || '18:30',
            end: values?.end || '21:30'
        };

        newItem.className = 'date-proposal-item';
        newItem.dataset.confirmed = 'false';
        newItem.innerHTML = `
            <div class="date-time-range">
                <input type="date" class="date-input-date" value="${normalized.date}">
                <input type="time" class="date-input-start" value="${normalized.start}">
                <span class="time-separator">bis</span>
                <input type="time" class="date-input-end" value="${normalized.end}">
                <button type="button" class="btn-icon remove-date" aria-label="Terminvorschlag löschen" title="Terminvorschlag löschen">${this.getDateProposalRemoveIcon()}</button>
            </div>
            <div class="date-proposal-footer">
                <span class="date-availability"></span>
            </div>
        `;

        this.attachVoteHandlers(newItem);

        newItem.querySelector('.remove-date')?.addEventListener('click', () => {
            newItem.remove();
            this.updateRemoveButtons();
        });

        return newItem;
    },

    resetDateProposalRows(initialValues = [{}]) {
        const container = document.getElementById('dateProposals');
        if (!container) return;

        const rows = Array.isArray(initialValues) && initialValues.length > 0 ? initialValues : [{}];
        container.innerHTML = '';
        rows.forEach(values => {
            container.appendChild(this.createDateProposalItem(values));
        });

        this.updateRemoveButtons();
        this.attachAvailabilityListeners();
    },

    setScheduleMode(mode = 'fixed', options = {}) {
        const normalizedMode = mode === 'proposals' ? 'proposals' : 'fixed';
        const fixedRadio = document.getElementById('rehearsalScheduleModeFixed');
        const proposalsRadio = document.getElementById('rehearsalScheduleModeProposals');
        const modeSection = document.getElementById('rehearsalScheduleModeSection');
        const fixedSection = document.getElementById('rehearsalFixedDateSection');
        const proposalsSection = document.getElementById('rehearsalDateProposalsSection');
        const proposalsContainer = document.getElementById('dateProposals');
        const fixedInputs = [
            document.getElementById('rehearsalFixedDate'),
            document.getElementById('rehearsalFixedStartTime'),
            document.getElementById('rehearsalFixedEndTime')
        ];
        const updateEmailSection = document.getElementById('updateEmailSection');
        const sendUpdateCheckbox = document.getElementById('sendUpdateEmail');

        if (fixedRadio) fixedRadio.checked = normalizedMode === 'fixed';
        if (proposalsRadio) proposalsRadio.checked = normalizedMode === 'proposals';

        if (modeSection) {
            modeSection.style.display = options.lockMode ? 'none' : '';
        }

        if (fixedSection) {
            fixedSection.style.display = normalizedMode === 'fixed' ? '' : 'none';
        }

        if (proposalsSection) {
            proposalsSection.style.display = normalizedMode === 'proposals' ? '' : 'none';
        }

        fixedInputs.forEach(input => {
            if (input) input.required = normalizedMode === 'fixed';
        });

        if (normalizedMode === 'proposals' && proposalsContainer && !proposalsContainer.querySelector('.date-proposal-item')) {
            this.resetDateProposalRows();
        }

        if (normalizedMode !== 'fixed') {
            this.clearFixedDateAvailability();
        }

        if (updateEmailSection && this.originalRehearsal) {
            updateEmailSection.style.display = normalizedMode === 'fixed' ? 'block' : 'none';
            if (normalizedMode !== 'fixed' && sendUpdateCheckbox) {
                sendUpdateCheckbox.checked = false;
            }
        }

        if (options.refreshAvailability !== false) {
            this.updateAvailabilityIndicators();
        }
    },

    // Clear all cached data (called during logout)
    clearCache() {
        this.expandedRehearsalId = null;
        this.currentRehearsalId = null;
        this.rehearsals = [];
        this.currentFilter = '';
        this.currentStatusTab = 'pending';
        this.rehearsalsCache = null;
        this.dataContextCache = null;
    },

    invalidateCache() {
        Logger.info('[Rehearsals] Cache invalidated.');
        this.rehearsalsCache = null;
        this.dataContextCache = null;
        if (typeof Statistics !== 'undefined') Statistics.invalidateCache();
    },

    normalizeDateIndex(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : value;
    },

    formatCountLabel(count, singular, plural) {
        return `${count} ${count === 1 ? singular : plural}`;
    },

    getLocationConflictLabel(conflicts = []) {
        const conflictCount = conflicts.length || 1;
        const overlapLabel = this.formatCountLabel(conflictCount, 'Überschneidung', 'Überschneidungen');
        return `Ort bereits belegt (${overlapLabel})`;
    },

    getMemberConflictSummaryLabel(memberConflicts = []) {
        const memberConflictCount = memberConflicts.length || 1;
        return memberConflictCount === 1
            ? '1 ausgewähltes Mitglied ist nicht verfügbar'
            : `${memberConflictCount} ausgewählte Mitglieder sind nicht verfügbar`;
    },

    buildAvailabilityStatusLabel({ locationId = '', locationConflicts = [], memberConflicts = [] } = {}) {
        const parts = [];

        if (locationId) {
            parts.push(locationConflicts.length > 0 ? this.getLocationConflictLabel(locationConflicts) : 'Ort ist frei');
        }

        if (memberConflicts.length > 0) {
            parts.push(this.getMemberConflictSummaryLabel(memberConflicts));
        } else if (locationConflicts.length === 0) {
            parts.push(locationId ? 'alle ausgewählten Mitglieder sind verfügbar' : 'Alle ausgewählten Mitglieder sind verfügbar');
        }

        return parts.join(' · ') || 'Kein Ort gewählt';
    },

    getLocationStatusMeta({ locationId = '', locationConflicts = [] } = {}) {
        if (!locationId) {
            return { tone: 'neutral', text: 'Ort: kein Ort ausgewählt' };
        }

        if (locationConflicts.length > 0) {
            return null;
        }

        return { tone: 'success', text: 'Ort: frei' };
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

    buildProposalStatusMarkup({ locationId = '', locationConflicts = [], memberConflicts = [] } = {}) {
        const lines = [];
        const locationStatus = this.getLocationStatusMeta({ locationId, locationConflicts });
        const memberStatus = this.getMemberStatusMeta(memberConflicts);

        if (locationStatus) {
            lines.push(`<span class="proposal-status-line is-${locationStatus.tone}">${locationStatus.tone === 'success' ? '✓' : '•'} ${locationStatus.text}</span>`);
        }

        if (memberStatus) {
            lines.push(`<span class="proposal-status-line is-${memberStatus.tone}">${memberStatus.tone === 'warning' ? '•' : '✓'} ${memberStatus.text}</span>`);
        }

        return `<div class="proposal-status-stack">${lines.join('')}</div>`;
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
                reason: Storage.getAbsenceDisplayReason(conflict) || 'Abwesend'
            };
        });
    },

    renderLocationConflictItem(conflict) {
        const summary = Bands.escapeHtml(conflict?.summary || 'Belegter Kalendereintrag');

        if (!conflict?.startDate || !conflict?.endDate) {
            return `<div class="conflict-item">• ${summary}</div>`;
        }

        const start = new Date(conflict.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const end = new Date(conflict.endDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const datePart = new Date(conflict.startDate).toLocaleDateString('de-DE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        return `<div class="conflict-item">• ${summary} (${datePart} von ${start} - ${end} Uhr)</div>`;
    },

    buildLocationConflictDetailsSection(conflicts = [], headerText = 'Der ausgewählte Probeort ist in diesem Zeitraum bereits belegt:') {
        if (!Array.isArray(conflicts) || conflicts.length === 0) return '';

        return `
            <div class="conflict-details-header">${headerText}</div>
            ${conflicts.map(conflict => this.renderLocationConflictItem(conflict)).join('')}
        `;
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

    buildAvailabilityDetailsHtml({ locationConflicts = [], memberConflicts = [] } = {}) {
        const sections = [];

        if (locationConflicts.length > 0) {
            sections.push(`<div class="conflict-details-box">${this.buildLocationConflictDetailsSection(locationConflicts)}</div>`);
        }

        if (memberConflicts.length > 0) {
            sections.push(`<div class="member-details-box">${this.buildMemberConflictDetailsSection(memberConflicts)}</div>`);
        }

        if (sections.length === 0) return '';

        return sections.join('');
    },

    setupStatusSwitcher() {
        const view = document.getElementById('rehearsalsView');
        if (!view) return;

        view.querySelectorAll('[data-rehearsals-status]').forEach(button => {
            if (button.dataset.initialized) return;
            button.dataset.initialized = 'true';
            button.addEventListener('click', () => {
                this.currentStatusTab = button.dataset.rehearsalsStatus;
                this.syncStatusPanels();
            });
        });
    },

    syncStatusPanels() {
        const view = document.getElementById('rehearsalsView');
        if (!view) return;

        view.querySelectorAll('[data-rehearsals-status]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.rehearsalsStatus === this.currentStatusTab);
        });

        view.querySelectorAll('[data-rehearsals-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.dataset.rehearsalsPanel === this.currentStatusTab);
        });
    },

    updateStatusSummary(counts) {
        const countMap = {
            pending: document.getElementById('rehearsalsStatusCountPending'),
            voted: document.getElementById('rehearsalsStatusCountVoted'),
            resolved: document.getElementById('rehearsalsStatusCountResolved')
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

    getConfirmedDateValue(rehearsal) {
        if (!rehearsal?.confirmedDate) return null;

        if (typeof rehearsal.confirmedDate === 'object' && rehearsal.confirmedDate.startTime) {
            return rehearsal.confirmedDate.startTime;
        }

        return rehearsal.confirmedDate;
    },

    getRehearsalSortDate(rehearsal) {
        const confirmedDateValue = this.getConfirmedDateValue(rehearsal);
        if (rehearsal?.status === 'confirmed' && confirmedDateValue) {
            return new Date(confirmedDateValue);
        }

        if (Array.isArray(rehearsal?.proposedDates) && rehearsal.proposedDates.length > 0) {
            return rehearsal.proposedDates.reduce((earliest, current) => {
                const dateValue = current?.startTime || current?.start || current;
                const date = new Date(dateValue);
                return date < earliest ? date : earliest;
            }, new Date(8640000000000000));
        }

        return new Date(rehearsal?.createdAt || 0);
    },

    isArchivedResolvedRehearsal(rehearsal) {
        const confirmedDateValue = this.getConfirmedDateValue(rehearsal);
        return rehearsal?.status === 'confirmed' && !!confirmedDateValue && Storage.isPastCalendarDay(confirmedDateValue);
    },

    buildResolvedSectionMarkup(activeCardsHtml = '', archivedCardsHtml = '', archiveTitle = 'Abgeschlossen', options = {}) {
        const sections = [];
        const archiveOnly = !activeCardsHtml && !!archivedCardsHtml;

        if (activeCardsHtml) {
            sections.push(`<div class="schedule-active-list">${activeCardsHtml}</div>`);
        } else if (archiveOnly && options.activeEmptyMessage) {
            sections.push(`
                <div class="schedule-active-placeholder">
                    <div class="empty-state-compact schedule-active-empty">
                        <p>${options.activeEmptyMessage}</p>
                    </div>
                </div>
            `);
        }

        if (archivedCardsHtml) {
            sections.push(`
                <section class="schedule-archive-section ${archiveOnly ? 'is-archive-only' : ''}">
                    <div class="schedule-archive-divider">
                        <span>${archiveTitle}</span>
                    </div>
                    <div class="schedule-archive-list">
                        ${archivedCardsHtml}
                    </div>
                </section>
            `);
        }

        return sections.join('');
    },

    // Render all rehearsals
    async renderRehearsals(filterBandId = '', forceRefresh = false) {
        if (this.isLoading) {
            Logger.warn('[Rehearsals] Already loading, skipping.');
            return;
        }

        Storage.cleanupPastItems().catch(error => {
            console.warn('[Rehearsals] Could not cleanup past items in background:', error);
        });

        // Check if we have cached data and should use it
        if (!forceRefresh && this.rehearsalsCache && this.dataContextCache) {
            Logger.info('[Rehearsals] Using cached data.');
            let rehearsals = [...this.rehearsalsCache];
            if (filterBandId) {
                rehearsals = rehearsals.filter(r => r.bandId === filterBandId);
            }
            await this.renderRehearsalsList(rehearsals, this.dataContextCache);
            return;
        }

        this.isLoading = true;
        UI.showLoading('Proben werden geladen...');
        Logger.time('Load Rehearsals');

        try {
            const user = Auth.getCurrentUser();
            if (!user) {
                Logger.timeEnd('Load Rehearsals');
                UI.hideLoading();
                return;
            }
            let rehearsals = (await Storage.getUserRehearsals(user.id)) || [];
            this.rehearsals = rehearsals;

            // 1. Collect all IDs for batch fetching
            const rehearsalIds = rehearsals.map(r => r.id);
            const creatorIds = rehearsals.map(r => r.createdBy || r.proposedBy).filter(id => id);
            const locationIds = rehearsals.map(r => r.locationId).filter(id => id);
            const eventIds = rehearsals.map(r => r.eventId).filter(id => id);

            // 2. Batch Fetch everything in parallel
            const [
                userVotesBatch,
                allVotesBatch,
                creatorsBatch,
                locationsBatch,
                eventsBatch,
                userBandsBatch // This gives us roles for all bands the user is in
            ] = await Promise.all([
                Storage.getUserVotesForMultipleRehearsals(user.id, rehearsalIds),
                Storage.getRehearsalVotesForMultipleRehearsals(rehearsalIds),
                Storage.getBatchByIds('users', creatorIds),
                Storage.getBatchByIds('locations', locationIds),
                Storage.getBatchByIds('events', eventIds),
                Storage.getUserBands(user.id)
            ]);

            // 3. Create a data context for faster access during rendering
            const dataContext = {
                userVotes: userVotesBatch,
                allVotes: (allVotesBatch || []).reduce((acc, vote) => {
                    if (!acc[vote.rehearsalId]) acc[vote.rehearsalId] = [];
                    acc[vote.rehearsalId].push(vote);
                    return acc;
                }, {}),
                creators: creatorsBatch.reduce((acc, u) => ({ ...acc, [u.id]: u }), {}),
                locations: locationsBatch.reduce((acc, l) => ({ ...acc, [l.id]: l }), {}),
                events: eventsBatch.reduce((acc, e) => ({ ...acc, [e.id]: e }), {}),
                userBands: userBandsBatch.reduce((acc, b) => ({ ...acc, [b.id]: b }), {})
            };

            // Set Cache
            this.rehearsalsCache = rehearsals;
            this.dataContextCache = dataContext;

            // Apply filter
            if (filterBandId) {
                rehearsals = rehearsals.filter(r => r.bandId === filterBandId);
            }
            // Sort by effective date (Upcoming first, then past)
            const now = new Date();

            rehearsals.sort((a, b) => {
                const dateA = this.getRehearsalSortDate(a);
                const dateB = this.getRehearsalSortDate(b);
                const isPastA = Storage.isPastCalendarDay(dateA, now);
                const isPastB = Storage.isPastCalendarDay(dateB, now);

                if (isPastA && !isPastB) return 1; // Past at bottom
                if (!isPastA && isPastB) return -1; // Future at top

                if (!isPastA && !isPastB) {
                    // Both future: Ascending (nearest first)
                    return dateA - dateB;
                } else {
                    // Both past: Descending (most recent past first)
                    return dateB - dateA;
                }
            });
            await this.renderRehearsalsList(rehearsals, dataContext);
            Logger.timeEnd('Load Rehearsals');
        } finally {
            this.isLoading = false;
            UI.hideLoading();
        }
    },

    // Rendering der Proben-Liste (inkl. Overlay-Ausblendung und Event-Handler)
    async renderRehearsalsList(rehearsals, dataContext = {}) {
        const overlay = document.getElementById('globalLoadingOverlay');
        const containerPending = document.getElementById('rehearsalsListPending');
        const containerVoted = document.getElementById('rehearsalsListVoted');

        // Safety check for containers
        if (!containerPending || !containerVoted) {
            console.error('Rehearsal containers not found!');
            if (overlay) overlay.style.display = 'none';
            return;
        }

        const user = Auth.getCurrentUser();
        if (!user) return;

        const pendingRehearsals = [];
        const votedRehearsals = [];
        const resolvedRehearsals = [];
        const archivedResolvedRehearsals = [];

        const userVotesBatch = dataContext.userVotes || [];

        for (const rehearsal of rehearsals) {
            // Check if user has voted in the pre-loaded batch
            const userVotes = userVotesBatch.filter(v => String(v.rehearsalId) === String(rehearsal.id));
            const hasVoted = userVotes && userVotes.some(v => v.availability !== 'none');

            const isDone = rehearsal.status === 'confirmed' || rehearsal.status === 'cancelled';

            if (isDone) {
                if (this.isArchivedResolvedRehearsal(rehearsal)) {
                    archivedResolvedRehearsals.push(rehearsal);
                } else {
                    resolvedRehearsals.push(rehearsal);
                }
            } else if (hasVoted) {
                votedRehearsals.push(rehearsal);
            } else {
                pendingRehearsals.push(rehearsal);
            }
        }

        resolvedRehearsals.sort((a, b) => this.getRehearsalSortDate(b) - this.getRehearsalSortDate(a));
        archivedResolvedRehearsals.sort((a, b) => this.getRehearsalSortDate(b) - this.getRehearsalSortDate(a));

        this.updateStatusSummary({
            pending: pendingRehearsals.length,
            voted: votedRehearsals.length,
            resolved: resolvedRehearsals.length
        });

        // Render Pending List
        if (pendingRehearsals.length === 0) {
            UI.showCompactEmptyState(containerPending, 'Keine offenen Abstimmungen 🎉');
        } else {
            containerPending.innerHTML = (await Promise.all(pendingRehearsals.map(rehearsal =>
                this.renderRehearsalCard(rehearsal, dataContext)
            ))).join('');
        }

        // Render Voted List
        if (votedRehearsals.length === 0) {
            UI.showCompactEmptyState(containerVoted, 'Noch keine abgestimmten Proben');
        } else {
            containerVoted.innerHTML = (await Promise.all(votedRehearsals.map(rehearsal =>
                this.renderRehearsalCard(rehearsal, dataContext)
            ))).join('');
        }

        // Render Resolved List (New)
        const containerResolved = document.getElementById('rehearsalsListResolved');
        if (containerResolved) {
            const activeResolvedHtml = resolvedRehearsals.length > 0
                ? (await Promise.all(resolvedRehearsals.map(rehearsal =>
                    this.renderRehearsalCard(rehearsal, dataContext)
                ))).join('')
                : '';
            const archivedResolvedHtml = archivedResolvedRehearsals.length > 0
                ? (await Promise.all(archivedResolvedRehearsals.slice(0, 20).map(rehearsal =>
                    this.renderRehearsalCard(rehearsal, dataContext)
                ))).join('')
                : '';

            if (!activeResolvedHtml && !archivedResolvedHtml) {
                UI.showCompactEmptyState(containerResolved, 'Keine bestätigten Proben');
            } else {
                containerResolved.innerHTML = this.buildResolvedSectionMarkup(
                    activeResolvedHtml,
                    archivedResolvedHtml,
                    'Abgeschlossen',
                    { activeEmptyMessage: 'Keine anstehenden bestätigten Proben' }
                );
            }
        }

        // Add vote handlers to BOTH containers
        const viewContainer = document.getElementById('rehearsalsView');
        this.attachVoteHandlers(viewContainer);

        // Hide loading overlay faster
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 100);
        }
    },

    // Helper to get display name
    _getUserName(user) {
        return UI.getUserDisplayName(user);
    },

    _renderRehearsalDetailsGrid(rehearsal, { creator = null, creatorName = 'Unbekannt', locationName = 'Nicht angegeben', linkedEvent = null } = {}) {
        const confirmedDateValue = this.getConfirmedDateValue(rehearsal);
        const creatorAvatarContent = creator && creator.profile_image_url
            ? `<img src="${creator.profile_image_url}" class="creator-avatar-img" alt="${Bands.escapeHtml(creatorName)}">`
            : UI.getUserInitials(creatorName);
        const detailRows = [];

        detailRows.push(`
            <div class="detail-item detail-item-compact detail-item-creator">
                <div class="detail-label">Erstellt von</div>
                <div class="detail-stack-value">
                    <div class="creator-avatar detail-meta-avatar" style="background: ${creator ? UI.getAvatarColor(creatorName) : 'var(--color-primary)'};">
                        ${creatorAvatarContent}
                    </div>
                    <span class="detail-value">${Bands.escapeHtml(creatorName)}</span>
                </div>
            </div>
        `);

        if (rehearsal.status === 'confirmed' && confirmedDateValue) {
            detailRows.push(`
                <div class="detail-item detail-item-compact">
                    <div class="detail-label">Datum & Zeit</div>
                    <div class="detail-value">${UI.formatDate(confirmedDateValue)}</div>
                </div>
            `);
        }

        detailRows.push(`
            <div class="detail-item detail-item-compact">
                <div class="detail-label">Ort</div>
                <div class="detail-value">${Bands.escapeHtml(locationName || 'Nicht angegeben')}</div>
            </div>
        `);

        if (linkedEvent) {
            detailRows.push(`
                <div class="detail-item detail-item-compact">
                    <div class="detail-label">Verknüpfter Auftritt</div>
                    <div class="detail-value">${Bands.escapeHtml(linkedEvent.title || 'Auftritt')}</div>
                </div>
            `);
        }

        let detailGridHtml = `
            <div class="event-details-grid rehearsal-details-grid">
                <div class="event-details-meta-row">
                    ${detailRows.join('')}
                </div>
                ${rehearsal.description ? `
                    <div class="detail-item detail-item-wide detail-item-text">
                        <div class="detail-label">Beschreibung</div>
                        <div class="detail-value">${Bands.escapeHtml(rehearsal.description)}</div>
                    </div>
                ` : ''}
            </div>
        `;

        return detailGridHtml;
    },

    // Render single rehearsal card
    async renderRehearsalCard(rehearsal, dataContext = {}) {
        // Use joined band data if available, otherwise fetch
        const band = rehearsal.band || await Storage.getBand(rehearsal.bandId);

        // Use creator from context or fetch fallback
        const creatorId = rehearsal.createdBy || rehearsal.proposedBy;
        const creator = (dataContext.creators && dataContext.creators[creatorId]) ||
            (creatorId ? await Storage.getById('users', creatorId) : null);

        const creatorName = this._getUserName(creator);

        const user = Auth.getCurrentUser();
        const isExpanded = this.expandedRehearsalId === rehearsal.id;
        const currentUserVotes = (dataContext.userVotes || []).filter(v => String(v.rehearsalId) === String(rehearsal.id));
        const allRehearsalVotes = (dataContext.allVotes && dataContext.allVotes[rehearsal.id]) || [];
        const isArchived = this.isArchivedResolvedRehearsal(rehearsal);

        // Get location from context or fetch fallback
        const bandName = band ? band.name : 'Unbekannte Band';
        const bandColor = band ? (band.color || '#6366f1') : '#6366f1';

        const location = (dataContext.locations && dataContext.locations[rehearsal.locationId]) ||
            (rehearsal.locationId ? await Storage.getLocation(rehearsal.locationId) : null);

        const locationName = location ? location.name : (rehearsal.location || 'Kein Ort');

        const isAdmin = Auth.isAdmin();
        let isLeader = false;
        let isCoLeader = false;
        const bandId = rehearsal.bandId || (band && band.id);
        if (user && bandId) {
            // Get role from context or fetch fallback
            const userBand = dataContext.userBands && dataContext.userBands[bandId];
            const role = userBand ? userBand.role : await Storage.getUserRoleInBand(user.id, bandId);

            isLeader = role === 'leader';
            isCoLeader = role === 'co-leader';
        }

        // Strict permission check: Only Admin, Leader, Co-Leader can manage (confirm/edit/delete)
        const canManage = isAdmin || isLeader || isCoLeader;

        // Leaders and Co-Leaders see detailed votes
        const showVoteDetails = isLeader || isCoLeader || isAdmin;

        // Get linked event from context or fetch fallback
        let event = null;
        if (rehearsal.eventId) {
            event = (dataContext.events && dataContext.events[rehearsal.eventId]) ||
                await Storage.getEvent(rehearsal.eventId);
        }

        const respondedCount = new Set(
            allRehearsalVotes
                .filter(vote => vote.availability && vote.availability !== 'none')
                .map(vote => vote.userId)
        ).size;

        const hasCurrentUserVoted = currentUserVotes.some(vote => vote.availability !== 'none');
        const primaryDate = Array.isArray(rehearsal.proposedDates) && rehearsal.proposedDates.length > 0
            ? rehearsal.proposedDates[0]
            : null;
        const confirmedDateValue = this.getConfirmedDateValue(rehearsal);
        const headerChips = [];
        if (rehearsal.status === 'confirmed' && confirmedDateValue) {
            headerChips.push(`<span class="schedule-card-chip schedule-card-chip-primary">${UI.formatDateShort(confirmedDateValue)}</span>`);
        } else if (Array.isArray(rehearsal.proposedDates) && rehearsal.proposedDates.length > 0) {
            if (rehearsal.proposedDates.length > 1) {
                headerChips.push(`<span class="schedule-card-chip">${rehearsal.proposedDates.length} Termine</span>`);
            }
            headerChips.push(`<span class="schedule-card-chip schedule-card-chip-primary">${this.formatProposalDateLabel(primaryDate)}</span>`);
        }
        if (locationName && locationName !== 'Kein Ort') {
            headerChips.push(`<span class="schedule-card-chip">${Bands.escapeHtml(locationName)}</span>`);
        }

        const userStateLabel = rehearsal.status === 'pending'
            ? (hasCurrentUserVoted ? 'Abgestimmt' : 'Antwort offen')
            : '';
        const userStateClass = rehearsal.status === 'pending'
            ? (hasCurrentUserVoted ? 'is-complete' : 'is-open')
            : 'is-confirmed';
        const showPrimaryStatus = !(rehearsal.status === 'pending' && userStateLabel);
        const cardStateClass = rehearsal.status === 'pending'
            ? (hasCurrentUserVoted ? 'schedule-state-voted' : 'schedule-state-pending')
            : 'schedule-state-resolved';
        const statusText = rehearsal.status === 'pending'
            ? 'Offen'
            : (isArchived ? 'Abgeschlossen' : 'Bestätigt');
        const statusClass = isArchived ? 'status-completed' : `status-${rehearsal.status}`;
        const detailsGridHtml = this._renderRehearsalDetailsGrid(rehearsal, {
            creator,
            creatorName,
            locationName,
            linkedEvent: event
        });

        return `
            <div class="rehearsal-card accordion-card ${isArchived ? 'schedule-card-completed' : ''} ${cardStateClass} ${isExpanded ? 'expanded' : ''}" data-rehearsal-id="${rehearsal.id}" style="--band-accent: ${bandColor}">
                <div class="accordion-header" data-rehearsal-id="${rehearsal.id}">
                    <div class="accordion-title">
                        <div class="schedule-card-title-row">
                            <h3>${Bands.escapeHtml(rehearsal.title)}</h3>
                        </div>
                        <div class="rehearsal-band schedule-card-band">
                            ${band?.image_url ?
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
                        <div class="event-details-expanded rehearsal-details-expanded">
                            ${detailsGridHtml}
                        </div>

                        <div class="rehearsal-action-buttons">
                            ${rehearsal.status === 'pending' ? `
                                <button class="btn btn-vote-now" 
                                        data-rehearsal-id="${rehearsal.id}"
                                        onclick="Rehearsals.openVotingModal('${rehearsal.id}')">
                                    ${hasCurrentUserVoted ? 'Abstimmungen bearbeiten' : 'Jetzt abstimmen'}
                                </button>
                            ` : ''}
                            ${canManage && rehearsal.status === 'pending' ? `
                                <button class="btn btn-primary open-rehearsal-btn" 
                                        data-rehearsal-id="${rehearsal.id}">
                                    Termin bestätigen
                                </button>
                            ` : ''}
                            ${canManage ? `
                                <button class="btn btn-secondary edit-rehearsal" data-rehearsal-id="${rehearsal.id}">
                                    Bearbeiten
                                </button>
                                <button class="btn btn-danger delete-rehearsal" data-rehearsal-id="${rehearsal.id}">
                                    Löschen
                                </button>
                            ` : ''}
                        </div>

                        ${rehearsal.status === 'pending' ? `
                            <div class="rehearsal-overview-container">
                                ${await this.renderRehearsalOverviewTable(rehearsal, await Storage.getBandMembers(rehearsal.bandId))}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    // NEW: Render professional overview table for rehearsal votes
    async renderRehearsalOverviewTable(rehearsal, members) {
        const votes = (await Storage.getRehearsalVotes(rehearsal.id)) || [];

        // Header with member avatars
        const headerHtml = `
            <thead>
                <tr>
                    <th class="date-col">Termin</th>
                    ${(await Promise.all(members.map(async m => {
            const user = await Storage.getById('users', m.userId);
            const name = UI.getUserDisplayName(user);
            return `
                            <th class="member-avatar-cell" title="${Bands.escapeHtml(name)}">
                                <div class="member-avatar-mini" style="background: ${UI.getAvatarColor(name)}; width: 32px; height: 32px; font-size: 0.75rem; margin: 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; overflow: hidden; border: 2px solid var(--color-surface);">
                                    ${user && user.profile_image_url ?
                    `<img src="${user.profile_image_url}" style="width:100%; height:100%; object-fit:cover;">` :
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

        // Rows for each proposed date
        const rowsHtml = await Promise.all(rehearsal.proposedDates.map(async (date, index) => {
            const dateString = typeof date === 'string' ? date : date.startTime;
            const formattedDate = UI.formatDateShort(dateString);

            const dateVotes = votes.filter(v => this.normalizeDateIndex(v.dateIndex) === index);
            const yesCount = dateVotes.filter(v => v.availability === 'yes').length;

            const voteCells = members.map(m => {
                const vote = votes.find(v =>
                    String(v.userId) === String(m.userId) &&
                    this.normalizeDateIndex(v.dateIndex) === index
                );
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

            const timeSuggestions = (await Storage.getTimeSuggestionsForDate(rehearsal.id, index)) || [];
            const suggestionHtml = (await Promise.all(timeSuggestions.map(async s => {
                const suggUser = await Storage.getById('users', s.userId);
                const suggName = suggUser ? UI.getUserDisplayName(suggUser) : 'Unbekannt';
                return `
                    <div class="time-suggestion-pill" title="Vorschlag von ${Bands.escapeHtml(suggName)}">
                        ${Bands.escapeHtml(s.suggestedTime)} (${Bands.escapeHtml(suggName.split(' ')[0])})
                    </div>
                `;
            }))).join('');

            return `
                <tr>
                    <td class="date-col">
                        ${formattedDate}
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
        }));

        return `
            <table class="rehearsal-overview-table">
                ${headerHtml}
                <tbody>
                    ${rowsHtml.join('')}
                </tbody>
            </table>
        `;
    },

    // Open the bulk voting modal
    async openVotingModal(rehearsalId) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (!rehearsal) return;

        const votes = (await Storage.getRehearsalVotes(rehearsalId)) || [];
        const userVotes = votes.filter(v => String(v.userId) === String(user.id));

        const content = document.getElementById('rehearsalVotingContent');
        const rows = await Promise.all(rehearsal.proposedDates.map(async (date, index) => {
            const dateString = typeof date === 'string' ? date : date.startTime;
            const currentVote = userVotes.find(v => this.normalizeDateIndex(v.dateIndex) === index);
            const availability = currentVote ? currentVote.availability : 'none';
            const userSuggestion = (await Storage.getUserTimeSuggestionForDate(user.id, rehearsalId, index));
            const allSuggestions = (await Storage.getTimeSuggestionsForDate(rehearsalId, index)) || [];

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
                                data-rehearsal-id="${rehearsalId}" 
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
        const suggestButtons = content.querySelectorAll('.btn-suggest-time-modal');
        suggestButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const rehearsalId = btn.dataset.rehearsalId;
                const dateIndex = parseInt(btn.dataset.dateIndex);
                await this.suggestTime(rehearsalId, dateIndex);
            });
        });

        // Set up save button
        const saveForm = document.getElementById('rehearsalVotingForm');
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
                await this.handleSaveVotes(rehearsalId, newVotes);
                UI.closeModal('rehearsalVotingModal');
                UI.showToast('Abstimmungen gespeichert', 'success');
                // Force a true refresh from DB
                await this.renderRehearsals(this.currentFilter, true);
            } catch (error) {
                console.error('Error saving votes:', error);
                UI.showToast('Fehler beim Speichern der Abstimmungen', 'error');
            } finally {
                UI.hideLoading();
            }
        };

        UI.openModal('rehearsalVotingModal');

        // Wire Up Modal Cancel Button
        const cancelBtn = document.querySelector('#rehearsalVotingModal .cancel');
        if (cancelBtn) {
            cancelBtn.onclick = () => UI.closeModal('rehearsalVotingModal');
        }
    },

    // Save multiple votes at once
    async handleSaveVotes(rehearsalId, votes) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        this.invalidateCache();

        Logger.userAction('Submit', 'rehearsalVotingForm', 'Bulk Vote', { rehearsalId, votes });

        const existingVotes = await Storage.getUserVotesForRehearsal(user.id, rehearsalId);

        for (const vote of votes) {
            const targetDateIndex = this.normalizeDateIndex(vote.dateIndex);
            const existingForDate = existingVotes.filter(existingVote =>
                this.normalizeDateIndex(existingVote.dateIndex) === targetDateIndex
            );

            if (existingForDate.length > 0) {
                for (const existingVote of existingForDate) {
                    const deleted = await Storage.deleteVote(existingVote.id);
                    if (!deleted) {
                        throw new Error('Vorhandene Abstimmung konnte nicht aktualisiert werden.');
                    }
                }
            }

            if (vote.availability !== 'none') {
                const createdVote = await Storage.createVote({
                    userId: user.id,
                    rehearsalId: String(rehearsalId),
                    dateIndex: targetDateIndex,
                    availability: vote.availability
                });
                if (!createdVote) {
                    throw new Error('Abstimmung konnte nicht gespeichert werden.');
                }
            }
        }
    },

    // Legacy renderDateOption (reduced scope or removed if fully replaced)
    async renderDateOption(rehearsalId, date, dateIndex, userId, showVoteDetails = false, canManage = false) {
        return ''; // Replaced by table
    },

    // Attach vote and open handlers
    attachVoteHandlers(context = document) {
        // Accordion toggle handlers
        context.querySelectorAll('.accordion-header').forEach(header => {
            // Use flag to prevent duplicate listeners
            if (header._hasAccordionListener) return;
            header._hasAccordionListener = true;

            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on action buttons or vote buttons
                if (e.target.closest('button') && !e.target.closest('.accordion-toggle')) {
                    return;
                }

                const card = header.closest('.rehearsal-card');
                this.toggleAccordion(card);
            });
        });

        context.querySelectorAll('.suggest-time-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                const dateIndex = parseInt(btn.dataset.dateIndex);
                await this.suggestTime(rehearsalId, dateIndex);
            });
        });

        // Confirm proposal button handler
        context.querySelectorAll('.confirm-proposal-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const item = btn.closest('.date-proposal-item');
                if (!item) return;

                const dateInput = item.querySelector('.date-input-date');
                const startInput = item.querySelector('.date-input-start');
                const endInput = item.querySelector('.date-input-end');
                // Validate inputs
                if (!dateInput || !dateInput.value || !startInput || !startInput.value || !endInput || !endInput.value) {
                    UI.showToast('Bitte alle Felder ausfüllen', 'error');
                    return;
                }

                // Validate end time is after start time
                if (endInput.value <= startInput.value) {
                    UI.showToast('Endzeit muss nach Startzeit liegen', 'error');
                    return;
                }

                // Get location and check availability
                const locationId = document.getElementById('rehearsalLocation')?.value;
                let locationConflicts = [];
                const startDateTime = `${dateInput.value}T${startInput.value}`;
                const endDateTime = `${dateInput.value}T${endInput.value}`;

                if (locationId && typeof App !== 'undefined' && App.checkLocationAvailability) {
                    const availability = await App.checkLocationAvailability(
                        locationId,
                        new Date(startDateTime),
                        new Date(endDateTime)
                    );

                    if (!availability.available) {
                        locationConflicts = availability.conflicts && availability.conflicts.length > 0
                            ? availability.conflicts
                            : [];
                    }
                }

                const memberConflicts = this.collectMemberConflicts(startDateTime, endDateTime);
                const hasConflict = locationConflicts.length > 0 || memberConflicts.length > 0;

                // Mark as confirmed
                item.dataset.confirmed = 'true';

                // Update display
                const dateStr = new Date(dateInput.value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = `${startInput.value} - ${endInput.value}`;
                const statusMarkup = this.buildProposalStatusMarkup({
                    locationId,
                    locationConflicts,
                    memberConflicts
                });

                const displayDiv = item.querySelector('.confirmed-proposal-display') || document.createElement('div');
                displayDiv.className = 'confirmed-proposal-display';
                displayDiv.innerHTML = `
                    <span class="confirmed-date">📅 ${dateStr}, ${timeStr}</span>
                    ${statusMarkup}
                `;

                // Replace inputs with display if not already there, OR just show this
                // Simplification for now: User sees the inputs usually when creating. 
                // But the requirement implies a "confirm" visual.
                // Let's just toast and rely on the dataset attribute for saving.
                UI.showToast('Termin vorgemerkt', 'success');

                // Store data in dataset
                item.dataset.confirmed = 'true';
                item.dataset.startTime = new Date(startDateTime).toISOString();
                item.dataset.endTime = new Date(endDateTime).toISOString();
                item.dataset.hasConflict = hasConflict ? 'true' : 'false';

                // Clear item and add confirmed display
                item.innerHTML = '';
                const summaryRow = document.createElement('div');
                summaryRow.className = 'date-proposal-summary';
                summaryRow.appendChild(displayDiv);
                item.appendChild(summaryRow);

                // Add conflict details if there are conflicts
                if (hasConflict) {
                    const detailsBox = document.createElement('div');
                    detailsBox.className = 'availability-details-stack';
                    detailsBox.innerHTML = this.buildAvailabilityDetailsHtml({ locationConflicts, memberConflicts });
                    item.appendChild(detailsBox);
                }

                // Add delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn-icon remove-confirmed';
                deleteBtn.innerHTML = this.getDateProposalRemoveIcon();
                deleteBtn.addEventListener('click', () => {
                    item.remove();
                    this.updateRemoveButtons();
                });
                const actions = document.createElement('div');
                actions.className = 'date-proposal-actions date-proposal-actions-compact';
                actions.appendChild(deleteBtn);
                summaryRow.appendChild(actions);

                // Kein automatisches Hinzufügen eines neuen Vorschlags mehr
            });
        });

        context.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                const dateIndex = parseInt(btn.dataset.dateIndex);
                const availability = btn.dataset.availability;
                Logger.userAction('Button', 'vote-btn', 'Click', { rehearsalId, dateIndex, availability, action: 'Vote on Rehearsal Date' });
                await this.vote(rehearsalId, dateIndex, availability);
            });
        });

        context.querySelectorAll('.open-rehearsal-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                Logger.userAction('Button', 'open-rehearsal-btn', 'Click', { rehearsalId, action: 'Open Rehearsal for Confirmation' });
                await this.openRehearsalDetails(rehearsalId);
            });
        });

        context.querySelectorAll('.edit-rehearsal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                Logger.userAction('Button', 'edit-rehearsal', 'Click', { rehearsalId, action: 'Edit Rehearsal' });
                this.editRehearsal(rehearsalId);
            });
        });

        context.querySelectorAll('.delete-rehearsal').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                Logger.userAction('Button', 'delete-rehearsal', 'Click', { rehearsalId, action: 'Delete Rehearsal' });
                await this.deleteRehearsal(rehearsalId);
            });
        });

        context.querySelectorAll('.suggest-time-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const rehearsalId = btn.dataset.rehearsalId;
                const dateIndex = parseInt(btn.dataset.dateIndex);
                await this.suggestTime(rehearsalId, dateIndex);
            });
        });
    },

    // Toggle accordion
    toggleAccordion(cardOrId) {
        let card;
        let rehearsalId;

        if (typeof cardOrId === 'string') {
            // Legacy support or call by ID (finds first match)
            rehearsalId = cardOrId;
            card = document.querySelector(`.rehearsal-card[data-rehearsal-id="${rehearsalId}"]`);
        } else {
            // Call with element
            card = cardOrId;
            rehearsalId = card.dataset.rehearsalId;
        }

        if (!card) return;

        const content = card.querySelector('.accordion-content');
        const toggle = card.querySelector('.toggle-icon');

        // Check if THIS card is expanded
        const wasExpanded = card.classList.contains('expanded');

        // Close all accordions
        document.querySelectorAll('.rehearsal-card').forEach(c => {
            c.classList.remove('expanded');
            const cont = c.querySelector('.accordion-content');
            const tog = c.querySelector('.toggle-icon');
            if (cont) cont.style.display = 'none';
            if (tog) tog.textContent = '▶';
        });

        // If it was already expanded, we just closed it (by the "close all" loop above)
        if (wasExpanded) {
            this.expandedRehearsalId = null;
        } else {
            // Open this accordion
            card.classList.add('expanded');
            if (content) content.style.display = 'block';
            if (toggle) toggle.textContent = '▼';
            this.expandedRehearsalId = rehearsalId;
        }
    },

    formatProposalDateLabel(date) {
        if (date && typeof date === 'object' && date.startTime) {
            return UI.formatDateTimeRange(date.startTime, date.endTime);
        }

        return UI.formatDateTimeRange(date);
    },

    getCheckedSingleRehearsalIndexes() {
        return Array.from(document.querySelectorAll('.single-rehearsal-toggle:checked'))
            .map(input => parseInt(input.dataset.dateIndex, 10))
            .filter(index => !Number.isNaN(index));
    },

    collectSelectedSingleRehearsalIndexes(clickedDateIndex) {
        return [...new Set([clickedDateIndex, ...this.getCheckedSingleRehearsalIndexes()])];
    },

    updateConfirmMemberSelectionSummary() {
        const summary = document.getElementById('confirmMembersSummary');
        const sendButton = document.getElementById('sendConfirmationBtn');
        const memberCheckboxes = Array.from(
            document.querySelectorAll('#confirmMembersList .confirm-member-checkbox')
        ).filter(checkbox => !checkbox.disabled);
        const selectedCount = memberCheckboxes.filter(checkbox => checkbox.checked).length;

        if (summary) {
            if (memberCheckboxes.length === 0) {
                summary.textContent = 'Keine E-Mail-Adressen verfügbar';
            } else if (selectedCount === 0) {
                summary.textContent = 'Es wird keine E-Mail versendet';
            } else if (selectedCount === memberCheckboxes.length) {
                summary.textContent = `Alle ${selectedCount} Mitglieder erhalten eine E-Mail`;
            } else {
                summary.textContent = `${selectedCount} von ${memberCheckboxes.length} Mitgliedern erhalten eine E-Mail`;
            }
        }

        if (sendButton) {
            sendButton.textContent = selectedCount > 0
                ? `✅ Probe bestätigen & ${selectedCount} E-Mail${selectedCount === 1 ? '' : 's'} senden`
                : '✅ Probe bestätigen';
        }
    },

    bindConfirmMemberSelectionUI() {
        const memberCheckboxes = Array.from(document.querySelectorAll('#confirmMembersList .confirm-member-checkbox'));
        const syncSelectionState = () => {
            memberCheckboxes.forEach(checkbox => {
                const card = checkbox.closest('.confirm-member-card');
                if (card) {
                    card.classList.toggle('is-selected', checkbox.checked);
                    card.classList.toggle('is-disabled', checkbox.disabled);
                }
            });
            this.updateConfirmMemberSelectionSummary();
        };

        memberCheckboxes.forEach(checkbox => {
            checkbox.onchange = syncSelectionState;
        });

        const selectAllButton = document.getElementById('confirmSelectAllMembersBtn');
        if (selectAllButton) {
            selectAllButton.onclick = () => {
                memberCheckboxes.forEach(checkbox => {
                    if (!checkbox.disabled) {
                        checkbox.checked = true;
                    }
                });
                syncSelectionState();
            };
        }

        const deselectAllButton = document.getElementById('confirmDeselectAllMembersBtn');
        if (deselectAllButton) {
            deselectAllButton.onclick = () => {
                memberCheckboxes.forEach(checkbox => {
                    if (!checkbox.disabled) {
                        checkbox.checked = false;
                    }
                });
                syncSelectionState();
            };
        }

        syncSelectionState();
    },

    getProposalDateRange(proposal) {
        const startTime = typeof proposal === 'string' ? proposal : proposal?.startTime;
        let endTime = typeof proposal === 'object' && proposal?.endTime ? proposal.endTime : null;

        if (startTime && !endTime) {
            endTime = new Date(new Date(startTime).getTime() + 2 * 60 * 60 * 1000).toISOString();
        }

        return { startTime, endTime };
    },

    async createAdditionalConfirmedRehearsal(rehearsal, proposal, updates) {
        const currentUser = Auth.getCurrentUser();
        const { startTime, endTime } = this.getProposalDateRange(proposal);

        if (!startTime || !endTime) {
            return null;
        }

        return await Storage.createRehearsal({
            bandId: rehearsal.bandId,
            proposedBy: currentUser?.id || rehearsal.proposedBy,
            title: updates.title,
            description: updates.description,
            locationId: updates.locationId || null,
            eventId: rehearsal.eventId || null,
            proposedDates: [{
                startTime,
                endTime,
                confirmed: true
            }],
            status: 'confirmed',
            confirmedDate: startTime,
            confirmedLocation: updates.locationId || null,
            endTime
        });
    },

    // Open rehearsal details for confirmation
    async openRehearsalDetails(rehearsalId) {
        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (!rehearsal) {
            console.error('Rehearsal not found:', rehearsalId);
            return;
        }

        this.currentRehearsalId = rehearsalId;

        const band = await Storage.getBand(rehearsal.bandId);
        const members = await Storage.getBandMembers(rehearsal.bandId);
        const votes = await Storage.getRehearsalVotes(rehearsalId);

        // Check if proposedDates exists and is an array
        const proposedDates = Array.isArray(rehearsal.proposedDates) ? rehearsal.proposedDates : [];

        if (proposedDates.length === 0) {
            console.warn('No proposed dates found for rehearsal:', rehearsalId);
            UI.showToast('Keine vorgeschlagenen Termine gefunden', 'warning');
            return;
        }

        // Calculate statistics and get time suggestions for each date
        const dateStats = await Promise.all(proposedDates.map(async (date, index) => {
            const dateVotes = votes.filter(v => this.normalizeDateIndex(v.dateIndex) === index);
            const yesCount = dateVotes.filter(v => v.availability === 'yes').length;
            const noCount = dateVotes.filter(v => v.availability === 'no').length;
            const totalVotes = dateVotes.length;
            const score = yesCount;

            // Get time suggestions for this date
            const timeSuggestions = await Storage.getTimeSuggestionsForDate(rehearsalId, index);

            // Group suggestions by time with user names
            const suggestionsByTime = {};
            for (const suggestion of timeSuggestions) {
                const time = suggestion.suggestedTime;
                if (!suggestionsByTime[time]) {
                    suggestionsByTime[time] = [];
                }
                const user = await Storage.getById('users', suggestion.userId);
                if (user) {
                    const displayName = UI.getUserDisplayName(user);
                    if (!suggestionsByTime[time].includes(displayName)) {
                        suggestionsByTime[time].push(displayName);
                    }
                }
            }

            return { date, index, yesCount, noCount, totalVotes, score, timeSuggestions: suggestionsByTime };
            const proposedDates = Array.isArray(rehearsal.proposedDates) ? rehearsal.proposedDates : [];
            proposedDates.forEach(date => {
                let start = '';
                let end = '';
                if (typeof date === 'object' && date !== null && date.startTime && date.endTime) {
                    start = date.startTime.slice(0, 10);
                    const startTime = date.startTime.slice(11, 16);
                    end = date.endTime.slice(11, 16);
                    // Neues Feld wie im Standardformular
                    const newItem = document.createElement('div');
                    newItem.className = 'date-proposal-item';
                    newItem.dataset.confirmed = 'false';
                    newItem.innerHTML = `
                        <div class="date-time-range">
                            <input type="date" class="date-input-date" value="${start}" required>
                            <input type="time" class="date-input-start" value="${startTime}" required>
                            <span class="time-separator">bis</span>
                            <input type="time" class="date-input-end" value="${end}" required>
                        </div>
                    `;
                    container.appendChild(newItem);
                }
            });
        }));

        // Find best date
        const bestDate = dateStats.reduce((best, current) =>
            current.score > best.score ? current : best
        );

        // Get members who haven't voted
        const votedUserIds = new Set(votes.map(v => String(v.userId)));
        const notVoted = members.filter(m => !votedUserIds.has(String(m.userId)))
            .map(m => Storage.getById('users', m.userId)?.name)
            .filter(Boolean);
        document.getElementById('rehearsalDetailsTitle').textContent = rehearsal.title;

        document.getElementById('rehearsalDetailsContent').innerHTML = `
            <div class="rehearsal-details-view">
                <div class="detail-section">
                    <h3>📊 Abstimmungsübersicht</h3>
                    <p><strong>Band:</strong> ${Bands.escapeHtml(band?.name || '')}</p>
                    <p><strong>Abgestimmt:</strong> ${votedUserIds.size} von ${members.length} Mitgliedern</p>
                    ${notVoted.length > 0 ? `
                        <p><strong>Noch nicht abgestimmt:</strong> ${notVoted.map(n => Bands.escapeHtml(n)).join(', ')}</p>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h3>🏆 Beste Termine</h3>
                    <p class="rehearsal-bulk-create-note">
                        Setze Haken für Zusatztermine und nutze entweder einen einzelnen Termin-Button oder den Sammelbutton, um daraus bestätigte Proben anzulegen.
                    </p>
                    ${dateStats.sort((a, b) => b.score - a.score).map((stat, idx) => `
                        <div class="best-date-option ${idx === 0 ? 'is-best' : ''}">
                            <div class="date-header">
                                ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📅'} 
                                ${this.formatProposalDateLabel(stat.date)}
                            </div>
                            <div class="vote-breakdown">
                                ✅ ${stat.yesCount} können • 
                                ❌ ${stat.noCount} können nicht
                            </div>
                            ${Object.keys(stat.timeSuggestions).length > 0 ? `
                                <div class="time-suggestions-compact">
                                    <strong>🕐 Zeitvorschläge:</strong>
                                    ${Object.entries(stat.timeSuggestions).map(([time, users]) => `
                                        <span class="time-suggestion-tag">${time} (${users.join(', ')})</span>
                                    `).join('')}
                                </div>
                            ` : ''}
                            <div class="best-date-actions">
                                <label class="rehearsal-bulk-create-toggle">
                                    <input type="checkbox" class="single-rehearsal-toggle" data-date-index="${stat.index}">
                                    <span class="rehearsal-bulk-create-indicator" aria-hidden="true"></span>
                                    <span class="rehearsal-bulk-create-copy">
                                        <span class="rehearsal-bulk-create-title">Als Einzelprobe anlegen</span>
                                        <span class="rehearsal-bulk-create-subtitle">Diesen Termin zusätzlich als eigene Probe erstellen</span>
                                    </span>
                                </label>
                                <button class="btn btn-primary select-date-btn" 
                                        data-date-index="${stat.index}"
                                        data-date="${typeof stat.date === 'string' ? stat.date : stat.date.startTime}">
                                    Diese Probe bestätigen
                                </button>
                            </div>
                        </div>
                    `).join('')}
                    <div class="best-date-bulk-actions">
                        <button class="btn btn-secondary create-selected-rehearsals-btn">
                            Markierte Proben erstellen
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Attach select date handlers
        document.querySelectorAll('.select-date-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const dateIndex = parseInt(btn.dataset.dateIndex);
                const date = proposedDates[dateIndex] || btn.dataset.date;
                const selectedDateIndexes = this.collectSelectedSingleRehearsalIndexes(dateIndex);

                await this.showConfirmationModal(rehearsalId, dateIndex, date, selectedDateIndexes);
            });
        });

        document.querySelectorAll('.single-rehearsal-toggle').forEach(toggle => {
            const syncSelectionState = () => {
                const option = toggle.closest('.best-date-option');
                if (!option) return;
                option.classList.toggle('is-multi-selected', toggle.checked);
            };

            syncSelectionState();
            toggle.addEventListener('change', syncSelectionState);
        });

        const createSelectedButton = document.querySelector('.create-selected-rehearsals-btn');
        if (createSelectedButton) {
            createSelectedButton.addEventListener('click', async () => {
                const selectedDateIndexes = this.getCheckedSingleRehearsalIndexes();
                if (selectedDateIndexes.length === 0) {
                    UI.showToast('Bitte mindestens einen Termin anhaken', 'warning');
                    return;
                }

                const dateIndex = selectedDateIndexes[0];
                const date = proposedDates[dateIndex];
                await this.showConfirmationModal(rehearsalId, dateIndex, date, selectedDateIndexes);
            });
        }

        UI.openModal('rehearsalDetailsModal');
    },

    // Show confirmation modal
    async showConfirmationModal(rehearsalId, dateIndex, date, selectedDateIndexes = [dateIndex]) {
        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (!rehearsal) {
            console.error('Rehearsal not found:', rehearsalId);
            return;
        }

        document.getElementById('confirmRehearsalId').value = rehearsalId;
        document.getElementById('confirmDateIndex').value = dateIndex;
        document.getElementById('confirmAdditionalDateIndexes').value = JSON.stringify(
            selectedDateIndexes.filter(index => index !== dateIndex)
        );

        // Populate editable fields
        document.getElementById('confirmRehearsalTitle').value = rehearsal.title;
        document.getElementById('confirmRehearsalDescription').value = rehearsal.description || '';

        // Handle both old format (string) and new format (object with startTime/endTime)
        const dateString = typeof date === 'string' ? date : date.startTime;
        const endTimeString = typeof date === 'object' && date.endTime ? date.endTime : null;

        // Set start time from the selected date
        document.getElementById('confirmRehearsalStartTime').value = dateString.slice(0, 16);

        // Set end time
        let endDate;
        if (endTimeString) {
            endDate = new Date(endTimeString);
        } else {
            // Default to 2 hours after start
            const startDate = new Date(dateString);
            endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
        }
        document.getElementById('confirmRehearsalEndTime').value = endDate.toISOString().slice(0, 16);

        // Get time suggestions for this date
        const timeSuggestions = await Storage.getTimeSuggestionsForDate(rehearsalId, dateIndex);

        // Display time suggestions if any exist
        const startTimeGroup = document.getElementById('confirmRehearsalStartTime').closest('.form-group');
        let suggestionsHtml = '';

        if (timeSuggestions && timeSuggestions.length > 0) {
            // Group suggestions by time
            const suggestionsByTime = {};
            for (const suggestion of timeSuggestions) {
                const time = suggestion.suggestedTime;
                if (!suggestionsByTime[time]) {
                    suggestionsByTime[time] = [];
                }
                const user = await Storage.getById('users', suggestion.userId);
                if (user) {
                    const displayName = UI.getUserDisplayName(user);
                    if (!suggestionsByTime[time].includes(displayName)) {
                        suggestionsByTime[time].push(displayName);
                    }
                }
            }

            suggestionsHtml = `
                <div class="time-suggestions-info" style="margin-top: 0.5rem;">
                    <small style="color: var(--color-text-secondary); display: block; margin-bottom: 0.25rem;">
                        <strong>🕐 Vorgeschlagene Uhrzeiten:</strong>
                    </small>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                        ${Object.entries(suggestionsByTime).map(([time, users]) => `
                            <button type="button" class="time-suggestion-quick-select" data-time="${time}" 
                                    style="padding: 0.25rem 0.5rem; background: var(--color-primary); color: white; 
                                           border: none; border-radius: 4px; cursor: pointer; font-size: 0.8125rem;">
                                ${time} (${users.join(', ')})
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Remove any existing suggestions display
        const existingSuggestions = startTimeGroup.querySelector('.time-suggestions-info');
        if (existingSuggestions) {
            existingSuggestions.remove();
        }

        // Add suggestions after the start time input
        if (suggestionsHtml) {
            startTimeGroup.insertAdjacentHTML('beforeend', suggestionsHtml);

            // Add click handlers for quick-select buttons
            startTimeGroup.querySelectorAll('.time-suggestion-quick-select').forEach(btn => {
                btn.addEventListener('click', () => {
                    const selectedTime = btn.dataset.time;
                    const currentDateTime = document.getElementById('confirmRehearsalStartTime').value;

                    // Extract date part and combine with selected time
                    if (currentDateTime) {
                        const datePart = currentDateTime.split('T')[0];
                        document.getElementById('confirmRehearsalStartTime').value = `${datePart}T${selectedTime}`;
                    }
                });
            });
        }

        // Populate location select
        const locationSelect = document.getElementById('confirmRehearsalLocation');
        const locations = await Storage.getLocations();
        const locationsArray = Array.isArray(locations) ? locations : [];
        locationSelect.innerHTML = '<option value="">Kein Ort ausgewählt</option>' +
            locationsArray.map(loc => `<option value="${loc.id}">${Bands.escapeHtml(loc.name)}</option>`).join('');

        // Pre-select location if already set
        if (rehearsal.locationId) {
            locationSelect.value = rehearsal.locationId;
        }

        const additionalDatesInfo = document.getElementById('confirmAdditionalDatesInfo');
        const additionalDatesList = document.getElementById('confirmAdditionalDatesList');
        const additionalDateIndexes = selectedDateIndexes.filter(index => index !== dateIndex);

        if (additionalDatesInfo && additionalDatesList) {
            if (additionalDateIndexes.length > 0) {
                additionalDatesInfo.style.display = 'block';
                additionalDatesList.innerHTML = additionalDateIndexes.map(index => {
                    const proposal = rehearsal.proposedDates?.[index];
                    if (!proposal) return '';

                    return `
                        <div class="checkbox-item">
                            <span>${this.formatProposalDateLabel(proposal)}</span>
                        </div>
                    `;
                }).join('');
            } else {
                additionalDatesInfo.style.display = 'none';
                additionalDatesList.innerHTML = '';
            }
        }

        // Populate members list with checkboxes
        const members = await Storage.getBandMembers(rehearsal.bandId);
        const membersArray = Array.isArray(members) ? members : [];
        const membersList = document.getElementById('confirmMembersList');

        // Load all users first
        const userPromises = membersArray.map(member => Storage.getById('users', member.userId));
        const users = await Promise.all(userPromises);

        membersList.innerHTML = users.map(user => {
            if (!user) return '';

            const displayName = UI.getUserDisplayName(user);
            const hasEmail = Boolean(user.email);
            const escapedEmail = hasEmail ? Bands.escapeHtml(user.email) : 'Keine E-Mail-Adresse hinterlegt';
            let instrumentText = '';
            // Handle 'instrument' as comma-separated string (database format)
            if (user.instrument) {
                const instruments = user.instrument.split(',').map(s => s.trim()).filter(s => s);
                if (instruments.length > 0) {
                    instrumentText = `<span class="confirm-member-badge">${Bands.escapeHtml(instruments.join(', '))}</span>`;
                }
            } else if (user.instruments && Array.isArray(user.instruments) && user.instruments.length > 0) {
                instrumentText = `<span class="confirm-member-badge">${Bands.escapeHtml(user.instruments.join(', '))}</span>`;
            }

            return `
                <div class="confirm-member-card ${hasEmail ? 'is-selected' : 'is-disabled'}">
                    <input
                        type="checkbox"
                        class="confirm-member-checkbox"
                        id="notify_${user.id}"
                        value="${user.id}"
                        ${hasEmail ? 'checked' : ''}
                        ${hasEmail ? '' : 'disabled'}
                    >
                    <label for="notify_${user.id}" class="confirm-member-label ${hasEmail ? '' : 'is-disabled'}">
                        <span class="confirm-member-indicator" aria-hidden="true"></span>
                        <span class="confirm-member-main">
                            <span class="confirm-member-name-row">
                                <span class="confirm-member-name">${Bands.escapeHtml(displayName)}</span>
                                ${instrumentText}
                            </span>
                            <span class="confirm-member-email">${escapedEmail}</span>
                            <span class="confirm-member-note">
                                ${hasEmail ? 'Erhält eine Bestätigungs-Mail, wenn markiert' : 'Keine Benachrichtigung möglich'}
                            </span>
                        </span>
                    </label>
                </div>
            `;
        }).join('');

        this.bindConfirmMemberSelectionUI();

        UI.closeModal('rehearsalDetailsModal');
        UI.openModal('confirmRehearsalModal');
    },

    // Confirm rehearsal and send emails
    async confirmRehearsal(forceConfirm = false) {
        const rehearsalId = document.getElementById('confirmRehearsalId').value;
        const dateIndex = parseInt(document.getElementById('confirmDateIndex').value);
        const locationId = document.getElementById('confirmRehearsalLocation').value;
        const additionalDateIndexes = JSON.parse(
            document.getElementById('confirmAdditionalDateIndexes').value || '[]'
        );

        // Get edited values
        const editedTitle = document.getElementById('confirmRehearsalTitle').value;
        const editedDescription = document.getElementById('confirmRehearsalDescription').value;
        const editedStartTime = document.getElementById('confirmRehearsalStartTime').value;
        const editedEndTime = document.getElementById('confirmRehearsalEndTime').value;

        if (!editedTitle || !editedStartTime || !editedEndTime) {
            UI.showToast('Bitte Titel, Start- und Endzeit ausfüllen', 'error');
            return;
        }

        try {
            const rehearsal = await Storage.getRehearsal(rehearsalId);
            if (!rehearsal) {
                console.error('Rehearsal not found:', rehearsalId);
                UI.showToast('Probe nicht gefunden', 'error');
                return;
            }

            // Use edited start time
            const selectedDate = new Date(editedStartTime).toISOString();
            const selectedEndTime = new Date(editedEndTime).toISOString();
            const additionalProposals = additionalDateIndexes
                .map(index => rehearsal.proposedDates?.[index])
                .filter(Boolean);

            // Check location availability if location is selected and not forcing confirmation
            if (locationId && !forceConfirm && typeof App !== 'undefined' && App.checkLocationAvailability) {
                const startDate = new Date(editedStartTime);
                const endDate = new Date(editedEndTime);

                const availability = await App.checkLocationAvailability(locationId, startDate, endDate);

                if (!availability.available && availability.conflicts && availability.conflicts.length > 0) {
                    // Show conflict warning modal
                    const location = await Storage.getLocation(locationId);
                    let dateLabel = '';
                    const conflictCount = availability.conflicts.length;
                    if (editedStartTime) {
                        dateLabel = UI.formatDate(editedStartTime);
                        if (editedEndTime) {
                            const start = new Date(editedStartTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const end = new Date(editedEndTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            dateLabel += ` (${start} - ${end})`;
                        }
                    }
                    const conflictDetailsHtml = `
                        <div class="conflict-container">
                            <div class="conflict-header">
                                <div class="conflict-header-title-row">
                                    <span class="conflict-header-kicker">Ort</span>
                                    <span class="conflict-header-badge">${this.formatCountLabel(conflictCount, 'Überschneidung', 'Überschneidungen')}</span>
                                </div>
                                <div class="conflict-header-title">${Bands.escapeHtml(location?.name || 'Unbekannt')}</div>
                                <div class="conflict-header-info">
                                    <span class="conflict-header-info-label">Gewählter Zeitraum</span>
                                    <strong>${dateLabel}</strong>
                                </div>
                                <p class="conflict-header-text">Der ausgewählte Probeort ist in diesem Zeitraum bereits belegt. Unten siehst du, welche Buchungen sich mit deiner Probe überschneiden.</p>
                            </div>
                            <div class="conflict-card">
                                <div class="conflict-card-header">
                                    <div class="date-badge">Diese Belegungen überschneiden sich</div>
                                    <span class="conflict-count">${this.formatCountLabel(conflictCount, 'Eintrag', 'Einträge')}</span>
                                </div>
                                <div class="conflict-card-body">
                                    <div class="conflict-event-list">
                                        ${availability.conflicts.map(conflict => {
                                            const start = new Date(conflict.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                            const end = new Date(conflict.endDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                            const day = new Date(conflict.startDate).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
                                            return `
                                                <div class="conflict-event-item">
                                                    <span class="conflict-event-bullet" aria-hidden="true"></span>
                                                    <div class="conflict-event-info">
                                                        <div class="conflict-event-title">${Bands.escapeHtml(conflict.summary)}</div>
                                                        <div class="conflict-event-time">${day} · ${start} - ${end} Uhr</div>
                                                    </div>
                                                </div>`;
                                        }).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;

                    document.getElementById('conflictDetails').innerHTML = conflictDetailsHtml;

                    window._pendingRehearsalCreation = null;
                    window._locationConflictReturnModalId = 'confirmRehearsalModal';

                    // Close confirmation modal and open conflict modal
                    UI.closeModal('confirmRehearsalModal');
                    UI.openModal('locationConflictModal');

                    return; // Stop here, wait for user decision
                }
            }

            if (locationId && !forceConfirm && additionalProposals.length > 0) {
                const conflictingAdditionalDates = [];

                for (const proposal of additionalProposals) {
                    const { startTime, endTime } = this.getProposalDateRange(proposal);
                    if (!startTime || !endTime) continue;

                    const availability = await this.checkSingleDateAvailability(locationId, startTime, endTime);
                    if (!availability.available) {
                        conflictingAdditionalDates.push(this.formatProposalDateLabel(proposal));
                    }
                }

                if (conflictingAdditionalDates.length > 0) {
                    UI.showToast(
                        `Diese Zusatztermine können nicht bestätigt werden, weil der gewählte Probeort dort bereits belegt ist: ${conflictingAdditionalDates.join(', ')}`,
                        'error'
                    );
                    return;
                }
            }

            // Get selected members
            const checkboxes = document.querySelectorAll('#confirmMembersList input[type="checkbox"]:checked');
            const selectedMemberIds = Array.from(checkboxes).map(cb => cb.value);

            // Update rehearsal with confirmed date and edited details
            const updatedRehearsal = await Storage.updateRehearsal(rehearsalId, {
                status: 'confirmed',
                title: editedTitle,
                description: editedDescription,
                locationId: locationId || null,
                confirmedLocation: locationId || null,
                confirmedDate: selectedDate,
                endTime: selectedEndTime
            });

            if (!updatedRehearsal) {
                UI.showToast('Probe konnte nicht bestätigt werden', 'error');
                return;
            }

            const additionalCreatedRehearsals = [];
            for (const proposal of additionalProposals) {
                const created = await this.createAdditionalConfirmedRehearsal(rehearsal, proposal, {
                    title: editedTitle,
                    description: editedDescription,
                    locationId
                });

                if (created) {
                    additionalCreatedRehearsals.push(created);
                }
            }

            // Only send emails if members are selected
            if (selectedMemberIds.length > 0) {
                const members = await Storage.getBandMembers(rehearsal.bandId);
                const selectedMembers = members.filter(m => selectedMemberIds.includes(m.userId));
                const confirmationTargets = [
                    {
                        rehearsal: {
                            ...rehearsal,
                            title: editedTitle,
                            description: editedDescription,
                            locationId: locationId || null
                        },
                        selectedDate
                    },
                    ...additionalCreatedRehearsals.map(created => ({
                        rehearsal: created,
                        selectedDate: created.confirmedDate
                    }))
                ];

                UI.showToast('Termin(e) bestätigt. Sende E-Mails...', 'info');

                let sentMailCount = 0;
                let hasMailErrors = false;

                for (const target of confirmationTargets) {
                    const result = await EmailService.sendRehearsalConfirmation(
                        target.rehearsal,
                        target.selectedDate,
                        selectedMembers
                    );

                    sentMailCount += (result.results || []).filter(entry => entry && entry.success).length;
                    if (!result.success) {
                        hasMailErrors = true;
                    }
                }

                if (sentMailCount > 0) {
                    UI.showToast(
                        `${1 + additionalCreatedRehearsals.length} Probe(n) bestätigt, ${sentMailCount} E-Mails versendet`,
                        hasMailErrors ? 'warning' : 'success'
                    );
                } else {
                    UI.showToast('Probe(n) bestätigt, aber keine E-Mails versendet', hasMailErrors ? 'warning' : 'success');
                }
            } else {
                UI.showToast(
                    `${1 + additionalCreatedRehearsals.length} Probe(n) bestätigt (keine E-Mails versendet)`,
                    'success'
                );
            }

            window._pendingRehearsalCreation = null;
            window._locationConflictReturnModalId = null;

            UI.closeModal('confirmRehearsalModal');
            UI.closeModal('locationConflictModal'); // Close conflict modal if it was open

            // Force refresh of data
            this.invalidateCache();
            this.rehearsals = null;
            await this.renderRehearsals(this.currentFilter);

            if (typeof App !== 'undefined' && App.updateDashboard) {
                await App.updateDashboard();
            }
        } catch (error) {
            console.error('[Rehearsals] confirmRehearsal failed', error);
            UI.showToast(error?.message || 'Probe konnte nicht bestätigt werden', 'error');
        }
    },

    // Vote on a date
    async vote(rehearsalId, dateIndex, availability) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const existingVote = await Storage.getUserVoteForDate(user.id, rehearsalId, dateIndex);

        if (availability === 'none') {
            // Explicitly retract vote
            if (existingVote) {
                await Storage.deleteVote(existingVote.id);
                UI.showToast('Abstimmung zurückgezogen', 'info');
            }
        } else if (existingVote && existingVote.availability === availability) {
            // Toggle off if clicking the same option (optional, but consistent)
            await Storage.deleteVote(existingVote.id);
            UI.showToast('Abstimmung zurückgezogen', 'info');
        } else {
            // Delete existing vote if changing from one option to another
            if (existingVote) {
                await Storage.deleteVote(existingVote.id);
            }
            // Create new vote
            await Storage.createVote({
                rehearsalId,
                userId: user.id,
                dateIndex,
                availability
            });
            UI.showToast('Abstimmung gespeichert!', 'success');
        }

        // Full re-render to move card between lists (Pending <-> Voted)
        // Ensure the current card stays expanded
        this.expandedRehearsalId = rehearsalId;

        // Save scroll position
        const scrollPos = window.scrollY;

        await this.renderRehearsals(this.currentFilter, true);

        // Restore scroll position
        window.scrollTo(0, scrollPos);

        if (typeof App !== 'undefined' && App.updateDashboard) {
            App.updateDashboard();
        }
    },

    // Suggest alternative time for a date
    async suggestTime(rehearsalId, dateIndex) {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const existingSuggestion = await Storage.getUserTimeSuggestionForDate(user.id, rehearsalId, dateIndex);

        // Set hidden fields
        document.getElementById('suggestTimeRehearsalId').value = rehearsalId;
        document.getElementById('suggestTimeDateIndex').value = dateIndex;

        // Set existing time if available
        const timeInput = document.getElementById('suggestedTimeInput');
        if (existingSuggestion) {
            timeInput.value = existingSuggestion.suggestedTime;
            document.getElementById('deleteTimeSuggestionBtn').style.display = 'inline-block';
        } else {
            timeInput.value = '';
            document.getElementById('deleteTimeSuggestionBtn').style.display = 'none';
        }

        // Open modal
        UI.openModal('timeSuggestionModal');
    },

    // Save time suggestion from modal
    async saveTimeSuggestion() {
        const user = Auth.getCurrentUser();
        if (!user) return;

        const rehearsalId = document.getElementById('suggestTimeRehearsalId').value;
        const dateIndex = parseInt(document.getElementById('suggestTimeDateIndex').value);
        const timeInput = document.getElementById('suggestedTimeInput').value;

        if (!timeInput) {
            UI.showToast('Bitte eine Uhrzeit auswählen', 'error');
            return;
        }

        // Delete existing suggestion if changing
        const existingSuggestion = await Storage.getUserTimeSuggestionForDate(user.id, rehearsalId, dateIndex);
        if (existingSuggestion) {
            await Storage.deleteTimeSuggestion(existingSuggestion.id);
        }

        // Create new suggestion
        await Storage.createTimeSuggestion({
            rehearsalId,
            userId: user.id,
            dateIndex,
            suggestedTime: timeInput
        });

        UI.showToast('Zeitvorschlag gespeichert!', 'success');
        UI.closeModal('timeSuggestionModal');

        // Update the rehearsal card
        await this.refreshRehearsalCard(rehearsalId);

        // If voting modal is open, refresh it too
        const votingModal = document.getElementById('rehearsalVotingModal');
        if (votingModal && votingModal.classList.contains('active')) {
            await this.openVotingModal(rehearsalId);
        }
    },

    async refreshRehearsalCard(rehearsalId) {
        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (rehearsal) {
            const card = document.querySelector(`.rehearsal-card[data-rehearsal-id="${rehearsalId}"]`);
            if (card) {
                const newCardHtml = await this.renderRehearsalCard(rehearsal);
                card.outerHTML = newCardHtml;

                // Re-attach handlers to the updated card
                const updatedCard = document.querySelector(`.rehearsal-card[data-rehearsal-id="${rehearsalId}"]`);
                if (updatedCard) {
                    this.attachVoteHandlers(updatedCard);
                }
            }
        }
    },

    async loadBandMembers(bandId, selectedMembers = null) {
        const container = document.getElementById('rehearsalBandMembers');
        if (!container) return;
        if (!bandId) {
            container.innerHTML = '<div class="member-selection-empty">Bitte zuerst eine Band auswählen.</div>';
            this.currentBandMemerAbsences = [];
            return;
        }

        const members = await Storage.getBandMembers(bandId);
        const users = await Promise.all(members.map(member => Storage.getById('users', member.userId)));
        const normalizedSelectedMembers = Array.isArray(selectedMembers)
            ? selectedMembers.map(memberId => String(memberId))
            : null;
        const validUsers = users.filter(u => u).sort((a, b) => {
            const getRank = role => role === 'leader' ? 0 : role === 'co-leader' ? 1 : 2;
            const rankA = getRank(members.find(m => m.userId === a.id)?.role);
            const rankB = getRank(members.find(m => m.userId === b.id)?.role);
            if (rankA !== rankB) return rankA - rankB;
            return (a.first_name || '').localeCompare(b.first_name || '');
        });

        const userIds = validUsers.map(u => u.id);
        this.currentBandMemerAbsences = await Storage.getAbsencesForUsers(userIds);

        container.innerHTML = validUsers.map(user => {
            const member = members.find(m => m.userId === user.id);
            const role = member ? member.role : 'member';
            const roleLabel = role === 'leader' ? 'Leiter' : role === 'co-leader' ? 'Co-Leiter' : 'Mitglied';
            const isSelected = normalizedSelectedMembers ? normalizedSelectedMembers.includes(String(user.id)) : true;
            const displayName = user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user.username || 'Unbekannt');
            const profileImage = user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${Bands.escapeHtml(displayName)}">` : displayName.charAt(0).toUpperCase();
            
            let instrumentHtml = '';
            if (typeof Events !== 'undefined' && typeof Events.getInstrumentLabels === 'function') {
                const instruments = Events.getInstrumentLabels(user);
                if (instruments.length > 0) {
                    instrumentHtml = `<span class="member-select-instrument">${Bands.escapeHtml(instruments.join(', '))}</span>`;
                }
            }

            return `
                <label class="member-select-card ${isSelected ? 'is-selected' : ''}" data-user-id="${user.id}">
                    <input type="checkbox" class="member-select-checkbox" value="${user.id}" ${isSelected ? 'checked' : ''}>
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

    getSelectedMembers() {
        return Array.from(document.querySelectorAll('#rehearsalBandMembers input:checked')).map(cb => cb.value);
    },

    buildRehearsalPayload({ bandId, title, description, dates, locationId = null, eventId = null, scheduleMode = 'proposals', proposedBy = null } = {}) {
        const normalizedMode = scheduleMode === 'fixed' ? 'fixed' : 'proposals';
        const normalizedDates = Array.isArray(dates)
            ? dates
                .filter(date => date && date.startTime && date.endTime)
                .map(date => ({
                    startTime: date.startTime,
                    endTime: date.endTime,
                    confirmed: normalizedMode === 'fixed'
                }))
            : [];
        const primaryDate = normalizedDates[0] || null;
        const payload = {
            bandId,
            title,
            description,
            locationId: locationId || null,
            eventId: eventId || null,
            proposedDates: normalizedDates,
            status: normalizedMode === 'fixed' ? 'confirmed' : 'pending',
            confirmedDate: normalizedMode === 'fixed' && primaryDate ? primaryDate.startTime : null,
            confirmedLocation: normalizedMode === 'fixed' ? (locationId || null) : null,
            endTime: normalizedMode === 'fixed' && primaryDate ? primaryDate.endTime : null
        };

        if (proposedBy) {
            payload.proposedBy = proposedBy;
        }

        return payload;
    },

    // Create new rehearsal
    async createRehearsal(bandId, title, description, dates, locationId = null, eventId = null, options = {}) {
        const user = Auth.getCurrentUser();
        if (!user) return;
        const scheduleMode = options.scheduleMode === 'fixed' ? 'fixed' : 'proposals';
        const normalizedDates = Array.isArray(dates)
            ? dates.filter(date => date && date.startTime && date.endTime)
            : [];

        if (!(await Auth.canProposeRehearsal(bandId))) {
            UI.showToast('Keine Berechtigung – nur Leiter und Co-Leiter dürfen Proben vorschlagen.', 'error');
            return;
        }

        // Check location availability if location is calendar-linked
        if (locationId && typeof App !== 'undefined' && App.checkLocationAvailability) {
            for (const date of normalizedDates) {
                const startDate = new Date(date.startTime);
                const endDate = new Date(date.endTime);

                const availability = await App.checkLocationAvailability(locationId, startDate, endDate);

                if (!availability.available) {
                    const location = await Storage.getLocation(locationId);
                    const conflictList = availability.conflicts.map(c => {
                        const start = new Date(c.startDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const end = new Date(c.endDate).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return `• ${c.summary} (${start} - ${end})`;
                    }).join('\n');

                    const proceed = confirm(
                        `⚠️ Achtung: ${location.name} ist am ${date.date} in diesem Zeitraum bereits belegt.\n\n` +
                        `Diese bestehenden Buchungen überschneiden sich mit deiner Probe:\n${conflictList}\n\n` +
                        `Wenn du fortfährst, wird die Probe trotzdem mit diesem Ort gespeichert. Möchtest du das wirklich?`
                    );

                    if (!proceed) {
                        return;
                    }
                }
            }
        }

        const rehearsal = this.buildRehearsalPayload({
            bandId,
            proposedBy: user.id,
            title,
            description,
            dates: normalizedDates,
            locationId,
            eventId,
            scheduleMode
        });

        const savedRehearsal = await Storage.createRehearsal(rehearsal);

        // Invalidate cache
        this.invalidateCache();

        // No auto-vote for proposer anymore - they start with 'maybe' (no vote)
        // Votes will be created when they interact with the buttons

        UI.showToast(scheduleMode === 'fixed' ? 'Probetermin erstellt' : 'Probetermin vorgeschlagen', 'success');
        UI.closeModal('createRehearsalModal');

        // Force a true refresh from DB to get all context (votes, creators etc)
        await this.renderRehearsals(this.currentFilter, true);

        if (typeof App !== 'undefined' && App.updateDashboard) {
            await App.updateDashboard();
        }

        if (typeof App !== 'undefined' && App.refreshPersonalCalendarAfterPlanningChange) {
            await App.refreshPersonalCalendarAfterPlanningChange();
        }

        return savedRehearsal;
    },

    // Edit rehearsal
    async editRehearsal(rehearsalId) {
        const rehearsal = await Storage.getRehearsal(rehearsalId);
        if (!rehearsal) return;

        this.currentRehearsalId = rehearsalId;

        // Set modal title
        document.getElementById('rehearsalModalTitle').textContent = 'Probetermin bearbeiten';
        document.getElementById('saveRehearsalBtn').textContent = 'Änderungen speichern';
        document.getElementById('editRehearsalId').value = rehearsalId;

        // Show delete button
        const deleteBtn = document.getElementById('deleteRehearsalBtn');
        if (deleteBtn) {
            deleteBtn.style.display = 'block';
        }

        // Show update email section only for confirmed rehearsals
        const updateEmailSection = document.getElementById('updateEmailSection');
        const sendUpdateCheckbox = document.getElementById('sendUpdateEmail');
        if (rehearsal.status === 'confirmed' && updateEmailSection) {
            updateEmailSection.style.display = 'block';
            if (sendUpdateCheckbox) sendUpdateCheckbox.checked = false; // Reset checkbox

            // Store original rehearsal data for change detection
            this.originalRehearsal = {
                title: rehearsal.title,
                description: rehearsal.description,
                confirmedDate: rehearsal.confirmedDate,
                locationId: rehearsal.locationId,
                bandId: rehearsal.bandId
            };
        } else {
            if (updateEmailSection) updateEmailSection.style.display = 'none';
            this.originalRehearsal = null;
        }

        // Populate band and location selects
        await Bands.populateBandSelects();
        if (typeof App !== 'undefined' && App.populateLocationSelect) {
            await App.populateLocationSelect();
        }

        // Load members list
        await this.loadBandMembers(rehearsal.bandId, rehearsal.members);

        // Populate form
        document.getElementById('rehearsalBand').value = rehearsal.bandId;
        document.getElementById('rehearsalTitle').value = rehearsal.title;
        document.getElementById('rehearsalDescription').value = rehearsal.description || '';
        document.getElementById('rehearsalLocation').value = rehearsal.locationId || '';

        // Populate event select
        if (typeof App !== 'undefined' && App.populateEventSelect) {
            await App.populateEventSelect(rehearsal.bandId);
            document.getElementById('rehearsalEvent').value = rehearsal.eventId || '';
        }

        const proposedDates = Array.isArray(rehearsal.proposedDates) ? rehearsal.proposedDates : [];
        const scheduleMode = this.resolveScheduleModeFromRehearsal(rehearsal);
        const fixedSource = rehearsal.confirmedDate
            ? { startTime: rehearsal.confirmedDate, endTime: rehearsal.endTime }
            : (proposedDates[0] || null);
        const proposalRows = proposedDates.length > 0
            ? proposedDates.map(date => this.getProposalInputValues(date))
            : (fixedSource ? [this.getProposalInputValues(fixedSource)] : [{}]);

        this.setFixedDateFields(this.getProposalInputValues(fixedSource));
        this.resetDateProposalRows(proposalRows);
        this.setScheduleMode(scheduleMode, { lockMode: false, refreshAvailability: false });

        if (typeof App !== 'undefined') {
            this.attachAvailabilityListeners();
            UI.showLoading('Kalender wird geladen…');
            Promise.resolve(this.updateAvailabilityIndicators())
                .finally(() => UI.hideLoading());
            const locSelect = document.getElementById('rehearsalLocation');
            if (locSelect) {
                const evt = new Event('change', { bubbles: true });
                locSelect.dispatchEvent(evt);
            }
        }

        // Show notification checkbox for editing
        const notifyGroup = document.getElementById('notifyMembersGroup');
        if (notifyGroup) {
            notifyGroup.style.display = 'block';
            document.getElementById('notifyMembersOnUpdate').checked = false;
        }

        UI.openModal('createRehearsalModal');
    },

    // Update rehearsal
    async updateRehearsal(rehearsalId, bandId, title, description, dates, locationId, eventId, notifyMembers = false, options = {}) {
        // Get old rehearsal data before updating
        const oldRehearsal = await Storage.getRehearsal(rehearsalId);
        const payload = this.buildRehearsalPayload({
            bandId,
            title,
            description,
            dates,
            locationId,
            eventId,
            scheduleMode: options.scheduleMode
        });

        const updatedRehearsal = await Storage.updateRehearsal(rehearsalId, payload);

        // Send update email if requested and rehearsal was confirmed
        if (notifyMembers && oldRehearsal && oldRehearsal.status === 'confirmed' && updatedRehearsal) {
            const members = await Storage.getBandMembers(bandId);

            UI.showToast('Änderungen werden gespeichert und E-Mails versendet...', 'info');

            const result = await EmailService.sendRehearsalUpdate(oldRehearsal, updatedRehearsal, members);

            if (result.success) {
                UI.showToast(result.message, 'success');
            } else {
                UI.showToast(result.message || 'Fehler beim Senden der E-Mails', 'warning');
            }
        } else {
            UI.showToast('Probetermin aktualisiert', 'success');
        }

        UI.closeModal('createRehearsalModal');
        this.invalidateCache();
        await this.renderRehearsals(this.currentFilter);

        if (typeof App !== 'undefined' && App.refreshPersonalCalendarAfterPlanningChange) {
            await App.refreshPersonalCalendarAfterPlanningChange();
        }
    },

    async deleteRehearsal(rehearsalId) {
        const confirmed = await UI.confirmDelete('Möchtest du diesen Probentermin wirklich löschen?');
        if (confirmed) {
            // Sofort aus dem DOM entfernen für bessere UX
            const card = document.querySelector(`.rehearsal-card[data-rehearsal-id="${rehearsalId}"]`);
            if (card) {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.95)';
                setTimeout(() => card.remove(), 300);
            }

            // Aus dem lokalen Cache entfernen
            if (this.rehearsals && Array.isArray(this.rehearsals)) {
                this.rehearsals = this.rehearsals.filter(r => r.id !== rehearsalId);
            }

            // Aus der Datenbank löschen
            await Storage.deleteRehearsal(rehearsalId);

            // Liste aktualisieren (invalidiert den alten Cache)
            this.invalidateCache();
            if (typeof App !== 'undefined' && App.refreshPersonalCalendarAfterPlanningChange) {
                await App.refreshPersonalCalendarAfterPlanningChange();
            }
            await this.renderRehearsals(this.currentFilter, true);
        }
    },

    // Availability helpers
    async checkSingleDateAvailability(locationId, isoString, endIsoString = null) {
        try {
            if (!locationId || !isoString || typeof App === 'undefined' || !App.checkLocationAvailability) {
                return { available: true, conflicts: [] };
            }

            // Get the location to find its linked calendar
            const location = await Storage.getLocation(locationId);
            if (!location) {
                return { available: true, conflicts: [] };
            }

            // Determine linked calendar
            let linkedCalendar = location.linkedCalendar || '';
            if (!linkedCalendar && location.linkedCalendars) {
                if (location.linkedCalendars.tonstudio) linkedCalendar = 'tonstudio';
                else if (location.linkedCalendars.festhalle) linkedCalendar = 'jms-festhalle';
                else if (location.linkedCalendars.ankersaal) linkedCalendar = 'ankersaal';
            } else if (!linkedCalendar && location.linkedToCalendar) {
                linkedCalendar = 'tonstudio';
            }

            if (!linkedCalendar) {
                // No calendar linked, always available
                return { available: true, conflicts: [] };
            }

            // Ensure calendar data is loaded
            if (typeof Calendar !== 'undefined' && Calendar.ensureLocationCalendar) {
                try {
                    await Calendar.ensureLocationCalendar(linkedCalendar, location.name);
                    console.log(`[Rehearsals] Calendar loaded: ${linkedCalendar}`);
                } catch (err) {
                    console.error(`[Rehearsals] Failed to load calendar ${linkedCalendar}:`, err);
                    // Don't return true here - the calendar might have data that failed to refresh
                }
            }

            const startDate = new Date(isoString);
            const endDate = endIsoString ? new Date(endIsoString) : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
            return await App.checkLocationAvailability(locationId, startDate, endDate);
        } catch (e) {
            console.error('Availability check failed', e);
            return { available: true, conflicts: [] };
        }
    },

    async updateAvailabilityIndicators() {
        const scheduleMode = this.getScheduleMode();
        const locationId = document.getElementById('rehearsalLocation')?.value || '';
        const fixedDateInput = document.getElementById('rehearsalFixedDate');
        const fixedStartInput = document.getElementById('rehearsalFixedStartTime');
        const fixedEndInput = document.getElementById('rehearsalFixedEndTime');
        const fixedIndicator = document.getElementById('rehearsalFixedDateAvailability');
        const fixedSection = document.getElementById('rehearsalFixedDateSection');
        const items = document.querySelectorAll('#dateProposals .date-proposal-item');

        // Reset any generic member conflict highlighting.
        document.querySelectorAll('.member-select-card').forEach(card => {
            card.classList.remove('has-conflict');
        });

        this.bindTimeRangeValidation(fixedStartInput, fixedEndInput);
        this.clearFixedDateAvailability();

        if (scheduleMode === 'fixed' && fixedDateInput && fixedStartInput && fixedEndInput && fixedIndicator) {
            if (fixedDateInput.value && fixedStartInput.value && fixedEndInput.value && fixedEndInput.value > fixedStartInput.value) {
                const startDateTime = `${fixedDateInput.value}T${fixedStartInput.value}`;
                const endDateTime = `${fixedDateInput.value}T${fixedEndInput.value}`;
                const availability = locationId
                    ? await this.checkSingleDateAvailability(locationId, startDateTime, endDateTime)
                    : { available: true, conflicts: [] };
                const locationConflicts = availability.available ? [] : (availability.conflicts || []);
                const memberConflicts = this.collectMemberConflicts(startDateTime, endDateTime);
                const hasConflicts = locationConflicts.length > 0 || memberConflicts.length > 0;

                fixedIndicator.innerHTML = this.buildProposalStatusMarkup({
                    locationId,
                    locationConflicts,
                    memberConflicts
                });
                fixedIndicator.className = `date-availability ${hasConflicts ? 'has-conflict' : 'is-available'}`;

                const detailsHtml = hasConflicts
                    ? `<div class="availability-details-stack">${this.buildAvailabilityDetailsHtml({ locationConflicts, memberConflicts })}</div>`
                    : '';

                if (detailsHtml && fixedSection) {
                    fixedIndicator.insertAdjacentHTML('afterend', detailsHtml);
                }
            } else if (fixedIndicator) {
                fixedIndicator.innerHTML = '';
                fixedIndicator.className = 'date-availability';
            }
        }

        if (scheduleMode !== 'proposals') {
            items.forEach(item => {
                const indicator = item.querySelector('.date-availability');
                if (indicator) {
                    indicator.innerHTML = '';
                    indicator.className = 'date-availability';
                }
                item.querySelectorAll('.availability-details-stack, .conflict-details-box, .member-details-box').forEach(details => details.remove());
            });
            return;
        }

        for (const item of items) {
            // Skip confirmed proposals
            if (item.dataset.confirmed === 'true') {
                continue;
            }

            const dateInput = item.querySelector('.date-input-date');
            const startInput = item.querySelector('.date-input-start');
            const endInput = item.querySelector('.date-input-end');
            const indicator = item.querySelector('.date-availability');

            if (!indicator) continue;

            if (!dateInput || !dateInput.value || !startInput || !startInput.value || !endInput || !endInput.value) {
                indicator.textContent = '';
                indicator.className = 'date-availability';
                continue;
            }

            // Combine date with start and end times
            const startDateTime = `${dateInput.value}T${startInput.value}`;
            const endDateTime = `${dateInput.value}T${endInput.value}`;

            let locationConflicts = [];

            // Check location availability
            if (locationId) {
                const availability = await this.checkSingleDateAvailability(locationId, startDateTime, endDateTime);
                if (!availability.available) {
                    locationConflicts = availability.conflicts || [];
                }
            }
            const memberConflicts = this.collectMemberConflicts(startDateTime, endDateTime);

            // Remove any existing conflict details box
            const existingDetails = item.querySelector('.availability-details-stack, .conflict-details-box, .member-details-box');
            if (existingDetails) {
                existingDetails.remove();
            }

            const hasConflicts = locationConflicts.length > 0 || memberConflicts.length > 0;
            indicator.innerHTML = this.buildProposalStatusMarkup({
                locationId,
                locationConflicts,
                memberConflicts
            });
            indicator.className = `date-availability ${hasConflicts ? 'has-conflict' : 'is-available'}`;

            const detailsHtml = hasConflicts
                ? `<div class="availability-details-stack">${this.buildAvailabilityDetailsHtml({ locationConflicts, memberConflicts })}</div>`
                : '';
            if (detailsHtml) {
                const detailsAnchor = item.querySelector('.date-proposal-footer') || indicator;
                detailsAnchor.insertAdjacentHTML('afterend', detailsHtml);
            }
        }

        // Add time validation listeners
        items.forEach(item => {
            const startInput = item.querySelector('.date-input-start');
            const endInput = item.querySelector('.date-input-end');
            this.bindTimeRangeValidation(startInput, endInput);
        });
    },

    // Render recent votes for dashboard
    async renderRecentVotes() {
        const container = document.getElementById('recentVotes');
        const user = Auth.getCurrentUser();

        if (!user) return;

        let rehearsals = (await Storage.getUserRehearsals(user.id)) || [];
        rehearsals = rehearsals.filter(r => r.status === 'pending');
        rehearsals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        rehearsals = rehearsals.slice(0, 3);

        if (rehearsals.length === 0) {
            UI.showCompactEmptyState(container, 'Keine offenen Abstimmungen 🥳');
            return;
        }

        const cards = await Promise.all(rehearsals.map(rehearsal =>
            this.renderRehearsalCard(rehearsal)
        ));
        container.innerHTML = cards.join('');

        this.attachVoteHandlers(container);
    },

    // Populate statistics rehearsal select
    async populateStatsSelect() {
        // Show loading overlay if present
        const overlay = document.getElementById('globalLoadingOverlay');
        if (typeof window.showGlobalLoadingOverlay === 'function') {
            window.showGlobalLoadingOverlay();
        } else if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
        }
        const select = document.getElementById('statsRehearsalSelect');
        const user = Auth.getCurrentUser();

        if (!select || !user) return;

        const rehearsals = (await Storage.getUserRehearsals(user.id)) || [];

        const options = await Promise.all(rehearsals.map(async r => {
            const band = await Storage.getBand(r.bandId);
            return `<option value="${r.id}">${Bands.escapeHtml(r.title)} (${Bands.escapeHtml(band?.name || '')})</option>`;
        }));

        select.innerHTML = '<option value="">Probetermin auswählen</option>' + options.join('');

        // Hide loading overlay after all data/UI is ready
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 400);
        }
    },

    // Populate band select for statistics
    async populateStatsBandSelect() {
        const select = document.getElementById('statsBandSelect');
        const user = Auth.getCurrentUser();
        if (!select || !user) return;

        const bands = (await Storage.getUserBands(user.id)) || [];

        select.innerHTML = '<option value="">Band auswählen</option>' +
            bands.map(b => `<option value="${b.id}">${Bands.escapeHtml(b.name)}</option>`).join('');

        // Wenn der Nutzer genau in einer Band ist, automatisch vorauswählen
        if (bands.length === 1) {
            select.value = bands[0].id;
            // change-Event auslösen, damit abhängige UI sofort aktualisiert
            const evt = new Event('change', { bubbles: true });
            select.dispatchEvent(evt);
        }
    },

    // Add date proposal field
    addDateProposal() {
        const container = document.getElementById('dateProposals');
        if (!container) return;

        const newItem = this.createDateProposalItem();
        container.appendChild(newItem);

        this.updateRemoveButtons();
        this.attachAvailabilityListeners();
        UI.showLoading('Kalender wird geladen…');
        Promise.resolve(this.updateAvailabilityIndicators())
            .finally(() => UI.hideLoading());
    },

    // Update remove button states
    updateRemoveButtons() {
        const container = document.getElementById('dateProposals');
        const items = container.querySelectorAll('.date-proposal-item');
        const removeButtons = container.querySelectorAll('.remove-date');

        removeButtons.forEach((btn, index) => {
            btn.disabled = items.length <= 1;
        });
    },

    getProposalDatesFromForm() {
        const items = document.querySelectorAll('#dateProposals .date-proposal-item');
        const dates = [];
        items.forEach(item => {
            const dateInput = item.querySelector('.date-input-date');
            const startInput = item.querySelector('.date-input-start');
            const endInput = item.querySelector('.date-input-end');
            const isConfirmed = item.dataset.confirmed === 'true';

            if (dateInput && startInput && endInput && dateInput.value && startInput.value && endInput.value && endInput.value > startInput.value) {
                const startTime = `${dateInput.value}T${startInput.value}`;
                const endTime = `${dateInput.value}T${endInput.value}`;
                dates.push({ startTime, endTime, confirmed: isConfirmed });
            }
            else if (item.dataset.startTime && item.dataset.endTime) {
                dates.push({
                    startTime: item.dataset.startTime,
                    endTime: item.dataset.endTime,
                    confirmed: isConfirmed
                });
            }
        });
        return dates;
    },

    // Get dates from form
    getDatesFromForm() {
        return this.getProposalDatesFromForm();
    }
};

window.Rehearsals = Rehearsals;
