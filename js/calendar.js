// Calendar Module - Fetch and display iCal events for multiple locations

const Calendar = {
    calendars: {
        tonstudio: {
            url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=NfxmtRVaX40wkMxvfbpH9PRMKdJu9VDI&id=19',
            events: [],
            currentMonth: new Date(),
            containerId: 'tonstudioEventsContainer'
        },
        festhalle: {
            url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=bOv5OpXv4gXaRK4K9An9&id=3',
            events: [],
            currentMonth: new Date(),
            containerId: 'festhalleEventsContainer'
        },
        ankersaal: {
            url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=x135fXCcu1pJAo1xQfwfmeLuemeBfqUV&id=9',
            events: [],
            currentMonth: new Date(),
            containerId: 'ankersaalEventsContainer'
        }
    },
    currentCalendar: 'tonstudio',
    dayCreateMenuListenersBound: false,

    // Getter for backwards compatibility
    get calendarUrl() {
        return this.calendars[this.currentCalendar].url;
    },
    get events() {
        return this.calendars[this.currentCalendar].events;
    },
    set events(value) {
        this.calendars[this.currentCalendar].events = value;
    },
    get currentMonth() {
        return this.calendars[this.currentCalendar].currentMonth;
    },
    set currentMonth(value) {
        this.calendars[this.currentCalendar].currentMonth = value;
    },

    // Initialize calendars from database
    async initCalendars() {
        // Keep hardcoded system calendars as fallback
        const systemCalendars = {
            tonstudio: {
                url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=NfxmtRVaX40wkMxvfbpH9PRMKdJu9VDI&id=19',
                name: 'Tonstudio',
                icon: '🎙️',
                events: [],
                currentMonth: new Date(),
                containerId: 'tonstudioEventsContainer',
                isSystem: true
            },
            festhalle: {
                url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=bOv5OpXv4gXaRK4K9An9&id=3',
                name: 'JMS Festhalle',
                icon: '🏛️',
                events: [],
                currentMonth: new Date(),
                containerId: 'festhalleEventsContainer',
                isSystem: true
            },
            ankersaal: {
                url: 'https://jms-altensteig.church.tools/?q=public/cr_ical&security=x135fXCcu1pJAo1xQfwfmeLuemeBfqUV&id=9',
                name: 'Ankersaal',
                icon: '⚓',
                events: [],
                currentMonth: new Date(),
                containerId: 'ankersaalEventsContainer',
                isSystem: true
            }
        };

        // Load calendars from database
        try {
            if (typeof Storage !== 'undefined' && Storage.getAllCalendars) {
                const dbCalendars = await Storage.getAllCalendars();

                // Update calendars object with DB data
                this.calendars = { ...systemCalendars };

                if (dbCalendars && dbCalendars.length > 0) {
                    dbCalendars.forEach(cal => {
                        const calId = cal.id;
                        this.calendars[calId] = {
                            url: cal.ical_url,
                            name: cal.name,
                            icon: cal.icon || '📅',
                            events: [],
                            currentMonth: new Date(),
                            containerId: `${calId}EventsContainer`,
                            isSystem: cal.is_system || false
                        };
                    });
                }

                Logger.info(`Calendars Initialized – ${Object.keys(this.calendars).length} locations found`);
            }
        } catch (error) {
            Logger.error('Error loading calendars from database', error);
            // Fallback to system calendars
            this.calendars = systemCalendars;
        }
    },

    async loadCalendar(calendarType = 'tonstudio') {
        const timerLabel = 'Location Calendar Load: ' + calendarType;
        Logger.time(timerLabel);
        const calendar = this.calendars[calendarType];
        if (!calendar) {
            Logger.error(`Calendar type "${calendarType}" not found`);
            Logger.timeEnd(timerLabel);
            return;
        }

        if (calendar.isLoading) {
            Logger.timeEnd(timerLabel);
            return;
        }

        // Prevent reload if already loaded
        if (calendar.events && calendar.events.length > 0) {
            this.currentCalendar = calendarType; // CRITICAL: Set current calendar before rendering
            this.renderMonthView(); // Just re-render
            Logger.timeEnd(timerLabel);
            return;
        }

        calendar.isLoading = true;

        const container = document.getElementById(calendar.containerId);
        if (!container) {
            Logger.error(`Container "${calendar.containerId}" not found`);
            Logger.timeEnd(timerLabel);
            return;
        }

        // Check if URL is configured
        if (!calendar.url) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📅</div>
                    <p>Kalender noch nicht konfiguriert</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        Die iCal-URL für diesen Kalender wurde noch nicht hinzugefügt.
                    </p>
                </div>
            `;
            Logger.timeEnd(timerLabel);
            return;
        }

        this.currentCalendar = calendarType;

        try {
            if (typeof UI !== 'undefined' && UI.showLoading) {
                UI.showLoading('Kalender wird geladen…');
            }
            container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Lade Kalender-Termine...</p></div>';

            // Use central ProxyService for robust fetching
            const icalData = await ProxyService.fetch(calendar.url);

            // PREVENT CRASH: Validate if we actually got iCal data
            if (!icalData || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
                Logger.error('Invalid iCal data received:', icalData?.substring(0, 100));
                throw new Error('Ungültiges Kalender-Format empfangen.');
            }

            // PREVENT CRASH: Validate if we actually got iCal data
            if (!icalData || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
                Logger.error('Invalid iCal data received from proxy:', icalData?.substring(0, 100));
                throw new Error('Ungültiges Kalender-Format empfangen.');
            }

            // Parse iCal data using ical.js
            const jcalData = ICAL.parse(icalData);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');

            // Extract events
            calendar.events = vevents.map(vevent => {
                const event = new ICAL.Event(vevent);
                return {
                    summary: event.summary || 'Kein Titel',
                    description: event.description || '',
                    location: event.location || '',
                    startDate: event.startDate ? event.startDate.toJSDate() : null,
                    endDate: event.endDate ? event.endDate.toJSDate() : null,
                    uid: event.uid
                };
            }).filter(event => event.startDate);

            // Sort by start date
            calendar.events.sort((a, b) => a.startDate - b.startDate);

            this.renderMonthView();
            const duration = ((performance.now() - Logger.timers[timerLabel]) / 1000).toFixed(2);
            Logger.info(`Calendar Loaded – "${calendarType}" (${calendar.events.length} events, ${duration}s)`);
            delete Logger.timers[timerLabel];
        } catch (error) {
            Logger.error(`Fehler beim Laden des ${calendarType} Kalenders:`, error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>Kalender konnte nicht geladen werden.</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                        Fehler: ${error.message}
                    </p>
                    <p style="color: var(--color-text-secondary); font-size: 0.875rem; margin-top: 1rem;">
                        Dies liegt möglicherweise an Sicherheitseinstellungen des Kalender-Servers.
                    </p>
                    <a href="${calendar.url}" target="_blank" class="btn btn-secondary" style="margin-top: 1rem;">
                        📅 Kalender direkt öffnen
                    </a>
                </div>
            `;
        } finally {
            calendar.isLoading = false;
            if (typeof UI !== 'undefined' && UI.hideLoading) {
                UI.hideLoading();
            }
        }
    },

    renderMonthView() {
        const calendar = this.calendars[this.currentCalendar];
        const container = document.getElementById(calendar.containerId);
        const toolbarHost = document.getElementById('probeorteCalendarToolbarHost');

        if (!container) {
            Logger.error(`Container "${calendar.containerId}" not found in DOM!`);
            return;
        }

        const year = calendar.currentMonth.getFullYear();
        const month = calendar.currentMonth.getMonth();

        const monthName = calendar.currentMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        const weeks = this.buildCalendarWeeks(year, month);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Build calendar HTML
        let html = `
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
        const canQuickCreate = this.canQuickCreate();

        if (toolbarHost) {
            toolbarHost.innerHTML = `
                <div class="personal-calendar-toolbar-nav probeorte-calendar-toolbar-nav">
                    <button onclick="Calendar.previousMonth()" class="btn btn-icon personal-calendar-nav-btn probeorte-calendar-nav" type="button" aria-label="Vorheriger Monat">‹</button>
                    <div class="personal-calendar-toolbar-title probeorte-calendar-toolbar-title">
                        <h3 class="probeorte-calendar-title">${monthName}</h3>
                        <button onclick="Calendar.goToToday()" class="btn btn-secondary personal-calendar-today-btn probeorte-calendar-today" type="button">Heute</button>
                    </div>
                    <button onclick="Calendar.nextMonth()" class="btn btn-icon personal-calendar-nav-btn probeorte-calendar-nav" type="button" aria-label="Nächster Monat">›</button>
                </div>
            `;
        }

        weeks.forEach(weekDates => {
            html += `
                <div class="calendar-week-row">
                    <div class="calendar-week-days">
            `;

            weekDates.forEach(currentDate => {
                if (!currentDate) {
                    html += '<div class="calendar-day empty"></div>';
                    return;
                }

                const isToday = currentDate.getTime() === today.getTime();
                const dayEvents = this.getEventsForDate(currentDate);
                const canDayQuickCreate = canQuickCreate && dayEvents.length === 0;
                const dateValue = this.formatDateForInput(currentDate);

                let dayClass = 'calendar-day';
                if (isToday) dayClass += ' today';
                if (dayEvents.length > 0) dayClass += ' has-events';
                if (canDayQuickCreate) dayClass += ' can-create';

                html += `
                    <div class="${dayClass}"${canDayQuickCreate ? ` data-date="${dateValue}" onclick="Calendar.toggleDayCreateMenu(event, '${dateValue}')"` : ''}>
                        <div class="calendar-day-top">
                            <div class="calendar-day-number">${currentDate.getDate()}</div>
                            ${canDayQuickCreate ? `
                                <button
                                    type="button"
                                    class="calendar-day-quick-create-trigger"
                                    aria-label="Probe am ${dateValue} anlegen"
                                    aria-expanded="false"
                                    onclick="Calendar.toggleDayCreateMenu(event, '${dateValue}')"
                                >
                                    +
                                </button>
                            ` : ''}
                        </div>
                        ${canDayQuickCreate ? `
                            <div class="calendar-day-quick-create-menu" data-date="${dateValue}" hidden onclick="event.stopPropagation()">
                                <button type="button" class="calendar-day-quick-create-option" onclick="Calendar.createRehearsalForDate(event, '${dateValue}')">Probe hier anlegen</button>
                            </div>
                        ` : ''}
                        <div class="calendar-day-events">
                            ${dayEvents.map(event => this.renderCalendarEvent(event)).join('')}
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

        // Add click listeners to all calendar events
        container.querySelectorAll('.calendar-event').forEach(eventElement => {
            eventElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEventDetails(eventElement);
            });
        });

        this.ensureDayCreateMenuListeners();
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

    canQuickCreate() {
        return false;
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
            if (event.target.closest('#probeorteView .calendar-day.can-create')) {
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
        document.querySelectorAll('#probeorteView .calendar-day.can-create').forEach(day => {
            day.classList.remove('is-open');
        });

        document.querySelectorAll('#probeorteView .calendar-day-quick-create-menu').forEach(menu => {
            menu.hidden = true;
        });

        document.querySelectorAll('#probeorteView .calendar-day-quick-create-trigger').forEach(trigger => {
            trigger.setAttribute('aria-expanded', 'false');
        });
    },

    toggleDayCreateMenu(event, dateValue) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (!dateValue) return;

        const day = document.querySelector(`#probeorteView .calendar-day[data-date="${dateValue}"]`);
        const menu = document.querySelector(`#probeorteView .calendar-day-quick-create-menu[data-date="${dateValue}"]`);
        const trigger = day?.querySelector('.calendar-day-quick-create-trigger');

        if (!day || !menu) return;

        const shouldOpen = menu.hidden;
        this.closeDayCreateMenus();

        if (!shouldOpen) return;

        day.classList.add('is-open');
        menu.hidden = false;
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'true');
        }
    },

    getCalendarAliases(calendarType = this.currentCalendar) {
        const normalized = String(calendarType || '').toLowerCase();
        const aliasMap = {
            tonstudio: ['tonstudio'],
            festhalle: ['festhalle', 'jms-festhalle', 'jms festhalle'],
            ankersaal: ['ankersaal']
        };

        return aliasMap[normalized] || [normalized];
    },

    normalizeLocationValue(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    },

    async resolveLocationIdForCurrentCalendar() {
        if (typeof Storage === 'undefined' || typeof Storage.getLocations !== 'function') {
            return '';
        }

        const aliases = this.getCalendarAliases();
        const normalizedAliases = aliases.map(alias => this.normalizeLocationValue(alias));
        const locations = await Storage.getLocations();
        if (!Array.isArray(locations) || locations.length === 0) {
            return '';
        }

        const matchesCalendar = (location) => {
            const linkedCalendar = this.normalizeLocationValue(location.linkedCalendar);
            if (linkedCalendar && normalizedAliases.includes(linkedCalendar)) {
                return true;
            }

            const linkedToCalendar = this.normalizeLocationValue(location.linkedToCalendar);
            if (linkedToCalendar && normalizedAliases.includes(linkedToCalendar)) {
                return true;
            }

            if (location.linkedCalendars && typeof location.linkedCalendars === 'object') {
                return normalizedAliases.some(alias => Boolean(
                    location.linkedCalendars[alias] ||
                    location.linkedCalendars[alias.replace(/\s+/g, '-')] ||
                    location.linkedCalendars[alias.replace(/\s+/g, '')]
                ));
            }

            const locationName = this.normalizeLocationValue(location.name);
            return normalizedAliases.some(alias => locationName === alias);
        };

        const match = locations.find(matchesCalendar);
        return match?.id || '';
    },

    async createRehearsalForDate(event, dateValue) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        this.closeDayCreateMenus();

        const locationId = await this.resolveLocationIdForCurrentCalendar();
        App.openCreateRehearsalModal({
            date: dateValue,
            locationId: locationId || ''
        });
    },

    getEventsForDate(date) {
        const calendar = this.calendars[this.currentCalendar];
        return calendar.events.filter(event => {
            const eventDate = new Date(event.startDate);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate.getTime() === date.getTime();
        });
    },

    renderCalendarEvent(event) {
        const startTime = event.startDate.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const endTime = event.endDate ? event.endDate.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        }) : null;

        const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;
        const dateDisplay = event.startDate.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Truncate title at 15 characters
        const truncateTitle = (text, maxLength = 20) => {
            const escaped = this.escapeHtml(text);
            if (text.length <= maxLength) return escaped;
            return escaped.substring(0, maxLength) + '...';
        };

        // Create unique event ID for click handler
        const eventId = `event_${event.uid}_${event.startDate.getTime()}`;

        return `
            <div class="calendar-event location-type"
                 id="${eventId}"
                 data-event-summary="${this.escapeHtml(event.summary)}"
                 data-event-date="${this.escapeHtml(dateDisplay)}"
                 data-event-time="${timeDisplay}"
                 data-event-location="${this.escapeHtml(event.location || '')}"
                 data-event-description="${this.escapeHtml(event.description || '')}"
                 title="Klicken für Details"
                 style="background: #334155; border-color: rgba(148,163,184,0.18);">
                <div class="calendar-event-type" style="color: rgba(186,212,255,0.8); font-weight: 800; font-size: 0.55rem;">📅 Kalender</div>
                <div class="calendar-event-title" style="color: var(--color-text); font-weight: 600;">${truncateTitle(event.summary)}</div>
                <div class="calendar-event-band" style="color: var(--color-text-secondary); opacity: 0.7; font-size: 0.55rem;">${timeDisplay}</div>
            </div>
        `;
    },

    // Show event details in modal
    showEventDetails(eventElement) {
        const summary = eventElement.dataset.eventSummary;
        const date = eventElement.dataset.eventDate;
        const time = eventElement.dataset.eventTime;
        const location = eventElement.dataset.eventLocation;
        const description = eventElement.dataset.eventDescription;
        const currentCalendar = this.calendars[this.currentCalendar] || {};
        const calendarFallbacks = {
            tonstudio: { name: 'Tonstudio', icon: '🎙️' },
            festhalle: { name: 'JMS Festhalle', icon: '🏛️' },
            'jms-festhalle': { name: 'JMS Festhalle', icon: '🏛️' },
            ankersaal: { name: 'Ankersaal', icon: '⚓' }
        };
        const currentFallback = calendarFallbacks[this.currentCalendar] || {};
        const calendarName = currentCalendar.name || currentFallback.name || 'Probeort';
        const calendarIcon = currentCalendar.icon || currentFallback.icon || '📅';

        const iconEl = document.getElementById('calendarEventDetailIcon');
        const titleEl = document.getElementById('calendarEventDetailTitle');
        const subtitleEl = document.getElementById('calendarEventDetailSubtitle');
        const metaEl = document.getElementById('calendarEventDetailMeta');
        const dateEl = document.getElementById('calendarEventDetailDate');
        const timeEl = document.getElementById('calendarEventDetailTime');

        if (iconEl) iconEl.textContent = calendarIcon;
        if (titleEl) titleEl.textContent = summary || 'Kalendereintrag';
        if (subtitleEl) {
            subtitleEl.textContent = `Alle Details zur Belegung in ${calendarName} auf einen Blick.`;
        }
        if (dateEl) dateEl.textContent = date || 'Datum unbekannt';
        if (timeEl) timeEl.textContent = time || 'Zeit unbekannt';

        if (metaEl) {
            metaEl.innerHTML = '';
            const chip = document.createElement('span');
            chip.className = 'calendar-event-detail-chip';
            chip.textContent = `${calendarIcon} ${calendarName}`;
            metaEl.appendChild(chip);
        }

        // Show/hide location
        const locationContainer = document.getElementById('calendarEventDetailLocationContainer');
        if (location) {
            document.getElementById('calendarEventDetailLocation').textContent = location;
            locationContainer.hidden = false;
        } else {
            locationContainer.hidden = true;
        }

        // Show/hide description
        const descriptionContainer = document.getElementById('calendarEventDetailDescriptionContainer');
        if (description) {
            document.getElementById('calendarEventDetailDescription').textContent = description;
            descriptionContainer.hidden = false;
        } else {
            descriptionContainer.hidden = true;
        }

        // Open modal using UI helper
        if (typeof UI !== 'undefined' && UI.openModal) {
            UI.openModal('calendarEventModal');
        }
    },

    previousMonth() {
        const calendar = this.calendars[this.currentCalendar];
        calendar.currentMonth = new Date(calendar.currentMonth.getFullYear(), calendar.currentMonth.getMonth() - 1, 1);
        this.renderMonthView();
    },

    nextMonth() {
        const calendar = this.calendars[this.currentCalendar];
        calendar.currentMonth = new Date(calendar.currentMonth.getFullYear(), calendar.currentMonth.getMonth() + 1, 1);
        this.renderMonthView();
    },

    goToToday() {
        const calendar = this.calendars[this.currentCalendar];
        calendar.currentMonth = new Date();
        this.renderMonthView();
    },

    // Ensure a calendar is loaded (for availability checking)
    async ensureLocationCalendar(calendarId, locationName) {
        const startTime = performance.now();

        // Map calendar IDs to internal calendar types
        const calendarMap = {
            'tonstudio': 'tonstudio',
            'jms-festhalle': 'festhalle',
            'festhalle': 'festhalle',
            'ankersaal': 'ankersaal'
        };

        const calendarType = calendarMap[calendarId] || calendarId;
        const calendar = this.calendars[calendarType];

        if (!calendar) return;

        // Check if calendar already has events loaded
        if (calendar.events && calendar.events.length > 0) {
            // If already loaded, just render it
            const previousCalendar = this.currentCalendar;
            this.currentCalendar = calendarType;
            this.renderMonthView();
            this.currentCalendar = previousCalendar;
            return;
        }

        // Load the calendar via ProxyService
        try {
            const icalData = await ProxyService.fetch(calendar.url);

            // Validierung
            if (!icalData || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
                throw new Error('Gültige Kalenderdaten konnten nicht geladen werden.');
            }

            const jcalData = ICAL.parse(icalData);
            const comp = new ICAL.Component(jcalData);
            const vevents = comp.getAllSubcomponents('vevent');

            calendar.events = vevents.map(vevent => {
                const event = new ICAL.Event(vevent);
                return {
                    summary: event.summary || 'Kein Titel',
                    description: event.description || '',
                    location: event.location || '',
                    startDate: event.startDate ? event.startDate.toJSDate() : null,
                    endDate: event.endDate ? event.endDate.toJSDate() : null,
                    uid: event.uid
                };
            }).filter(event => event.startDate);

            calendar.events.sort((a, b) => a.startDate - b.startDate);
            const duration = ((performance.now() - startTime) / 1000).toFixed(2);
            Logger.info(`Calendar Loaded – "${locationName}" (${calendar.events.length} events, ${duration}s)`);

            // Render the calendar after loading
            const previousCalendar = this.currentCalendar;
            this.currentCalendar = calendarType;
            this.renderMonthView();
            this.currentCalendar = previousCalendar;
        } catch (error) {
            Logger.error(`Failed to load ${calendarType}`, error);
            throw error;
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
