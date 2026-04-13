// Personal Calendar Module - Shows user's rehearsals and events

const PersonalCalendar = {
    events: [],
    rehearsals: [],
    absences: [],
    userBands: [],
    currentMonth: new Date(),
    isLoading: false,
    hasLoaded: false,
    dayCreateMenuListenersBound: false,

    // Clear all cached data (called during logout)
    clearCache() {
        this.events = [];
        this.rehearsals = [];
        this.absences = [];
        this.userBands = [];
        this.hasLoaded = false;
    },

    async loadPersonalCalendar() {
        Logger.time('Personal Calendar Load');
        if (this.hasLoaded) {
            this.renderCalendar();
            Logger.timeEnd('Personal Calendar Load');
            return;
        }

        if (this.isLoading) return;
        this.isLoading = true;

        const startTime = performance.now();
        const container = document.getElementById('personalCalendarContainer');
        if (!container) {
            console.error('[PersonalCalendar] Container not found!');
            Logger.timeEnd('Personal Calendar Load');
            return;
        }
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Termine...</p></div>';
        let overlay = document.getElementById('globalLoadingOverlay');
        try {
            const user = Auth.getCurrentUser();
            const userBands = await Storage.getUserBands(user.id);
            const bandIds = (userBands || []).map(b => b.id || b.band_id || b.bandId).filter(Boolean);

            const [allEvents, allRehearsals, allAbsences] = await Promise.all([
                bandIds.length > 0 ? this.loadUserEvents(bandIds) : [],
                bandIds.length > 0 ? this.loadUserRehearsals(bandIds) : [],
                this.loadUserAbsences(user.id)
            ]);

            if ((!Array.isArray(userBands) || userBands.length === 0) && (!Array.isArray(allAbsences) || allAbsences.length === 0)) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📅</div>
                        <p>Du bist noch keiner Band beigetreten.</p>
                        <p>Trete einer Band bei, um deine Termine zu sehen.</p>
                    </div>
                `;
                Logger.timeEnd('Personal Calendar Load');
                return;
            }

            this.events = allEvents;
            this.rehearsals = allRehearsals;
            this.absences = allAbsences;
            this.userBands = userBands;
            
            // Map roles for quick access
            this.userRoles = {};
            (userBands || []).forEach(b => {
                const bId = b.id || b.band_id || b.bandId;
                if (bId) this.userRoles[bId] = b.role;
            });

            this.hasLoaded = true;
            this.renderCalendar();

            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Personal Calendar Loaded – (${allEvents.length} events, ${allRehearsals.length} rehearsals, ${allAbsences.length} absences, ${duration}s)`);
            delete Logger.timers['Personal Calendar Load']; // handled manually
        } catch (error) {
            console.error('[PersonalCalendar] Error loading personal calendar:', error);
            this.hasLoaded = false;
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>Termine konnten nicht geladen werden.</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        ${this.escapeHtml(error.message)}
                    </p>
                    <button onclick="PersonalCalendar.loadPersonalCalendar()" class="btn btn-primary" style="margin-top: 1rem;">
                        🔄 Erneut versuchen
                    </button>
                </div>
            `;
        } finally {
            this.isLoading = false;
            // Lade-Overlay immer ausblenden
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 400);
            }
        }
    },

    async loadUserEvents(bandIds) {
        if (!bandIds || bandIds.length === 0) return [];

        try {
            // Try to get from Supabase
            if (SupabaseClient.client) {
                const { data, error } = await SupabaseClient.client
                    .from('events')
                    .select('*')
                    .in('bandId', bandIds)
                    .order('date', { ascending: true });

                if (error) throw error;
                return data || [];
            } else {
                throw new Error('Supabase client not initialized');
            }
        } catch (error) {
            console.error('[PersonalCalendar] Error loading events:', error);
            // Fallback to storage
            const allEvents = await Storage.getAllEvents() || [];
            return allEvents.filter(event => bandIds.includes(event.bandId));
        }
    },

    async loadUserRehearsals(bandIds) {
        if (!bandIds || bandIds.length === 0) return [];

        try {
            // Try to get from Supabase
            if (SupabaseClient.client) {
                const { data, error } = await SupabaseClient.client
                    .from('rehearsals')
                    .select('*')
                    .in('bandId', bandIds)
                    .eq('status', 'confirmed')
                    .order('confirmedDate', { ascending: true });

                if (error) throw error;
                return data || [];
            } else {
                throw new Error('Supabase client not initialized');
            }
        } catch (error) {
            console.error('[PersonalCalendar] Error loading rehearsals:', error);
            // Fallback to storage
            const allRehearsals = await Storage.getAllRehearsals() || [];
            return allRehearsals.filter(rehearsal =>
                bandIds.includes(rehearsal.bandId) && rehearsal.status === 'confirmed'
            );
        }
    },

    async loadUserAbsences(userId) {
        if (!userId) return [];
        try {
            const absences = await Storage.getUserAbsences(userId);
            return Array.isArray(absences) ? absences : [];
        } catch (error) {
            console.error('[PersonalCalendar] Error loading absences:', error);
            return [];
        }
    },

    normalizeDate(dateValue) {
        const date = new Date(dateValue);
        date.setHours(0, 0, 0, 0);
        return date;
    },

    getAbsenceTitle(absence) {
        const reason = Storage.getAbsenceDisplayReason(absence);
        return reason || 'Abwesenheit';
    },

    getAbsenceMeta(absence) {
        const startDate = this.normalizeDate(absence.startDate);
        const endDate = this.normalizeDate(absence.endDate || absence.startDate);
        const startLabel = startDate.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const endLabel = endDate.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        const timeLabel = typeof App !== 'undefined' && typeof App.formatAbsenceTimeRangeLabel === 'function'
            ? App.formatAbsenceTimeRangeLabel(absence.startDate, absence.endDate)
            : '';

        if (startLabel === endLabel) {
            return timeLabel ? `Nicht verfügbar · ${timeLabel}` : 'Nicht verfügbar';
        }

        return timeLabel ? `${startLabel} – ${endLabel} · ${timeLabel}` : `${startLabel} – ${endLabel}`;
    },

    renderCalendar() {
        const container = document.getElementById('personalCalendarContainer');
        if (!container) return;

        // Combine and sort all items by date
        const allItems = [
            ...this.events.map(e => ({ ...e, type: 'event', sortDate: new Date(e.date) })),
            ...this.rehearsals.map(r => ({ ...r, type: 'rehearsal', sortDate: new Date(r.confirmed_date) }))
        ].sort((a, b) => a.sortDate - b.sortDate);

        if (allItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📅</div>
                    <p>Keine Termine vorhanden</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        Proben und Auftritte deiner Bands werden hier angezeigt.
                    </p>
                </div>
            `;
            return;
        }

        // Group items by month
        const itemsByMonth = this.groupByMonth(allItems);

        const canCreate = Auth.isAdmin() || Object.values(this.userRoles || {}).some(role => role === 'leader' || role === 'co-leader');

        let html = '';
        
        if (canCreate) {
            html += `
                <div class="calendar-actions">
                    <button class="btn btn-primary" onclick="App.openCreateRehearsalModal()">
                        <span>➕</span> Probe anlegen
                    </button>
                    <button class="btn btn-secondary" onclick="App.openCreateEventModal()">
                        <span>🎤</span> Auftritt anlegen
                    </button>
                    <button class="btn btn-ghost" onclick="App.openAbsencesSettings()">
                        <span>🗓️</span> Abwesenheit eintragen
                    </button>
                </div>
            `;
        }

        html += '<div class="personal-calendar-timeline">';

        Object.keys(itemsByMonth).sort().forEach(monthKey => {
            const items = itemsByMonth[monthKey];
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

            html += `
                <div class="calendar-month-section">
                    <h3 class="calendar-month-header">${monthName}</h3>
                    <div class="calendar-items-list">
            `;

            items.forEach(item => {
                if (item.type === 'event') {
                    html += this.renderEventItem(item);
                } else {
                    html += this.renderRehearsalItem(item);
                }
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    groupByMonth(items) {
        const grouped = {};
        items.forEach(item => {
            const date = item.type === 'event' ? new Date(item.date) : new Date(item.confirmedDate);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        return grouped;
    },

    canUserEdit(bandId) {
        if (Auth.isAdmin()) return true;
        const role = (this.userRoles && this.userRoles[bandId]) || null;
        return role === 'leader' || role === 'co-leader';
    },

    renderEventItem(event) {
        const band = this.userBands.find(b => b.id === event.bandId);
        const bandName = band ? band.name : 'Unbekannte Band';
        const date = new Date(event.date);
        const dateStr = date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = event.time || '';
        const isPast = date < new Date();

        return `
            <div class="calendar-item event-item ${isPast ? 'past-item' : ''}">
                <div class="calendar-item-icon">🎤</div>
                <div class="calendar-item-content">
                    <div class="calendar-item-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                        <div class="calendar-item-title">${this.escapeHtml(event.title || event.name)}</div>
                        ${this.canUserEdit(event.bandId) ? `
                            <button class="btn btn-ghost btn-sm" onclick="App.handleEditEvent('${event.id}')" title="Bearbeiten">
                                ✏️ Bearbeiten
                            </button>
                        ` : ''}
                    </div>
                    <div class="calendar-item-meta">
                        <span class="calendar-item-band">🎸 ${this.escapeHtml(bandName)}</span>
                        <span class="calendar-item-date">📅 ${dateStr}</span>
                        ${timeStr ? `<span class="calendar-item-time">🕐 ${this.escapeHtml(timeStr)}</span>` : ''}
                        ${event.location ? `<span class="calendar-item-location">📍 ${this.escapeHtml(event.location)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderRehearsalItem(rehearsal) {
        const band = this.userBands.find(b => b.id === rehearsal.bandId);
        const bandName = band ? band.name : 'Unbekannte Band';
        const date = new Date(rehearsal.confirmedDate);
        const dateStr = date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = rehearsal.confirmedTime || '';
        const isPast = date < new Date();

        return `
            <div class="calendar-item rehearsal-item ${isPast ? 'past-item' : ''}">
                <div class="calendar-item-icon">📅</div>
                <div class="calendar-item-content">
                    <div class="calendar-item-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                        <div class="calendar-item-title">${this.escapeHtml(rehearsal.title || rehearsal.name || 'Probe')}</div>
                        ${this.canUserEdit(rehearsal.bandId) ? `
                            <button class="btn btn-ghost btn-sm" onclick="App.handleEditRehearsal('${rehearsal.id}')" title="Bearbeiten">
                                ✏️ Bearbeiten
                            </button>
                        ` : ''}
                    </div>
                    <div class="calendar-item-meta">
                        <span class="calendar-item-band">🎸 ${this.escapeHtml(bandName)}</span>
                        <span class="calendar-item-date">📅 ${dateStr}</span>
                        ${timeStr ? `<span class="calendar-item-time">🕐 ${this.escapeHtml(timeStr)}</span>` : ''}
                        ${(rehearsal.confirmed_location || rehearsal.location) ? `<span class="calendar-item-location">📍 ${this.escapeHtml(rehearsal.confirmed_location || rehearsal.location)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderCalendar() {
        const container = document.getElementById('personalCalendarContainer');
        if (!container) return;

        const year = this.currentMonth.getFullYear();
        const month = this.currentMonth.getMonth();
        const monthName = this.currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

        const weeks = this.buildCalendarWeeks(year, month);

        const canCreate = Auth.isAdmin() || Object.values(this.userRoles || {}).some(role => role === 'leader' || role === 'co-leader');

        // Build calendar HTML
        let html = `
            <div class="personal-calendar-head">
                <div class="personal-calendar-head-top">
                    <div class="personal-calendar-head-copy">
                        <span class="personal-calendar-head-kicker">Persönliche Termine und Synchronisation</span>
                        <p>Alle persönlichen Termine, schnelle Aktionen und dein Kalender-Abo in einem kompakten Bereich.</p>
                    </div>
                    <button class="btn btn-secondary personal-calendar-subscribe-btn" onclick="PersonalCalendar.exportICS()">
                        <span aria-hidden="true">🔗</span>
                        <span>Kalender abonnieren</span>
                    </button>
                </div>
                <div class="personal-calendar-toolbar">
                    ${canCreate ? `
                        <div class="personal-calendar-toolbar-actions">
                            <button class="btn btn-primary personal-calendar-action-btn" onclick="App.openCreateRehearsalModal()">
                                <span aria-hidden="true">➕</span>
                                <span>Probe anlegen</span>
                            </button>
                            <button class="btn btn-secondary personal-calendar-action-btn" onclick="App.openCreateEventModal()">
                                <span aria-hidden="true">🎤</span>
                                <span>Auftritt anlegen</span>
                            </button>
                            <button class="btn btn-ghost personal-calendar-action-btn" onclick="App.openAbsencesSettings()">
                                <span aria-hidden="true">🗓️</span>
                                <span>Abwesenheit eintragen</span>
                            </button>
                        </div>
                    ` : ''}
                    <div class="personal-calendar-toolbar-nav">
                        <button onclick="PersonalCalendar.previousMonth()" class="btn btn-icon personal-calendar-nav-btn" type="button" aria-label="Vorheriger Monat">‹</button>
                        <div class="personal-calendar-toolbar-title">
                            <h3>${monthName}</h3>
                            <button onclick="PersonalCalendar.goToToday()" class="btn btn-secondary personal-calendar-today-btn" type="button">Heute</button>
                        </div>
                        <button onclick="PersonalCalendar.nextMonth()" class="btn btn-icon personal-calendar-nav-btn" type="button" aria-label="Nächster Monat">›</button>
                    </div>
                </div>
            </div>

            <div class="calendar-grid personal-calendar-grid">
                <div class="calendar-day-headers">
                    <div class="calendar-day-header">Mo</div>
                    <div class="calendar-day-header">Di</div>
                    <div class="calendar-day-header">Mi</div>
                    <div class="calendar-day-header">Do</div>
                    <div class="calendar-day-header">Fr</div>
                    <div class="calendar-day-header">Sa</div>
                    <div class="calendar-day-header">So</div>
                </div>
                <div class="calendar-weeks">
        `;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        weeks.forEach(weekDates => {
            const absenceLayout = this.getAbsenceSegmentsForWeek(weekDates);
            const hasAbsenceBars = absenceLayout.segments.length > 0;

            html += `
                <div class="calendar-week-row${hasAbsenceBars ? ' has-absence-bars' : ''}" style="--absence-lanes:${absenceLayout.laneCount};">
                    ${hasAbsenceBars ? `
                        <div class="calendar-week-absence-layer">
                            ${absenceLayout.segments.map(segment => this.renderAbsenceBar(segment)).join('')}
                        </div>
                    ` : ''}
                    <div class="calendar-week-days">
            `;

            weekDates.forEach(currentDate => {
                if (!currentDate) {
                    html += '<div class="calendar-day empty"></div>';
                    return;
                }

                const isToday = currentDate.getTime() === today.getTime();
                const dayItems = this.getItemsForDate(currentDate);
                const canQuickCreate = canCreate && dayItems.length === 0;
                const dateValue = this.formatDateForInput(currentDate);

                let dayClass = 'calendar-day';
                if (isToday) dayClass += ' today';
                if (dayItems.length > 0) dayClass += ' has-events';
                if (canQuickCreate) dayClass += ' can-create';

                html += `
                    <div class="${dayClass}"${canQuickCreate ? ` data-date="${dateValue}" onclick="PersonalCalendar.toggleDayCreateMenu(event, '${dateValue}')"` : ''}>
                        <div class="calendar-day-top">
                            <div class="calendar-day-number">${currentDate.getDate()}</div>
                        </div>
                        ${canQuickCreate ? `
                            <div class="calendar-day-quick-create-menu" data-date="${dateValue}" hidden onclick="event.stopPropagation()">
                                <button type="button" class="calendar-day-quick-create-option" onclick="PersonalCalendar.createItemForDate(event, 'rehearsal', '${dateValue}')">Probe anlegen</button>
                                <button type="button" class="calendar-day-quick-create-option" onclick="PersonalCalendar.createItemForDate(event, 'event', '${dateValue}')">Auftritt anlegen</button>
                            </div>
                        ` : ''}
                        <div class="calendar-day-events">
                            ${dayItems.map(item => this.renderCalendarItem(item)).join('')}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
        container.innerHTML = html;
        this.ensureDayCreateMenuListeners();
    },

    formatDateForInput(value) {
        if (!value) return '';

        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            return value.slice(0, 10);
        }

        const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    ensureDayCreateMenuListeners() {
        if (this.dayCreateMenuListenersBound) return;

        document.addEventListener('click', (event) => {
            if (event.target.closest('#personalCalendarContainer .calendar-day.can-create')) {
                return;
            }
            this.closeDayCreateMenus();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeDayCreateMenus();
            }
        });

        this.dayCreateMenuListenersBound = true;
    },

    closeDayCreateMenus() {
        const container = document.getElementById('personalCalendarContainer');
        if (!container) return;

        container.querySelectorAll('.calendar-day.can-create').forEach(day => {
            day.classList.remove('is-open');
        });

        container.querySelectorAll('.calendar-day-quick-create-menu').forEach(menu => {
            menu.hidden = true;
        });

        container.querySelectorAll('.calendar-day-quick-create-trigger').forEach(trigger => {
            trigger.setAttribute('aria-expanded', 'false');
        });
    },

    toggleDayCreateMenu(event, dateValue) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        const container = document.getElementById('personalCalendarContainer');
        if (!container || !dateValue) return;

        const menu = container.querySelector(`.calendar-day-quick-create-menu[data-date="${dateValue}"]`);
        const trigger = container.querySelector(`.calendar-day[data-date="${dateValue}"] .calendar-day-quick-create-trigger`);
        const day = container.querySelector(`.calendar-day[data-date="${dateValue}"]`);

        if (!menu || !day) return;

        const shouldOpen = menu.hidden;
        this.closeDayCreateMenus();

        if (!shouldOpen) return;

        menu.hidden = false;
        day.classList.add('is-open');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'true');
        }
    },

    createItemForDate(event, itemType, dateValue) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        this.closeDayCreateMenus();

        if (itemType === 'rehearsal') {
            App.openCreateRehearsalModal({ date: dateValue });
            return;
        }

        App.openCreateEventModal({ date: dateValue, time: '19:00' });
    },

    getItemsForDate(date) {
        const items = [];

        // Add events for this date
        this.events.forEach(event => {
            const eventDate = new Date(event.date);
            eventDate.setHours(0, 0, 0, 0);
            if (eventDate.getTime() === date.getTime()) {
                items.push({ ...event, type: 'event' });
            }
        });

        // Add rehearsals for this date
        this.rehearsals.forEach(rehearsal => {
            const rehearsalDate = this.normalizeDate(rehearsal.confirmedDate);
            if (rehearsalDate.getTime() === date.getTime()) {
                items.push({ ...rehearsal, type: 'rehearsal' });
            }
        });

        return items;
    },

    buildCalendarWeeks(year, month) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;

        const weeks = [];
        let currentWeek = [];

        for (let i = 0; i < startDay; i++) {
            currentWeek.push(null);
        }

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            date.setHours(0, 0, 0, 0);
            currentWeek.push(date);

            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }

        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) {
                currentWeek.push(null);
            }
            weeks.push(currentWeek);
        }

        return weeks;
    },

    getAbsenceSegmentsForWeek(weekDates) {
        const visibleDates = weekDates.filter(Boolean);
        if (visibleDates.length === 0) {
            return { laneCount: 0, segments: [] };
        }

        const weekStart = visibleDates[0];
        const weekEnd = visibleDates[visibleDates.length - 1];
        const segments = [];

        this.absences.forEach(absence => {
            const startDate = this.normalizeDate(absence.startDate);
            const endDate = this.normalizeDate(absence.endDate || absence.startDate);

            if (endDate.getTime() < weekStart.getTime() || startDate.getTime() > weekEnd.getTime()) {
                return;
            }

            const segmentStart = startDate.getTime() < weekStart.getTime() ? weekStart : startDate;
            const segmentEnd = endDate.getTime() > weekEnd.getTime() ? weekEnd : endDate;

            const startCol = weekDates.findIndex(day => day && day.getTime() === segmentStart.getTime()) + 1;
            const endCol = weekDates.findIndex(day => day && day.getTime() === segmentEnd.getTime()) + 1;

            if (startCol <= 0 || endCol <= 0) return;

            segments.push({
                id: absence.id,
                title: this.getAbsenceTitle(absence),
                startCol,
                endCol,
                continuesFromPrev: startDate.getTime() < weekStart.getTime(),
                continuesToNext: endDate.getTime() > weekEnd.getTime()
            });
        });

        segments.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);

        const laneEndByIndex = [];
        segments.forEach(segment => {
            let laneIndex = laneEndByIndex.findIndex(lastEnd => segment.startCol > lastEnd);
            if (laneIndex === -1) {
                laneIndex = laneEndByIndex.length;
                laneEndByIndex.push(segment.endCol);
            } else {
                laneEndByIndex[laneIndex] = segment.endCol;
            }
            segment.lane = laneIndex + 1;
        });

        return {
            laneCount: laneEndByIndex.length,
            segments
        };
    },

    renderAbsenceBar(segment) {
        const classes = ['calendar-absence-bar'];
        if (segment.continuesFromPrev) classes.push('is-continued-start');
        if (segment.continuesToNext) classes.push('is-continued-end');

        return `
            <button
                type="button"
                class="${classes.join(' ')}"
                style="grid-column: ${segment.startCol} / ${segment.endCol + 1}; grid-row: ${segment.lane};"
                onclick="PersonalCalendar.showItemDetails('${segment.id}', 'absence')"
            >
                <span class="calendar-absence-bar-label">${this.escapeHtml(segment.title)}</span>
            </button>
        `;
    },

    renderCalendarItem(item) {
        if (item.type === 'event') {
            const band = this.userBands.find(b => b.id === item.bandId);
            const bandName = band ? band.name : 'Unbekannte Band';
            const eventName = item.title || 'Auftritt';

            return `
                <div class="calendar-event event-type" onclick="PersonalCalendar.showItemDetails('${item.id}', 'event')" style="cursor: pointer;">
                    <div class="calendar-event-type">🎤 Auftritt</div>
                    <div class="calendar-event-title">${this.escapeHtml(eventName)}</div>
                    <div class="calendar-event-band">${this.escapeHtml(bandName)}</div>
                </div>
            `;
        }

        if (item.type === 'rehearsal') {
            const band = this.userBands.find(b => b.id === item.bandId);
            const bandName = band ? band.name : 'Unbekannte Band';
            const title = item.title || 'Probe';

            return `
                <div class="calendar-event rehearsal-type" onclick="PersonalCalendar.showItemDetails('${item.id}', 'rehearsal')" style="cursor: pointer;">
                    <div class="calendar-event-type">📅 Probe</div>
                    <div class="calendar-event-title">${this.escapeHtml(title)}</div>
                    <div class="calendar-event-band">${this.escapeHtml(bandName)}</div>
                </div>
            `;
        }

        return `
            <div class="calendar-event absence-type" onclick="PersonalCalendar.showItemDetails('${item.id}', 'absence')" style="cursor: pointer;">
                <div class="calendar-event-type">Abwesenheit</div>
                <div class="calendar-event-title">${this.escapeHtml(this.getAbsenceTitle(item))}</div>
                <div class="calendar-event-band">${this.escapeHtml(this.getAbsenceMeta(item))}</div>
            </div>
        `;
    },

    previousMonth() {
        this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
        this.renderCalendar();
    },

    nextMonth() {
        this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
        this.renderCalendar();
    },

    goToToday() {
        this.currentMonth = new Date();
        this.renderCalendar();
    },

    async showItemDetails(itemId, itemType) {
        let item;

        if (itemType === 'event') {
            item = this.events.find(e => e.id === itemId);
        } else if (itemType === 'rehearsal') {
            item = this.rehearsals.find(r => r.id === itemId);
        } else {
            item = this.absences.find(a => a.id === itemId);
        }

        if (!item) {
            console.error('Item not found:', itemId, itemType);
            return;
        }

        const band = item.bandId ? this.userBands.find(b => b.id === item.bandId) : null;
        const bandName = band ? band.name : 'Unbekannte Band';
        const bandColor = band ? (band.color || '#e11d48') : '#e11d48';

        let detailsHTML = '';

        if (itemType === 'event') {
            const date = new Date(item.date);
            const dateStr = date.toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });

            // Get band members for this event, fetch user names
            let membersHTML = '';
            const members = await Storage.getBandMembers(item.bandId);
            if (members && members.length > 0) {
                const memberUsers = await Promise.all(members.map(async m => {
                    const user = await Storage.getById('users', m.userId);
                    return user || { id: m.userId, name: 'Unbekannt' };
                }));

                membersHTML = `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">👥 Band-Mitglieder:</div>
                        <div class="calendar-members-grid">
                            ${memberUsers.map(user => {
                    const displayName = UI.getUserDisplayName(user);
                    const initials = UI.getUserInitials(displayName);
                    const avatarColor = UI.getAvatarColor(displayName);
                    return `
                                    <div class="member-avatar-item">
                                        <div class="member-avatar" style="background: ${avatarColor}">
                                            ${user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${displayName}" class="avatar-img">` : initials}
                                        </div>
                                        <span class="member-name">${this.escapeHtml(displayName)}</span>
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
            }

            // Get setlist
            let setlistHTML = '';
            const songs = await Storage.getEventSongs(item.id);
            if (songs && songs.length > 0) {
                setlistHTML = `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">🎵 Setlist:</div>
                        <div class="calendar-setlist-list">
                            ${songs.map((song, idx) => `
                                <div class="calendar-song-item">
                                    <span class="song-index">${idx + 1}.</span>
                                    <span class="song-title">${this.escapeHtml(song.title)}</span>
                                    ${song.artist ? `<span class="song-artist">- ${this.escapeHtml(song.artist)}</span>` : ''}
                                    ${song.key ? `<span class="song-key">(${this.escapeHtml(song.key)})</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            detailsHTML = `
                <div class="calendar-details-container">
                    <div class="calendar-detail-header" style="border-left-color: ${bandColor}">
                        <div class="calendar-detail-icon-large">🎤</div>
                        <div class="calendar-detail-title-group">
                            <h2 class="calendar-detail-title">${this.escapeHtml(item.title || 'Auftritt')}</h2>
                            <div class="calendar-detail-subtitle" style="color: ${bandColor}">🎸 ${this.escapeHtml(bandName)}</div>
                        </div>
                    </div>
                    
                    <div class="calendar-info-grid">
                        <div class="calendar-info-item">
                            <div class="info-icon">📅</div>
                            <div class="info-content">
                                <div class="info-label">Datum</div>
                                <div class="info-value">${dateStr}</div>
                            </div>
                        </div>
                        ${item.time ? `
                        <div class="calendar-info-item">
                            <div class="info-icon">🕐</div>
                            <div class="info-content">
                                <div class="info-label">Uhrzeit</div>
                                <div class="info-value">${this.escapeHtml(item.time)}</div>
                            </div>
                        </div>` : ''}
                        ${item.location ? `
                        <div class="calendar-info-item">
                            <div class="info-icon">📍</div>
                            <div class="info-content">
                                <div class="info-label">Ort</div>
                                <div class="info-value">${this.escapeHtml(item.location)}</div>
                            </div>
                        </div>` : ''}
                        ${item.soundcheck ? `
                        <div class="calendar-info-item">
                            <div class="info-icon">🎚️</div>
                            <div class="info-content">
                                <div class="info-label">Soundcheck</div>
                                <div class="info-value">${this.escapeHtml(item.soundcheck)}</div>
                            </div>
                        </div>` : ''}
                    </div>

                    ${item.notes ? `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">📝 Notizen:</div>
                        <div class="calendar-detail-notes">${this.escapeHtml(item.notes)}</div>
                    </div>` : ''}

                    ${membersHTML}
                    ${setlistHTML}
                </div>
            `;
        } else if (itemType === 'rehearsal') {
            const date = new Date(item.confirmedDate);
            const dateStr = date.toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });

            // Get band members for this rehearsal
            let membersHTML = '';
            const members = await Storage.getBandMembers(item.bandId);
            if (members && members.length > 0) {
                const memberUsers = await Promise.all(members.map(async m => {
                    const user = await Storage.getById('users', m.userId);
                    return user || { id: m.userId, name: 'Unbekannt' };
                }));

                membersHTML = `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">👥 Band-Mitglieder:</div>
                        <div class="calendar-members-grid">
                            ${memberUsers.map(user => {
                    const displayName = UI.getUserDisplayName(user);
                    const initials = UI.getUserInitials(displayName);
                    const avatarColor = UI.getAvatarColor(displayName);
                    return `
                                    <div class="member-avatar-item">
                                        <div class="member-avatar" style="background: ${avatarColor}">
                                            ${user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${displayName}" class="avatar-img">` : initials}
                                        </div>
                                        <span class="member-name">${this.escapeHtml(displayName)}</span>
                                    </div>
                                `;
                }).join('')}
                        </div>
                    </div>
                `;
            }

            // Get attendance summary
            let attendanceHTML = '';
            if (item.responses && Object.keys(item.responses).length > 0) {
                const responseEntries = Object.entries(item.responses);
                const acceptedIds = responseEntries.filter(([id, r]) => r === 'accepted').map(([id, r]) => id);
                const declinedIds = responseEntries.filter(([id, r]) => r === 'declined').map(([id, r]) => id);
                const maybeIds = responseEntries.filter(([id, r]) => r === 'maybe').map(([id, r]) => id);

                // Fetch names/avatars for responders
                const responderIds = [...new Set([...acceptedIds, ...declinedIds, ...maybeIds])];
                const responders = await Promise.all(responderIds.map(async id => {
                    const user = await Storage.getById('users', id);
                    return user || { id, name: 'Unbekannt' };
                }));
                const responderMap = {};
                responders.forEach(r => responderMap[r.id] = r);

                const renderResponderList = (ids, label, className) => {
                    if (ids.length === 0) return '';
                    return `
                        <div class="attendance-group" style="margin-top: 0.5rem;">
                            <div class="attendance-sublabel ${className}" style="font-size: 0.8rem; font-weight: 700; margin-bottom: 0.25rem;">${label} (${ids.length}):</div>
                            <div class="calendar-members-grid">
                                ${ids.map(id => {
                        const user = responderMap[id];
                        if (!user) return '';
                        const displayName = UI.getUserDisplayName(user);
                        const initials = UI.getUserInitials(displayName);
                        const avatarColor = UI.getAvatarColor(displayName);
                        return `
                                        <div class="member-avatar-item">
                                            <div class="member-avatar" style="background: ${avatarColor}">
                                                ${user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${displayName}" class="avatar-img">` : initials}
                                            </div>
                                            <span class="member-name">${this.escapeHtml(displayName)}</span>
                                        </div>
                                    `;
                    }).join('')}
                            </div>
                        </div>
                    `;
                };

                attendanceHTML = `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">✅ Teilnahmen:</div>
                        <div class="calendar-attendance-details">
                            ${renderResponderList(acceptedIds, 'Zugesagt', 'stat-accepted')}
                            ${renderResponderList(declinedIds, 'Abgesagt', 'stat-declined')}
                            ${renderResponderList(maybeIds, 'Vielleicht', 'stat-maybe')}
                        </div>
                    </div>
                `;
            }

            // Get location details
            let locationValue = 'Nicht angegeben';
            let locationDetails = '';
            if (item.confirmedLocation) {
                const location = await Storage.getById('locations', item.confirmedLocation);
                if (location) {
                    locationValue = this.escapeHtml(location.name);
                    if (location.address) {
                        locationDetails = `<div class="info-help">${this.escapeHtml(location.address)}</div>`;
                    }
                }
            } else if (item.confirmed_location) {
                locationValue = this.escapeHtml(item.confirmed_location);
            }

            detailsHTML = `
                <div class="calendar-details-container">
                    <div class="calendar-detail-header" style="border-left-color: ${bandColor}">
                        <div class="calendar-detail-icon-large">📅</div>
                        <div class="calendar-detail-title-group">
                            <h2 class="calendar-detail-title">${this.escapeHtml(item.title || 'Probe')}</h2>
                            <div class="calendar-detail-subtitle" style="color: ${bandColor}">🎸 ${this.escapeHtml(bandName)}</div>
                        </div>
                    </div>
                    
                    <div class="calendar-info-grid">
                        <div class="calendar-info-item">
                            <div class="info-icon">📅</div>
                            <div class="info-content">
                                <div class="info-label">Datum</div>
                                <div class="info-value">${dateStr}</div>
                            </div>
                        </div>
                        ${item.confirmedTime ? `
                        <div class="calendar-info-item">
                            <div class="info-icon">🕐</div>
                            <div class="info-content">
                                <div class="info-label">Uhrzeit</div>
                                <div class="info-value">${this.escapeHtml(item.confirmedTime)}</div>
                            </div>
                        </div>` : ''}
                        <div class="calendar-info-item">
                            <div class="info-icon">📍</div>
                            <div class="info-content">
                                <div class="info-label">Ort</div>
                                <div class="info-value">${locationValue}</div>
                                ${locationDetails}
                            </div>
                        </div>
                    </div>

                    ${item.notes ? `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">📝 Notizen:</div>
                        <div class="calendar-detail-notes">${this.escapeHtml(item.notes)}</div>
                    </div>` : ''}

                    ${membersHTML}
                    ${attendanceHTML}
                </div>
            `;
        } else {
            const startDate = this.normalizeDate(item.startDate);
            const endDate = this.normalizeDate(item.endDate || item.startDate);
            const startLabel = startDate.toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
            const endLabel = endDate.toLocaleDateString('de-DE', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
            const durationLabel = startLabel === endLabel ? startLabel : `${startLabel} bis ${endLabel}`;

            detailsHTML = `
                <div class="calendar-details-container">
                    <div class="calendar-detail-header" style="border-left-color: #f59e0b">
                        <div class="calendar-detail-title-group">
                            <h2 class="calendar-detail-title">${this.escapeHtml(this.getAbsenceTitle(item))}</h2>
                            <div class="calendar-detail-subtitle" style="color: #f59e0b">Abwesenheit</div>
                        </div>
                    </div>

                    <div class="calendar-info-grid">
                        <div class="calendar-info-item">
                            <div class="info-content">
                                <div class="info-label">Zeitraum</div>
                                <div class="info-value">${this.escapeHtml(durationLabel)}</div>
                            </div>
                        </div>
                        <div class="calendar-info-item">
                            <div class="info-content">
                                <div class="info-label">Status</div>
                                <div class="info-value">Nicht verfügbar</div>
                            </div>
                        </div>
                    </div>

                    ${item.reason ? `
                    <div class="calendar-detail-section">
                        <div class="calendar-detail-label">Grund</div>
                        <div class="calendar-detail-notes">${this.escapeHtml(item.reason)}</div>
                    </div>` : ''}
                </div>
            `;
        }

        // Create modal
        const modalHTML = `
            <div id="itemDetailsModal" class="modal active" style="z-index: 1000;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h2>
                            ${itemType === 'event' ? 'Auftrittdetails' : itemType === 'rehearsal' ? 'Probendetails' : 'Abwesenheit'}
                        </h2>
                        <button class="modal-close" onclick="PersonalCalendar.closeDetailsModal()">×</button>
                    </div>
                    <div class="modal-body">
                        ${detailsHTML}
                    </div>
                    <div class="modal-actions">
                        ${itemType === 'event' ? `<button class="btn btn-secondary" onclick="App.handleEditEvent('${item.id}')">Zum Auftritt</button>` : ''}
                        ${itemType === 'rehearsal' ? `<button class="btn btn-primary" onclick="App.handleEditRehearsal('${item.id}')">Zur Probe</button>` : ''}
                        <button class="btn" onclick="PersonalCalendar.closeDetailsModal()">Schließen</button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('itemDetailsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add click-outside-to-close
        const modal = document.getElementById('itemDetailsModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeDetailsModal();
            }
        });
    },

    closeDetailsModal() {
        const modal = document.getElementById('itemDetailsModal');
        if (modal) {
            modal.remove();
        }
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Generate ICS content string
     */
    generateICSContent() {
        if ((!this.events || this.events.length === 0) && (!this.rehearsals || this.rehearsals.length === 0)) {
            return null;
        }

        let icsContent =
            'BEGIN:VCALENDAR\r\n' +
            'VERSION:2.0\r\n' +
            'PRODID:-//Bandmate//PersonalCalendar v1.0//DE\r\n' +
            'CALSCALE:GREGORIAN\r\n' +
            'METHOD:PUBLISH\r\n' +
            'X-WR-CALNAME:Mein Band-Kalender\r\n' +
            'X-WR-TIMEZONE:UTC\r\n' + // Changed to UTC to be safe
            'REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n' +
            'X-PUBLISHED-TTL:PT1H\r\n';

        // Use UTC for all dates to avoid timezone issues
        const formatDate = (date) => {
            const d = new Date(date);
            const pad = (n) => n < 10 ? '0' + n : n;
            return d.getUTCFullYear() +
                pad(d.getUTCMonth() + 1) +
                pad(d.getUTCDate()) + 'T' +
                pad(d.getUTCHours()) +
                pad(d.getUTCMinutes()) +
                pad(d.getUTCSeconds()) + 'Z';
        };

        const addEvent = (uid, start, end, summary, description, location) => {
            icsContent += 'BEGIN:VEVENT\r\n';
            icsContent += `UID:${uid}\r\n`;
            icsContent += `DTSTAMP:${formatDate(new Date())}\r\n`;
            icsContent += `DTSTART:${formatDate(start)}\r\n`;
            if (end) {
                icsContent += `DTEND:${formatDate(end)}\r\n`;
            }
            icsContent += `SUMMARY:${summary}\r\n`;
            icsContent += `DESCRIPTION:${description}\r\n`;
            if (location) {
                icsContent += `LOCATION:${location}\r\n`;
            }
            icsContent += 'END:VEVENT\r\n';
        };

        // Process Events
        for (const event of this.events) {
            const startDate = new Date(event.date);
            if (event.time) {
                const [h, m] = event.time.split(':');
                startDate.setHours(h, m);
            }
            const endDate = new Date(startDate);
            endDate.setHours(endDate.getHours() + 3); // Default 3h duration

            // Band name lookup
            const band = this.userBands.find(b => b.id === (event.bandId || (event.band ? event.band.id : null)));
            const bandName = band ? band.name : (event.band ? event.band.name : 'Band');

            addEvent(
                `event_${event.id}@bandmate`,
                startDate,
                endDate,
                `🎤 ${event.title} (${bandName})`,
                event.notes || '',
                event.location || ''
            );
        }

        // Process Rehearsals
        for (const rehearsal of this.rehearsals) {
            const startDate = new Date(rehearsal.confirmedDate);
            if (rehearsal.confirmedTime) {
                const [h, m] = rehearsal.confirmedTime.split(':');
                startDate.setHours(h, m);
            }
            const endDate = new Date(startDate);
            endDate.setHours(endDate.getHours() + 2);

            const band = this.userBands.find(b => b.id === (rehearsal.bandId || (rehearsal.band ? rehearsal.band.id : null)));
            const bandName = band ? band.name : (rehearsal.band ? rehearsal.band.name : 'Unknown');

            let locationName = '';
            // Only try to use location name if we have it or could look it up
            // For now, leave empty to avoid complexity in sync

            addEvent(
                `rehearsal_${rehearsal.id}@bandmate`,
                startDate,
                endDate,
                `📅 Probe: ${bandName}`,
                rehearsal.notes || '',
                locationName
            );
        }

        icsContent += 'END:VCALENDAR';
        return icsContent;
    },

    /**
     * Start subscription flow: Sync to cloud -> Show link modal
     */
    async startSubscriptionFlow() {
        const loadingToast = UI.showToast('Kalender wird synchronisiert...', 'info');
        try {
            const user = Auth.getCurrentUser();
            if (!user) throw new Error('Nicht eingeloggt');

            const icsContent = this.generateICSContent();
            if (!icsContent) {
                UI.showToast('Keine Termine zum Synchronisieren.', 'warning');
                return;
            }

            // Upload to Supabase Storage
            const client = SupabaseClient.getClient();
            if (!client) throw new Error('Datenbank-Verbindung fehlt');

            const fileName = `user_${user.id}.ics`;
            const { data, error } = await client
                .storage
                .from('calendars')
                .upload(fileName, icsContent, {
                    contentType: 'text/calendar',
                    upsert: true,
                    cacheControl: '3600'
                });

            if (error) {
                if (error.message.includes('Bucket not found')) {
                    throw new Error('Storage Bucket "calendars" fehlt! Bitte erstelle ihn in Supabase.');
                }
                throw error;
            }

            // Get Public URL
            const { data: { publicUrl } } = client
                .storage
                .from('calendars')
                .getPublicUrl(fileName);

            // Verify if bucket is actually public
            try {
                const check = await fetch(publicUrl, { method: 'HEAD' });
                if (!check.ok) {
                    UI.showToast('⚠️ WICHTIG: Dein "calendars" Bucket ist privacy (privat). Bitte stelle ihn in Supabase auf "Public"!', 'warning', 10000);
                    // Don't throw, let them see the link anyway, but warn heavily
                }
            } catch (e) {
                console.warn('Verification of public URL failed', e);
            }

            // Convert to webcal://
            const webcalUrl = publicUrl.replace(/^https?:\/\//, 'webcal://');

            // Show UI
            this.showSubscriptionModal(webcalUrl);
            UI.showToast('Kalender erfolgreich synchronisiert!', 'success');

        } catch (error) {
            console.error('Subscription Error:', error);
            UI.showToast('Fehler: ' + error.message, 'error');
        }
    },

    showSubscriptionModal(webcalUrl) {
        const modalHTML = `
            <div id="calendarSubModal" class="modal active" style="z-index: 2000;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>📅 Kalender abonnieren</h2>
                        <button class="modal-close" onclick="document.getElementById('calendarSubModal').remove()">×</button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <p style="margin-bottom: 1.5rem; color: var(--color-text-secondary);">
                            Klicke unten, um den Kalender direkt zu abonnieren. 
                            Dein Handy wird sich automatisch öffenen.
                        </p>
                        
                        <a href="${webcalUrl}" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; width: 100%;">
                            🔗 Jetzt abonnieren
                        </a>

                        <div style="background: var(--color-bg); padding: 1rem; border-radius: var(--radius-md); text-align: left;">
                            <p style="font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem;">Manueller Link:</p>
                            <code style="display: block; word-break: break-all; font-size: 0.8rem; padding: 0.5rem; background: rgba(0,0,0,0.1); border-radius: 4px;">${webcalUrl}</code>
                            <button onclick="navigator.clipboard.writeText('${webcalUrl}'); UI.showToast('Kopiert!', 'success')" class="btn btn-sm btn-secondary" style="margin-top: 0.5rem; width: 100%;">
                                📋 Link kopieren
                            </button>
                        </div>

                        <p style="margin-top: 1.5rem; font-size: 0.8rem; color: var(--color-text-secondary);">
                            ℹ️ Der Kalender aktualisiert sich automatisch, wenn du die App öffnest oder Änderungen vornimmst.
                        </p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    /**
     * Silent background sync (called after edits)
     */
    async syncCalendarBackground() {
        try {
            console.log('[PersonalCalendar] Starting background sync...');
            const user = Auth.getCurrentUser();
            if (!user) return;

            // Reload core data if cache is empty or stale
            if (!this.events || this.events.length === 0 || !this.rehearsals || this.rehearsals.length === 0 || !Array.isArray(this.absences)) {
                const userBands = await Storage.getUserBands(user.id);
                this.userBands = Array.isArray(userBands) ? userBands : [];
                const bandIds = this.userBands.map(b => b.id);
                const [allEvents, allRehearsals, allAbsences] = await Promise.all([
                    bandIds.length > 0 ? this.loadUserEvents(bandIds) : [],
                    bandIds.length > 0 ? this.loadUserRehearsals(bandIds) : [],
                    this.loadUserAbsences(user.id)
                ]);
                this.events = allEvents || [];
                this.rehearsals = allRehearsals || [];
                this.absences = allAbsences || [];
                console.log(`[PersonalCalendar] Reloaded ${this.events.length} events, ${this.rehearsals.length} rehearsals and ${this.absences.length} absences for sync`);
            }

            const icsContent = this.generateICSContent();
            if (!icsContent) {
                console.warn('[PersonalCalendar] No content generated for sync');
                return;
            }

            const client = SupabaseClient.getClient();
            if (client) {
                const fileName = `user_${user.id}.ics`;
                const { error } = await client.storage.from('calendars').upload(fileName, icsContent, {
                    contentType: 'text/calendar',
                    upsert: true,
                    cacheControl: '0' // NO CACHE to ensure updates are seen immediately
                });

                if (error) throw error;
                console.log('[PersonalCalendar] Background sync success');
            }
        } catch (e) {
            console.warn('[PersonalCalendar] Background sync failed', e);
        }
    },

    // Legacy Export (File Download) - Kept available via console or fallback if needed
    async exportICS() {
        this.startSubscriptionFlow(); // Redirect to new flow
    }
};

// Make globally accessible
window.PersonalCalendar = PersonalCalendar;
