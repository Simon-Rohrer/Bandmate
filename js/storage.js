// (removed duplicate top-level async deleteUser)
// Storage Module - Supabase-only (no localStorage fallback)

const Storage = {
    calendarsCache: null,
    calendarsCacheTimestamp: 0,
    locationsCache: null,
    locationsCacheTimestamp: 0,
    lastPastItemsCleanupAt: 0,
    pastItemsCleanupPromise: null,
    PAST_ITEMS_CLEANUP_INTERVAL_MS: 120000,
    CACHE_DURATION: 300000, // 5 Minutes
    SONG_CHORDPRO_MARKER: '[[CHORDPRO]]',
    SONG_CHORDPRO_PREVIEW_LABEL: 'ChordPro hinterlegt',
    songChordProSaveField: null,
    SONG_CHORDPRO_FIELD_STORAGE_KEY: 'bandplanning.songChordProSaveField',
    ABSENCE_META_PREFIX: '[[ABSENCE_META]]',
    ABSENCE_META_SUFFIX: '[[/ABSENCE_META]]',
    EXTERNAL_CALENDAR_PAST_MONTHS: 6,
    EXTERNAL_CALENDAR_FUTURE_MONTHS: 18,

    // Löscht einen User aus der eigenen Datenbank
    async deleteUser(userId) {
        const sb = SupabaseClient.getClient();
        if (!sb || !userId) throw new Error('Kein User zum Löschen gefunden!');
        const { error } = await sb.from('users').delete().eq('id', userId);
        if (error) throw new Error('User konnte nicht aus der Datenbank gelöscht werden!');
        return true;
    },
    async init() {
        if (!SupabaseClient.isConfigured()) {
            Logger.error('⚠️ Supabase nicht konfiguriert! Bitte URL und Anon Key in den Einstellungen eingeben.');
            return;
        }
    },

    generateId() {
        return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    },

    getStartOfDay(dateLike = new Date()) {
        const date = dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike);
        if (Number.isNaN(date.getTime())) return null;
        date.setHours(0, 0, 0, 0);
        return date;
    },

    isPastCalendarDay(dateLike, referenceDate = new Date()) {
        const targetDate = this.getStartOfDay(dateLike);
        const today = this.getStartOfDay(referenceDate);
        if (!targetDate || !today) return false;
        return targetDate < today;
    },

    getRehearsalConfirmedDateValue(rehearsal) {
        if (!rehearsal) return null;
        if (typeof rehearsal.confirmedDate === 'object' && rehearsal.confirmedDate?.startTime) {
            return rehearsal.confirmedDate.startTime;
        }
        return rehearsal.confirmedDate || rehearsal.finalDate || null;
    },

    getSongChordProSaveFieldPreference() {
        if (this.songChordProSaveField) return this.songChordProSaveField;

        try {
            const storedField = localStorage.getItem(this.SONG_CHORDPRO_FIELD_STORAGE_KEY);
            if (storedField) {
                this.songChordProSaveField = storedField;
            }
        } catch (err) {
            Logger.warn('[Storage] Could not read ChordPro save field preference:', err);
        }

        return this.songChordProSaveField;
    },

    setSongChordProSaveFieldPreference(field) {
        this.songChordProSaveField = field || null;

        try {
            if (field) {
                localStorage.setItem(this.SONG_CHORDPRO_FIELD_STORAGE_KEY, field);
            } else {
                localStorage.removeItem(this.SONG_CHORDPRO_FIELD_STORAGE_KEY);
            }
        } catch (err) {
            Logger.warn('[Storage] Could not persist ChordPro save field preference:', err);
        }
    },

    buildAbsenceReasonPayload(reason = '', meta = null) {
        const visibleReason = String(reason || '').trim();
        if (!meta || typeof meta !== 'object' || Object.keys(meta).length === 0) {
            return visibleReason;
        }

        try {
            return `${this.ABSENCE_META_PREFIX}${JSON.stringify(meta)}${this.ABSENCE_META_SUFFIX}${visibleReason}`;
        } catch (error) {
            Logger.warn('[Storage] Could not serialize absence meta:', error);
            return visibleReason;
        }
    },

    parseAbsenceReasonPayload(reasonValue = '') {
        const raw = typeof reasonValue === 'string' ? reasonValue : '';
        if (!raw.startsWith(this.ABSENCE_META_PREFIX)) {
            return {
                raw,
                text: raw.trim(),
                meta: null
            };
        }

        const metaEndIndex = raw.indexOf(this.ABSENCE_META_SUFFIX, this.ABSENCE_META_PREFIX.length);
        if (metaEndIndex === -1) {
            return {
                raw,
                text: raw.trim(),
                meta: null
            };
        }

        const metaPayload = raw.slice(this.ABSENCE_META_PREFIX.length, metaEndIndex);
        const visibleText = raw.slice(metaEndIndex + this.ABSENCE_META_SUFFIX.length).trim();

        try {
            return {
                raw,
                text: visibleText,
                meta: JSON.parse(metaPayload)
            };
        } catch (error) {
            Logger.warn('[Storage] Could not parse absence meta:', error);
            return {
                raw,
                text: visibleText || raw.trim(),
                meta: null
            };
        }
    },

    decorateAbsence(absence) {
        if (!absence) return absence;
        const parsed = this.parseAbsenceReasonPayload(absence.reason || '');
        return {
            ...absence,
            displayReason: parsed.text,
            recurrenceMeta: parsed.meta
        };
    },

    getAbsenceDisplayReason(absenceOrReason) {
        if (!absenceOrReason) return '';
        if (typeof absenceOrReason === 'string') {
            return this.parseAbsenceReasonPayload(absenceOrReason).text;
        }
        if (typeof absenceOrReason === 'object') {
            if (typeof absenceOrReason.displayReason === 'string') {
                return absenceOrReason.displayReason.trim();
            }
            return this.parseAbsenceReasonPayload(absenceOrReason.reason || '').text;
        }
        return '';
    },

    getAbsenceRecurrenceMeta(absenceOrReason) {
        if (!absenceOrReason) return null;
        if (typeof absenceOrReason === 'string') {
            return this.parseAbsenceReasonPayload(absenceOrReason).meta;
        }
        if (typeof absenceOrReason === 'object') {
            if (absenceOrReason.recurrenceMeta && typeof absenceOrReason.recurrenceMeta === 'object') {
                return absenceOrReason.recurrenceMeta;
            }
            return this.parseAbsenceReasonPayload(absenceOrReason.reason || '').meta;
        }
        return null;
    },

    getAbsenceRange(absence) {
        if (!absence || !absence.startDate) return null;

        let startTime = '';
        let endTime = '';

        // Try to recover times from meta-data if missing in the date fields
        const parsed = this.parseAbsenceReasonPayload(absence.reason || '');
        if (parsed.meta) {
            startTime = parsed.meta.startTime || '';
            endTime = parsed.meta.endTime || '';
        }

        const start = new Date(absence.startDate);
        const end = new Date(absence.endDate || absence.startDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return null;
        }

        let startHasExplicitTime = typeof absence.startDate === 'string' && absence.startDate.includes('T');
        let endHasExplicitTime = typeof absence.endDate === 'string' && absence.endDate.includes('T');

        // Apply meta-data fallback if columns don't have time
        if (!startHasExplicitTime && startTime) {
            const [h, m] = startTime.split(':').map(Number);
            if (!isNaN(h)) {
                start.setHours(h, m || 0, 0, 0);
                startHasExplicitTime = true;
            }
        }

        if (!endHasExplicitTime && endTime) {
            const [h, m] = endTime.split(':').map(Number);
            if (!isNaN(h)) {
                end.setHours(h, m || 0, 0, 0);
                endHasExplicitTime = true;
            }
        }

        if (!startHasExplicitTime) {
            start.setHours(0, 0, 0, 0);
        }

        const endIsMidnight = end.getHours() === 0
            && end.getMinutes() === 0
            && end.getSeconds() === 0
            && end.getMilliseconds() === 0;

        if (!endHasExplicitTime || endIsMidnight) {
            // Only set to end of day if we TRULY don't have a time from meta or DB
            if (!endTime) {
                end.setHours(23, 59, 59, 999);
            }
        }

        return {
            start,
            end,
            hasExplicitTime: startHasExplicitTime || endHasExplicitTime
        };
    },

    absenceOverlapsRange(absence, rangeStartValue, rangeEndValue = null) {
        const absenceRange = this.getAbsenceRange(absence);
        if (!absenceRange) return false;

        const rangeStart = new Date(rangeStartValue);
        const rangeEnd = new Date(rangeEndValue || rangeStartValue);
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
            return false;
        }

        return absenceRange.start <= rangeEnd && absenceRange.end >= rangeStart;
    },

    normalizeVoteRecord(vote) {
        if (!vote) return vote;

        const normalized = { ...vote };

        if (normalized.id != null) normalized.id = String(normalized.id);
        if (normalized.userId != null) normalized.userId = String(normalized.userId);
        if (normalized.rehearsalId != null) normalized.rehearsalId = String(normalized.rehearsalId);
        if (normalized.eventId != null) normalized.eventId = String(normalized.eventId);

        const parsedDateIndex = Number(normalized.dateIndex);
        if (Number.isFinite(parsedDateIndex)) {
            normalized.dateIndex = parsedDateIndex;
        }

        return normalized;
    },

    // Generic CRUD operations
    async getAll(key) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from(key).select('*');
        if (error) {
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );
            if (isNetworkError) {
                Logger.warn(`Verbindungsproblem beim Abrufen von ${key}`);
                return [];
            }
            Logger.error('Supabase getAll error', key, error);
            return [];
        }
        return data || [];
    },

    // Generic filtered retrieval
    async get(key, filters = {}) {
        const sb = SupabaseClient.getClient();
        let query = sb.from(key).select('*');

        for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
        }

        const { data, error } = await query;
        if (error) {
            Logger.error(`Supabase get error in ${key} with filters`, filters, error);
            return [];
        }
        return data || [];
    },

    async getById(key, id) {
        if (!id) return null;
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from(key).select('*').eq('id', id).limit(1).maybeSingle();

        if (error) {
            // Check for network errors and warn instead of error
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );

            if (isNetworkError) {
                Logger.warn(`Verbindungsproblem beim Abrufen von ${key}: ${error.message}. Bitte überprüfe deine Internetverbindung oder Supabase-URL.`);
                return null;
            }
            Logger.error('Supabase getById error', key, { message: error.message, code: error.code, details: error.details, hint: error.hint } || error);
            return null;
        }
        return data || null;
    },

    async save(key, item) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from(key).insert(item).select('*');

        if (error) {
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );
            if (isNetworkError) {
                throw new Error(`Verbindungsproblem: Speichern in ${key} fehlgeschlagen.`);
            }
            Logger.error(`Supabase save error in ${key}`, error);
            throw new Error(`Fehler beim Speichern in ${key}: ${error.message}`);
        }

        return Array.isArray(data) ? data[0] : (data || item);
    },

    async getBatchByIds(key, ids) {
        if (!ids || ids.length === 0) return [];
        // Filter out duplicates and nulls
        const uniqueIds = [...new Set(ids.filter(id => id))];
        if (uniqueIds.length === 0) return [];

        try {
            const sb = SupabaseClient.getClient();
            const { data, error } = await sb.from(key).select('*').in('id', uniqueIds);
            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn(`Netzwerkproblem beim Laden von ${key} (Batch)`);
                    return [];
                }
                Logger.error(`Supabase getBatchByIds error in ${key}`, error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn(`Netzwerkproblem beim Laden von ${key} (Batch-Catch)`);
            } else {
                Logger.error(`Unexpected error in getBatchByIds (${key}):`, err);
            }
            return [];
        }
    },

    _isNetworkError(error) {
        if (!error) return false;
        const msg = error.message || String(error);
        return (
            msg.includes('FetchError') ||
            msg.includes('network') ||
            msg.includes('connection') ||
            msg.includes('Load failed') ||
            msg.includes('Failed to fetch')
        );
    },

    _isMissingSongpoolTableError(error) {
        if (!error) return false;
        const message = String(error.message || error).toLowerCase();
        const code = String(error.code || '').toLowerCase();
        return (
            code === '42p01' ||
            code === 'pgrst204' ||
            code === 'pgrst205' ||
            message.includes('songpool_songs') && (
                message.includes('does not exist') ||
                message.includes('could not find') ||
                message.includes('not found') ||
                message.includes('relation')
            )
        );
    },

    _getSongpoolErrorMessage(error, fallback = 'Songpool konnte nicht geladen werden.') {
        // Log raw error for diagnostics
        if (error) Logger.warn('[Songpool] Raw Error Detail:', error);

        if (this._isMissingSongpoolTableError(error)) {
            return 'Die Songpool-Tabelle fehlt noch. Bitte zuerst das SQL aus "sql/songpool_setup.sql" in Supabase ausführen.';
        }
        if (this._isNetworkError(error)) {
            return 'Netzwerkproblem beim Laden des Songpools.';
        }
        return error?.message || fallback;
    },

    _isMissingExternalCalendarSharingSetupError(error) {
        if (!error) return false;
        const message = String(error.message || error).toLowerCase();
        const code = String(error.code || '').toLowerCase();

        return (
            code === '42p01' ||
            code === '42703' ||
            message.includes('external_calendar_busy_slots') ||
            message.includes('share_for_band_planning')
        );
    },

    _getExternalCalendarSharingErrorMessage(error, fallback = 'Kalenderfreigabe konnte nicht gespeichert werden.') {
        if (this._isMissingExternalCalendarSharingSetupError(error)) {
            return 'Die Freigabe externer Kalender ist noch nicht in Supabase eingerichtet. Bitte zuerst das SQL aus "supabase_external_calendar_visibility.sql" ausführen.';
        }
        if (this._isNetworkError(error)) {
            return 'Netzwerkproblem beim Aktualisieren der externen Kalender.';
        }
        return error?.message || fallback;
    },

    async update(key, id, updatedItem) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from(key).update(updatedItem).eq('id', id).select('*').maybeSingle();
        if (error) {
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );
            if (isNetworkError) {
                Logger.warn(`Verbindungsproblem beim Aktualisieren von ${key}`);
                return null;
            }
            Logger.error('Supabase update error', key, error);
            return null;
        }
        return data || null;
    },

    async delete(key, id) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from(key).delete().eq('id', id);
        if (error) {
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );
            if (isNetworkError) {
                Logger.warn(`Verbindungsproblem beim Löschen aus ${key}`);
                return false;
            }
            Logger.error('Supabase delete error', key, error);
            return false;
        }
        return true;
    },

    // User operations
    async createUser(userData) {
        const user = {
            // CRITICAL: Don't overwrite ID if already provided (e.g., from Supabase Auth)
            // Only generate new ID if not provided
            id: userData.id || this.generateId(),
            ...userData,
            bandIds: userData.bandIds || [],
            createdAt: userData.createdAt || new Date().toISOString()
        };
        return await this.save('users', user);
    },

    async getUserByUsername(username) {
        const sb = SupabaseClient.getClient();
        // Optimized columns (removed avatar_url)
        const { data, error } = await sb
            .from('users')
            .select('id, username, email, first_name, last_name, profile_image_url')
            .ilike('username', username)
            .limit(1)
            .maybeSingle();
        if (error) { Logger.error('Supabase getUserByUsername error', error); return null; }
        return data || null;
    },

    async getUserByEmail(email) {
        const sb = SupabaseClient.getClient();
        // Optimized columns (removed avatar_url)
        const { data, error } = await sb
            .from('users')
            .select('id, username, email, first_name, last_name, profile_image_url')
            .ilike('email', email)
            .limit(1)
            .maybeSingle();
        if (error) { Logger.error('Supabase getUserByEmail error', error); return null; }
        return data || null;
    },

    async updateUser(userId, updates) {
        return await this.update('users', userId, updates);
    },

    // Band operations
    async createBand(bandData) {
        // Bunter Farbpool ohne Grautöne
        const vibrantColors = [
            '#6366f1', // Indigo/Blau
            '#ec4899', // Pink
            '#10b981', // Grün
            '#f59e0b', // Orange
            '#ef4444', // Rot
            '#8b5cf6', // Lila
            '#06b6d4', // Cyan
            '#f97316', // Dunkelorange
            '#14b8a6', // Teal
            '#a855f7', // Violett
            '#22c55e', // Hellgrün
            '#eab308', // Gelb
            '#3b82f6', // Blau
            '#e11d48', // Rose/Pink
            '#84cc16', // Lime
            '#0ea5e9'  // Sky
        ];

        // Zufällige Farbe auswählen, wenn keine angegeben
        const randomColor = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];

        const band = {
            id: this.generateId(),
            ...bandData,
            joinCode: await this.generateUniqueJoinCode(),
            createdAt: new Date().toISOString(),
            color: bandData.color || randomColor
        };
        return await this.save('bands', band);
    },

    async getBand(bandId) {
        return await this.getById('bands', bandId);
    },

    async getAllBands() {
        return await this.getAll('bands');
    },

    async updateBand(bandId, updates) {
        return await this.update('bands', bandId, updates);
    },

    async deleteBand(bandId) {
        await this.delete('bands', bandId);
        // Supabase CASCADE handles deletion of related records
        return true;
    },

    async getBandByJoinCode(joinCode) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('bands')
            .select('id, name, color, joinCode')
            .eq('joinCode', joinCode)
            .limit(1)
            .maybeSingle();
        if (error) { Logger.error('Supabase getBandByJoinCode error', error); return null; }
        return data || null;
    },

    async generateUniqueJoinCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code;
        let isUnique = false;

        while (!isUnique) {
            code = '';
            for (let i = 0; i < 6; i++) {
                code += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            const existing = await this.getBandByJoinCode(code);
            if (!existing) isUnique = true;
        }
        return code;
    },

    // Band member operations
    async addBandMember(bandId, userId, role = 'member') {
        const membership = {
            id: this.generateId(),
            bandId,
            userId,
            role,
            joinedAt: new Date().toISOString()
        };
        return await this.save('bandMembers', membership);
    },

    async getBandMembers(bandId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Select only necessary columns
        const { data, error } = await sb
            .from('bandMembers')
            .select('id, bandId, userId, role, joinedAt')
            .eq('bandId', bandId);
        if (error) { Logger.error('Supabase getBandMembers error', error); return []; }
        return data || [];
    },

    async getUserBands(userId) {
        try {
            const sb = SupabaseClient.getClient();
            // Optimized: Join bands table directly (1 request instead of N+1)
            const { data, error } = await sb
                .from('bandMembers')
                .select('role, band:bands(*)')
                .eq('userId', userId);

            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Bands');
                    return [];
                }
                Logger.error('Supabase getUserBands error', error);
                return [];
            }

            // Transform result: {role, band: {...}} -> {...band, role}
            const bands = (data || []).map(m => {
                if (!m.band) return null;
                return { ...m.band, role: m.role };
            }).filter(b => b !== null);

            return bands;
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Bands (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getUserBands:', err);
            }
            return [];
        }
    },

    async getUserRoleInBand(userId, bandId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Only need role
        const { data, error } = await sb
            .from('bandMembers')
            .select('role')
            .eq('userId', userId)
            .eq('bandId', bandId)
            .limit(1)
            .maybeSingle();

        if (error) { Logger.error('Supabase getUserRoleInBand error', error); return null; }
        return data ? data.role : null;
    },

    async updateBandMemberRole(bandId, userId, newRole) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from('bandMembers').update({ role: newRole }).eq('bandId', bandId).eq('userId', userId);
        if (error) { Logger.error('Supabase updateBandMemberRole error', error); return false; }
        return true;
    },

    async removeBandMember(bandId, userId) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from('bandMembers').delete().eq('bandId', bandId).eq('userId', userId);
        if (error) { Logger.error('Supabase removeBandMember error', error); return false; }
        return true;
    },

    async createBandMembershipRequest(requestData) {
        const request = {
            id: this.generateId(),
            status: 'pending',
            createdAt: new Date().toISOString(),
            respondedAt: null,
            respondedByUserId: null,
            ...requestData
        };
        return await this.save('bandMembershipRequests', request);
    },

    async getBandMembershipRequest(requestId) {
        return await this.getById('bandMembershipRequests', requestId);
    },

    async updateBandMembershipRequest(requestId, updates) {
        return await this.update('bandMembershipRequests', requestId, updates);
    },

    async getPendingBandMembershipRequest(bandId, targetUserId, type = null) {
        const sb = SupabaseClient.getClient();
        let query = sb
            .from('bandMembershipRequests')
            .select('*')
            .eq('bandId', bandId)
            .eq('targetUserId', targetUserId)
            .eq('status', 'pending')
            .order('createdAt', { ascending: false })
            .limit(1);

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
            Logger.error('Supabase getPendingBandMembershipRequest error', error);
            return null;
        }

        return data || null;
    },

    async getPendingMembershipRequestsForUserContext(userId, leaderBandIds = []) {
        if (!userId) return [];

        const sb = SupabaseClient.getClient();
        const uniqueRequests = new Map();

        const { data: selfRequests, error: selfError } = await sb
            .from('bandMembershipRequests')
            .select('*')
            .eq('status', 'pending')
            .or(`createdByUserId.eq.${userId},targetUserId.eq.${userId}`);

        if (selfError) {
            Logger.error('Supabase getPendingMembershipRequestsForUserContext self error', selfError);
        } else {
            (selfRequests || []).forEach((request) => {
                if (request?.id != null) uniqueRequests.set(String(request.id), request);
            });
        }

        const cleanedLeaderBandIds = Array.isArray(leaderBandIds)
            ? [...new Set(leaderBandIds.filter(Boolean).map((value) => String(value)))]
            : [];

        if (cleanedLeaderBandIds.length > 0) {
            const { data: leaderRequests, error: leaderError } = await sb
                .from('bandMembershipRequests')
                .select('*')
                .eq('status', 'pending')
                .in('bandId', cleanedLeaderBandIds);

            if (leaderError) {
                Logger.error('Supabase getPendingMembershipRequestsForUserContext leader error', leaderError);
            } else {
                (leaderRequests || []).forEach((request) => {
                    if (request?.id != null) uniqueRequests.set(String(request.id), request);
                });
            }
        }

        return [...uniqueRequests.values()];
    },

    async getBandLeadershipMembers(bandId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('bandMembers')
            .select('id, bandId, userId, role, joinedAt')
            .eq('bandId', bandId)
            .in('role', ['leader', 'co-leader']);

        if (error) {
            Logger.error('Supabase getBandLeadershipMembers error', error);
            return [];
        }

        return data || [];
    },

    async createNotification(notificationData) {
        const notification = {
            id: this.generateId(),
            status: 'unread',
            actionStatus: notificationData.actionType ? 'pending' : null,
            createdAt: new Date().toISOString(),
            readAt: null,
            actorUserId: null,
            actorName: '',
            actorImageUrl: '',
            bandName: '',
            requestedRole: '',
            ...notificationData
        };
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from('notifications').insert(notification);

        if (error) {
            const isNetworkError = error.message && (
                error.message.includes('FetchError') ||
                error.message.includes('network') ||
                error.message.includes('connection') ||
                error.message.includes('Load failed')
            );
            if (isNetworkError) {
                throw new Error('Verbindungsproblem: Speichern in notifications fehlgeschlagen.');
            }
            Logger.error('Supabase save error in notifications', error);
            throw new Error(`Fehler beim Speichern in notifications: ${error.message}`);
        }

        return notification;
    },

    async getNotificationsForUser(userId, options = {}) {
        if (!userId) return [];

        const { limit = 30 } = options;
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('notifications')
            .select('*')
            .eq('userId', userId)
            .neq('status', 'dismissed')
            .order('createdAt', { ascending: false })
            .limit(limit);

        if (error) {
            Logger.error('Supabase getNotificationsForUser error', error);
            return [];
        }

        return data || [];
    },

    async getUnreadNotificationCount(userId) {
        if (!userId) return 0;

        const sb = SupabaseClient.getClient();
        const { count, error } = await sb
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('userId', userId)
            .eq('status', 'unread');

        if (error) {
            Logger.error('Supabase getUnreadNotificationCount error', error);
            return 0;
        }

        return count || 0;
    },

    async markNotificationsRead(userId, notificationIds = []) {
        const ids = Array.isArray(notificationIds) ? notificationIds.filter(Boolean) : [];
        if (!userId || ids.length === 0) return true;

        const sb = SupabaseClient.getClient();
        const timestamp = new Date().toISOString();
        const { error } = await sb
            .from('notifications')
            .update({ status: 'read', readAt: timestamp })
            .eq('userId', userId)
            .in('id', ids);

        if (error) {
            Logger.error('Supabase markNotificationsRead error', error);
            return false;
        }

        return true;
    },

    async dismissNotification(userId, notificationId) {
        if (!userId || !notificationId) return false;

        const sb = SupabaseClient.getClient();
        const timestamp = new Date().toISOString();
        const { error } = await sb
            .from('notifications')
            .update({ status: 'dismissed', readAt: timestamp })
            .eq('userId', userId)
            .eq('id', notificationId);

        if (error) {
            Logger.error('Supabase dismissNotification error', error);
            return false;
        }

        return true;
    },

    async updateNotificationsByRequest(requestId, updates) {
        if (!requestId) return false;

        const sb = SupabaseClient.getClient();
        const { error } = await sb
            .from('notifications')
            .update(updates)
            .eq('requestId', requestId);

        if (error) {
            Logger.error('Supabase updateNotificationsByRequest error', error);
            return false;
        }

        return true;
    },

    async getNotificationsByRequest(requestId) {
        if (!requestId) return [];

        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('notifications')
            .select('*')
            .eq('requestId', requestId)
            .order('createdAt', { ascending: false });

        if (error) {
            Logger.error('Supabase getNotificationsByRequest error', error);
            return [];
        }

        return data || [];
    },

    // Event operations
    async createEvent(eventData) {
        const event = {
            id: this.generateId(),
            ...eventData,
            createdAt: new Date().toISOString()
        };
        return await this.save('events', event);
    },

    async getEvent(eventId) {
        return await this.getById('events', eventId);
    },

    async getBandEvents(bandId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Reverted to * to ensure members (JSON) and other fields are present
        const { data, error } = await sb
            .from('events')
            .select('*')
            .eq('bandId', bandId);
        if (error) { Logger.error('Supabase getBandEvents error', error); return []; }
        return data || [];
    },

    async getUserEvents(userId) {
        try {
            const userBands = await this.getUserBands(userId);
            const bandIds = userBands.map(b => b.id);
            if (bandIds.length === 0) return [];

            const sb = SupabaseClient.getClient();
            const { data, error } = await sb
                .from('events')
                .select('*, band:bands(name, color, image_url)')
                .in('bandId', bandIds);

            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Auftritte');
                    return [];
                }
                Logger.error('Supabase getUserEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Auftritte (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getUserEvents:', err);
            }
            return [];
        }
    },

    async updateEvent(eventId, updates) {
        return await this.update('events', eventId, updates);
    },

    async deleteEvent(eventId) {
        return await this.delete('events', eventId);
    },

    // Rehearsal operations
    async createRehearsal(rehearsalData) {
        const rehearsal = {
            id: this.generateId(),
            status: 'pending',
            createdAt: new Date().toISOString(),
            ...rehearsalData,
        };
        return await this.save('rehearsals', rehearsal);
    },

    async getRehearsal(rehearsalId) {
        return await this.getById('rehearsals', rehearsalId);
    },

    async getBandRehearsals(bandId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Reverted to * to ensure all fields (proposedBy, description etc) are present
        const { data, error } = await sb
            .from('rehearsals')
            .select('*')
            .eq('bandId', bandId);
        if (error) { Logger.error('Supabase getBandRehearsals error', error); return []; }
        return data || [];
    },

    async getUserRehearsals(userId) {
        try {
            const userBands = await this.getUserBands(userId);
            const bandIds = userBands.map(b => b.id);
            if (bandIds.length === 0) return [];

            const sb = SupabaseClient.getClient();
            const { data, error } = await sb
                .from('rehearsals')
                .select('*, band:bands(name, color, image_url)')
                .in('bandId', bandIds);

            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Probetermine');
                    return [];
                }
                Logger.error('Supabase getUserRehearsals error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Probetermine (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getUserRehearsals:', err);
            }
            return [];
        }
    },

    async updateRehearsal(rehearsalId, updates) {
        return await this.update('rehearsals', rehearsalId, updates);
    },

    async deleteRehearsal(rehearsalId) {
        await this.delete('rehearsals', rehearsalId);
        // Supabase CASCADE handles votes deletion
        return true;
    },

    // Vote operations
    async createVote(voteData) {
        const vote = {
            id: this.generateId(),
            ...voteData,
            createdAt: new Date().toISOString()
        };
        return await this.save('votes', vote);
    },

    async getRehearsalVotes(rehearsalId) {
        const sb = SupabaseClient.getClient();
        // Reverted to * due to column mismatch 'vote'
        const { data, error } = await sb
            .from('votes')
            .select('*')
            .eq('rehearsalId', rehearsalId);
        if (error) { Logger.error('Supabase getRehearsalVotes error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getRehearsalVotesForMultipleRehearsals(rehearsalIds) {
        if (!rehearsalIds || rehearsalIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('votes')
            .select('*')
            .in('rehearsalId', rehearsalIds);
        if (error) { Logger.error('Supabase getRehearsalVotesForMultipleRehearsals error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserVoteForDate(userId, rehearsalId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId).eq('dateIndex', dateIndex).limit(1).maybeSingle();
        if (error) { Logger.error('Supabase getUserVoteForDate error', error); return null; }
        return data ? this.normalizeVoteRecord(data) : null;
    },

    async getUserVotesForRehearsal(userId, rehearsalId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId);
        if (error) { Logger.error('Supabase getUserVotesForRehearsal error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserVotesForMultipleRehearsals(userId, rehearsalIds) {
        if (!rehearsalIds || rehearsalIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes')
            .select('*')
            .eq('userId', userId)
            .in('rehearsalId', rehearsalIds);
        if (error) { Logger.error('Supabase getUserVotesForMultipleRehearsals error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async deleteVote(voteId) {
        return await this.delete('votes', voteId);
    },

    // Event Vote operations
    async createEventVote(voteData) {
        const vote = {
            id: this.generateId(),
            ...voteData,
            createdAt: new Date().toISOString()
        };
        // Reuse the same 'votes' table but with eventId instead of rehearsalId
        return await this.save('votes', vote);
    },

    async getEventVotes(eventId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('votes')
            .select('*')
            .eq('eventId', eventId);
        if (error) { Logger.error('Supabase getEventVotes error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getEventVotesForMultipleEvents(eventIds) {
        if (!eventIds || eventIds.length === 0) return [];
        try {
            const sb = SupabaseClient.getClient();
            const { data, error } = await sb
                .from('votes')
                .select('*')
                .in('eventId', eventIds);
            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Event-Stimmen');
                    return [];
                }
                Logger.error('Supabase getEventVotesForMultipleEvents error', error);
                return [];
            }
            return (data || []).map(vote => this.normalizeVoteRecord(vote));
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Event-Stimmen (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getEventVotesForMultipleEvents:', err);
            }
            return [];
        }
    },

    async getUserEventVoteForDate(userId, eventId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes')
            .select('*')
            .eq('userId', userId)
            .eq('eventId', eventId)
            .eq('dateIndex', dateIndex)
            .limit(1)
            .maybeSingle();
        if (error) { Logger.error('Supabase getUserEventVoteForDate error', error); return null; }
        return data ? this.normalizeVoteRecord(data) : null;
    },

    async getUserEventVotes(userId, eventId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('eventId', eventId);
        if (error) { Logger.error('Supabase getUserEventVotes error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserEventVotesForMultipleEvents(userId, eventIds) {
        if (!eventIds || eventIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes')
            .select('*')
            .eq('userId', userId)
            .in('eventId', eventIds);
        if (error) { Logger.error('Supabase getUserEventVotesForMultipleEvents error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    // Event Time Suggestion operations (Reuse same table, pattern same as rehearsals)
    async createEventTimeSuggestion(suggestionData) {
        const suggestion = {
            id: this.generateId(),
            ...suggestionData,
            createdAt: new Date().toISOString()
        };
        return await this.save('timeSuggestions', suggestion);
    },

    async getEventTimeSuggestions(eventId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('timeSuggestions')
            .select('*')
            .eq('eventId', eventId)
            .eq('dateIndex', dateIndex);
        if (error) { Logger.error('Supabase getEventTimeSuggestions error', error); return []; }
        return data || [];
    },

    async getEventTimeSuggestionsForMultipleEvents(eventIds) {
        if (!eventIds || eventIds.length === 0) return [];
        try {
            const sb = SupabaseClient.getClient();
            const { data, error } = await sb
                .from('timeSuggestions')
                .select('*')
                .in('eventId', eventIds);
            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Zeitvorschläge');
                    return [];
                }
                Logger.error('Supabase getEventTimeSuggestionsForMultipleEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Zeitvorschläge (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getEventTimeSuggestionsForMultipleEvents:', err);
            }
            return [];
        }
    },

    async getUserEventTimeSuggestionForDate(userId, eventId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('timeSuggestions')
            .select('*')
            .eq('userId', userId)
            .eq('eventId', eventId)
            .eq('dateIndex', dateIndex)
            .limit(1)
            .maybeSingle();
        if (error) { Logger.error('Supabase getUserEventTimeSuggestionForDate error', error); return null; }
        return data || null;
    },

    // Time Suggestion operations
    async createTimeSuggestion(suggestionData) {
        const suggestion = {
            id: this.generateId(),
            ...suggestionData,
            createdAt: new Date().toISOString()
        };
        return await this.save('timeSuggestions', suggestion);
    },

    async getTimeSuggestionsForDate(rehearsalId, dateIndex) {
        const sb = SupabaseClient.getClient();
        // Reverted to * due to column mismatch 'startTime'
        const { data, error } = await sb
            .from('timeSuggestions')
            .select('*')
            .eq('rehearsalId', rehearsalId)
            .eq('dateIndex', dateIndex);
        if (error) { Logger.error('Supabase getTimeSuggestionsForDate error', error); return []; }
        return data || [];
    },

    async getUserTimeSuggestionForDate(userId, rehearsalId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('timeSuggestions').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId).eq('dateIndex', dateIndex).limit(1).maybeSingle();
        if (error) { Logger.error('Supabase getUserTimeSuggestionForDate error', error); return null; }
        return data || null;
    },

    async deleteTimeSuggestion(suggestionId) {
        return await this.delete('timeSuggestions', suggestionId);
    },

    // Location operations
    async createLocation(locationData) {
        const location = {
            id: this.generateId(),
            ...locationData,
            createdAt: new Date().toISOString()
        };
        return await this.save('locations', location);
    },

    async getLocations() {
        if (this.locationsCache && (Date.now() - this.locationsCacheTimestamp < this.CACHE_DURATION)) {
            return this.locationsCache;
        }

        const data = await this.getAll('locations'); // uses select('*')

        if (data) {
            this.locationsCache = data;
            this.locationsCacheTimestamp = Date.now();
        }
        return data;
    },

    async getLocation(locationId) {
        return await this.getById('locations', locationId);
    },

    async updateLocation(locationId, updates) {
        return await this.update('locations', locationId, updates);
    },

    async deleteLocation(locationId) {
        return await this.delete('locations', locationId);
    },

    // Absence operations
    async createAbsence(userId, startDate, endDate, reason = '', options = {}) {
        const meta = options?.meta || null;
        const absence = {
            id: this.generateId(),
            userId,
            startDate,
            endDate,
            reason: this.buildAbsenceReasonPayload(reason, meta),
            createdAt: options?.createdAt || new Date().toISOString()
        };
        const saved = await this.save('absences', absence);
        return this.decorateAbsence(saved);
    },

    async getUserAbsences(userId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason, createdAt')
            .eq('userId', userId);
        if (error) { Logger.error('Supabase getUserAbsences error', error); return []; }
        return (data || []).map(absence => this.decorateAbsence(absence));
    },

    async getAbsencesForUsers(userIds) {
        if (!userIds || userIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason, createdAt')
            .in('userId', userIds);
        if (error) { Logger.error('Supabase getAbsencesForUsers error', error); return []; }
        return (data || []).map(absence => this.decorateAbsence(absence));
    },

    async getAbsenceById(absenceId) {
        if (!absenceId) return null;
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason, createdAt')
            .eq('id', absenceId)
            .limit(1)
            .maybeSingle();
        if (error) {
            Logger.error('Supabase getAbsenceById error', error);
            return null;
        }
        return data ? this.decorateAbsence(data) : null;
    },


    async deleteAbsence(absenceId) {
        return await this.delete('absences', absenceId);
    },

    normalizeExternalCalendarUrl(url = '') {
        return String(url || '').trim().replace(/^webcal(s)?:\/\//i, 'https://');
    },

    isExternalCalendarEntryWithinSyncRange(dateLike) {
        const eventDate = new Date(dateLike);
        if (Number.isNaN(eventDate.getTime())) return false;

        const now = new Date();
        const pastLimit = new Date();
        pastLimit.setMonth(now.getMonth() - this.EXTERNAL_CALENDAR_PAST_MONTHS);
        const futureLimit = new Date();
        futureLimit.setMonth(now.getMonth() + this.EXTERNAL_CALENDAR_FUTURE_MONTHS);

        return eventDate >= pastLimit && eventDate <= futureLimit;
    },

    parseExternalCalendarEntries(icalData, sourceName = 'Externer Kalender', options = {}) {
        if (!icalData || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
            return [];
        }

        const sourceCalendarId = options?.sourceCalendarId ? String(options.sourceCalendarId) : null;
        const jcalData = ICAL.parse(icalData);
        const vcalendar = new ICAL.Component(jcalData);
        const vevents = vcalendar.getAllSubcomponents('vevent');

        return vevents.map((vevent) => {
            try {
                const event = new ICAL.Event(vevent);
                const dtStart = event.startDate.toJSDate();
                const dtEnd = event.endDate.toJSDate();
                const isAllDay = Boolean(event.startDate.isDate);

                let dateStr = dtStart.toISOString();
                let endDateStr = dtEnd.toISOString();

                if (isAllDay) {
                    dateStr = `${event.startDate.year}-${String(event.startDate.month).padStart(2, '0')}-${String(event.startDate.day).padStart(2, '0')}`;
                    endDateStr = `${event.endDate.year}-${String(event.endDate.month).padStart(2, '0')}-${String(event.endDate.day).padStart(2, '0')}`;
                }

                return {
                    id: `ext_${Math.random().toString(36).slice(2, 11)}`,
                    title: event.summary || '',
                    location: event.location || '',
                    description: event.description || '',
                    date: dateStr,
                    endDate: endDateStr,
                    isAllDay,
                    time: isAllDay
                        ? null
                        : `${dtStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${dtEnd.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
                    type: 'external',
                    sourceName,
                    sourceCalendarId
                };
            } catch (error) {
                Logger.warn('[Storage] Ungültiger externer Kalender-Eintrag wurde übersprungen:', error);
                return null;
            }
        }).filter(Boolean).filter(entry => this.isExternalCalendarEntryWithinSyncRange(entry.date));
    },

    async fetchExternalCalendarEntries(url, sourceName = 'Externer Kalender', options = {}) {
        try {
            const normalizedUrl = this.normalizeExternalCalendarUrl(url);
            if (!normalizedUrl) return [];

            const icalData = await ProxyService.fetch(normalizedUrl);
            if (!icalData || typeof icalData !== 'string' || !icalData.includes('BEGIN:VCALENDAR')) {
                Logger.warn('[Storage] Ungültige iCal-Daten für externen Kalender:', normalizedUrl);
                return [];
            }

            await new Promise(resolve => setTimeout(resolve, 0));
            return this.parseExternalCalendarEntries(icalData, sourceName, options);
        } catch (error) {
            Logger.error('[Storage] Error loading external calendar feed:', error);
            return [];
        }
    },

    buildSharedExternalCalendarBusyLabel(startDateValue, endDateValue, isAllDay = false) {
        if (isAllDay) {
            return 'Externer Kalender · ganztägig';
        }

        const start = new Date(startDateValue);
        const end = new Date(endDateValue);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return 'Externer Kalender';
        }

        const startLabel = start.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const endLabel = end.toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `Externer Kalender · ${startLabel} - ${endLabel} Uhr`;
    },

    createSharedExternalBusySlot(calendar, entry) {
        if (!calendar?.id || !calendar?.user_id || !entry?.date) {
            return null;
        }

        return {
            id: this.generateId(),
            calendar_id: String(calendar.id),
            user_id: String(calendar.user_id),
            start_date: entry.date,
            end_date: entry.endDate || entry.date,
            is_all_day: Boolean(entry.isAllDay),
            source_name: calendar.name || entry.sourceName || 'Externer Kalender',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    },

    decorateSharedExternalBusySlot(slot) {
        if (!slot) return null;

        const startDate = slot.start_date || slot.startDate;
        const endDate = slot.end_date || slot.endDate || startDate;
        const isAllDay = Boolean(slot.is_all_day ?? slot.isAllDay);
        const displayReason = this.buildSharedExternalCalendarBusyLabel(startDate, endDate, isAllDay);

        return {
            id: `external-busy-${slot.id}`,
            userId: String(slot.user_id || slot.userId || ''),
            startDate,
            endDate,
            reason: this.buildAbsenceReasonPayload(displayReason, {
                sourceType: 'sharedExternalCalendar',
                sourceName: slot.source_name || slot.sourceName || 'Externer Kalender',
                isAllDay
            }),
            createdAt: slot.updated_at || slot.updatedAt || slot.created_at || slot.createdAt || new Date().toISOString(),
            displayReason,
            recurrenceMeta: null
        };
    },

    async syncSharedExternalCalendarBusySlots(userId, calendars = [], preloadedEntries = []) {
        if (!userId) return [];

        const sb = SupabaseClient.getClient();
        const normalizedCalendars = Array.isArray(calendars)
            ? calendars
                .filter(Boolean)
                .map(calendar => ({
                    ...calendar,
                    id: calendar.id != null ? String(calendar.id) : null,
                    user_id: String(calendar.user_id || calendar.userId || userId),
                    share_for_band_planning: Boolean(calendar.share_for_band_planning ?? calendar.shareForBandPlanning)
                }))
                .filter(calendar => calendar.user_id === String(userId))
            : [];

        const sharedCalendars = normalizedCalendars.filter(calendar => calendar.share_for_band_planning && calendar.url);

        const { error: deleteError } = await sb
            .from('external_calendar_busy_slots')
            .delete()
            .eq('user_id', userId);

        if (deleteError) {
            if (sharedCalendars.length > 0) {
                throw deleteError;
            }
            Logger.warn('[Storage] Alte Busy-Slots konnten nicht entfernt werden:', deleteError);
            return [];
        }

        if (sharedCalendars.length === 0) {
            return [];
        }

        const entriesByCalendarId = new Map();
        if (Array.isArray(preloadedEntries) && preloadedEntries.length > 0) {
            preloadedEntries.forEach((entry) => {
                const key = entry?.sourceCalendarId != null ? String(entry.sourceCalendarId) : null;
                if (!key) return;
                if (!entriesByCalendarId.has(key)) entriesByCalendarId.set(key, []);
                entriesByCalendarId.get(key).push(entry);
            });
        }

        if (entriesByCalendarId.size === 0) {
            const feeds = await Promise.all(sharedCalendars.map(async (calendar) => ({
                calendarId: calendar.id,
                entries: await this.fetchExternalCalendarEntries(calendar.url, calendar.name || 'Externer Kalender', {
                    sourceCalendarId: calendar.id
                })
            })));

            feeds.forEach(({ calendarId, entries }) => {
                entriesByCalendarId.set(String(calendarId), entries || []);
            });
        }

        const busySlots = sharedCalendars.flatMap((calendar) => {
            const entries = entriesByCalendarId.get(String(calendar.id)) || [];
            return entries
                .map(entry => this.createSharedExternalBusySlot(calendar, entry))
                .filter(Boolean);
        });

        if (busySlots.length === 0) {
            return [];
        }

        const { data, error } = await sb
            .from('external_calendar_busy_slots')
            .insert(busySlots)
            .select('*');

        if (error) {
            throw error;
        }

        return (data || []).map(slot => this.decorateSharedExternalBusySlot(slot)).filter(Boolean);
    },

    async getSharedExternalCalendarBusySlotsForUsers(userIds) {
        const cleanedUserIds = Array.isArray(userIds)
            ? [...new Set(userIds.filter(Boolean).map(value => String(value)))]
            : [];

        if (cleanedUserIds.length === 0) return [];

        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('external_calendar_busy_slots')
            .select('*')
            .in('user_id', cleanedUserIds);

        if (error) {
            if (this._isMissingExternalCalendarSharingSetupError(error)) {
                Logger.warn('[Storage] Shared external calendar slots are not configured yet.');
                return [];
            }
            Logger.error('Supabase getSharedExternalCalendarBusySlotsForUsers error', error);
            return [];
        }

        return (data || []).map(slot => this.decorateSharedExternalBusySlot(slot)).filter(Boolean);
    },

    async getAvailabilityBlocksForUsers(userIds) {
        const cleanedUserIds = Array.isArray(userIds)
            ? [...new Set(userIds.filter(Boolean).map(value => String(value)))]
            : [];

        if (cleanedUserIds.length === 0) return [];

        const [absences, externalBusySlots] = await Promise.all([
            this.getAbsencesForUsers(cleanedUserIds),
            this.getSharedExternalCalendarBusySlotsForUsers(cleanedUserIds)
        ]);

        return [...(absences || []), ...(externalBusySlots || [])];
    },

    async getUserAvailabilityBlocks(userId) {
        if (!userId) return [];
        return this.getAvailabilityBlocksForUsers([userId]);
    },

    async isUserAbsentInRange(userId, startDate, endDate = null) {
        const absences = await this.getUserAbsences(userId);
        return absences.some(absence => this.absenceOverlapsRange(absence, startDate, endDate || startDate));
    },

    async isUserUnavailableInRange(userId, startDate, endDate = null) {
        const blocks = await this.getUserAvailabilityBlocks(userId);
        return blocks.some(block => this.absenceOverlapsRange(block, startDate, endDate || startDate));
    },

    async isUserAbsentOnDate(userId, date) {
        return this.isUserAbsentInRange(userId, date, date);
    },

    async getAbsentUsersDuringRange(userIds, startDate, endDate) {
        if (!userIds || userIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        // Optimized columns
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason, createdAt')
            .in('userId', userIds);

        if (error) { Logger.error('Supabase getAbsentUsersDuringRange error', error); return []; }

        const absences = (data || []).map(absence => this.decorateAbsence(absence));
        const rangeStart = new Date(startDate);
        const rangeEnd = new Date(endDate);

        return absences.filter(absence => this.absenceOverlapsRange(absence, rangeStart, rangeEnd));
    },

    // News operations
    async createNewsItem(title, content, createdBy, images = []) {
        const newsItem = {
            id: this.generateId(),
            title,
            content,
            images,
            createdBy,
            createdAt: new Date().toISOString(),
            readBy: [] // Empty array so creator also sees "NEU" badge initially
        };
        return await this.save('news', newsItem);
    },

    async getAllNews() {
        const news = await this.getAll('news');
        return news.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getLatestNews(limit = 5) {
        try {
            const sb = SupabaseClient.getClient();
            // Optimized: distinct columns, exclude heavy 'images'
            const { data, error } = await sb
                .from('news')
                .select('id, title, content, createdAt, createdBy, readBy')
                .order('createdAt', { ascending: false })
                .limit(limit);

            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der News');
                    return [];
                }
                Logger.error('Supabase getLatestNews error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der News (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getLatestNews:', err);
            }
            return [];
        }
    },

    async deleteNewsItem(newsId) {
        return await this.delete('news', newsId);
    },

    async updateNewsItem(newsId, updates) {
        return await this.update('news', newsId, updates);
    },

    async markNewsRead(newsId, userId) {
        const news = await this.getById('news', newsId);
        if (!news) return;
        if (!news.readBy) news.readBy = [];
        if (!news.readBy.includes(userId)) {
            news.readBy.push(userId);
            await this.update('news', newsId, { readBy: news.readBy });
        }
    },

    async markAllNewsReadForUser(userId) {
        const allNews = await this.getAllNews();
        for (const news of allNews) {
            if (!news.readBy) news.readBy = [];
            if (!news.readBy.includes(userId)) {
                news.readBy.push(userId);
                await this.update('news', news.id, { readBy: news.readBy });
            }
        }
    },

    async getUnreadNewsCountForUser(userId) {
        const allNews = await this.getAllNews();
        return allNews.filter(n => !n.readBy || !n.readBy.includes(userId)).length;
    },

    _getSongInfoString(songOrInfo) {
        if (songOrInfo && typeof songOrInfo === 'object' && !Array.isArray(songOrInfo)) {
            return typeof songOrInfo.info === 'string' ? songOrInfo.info : '';
        }
        return typeof songOrInfo === 'string' ? songOrInfo : '';
    },

    getSongPlainInfo(songOrInfo) {
        const info = this._getSongInfoString(songOrInfo);
        const markerIndex = info.indexOf(this.SONG_CHORDPRO_MARKER);
        const plainInfo = markerIndex >= 0 ? info.slice(0, markerIndex) : info;
        return plainInfo.trim();
    },

    getSongChordPro(songOrInfo) {
        const info = this._getSongInfoString(songOrInfo);
        const markerIndex = info.indexOf(this.SONG_CHORDPRO_MARKER);
        if (markerIndex === -1) {
            if (songOrInfo && typeof songOrInfo === 'object' && !Array.isArray(songOrInfo)) {
                const fallbackFields = ['chordpro', 'chord_pro', 'chordPro', 'chordpro_text', 'chordProText'];
                const directChordPro = fallbackFields.find((field) => typeof songOrInfo[field] === 'string' && songOrInfo[field].trim());
                if (directChordPro) {
                    return songOrInfo[directChordPro].trim();
                }
            }
            return '';
        }

        return info
            .slice(markerIndex + this.SONG_CHORDPRO_MARKER.length)
            .replace(/^\s+/, '')
            .trim();
    },

    getSongInfoPreview(songOrInfo) {
        const plainInfo = this.getSongPlainInfo(songOrInfo);
        if (plainInfo) return plainInfo;
        return this.getSongChordPro(songOrInfo) ? this.SONG_CHORDPRO_PREVIEW_LABEL : '';
    },

    composeSongInfoWithChordPro(plainInfo, chordProText = '') {
        const cleanInfo = this.getSongPlainInfo(plainInfo);
        const cleanChordPro = typeof chordProText === 'string' ? chordProText.trim() : '';

        if (cleanInfo && cleanChordPro) {
            return `${cleanInfo}\n\n${this.SONG_CHORDPRO_MARKER}\n${cleanChordPro}`;
        }
        if (cleanChordPro) {
            return `${this.SONG_CHORDPRO_MARKER}\n${cleanChordPro}`;
        }

        return cleanInfo || null;
    },

    getSongPdfStoragePath(pdfUrl = '') {
        const rawUrl = String(pdfUrl || '').trim();
        if (!rawUrl) return null;

        try {
            const parsedUrl = new URL(rawUrl, window.location.origin);
            const match = parsedUrl.pathname.match(/\/storage\/v1\/object\/public\/song-pdfs\/(.+)$/);
            if (!match || !match[1]) return null;
            return decodeURIComponent(match[1]);
        } catch (error) {
            Logger.warn('[Storage] Could not parse song pdf path:', error);
            return null;
        }
    },

    async songPdfHasRemainingReferences(pdfUrl = '') {
        const normalizedUrl = String(pdfUrl || '').trim();
        if (!normalizedUrl) return false;

        const sb = SupabaseClient.getClient();
        const [
            { data: songRefs, error: songsError },
            { data: songpoolRefs, error: songpoolError }
        ] = await Promise.all([
            sb.from('songs').select('id').eq('pdf_url', normalizedUrl).limit(1),
            sb.from('songpool_songs').select('id').eq('pdf_url', normalizedUrl).limit(1)
        ]);

        if (songsError) {
            Logger.warn('[Storage] Song pdf reference lookup failed in songs:', songsError);
        }

        if (songpoolError && !this._isMissingSongpoolTableError(songpoolError)) {
            Logger.warn('[Storage] Song pdf reference lookup failed in songpool_songs:', songpoolError);
        }

        return Boolean((songRefs && songRefs.length) || (songpoolRefs && songpoolRefs.length));
    },

    async cleanupSongPdfStorage(pdfUrl = '') {
        const storagePath = this.getSongPdfStoragePath(pdfUrl);
        if (!storagePath) {
            return { removed: false, skipped: true, reason: 'invalid-path' };
        }

        const hasRemainingReferences = await this.songPdfHasRemainingReferences(pdfUrl);
        if (hasRemainingReferences) {
            return { removed: false, skipped: true, reason: 'still-referenced' };
        }

        const sb = SupabaseClient.getClient();
        const { error } = await sb.storage.from('song-pdfs').remove([storagePath]);

        if (error) {
            Logger.warn('[Storage] Song pdf cleanup failed:', error);
            return { removed: false, skipped: false, reason: error.message || 'remove-failed' };
        }

        return { removed: true, skipped: false, reason: null };
    },

    // Song operations
    async createSong(songData) {
        const song = {
            id: this.generateId(),
            ...songData,
            createdAt: new Date().toISOString()
        };
        return await this.save('songs', song);
    },

    async createSongpoolSong(songData) {
        const sb = SupabaseClient.getClient();
        const song = {
            id: this.generateId(),
            visibility: 'public',
            ...songData,
            createdAt: songData.createdAt || new Date().toISOString()
        };

        const { data, error } = await sb
            .from('songpool_songs')
            .insert(song)
            .select('*')
            .maybeSingle();

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Song konnte nicht im Songpool gespeichert werden.'));
        }

        return data || song;
    },

    async getSongpoolSong(songId) {
        if (!songId) return null;

        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('songpool_songs')
            .select('*')
            .eq('id', songId)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Song konnte nicht geladen werden.'));
        }

        return data || null;
    },

    async getSongpoolSongsByIds(songIds = []) {
        const normalizedIds = [...new Set(
            (Array.isArray(songIds) ? songIds : [])
                .map((songId) => String(songId || '').trim())
                .filter(Boolean)
        )];

        if (!normalizedIds.length) return [];

        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('songpool_songs')
            .select('*')
            .in('id', normalizedIds);

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Songs konnten nicht geladen werden.'));
        }

        return data || [];
    },

    async getSongpoolSongs(userId, options = {}) {
        if (!userId) return [];

        const includeAll = options.includeAll === true;
        const includePublic = options.includePublic === true;
        const sb = SupabaseClient.getClient();

        if (includeAll) {
            const { data, error } = await sb
                .from('songpool_songs')
                .select('*');

            if (error) {
                throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Songs konnten nicht geladen werden.'));
            }

            return data || [];
        }

        const ownSongsQuery = sb
            .from('songpool_songs')
            .select('*')
            .eq('createdBy', userId);

        const publicSongsQuery = includePublic
            ? sb
                .from('songpool_songs')
                .select('*')
                .eq('visibility', 'public')
                .neq('createdBy', userId)
            : Promise.resolve({ data: [], error: null });

        const [
            { data: ownSongs, error: ownSongsError },
            { data: publicSongs, error: publicSongsError }
        ] = await Promise.all([ownSongsQuery, publicSongsQuery]);

        if (ownSongsError) {
            throw new Error(this._getSongpoolErrorMessage(ownSongsError, 'Eigene Songpool-Songs konnten nicht geladen werden.'));
        }

        if (publicSongsError) {
            throw new Error(this._getSongpoolErrorMessage(publicSongsError, 'Öffentliche Songpool-Songs konnten nicht geladen werden.'));
        }

        const merged = [...(ownSongs || [])];
        const seenIds = new Set(merged.map(song => String(song.id)));

        (publicSongs || []).forEach((song) => {
            const songId = String(song.id);
            if (seenIds.has(songId)) return;
            seenIds.add(songId);
            merged.push(song);
        });

        return merged;
    },

    async updateSongpoolSong(songId, updates) {
        const shouldCheckPdfCleanup = updates && Object.prototype.hasOwnProperty.call(updates, 'pdf_url');
        const existingSong = shouldCheckPdfCleanup ? await this.getSongpoolSong(songId) : null;
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('songpool_songs')
            .update(updates)
            .eq('id', songId)
            .select('*')
            .maybeSingle();

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Song konnte nicht aktualisiert werden.'));
        }

        const updatedSong = data || null;
        if (shouldCheckPdfCleanup && existingSong?.pdf_url && existingSong.pdf_url !== (updatedSong?.pdf_url || updates?.pdf_url || null)) {
            await this.cleanupSongPdfStorage(existingSong.pdf_url);
        }

        return updatedSong;
    },

    async deleteSongpoolSongs(songIds = [], options = {}) {
        const normalizedIds = [...new Set(
            (Array.isArray(songIds) ? songIds : [])
                .map((songId) => String(songId || '').trim())
                .filter(Boolean)
        )];

        if (!normalizedIds.length) {
            return {
                deletedCount: 0,
                cleanedPdfCount: 0,
                skippedCleanupCount: 0,
                missingCount: 0
            };
        }

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const existingSongs = await this.getSongpoolSongsByIds(normalizedIds);
        const songLookup = new Map(existingSongs.map((song) => [String(song.id), song]));
        const existingIds = normalizedIds.filter((songId) => songLookup.has(songId));

        if (!existingIds.length) {
            return {
                deletedCount: 0,
                cleanedPdfCount: 0,
                skippedCleanupCount: 0,
                missingCount: normalizedIds.length
            };
        }

        if (onProgress) {
            onProgress({
                phase: 'delete',
                current: 0,
                total: existingIds.length
            });
        }

        const sb = SupabaseClient.getClient();
        const { error } = await sb
            .from('songpool_songs')
            .delete()
            .in('id', existingIds);

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Song konnte nicht gelöscht werden.'));
        }

        if (onProgress) {
            onProgress({
                phase: 'delete',
                current: existingIds.length,
                total: existingIds.length
            });
        }

        const uniquePdfUrls = [...new Set(
            existingIds
                .map((songId) => songLookup.get(songId)?.pdf_url)
                .filter(Boolean)
        )];

        let cleanedPdfCount = 0;
        let skippedCleanupCount = 0;

        for (let index = 0; index < uniquePdfUrls.length; index++) {
            if (onProgress) {
                onProgress({
                    phase: 'cleanup',
                    current: index,
                    total: uniquePdfUrls.length
                });
            }

            const cleanupResult = await this.cleanupSongPdfStorage(uniquePdfUrls[index]);
            if (cleanupResult?.removed) {
                cleanedPdfCount += 1;
            } else {
                skippedCleanupCount += 1;
            }
        }

        if (onProgress && uniquePdfUrls.length > 0) {
            onProgress({
                phase: 'cleanup',
                current: uniquePdfUrls.length,
                total: uniquePdfUrls.length
            });
        }

        return {
            deletedCount: existingIds.length,
            cleanedPdfCount,
            skippedCleanupCount,
            missingCount: normalizedIds.length - existingIds.length
        };
    },

    async deleteSongpoolSong(songId, options = {}) {
        const result = await this.deleteSongpoolSongs([songId], options);
        return result.deletedCount > 0;
    },

    async getEventSongs(eventId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Reverted to * due to unknown duration column name
        const { data, error } = await sb
            .from('songs')
            .select('*')
            .eq('eventId', eventId);

        if (error) { Logger.error('Supabase getEventSongs error', error); return []; }
        return (data || []).sort((a, b) => a.order - b.order);
    },

    async getEventSongsForMultipleEvents(eventIds) {
        if (!eventIds || eventIds.length === 0) return [];
        try {
            const sb = SupabaseClient.getClient();
            const { data, error } = await sb.from('songs')
                .select('*')
                .in('eventId', eventIds);
            if (error) {
                if (this._isNetworkError(error)) {
                    Logger.warn('Netzwerkproblem beim Laden der Setlists');
                    return [];
                }
                Logger.error('Supabase getEventSongsForMultipleEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Setlists (Catch)');
            } else {
                Logger.error('[Storage] Unexpected error in getEventSongsForMultipleEvents:', err);
            }
            return [];
        }
    },

    async getBandSongs(bandId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('songs')
            .select('*')
            .eq('bandId', bandId);

        if (error) { Logger.error('Supabase getBandSongs error', error); return []; }
        return data || [];
    },

    async getBandSongChoices(bandId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('songs')
            .select('id, title')
            .eq('bandId', bandId)
            .order('title', { ascending: true });

        if (error) {
            Logger.error('Supabase getBandSongChoices error', error);
            throw new Error(error.message || 'Songs konnten nicht geladen werden.');
        }

        return (data || []).map(song => ({
            id: song.id,
            title: song.title || 'Ohne Titel'
        }));
    },

    async searchSongAutofillCandidates(query, preferredBandId = null) {
        const cleanQuery = String(query || '').trim();
        if (cleanQuery.length < 2) return [];

        const sanitizeSearchTerm = value => value.replace(/[%_]/g, '').trim();
        const normalizeTerm = value => String(value || '')
            .toLocaleLowerCase('de-DE')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        const metadataScore = song => ([
            song.artist,
            song.bpm,
            song.key,
            song.originalKey,
            song.timeSignature,
            song.leadVocal,
            song.language
        ].filter(Boolean).length);
        const searchTerm = sanitizeSearchTerm(cleanQuery);
        if (searchTerm.length < 2) return [];

        const normalizedQuery = normalizeTerm(searchTerm);
        const preferredBand = preferredBandId ? String(preferredBandId) : null;
        const sb = SupabaseClient.getClient();

        const fetchJsonWithFallback = async (url, { timeoutMs = 6000 } = {}) => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

            const directFetch = async () => {
                const response = await fetch(url, {
                    headers: {
                        Accept: 'application/json'
                    },
                    signal: controller ? controller.signal : undefined
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return await response.json();
            };

            try {
                return await directFetch();
            } catch (directError) {
                if (typeof ProxyService !== 'undefined' && ProxyService && typeof ProxyService.fetch === 'function') {
                    const text = await ProxyService.fetch(url);
                    return JSON.parse(text);
                }
                throw directError;
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        };

        const fetchExternalCandidates = async () => {
            const musicBrainzUrl = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(`recording:"${searchTerm}"`)}&fmt=json&limit=6`;
            const appleUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=6&country=DE`;

            const [musicBrainzResult, appleResult] = await Promise.allSettled([
                fetchJsonWithFallback(musicBrainzUrl),
                fetchJsonWithFallback(appleUrl)
            ]);

            const externalCandidates = [];

            if (musicBrainzResult.status === 'fulfilled') {
                const recordings = musicBrainzResult.value?.recordings || [];
                recordings.forEach(recording => {
                    const artist = Array.isArray(recording['artist-credit'])
                        ? recording['artist-credit'].map(entry => entry?.name).filter(Boolean).join(', ')
                        : '';

                    externalCandidates.push({
                        id: `mb-${recording.id}`,
                        title: recording.title || '',
                        artist,
                        bpm: null,
                        key: null,
                        originalKey: null,
                        timeSignature: null,
                        leadVocal: null,
                        language: null,
                        bandId: null,
                        eventId: null,
                        createdAt: null,
                        source: 'musicbrainz',
                        sourceLabel: 'MusicBrainz',
                        externalScore: Number(recording.score || 0)
                    });
                });
            }

            if (appleResult.status === 'fulfilled') {
                const tracks = appleResult.value?.results || [];
                tracks.forEach(track => {
                    externalCandidates.push({
                        id: `itunes-${track.trackId || track.collectionId || this.generateId()}`,
                        title: track.trackName || '',
                        artist: track.artistName || '',
                        bpm: null,
                        key: null,
                        originalKey: null,
                        timeSignature: null,
                        leadVocal: null,
                        language: null,
                        bandId: null,
                        eventId: null,
                        createdAt: null,
                        source: 'itunes',
                        sourceLabel: 'Apple Music',
                        externalScore: 0
                    });
                });
            }

            return externalCandidates;
        };

        try {
            const { data, error } = await sb
                .from('songs')
                .select('id, title, artist, bpm, key, originalKey, timeSignature, leadVocal, language, bandId, eventId, createdAt')
                .not('bandId', 'is', null)
                .ilike('title', `%${searchTerm}%`)
                .limit(30);

            if (error) {
                if (this._isNetworkError(error)) {
                    throw new Error('Netzwerkproblem bei der Songsuche.');
                }
                throw new Error(error.message || 'Song-Vorschläge konnten nicht geladen werden.');
            }

            const localCandidates = (data || []).map(song => ({
                ...song,
                source: 'bandmate',
                sourceLabel: 'Bandmate'
            }));

            let externalCandidates = [];
            try {
                externalCandidates = await fetchExternalCandidates();
            } catch (externalError) {
                Logger.warn('External song autofill search failed:', externalError);
            }

            const ranked = [...localCandidates, ...externalCandidates].map(song => {
                const normalizedTitle = normalizeTerm(song.title);
                const exactMatch = normalizedTitle === normalizedQuery;
                const startsWith = normalizedTitle.startsWith(normalizedQuery);
                return {
                    ...song,
                    _rankSource: song.source === 'bandmate' ? 2 : 1,
                    _rankBand: preferredBand && String(song.bandId) === preferredBand ? 1 : 0,
                    _rankTitle: exactMatch ? 3 : (startsWith ? 2 : 1),
                    _rankMeta: metadataScore(song),
                    _rankExternal: Number(song.externalScore || 0)
                };
            });

            ranked.sort((a, b) => {
                if (b._rankSource !== a._rankSource) return b._rankSource - a._rankSource;
                if (b._rankBand !== a._rankBand) return b._rankBand - a._rankBand;
                if (b._rankTitle !== a._rankTitle) return b._rankTitle - a._rankTitle;
                if (b._rankMeta !== a._rankMeta) return b._rankMeta - a._rankMeta;
                if (b._rankExternal !== a._rankExternal) return b._rankExternal - a._rankExternal;
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });

            const seen = new Set();
            const unique = [];
            ranked.forEach(song => {
                const dedupeKey = `${normalizeTerm(song.title)}::${normalizeTerm(song.artist)}`;
                if (!normalizeTerm(song.title) || seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                unique.push(song);
            });

            return unique.slice(0, 10).map(({
                _rankSource,
                _rankBand,
                _rankTitle,
                _rankMeta,
                _rankExternal,
                externalScore,
                ...song
            }) => song);
        } catch (error) {
            Logger.error('Song autofill search failed:', error);
            if (this._isNetworkError(error)) {
                throw new Error('Netzwerkproblem bei der Songsuche.');
            }
            throw error;
        }
    },

    async updateSong(songId, updates) {
        const shouldCheckPdfCleanup = updates && Object.prototype.hasOwnProperty.call(updates, 'pdf_url');
        const existingSong = shouldCheckPdfCleanup ? await this.getById('songs', songId) : null;
        const updatedSong = await this.update('songs', songId, updates);

        if (updatedSong && shouldCheckPdfCleanup && existingSong?.pdf_url && existingSong.pdf_url !== (updatedSong?.pdf_url || updates?.pdf_url || null)) {
            await this.cleanupSongPdfStorage(existingSong.pdf_url);
        }

        return updatedSong;
    },

    async saveChordProToSong(songId, chordProText) {
        const sb = SupabaseClient.getClient();
        const cleanChordPro = typeof chordProText === 'string' ? chordProText.trim() : '';
        if (!songId) throw new Error('Kein Song zum Speichern ausgewählt.');
        if (!cleanChordPro) throw new Error('Es ist noch kein ChordPro-Inhalt vorhanden.');

        // --- Option B: Upload as real .cho file to Supabase Storage ---
        const existingSong = await this.getById('songs', songId);
        if (!existingSong) throw new Error('Der ausgewählte Song wurde nicht gefunden.');

        // Build a clean filename from the song title
        const safeTitle = (existingSong.title || 'song')
            .toLowerCase()
            .replace(/[^a-z0-9äöüß\s\-]/gi, '')
            .replace(/\s+/g, '-')
            .substring(0, 60);
        const fileName = `cp-${safeTitle}-${songId.substring(0, 8)}.cho`;
        const storagePath = fileName;

        // Remove old file if it exists
        if (existingSong.chordpro_url) {
            const oldPath = this.getChordProStoragePath(existingSong.chordpro_url);
            if (oldPath) {
                await sb.storage.from('song-pdfs').remove([oldPath]).catch(() => {});
            }
        }

        // Upload the .cho file
        const blob = new Blob([cleanChordPro], { type: 'text/plain' });
        const { data: uploadData, error: uploadError } = await sb.storage
            .from('song-pdfs')
            .upload(storagePath, blob, {
                contentType: 'text/plain',
                upsert: true
            });

        if (uploadError) {
            throw new Error('ChordPro-Datei konnte nicht hochgeladen werden: ' + (uploadError.message || ''));
        }

        // Get the public URL
        const { data: urlData } = sb.storage.from('song-pdfs').getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl || null;

        if (!publicUrl) {
            throw new Error('Öffentliche URL der ChordPro-Datei konnte nicht ermittelt werden.');
        }

        // Save the URL to the songs table
        const { data: updatedSong, error: updateError } = await sb
            .from('songs')
            .update({ chordpro_url: publicUrl })
            .eq('id', songId)
            .select('*')
            .maybeSingle();

        if (updateError) {
            // If chordpro_url column doesn't exist yet, fall back to info field
            if (updateError.code === 'PGRST204' || updateError.code === '42703' ||
                (updateError.message && updateError.message.includes('chordpro_url'))) {
                const mergedInfo = this.composeSongInfoWithChordPro(this.getSongPlainInfo(existingSong), cleanChordPro);
                const { data: infoData, error: infoError } = await sb
                    .from('songs')
                    .update({ info: mergedInfo })
                    .eq('id', songId)
                    .select('*')
                    .maybeSingle();
                if (infoError) throw new Error(infoError.message || 'ChordPro konnte nicht gespeichert werden.');
                return { field: 'info', usedInfoFallback: true, song: infoData || null };
            }
            throw new Error(updateError.message || 'ChordPro-URL konnte nicht gespeichert werden.');
        }

        return { field: 'chordpro_url', usedInfoFallback: false, song: updatedSong || null, fileUrl: publicUrl };
    },

    getChordProStoragePath(chordProUrl = '') {
        const rawUrl = String(chordProUrl || '').trim();
        if (!rawUrl) return null;
        try {
            const parsedUrl = new URL(rawUrl, window.location.origin);
            const match = parsedUrl.pathname.match(/\/storage\/v1\/object\/public\/song-pdfs\/(.+)$/);
            if (!match || !match[1]) return null;
            return decodeURIComponent(match[1]);
        } catch (error) {
            Logger.warn('[Storage] Could not parse chordpro path:', error);
            return null;
        }
    },

    async deleteSong(songId) {
        const existingSong = await this.getById('songs', songId);
        const deleted = await this.delete('songs', songId);

        if (deleted && existingSong?.pdf_url) {
            await this.cleanupSongPdfStorage(existingSong.pdf_url);
        }

        return deleted;
    },

    // Rundown Template operations
    async createRundownTemplate(name, templateData, userId) {
        const sb = SupabaseClient.getClient();
        const template = {
            id: this.generateId(),
            name: name.trim(),
            data: templateData,
            created_by: userId,
            created_at: new Date().toISOString()
        };
        const { data, error } = await sb
            .from('rundown_templates')
            .insert(template)
            .select('*')
            .maybeSingle();
        if (error) {
            Logger.error('Storage.createRundownTemplate error', error);
            throw new Error(error.message || 'Vorlage konnte nicht gespeichert werden.');
        }
        return data || template;
    },

    async getRundownTemplates(userId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('rundown_templates')
            .select('*')
            .eq('created_by', userId)
            .order('created_at', { ascending: false });
        if (error) {
            Logger.error('Storage.getRundownTemplates error', error);
            return [];
        }
        return data || [];
    },

    async deleteRundownTemplate(templateId) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb
            .from('rundown_templates')
            .delete()
            .eq('id', templateId);
        if (error) {
            Logger.error('Storage.deleteRundownTemplate error', error);
            throw new Error(error.message || 'Vorlage konnte nicht gelöscht werden.');
        }
        return true;
    },

    // Settings operations
    async getSetting(key) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('settings').select('value').eq('key', key).limit(1).maybeSingle();
        if (error) { Logger.error('Supabase getSetting error', key, error); return null; }
        return data ? data.value : null;
    },

    async setSetting(key, value) {
        const sb = SupabaseClient.getClient();
        const id = `setting-${key}`;

        // Try to update first
        const { data: existing } = await sb.from('settings').select('id').eq('key', key).limit(1).maybeSingle();

        if (existing) {
            // Update existing
            const { error } = await sb.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
            if (error) {
                Logger.error('Supabase setSetting update error', key, error);
                throw new Error(`Fehler beim Aktualisieren der Einstellung: ${error.message}`);
            }
        } else {
            // Insert new
            const { error } = await sb.from('settings').insert({ id, key, value });
            if (error) {
                Logger.error('Supabase setSetting insert error', key, error);
                throw new Error(`Fehler beim Speichern der Einstellung: ${error.message}`);
            }
        }
        return true;
    },

    // Cleanup operations
    async cleanupPastItems(force = false) {
        if (this.pastItemsCleanupPromise && !force) {
            return this.pastItemsCleanupPromise;
        }

        if (!force && this.lastPastItemsCleanupAt && (Date.now() - this.lastPastItemsCleanupAt) < this.PAST_ITEMS_CLEANUP_INTERVAL_MS) {
            return {
                deletedEventsCount: 0,
                deletedRehearsalsCount: 0,
                trimmedArchivedEventsCount: 0,
                trimmedArchivedRehearsalsCount: 0,
                skipped: true
            };
        }

        this.pastItemsCleanupPromise = (async () => {
        try {
            const today = this.getStartOfDay(new Date());
            if (!today) {
                throw new Error('Konnte heutiges Datum nicht bestimmen');
            }

            // Clean up past events
            const allEvents = await this.getAll('events');
            let deletedEventsCount = 0;
            let trimmedArchivedEventsCount = 0;
            const archivedConfirmedEvents = [];
            const eventsToDelete = [];

            for (const event of allEvents) {
                if (!event?.date || !this.isPastCalendarDay(event.date, today)) {
                    continue;
                }

                if (event.status === 'confirmed') {
                    archivedConfirmedEvents.push(event);
                    continue;
                }

                eventsToDelete.push(event.id);
            }

            const staleArchivedEvents = archivedConfirmedEvents
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(20);

            for (const event of staleArchivedEvents) {
                eventsToDelete.push(event.id);
            }

            // Perform deletions in parallel
            if (eventsToDelete.length > 0) {
                Logger.info(`[Storage] Clean up: Deleting ${eventsToDelete.length} past events in parallel...`);
                await Promise.all(eventsToDelete.map(id => this.deleteEvent(id)));
                deletedEventsCount = eventsToDelete.length - staleArchivedEvents.length;
                trimmedArchivedEventsCount = staleArchivedEvents.length;
            }

            // Clean up past rehearsals
            const allRehearsals = await this.getAll('rehearsals');
            let deletedRehearsalsCount = 0;
            let trimmedArchivedRehearsalsCount = 0;
            const archivedConfirmedRehearsals = [];
            const rehearsalsToDelete = [];

            for (const rehearsal of allRehearsals) {
                let shouldDelete = false;
                const confirmedDateValue = this.getRehearsalConfirmedDateValue(rehearsal);

                if (rehearsal.status === 'confirmed' && confirmedDateValue && this.isPastCalendarDay(confirmedDateValue, today)) {
                    archivedConfirmedRehearsals.push(rehearsal);
                    continue;
                }

                // Check unconfirmed rehearsals - delete if ALL proposed dates are in the past
                if (rehearsal.proposedDates && Array.isArray(rehearsal.proposedDates) && rehearsal.proposedDates.length > 0) {
                    const allDatesInPast = rehearsal.proposedDates.every(dateStr => {
                        const proposedDateValue = typeof dateStr === 'string'
                            ? dateStr
                            : dateStr?.startTime || dateStr?.start || '';
                        return proposedDateValue ? this.isPastCalendarDay(proposedDateValue, today) : false;
                    });

                    if (allDatesInPast) {
                        shouldDelete = true;
                    }
                }

                if (shouldDelete) {
                    await this.deleteRehearsal(rehearsal.id);
                    deletedRehearsalsCount++;
                }
            }

            const staleArchivedRehearsals = archivedConfirmedRehearsals
                .sort((a, b) => {
                    const dateA = this.getRehearsalConfirmedDateValue(a) || '';
                    const dateB = this.getRehearsalConfirmedDateValue(b) || '';
                    return new Date(dateB) - new Date(dateA);
                })
                .slice(20);

            for (const rehearsal of staleArchivedRehearsals) {
                await this.deleteRehearsal(rehearsal.id);
                trimmedArchivedRehearsalsCount++;
            }

            if (deletedEventsCount > 0 || deletedRehearsalsCount > 0 || trimmedArchivedEventsCount > 0 || trimmedArchivedRehearsalsCount > 0) {
                Logger.info(`Cleanup complete: ${deletedEventsCount} events deleted, ${trimmedArchivedEventsCount} archived events trimmed, ${deletedRehearsalsCount} rehearsals deleted and ${trimmedArchivedRehearsalsCount} archived rehearsals trimmed`);
            }

            return {
                deletedEventsCount,
                deletedRehearsalsCount,
                trimmedArchivedEventsCount,
                trimmedArchivedRehearsalsCount
            };
        } catch (error) {
            Logger.error('Error during cleanup:', error);
            return {
                deletedEventsCount: 0,
                deletedRehearsalsCount: 0,
                trimmedArchivedEventsCount: 0,
                trimmedArchivedRehearsalsCount: 0
            };
        } finally {
            this.lastPastItemsCleanupAt = Date.now();
            this.pastItemsCleanupPromise = null;
        }
        })();

        return this.pastItemsCleanupPromise;
    },

    // Bandrider operations
    async getBandRider(bandId) {
        if (!bandId) return null;
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('bandRiders')
            .select('*')
            .eq('bandId', bandId)
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            Logger.error('Supabase getBandRider error', error);
            return null;
        }

        return data || null;
    },

    async createOrUpdateBandRider(bandId, riderData) {
        if (!bandId) throw new Error('bandId erforderlich');

        const sb = SupabaseClient.getClient();

        // Prüfe ob bereits ein Rider existiert
        const existing = await this.getBandRider(bandId);

        const riderPayload = {
            bandId,
            members: riderData.members || {},
            updatedAt: new Date().toISOString()
        };

        if (existing) {
            // Update existing rider
            const { data, error } = await sb
                .from('bandRiders')
                .update(riderPayload)
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                Logger.error('Supabase createOrUpdateBandRider update error', error);
                throw error;
            }
            return data;
        } else {
            // Create new rider
            riderPayload.id = this.generateId();
            riderPayload.createdAt = new Date().toISOString();

            const { data, error } = await sb
                .from('bandRiders')
                .insert([riderPayload])
                .select()
                .single();

            if (error) {
                Logger.error('Supabase createOrUpdateBandRider insert error', error);
                throw error;
            }
            return data;
        }
    },

    async deleteBandRider(bandId) {
        if (!bandId) return false;
        const sb = SupabaseClient.getClient();
        const { error } = await sb
            .from('bandRiders')
            .delete()
            .eq('bandId', bandId);

        if (error) {
            Logger.error('Supabase deleteBandRider error', error);
            return false;
        }
        return true;
    },

    // Calendar operations
    async createCalendar(calendarData) {
        const calendar = {
            id: this.generateId(),
            ...calendarData,
            created_at: new Date().toISOString()
        };

        try {
            const sb = SupabaseClient.getClient();
            if (!sb || !sb.supabaseUrl || !sb.supabaseKey) {
                throw new Error('Supabase Client nicht korrekt initialisiert (URL/Key fehlen).');
            }

            // Create a timeout signal
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(`${sb.supabaseUrl}/rest/v1/calendars`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': sb.supabaseKey,
                    'Authorization': `Bearer ${sb.supabaseKey}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(calendar),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            this.calendarsCache = null; // Invalidate cache
            return Array.isArray(result) ? result[0] : result;
        } catch (error) {
            Logger.error('Storage.createCalendar error', error);
            if (error.name === 'AbortError') {
                throw new Error('Zeitüberschreitung beim Speichern (Timeout).');
            }
            throw error;
        }
    },

    async getAllCalendars() {
        if (this.calendarsCache && (Date.now() - this.calendarsCacheTimestamp < this.CACHE_DURATION)) {
            return this.calendarsCache;
        }

        try {
            const sb = SupabaseClient.getClient();
            const supabaseUrl = sb.supabaseUrl;
            const supabaseKey = sb.supabaseKey;

            const response = await fetch(`${supabaseUrl}/rest/v1/calendars?select=*`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error('Storage.getAllCalendars error', errorText);
                return [];
            }

            const data = await response.json();
            this.calendarsCache = data;
            this.calendarsCacheTimestamp = Date.now();

            return data;
        } catch (error) {
            Logger.error('[Storage.getAllCalendars] Fetch error:', error);
            return [];
        }
    },

    async getCalendar(calendarId) {
        try {
            const sb = SupabaseClient.getClient();
            const response = await fetch(`${sb.supabaseUrl}/rest/v1/calendars?id=eq.${calendarId}&select=*`, {
                headers: {
                    'apikey': sb.supabaseKey,
                    'Authorization': `Bearer ${sb.supabaseKey}`
                }
            });
            const data = await response.json();
            return Array.isArray(data) ? data[0] : data;
        } catch (error) {
            Logger.error('Storage.getCalendar error', error);
            return null;
        }
    },

    async updateCalendar(calendarId, updates) {
        try {
            const sb = SupabaseClient.getClient();
            const response = await fetch(`${sb.supabaseUrl}/rest/v1/calendars?id=eq.${calendarId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': sb.supabaseKey,
                    'Authorization': `Bearer ${sb.supabaseKey}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(updates)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            this.calendarsCache = null; // Invalidate cache
            return Array.isArray(data) ? data[0] : data;
        } catch (error) {
            Logger.error('Storage.updateCalendar error', error);
            throw error;
        }
    },

    async deleteCalendar(calendarId) {
        Logger.info('[Storage.deleteCalendar] Using direct REST API call for:', calendarId);
        try {
            const sb = SupabaseClient.getClient();
            const response = await fetch(`${sb.supabaseUrl}/rest/v1/calendars?id=eq.${calendarId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': sb.supabaseKey,
                    'Authorization': `Bearer ${sb.supabaseKey}`
                }
            });
            Logger.info('[Storage.deleteCalendar] Response status:', response.status, 'OK:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                Logger.error('[Storage.deleteCalendar] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            Logger.info('[Storage.deleteCalendar] Calendar deleted successfully');

            this.calendarsCache = null; // Invalidate cache

            return response.ok;
        } catch (error) {
            Logger.error('[Storage.deleteCalendar] Error:', error);
            throw error;
        }
    },
};

// Initialize storage on load
(async () => {
    await Storage.init();
})();
