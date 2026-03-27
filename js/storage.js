// (removed duplicate top-level async deleteUser)
// Storage Module - Supabase-only (no localStorage fallback)

const Storage = {
    calendarsCache: null,
    calendarsCacheTimestamp: 0,
    locationsCache: null,
    locationsCacheTimestamp: 0,
    CACHE_DURATION: 300000, // 5 Minutes
    SONG_CHORDPRO_MARKER: '[[CHORDPRO]]',
    SONG_CHORDPRO_PREVIEW_LABEL: 'ChordPro hinterlegt',
    songChordProSaveField: null,
    SONG_CHORDPRO_FIELD_STORAGE_KEY: 'bandplanning.songChordProSaveField',

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

    getSongChordProSaveFieldPreference() {
        if (this.songChordProSaveField) return this.songChordProSaveField;

        try {
            const storedField = localStorage.getItem(this.SONG_CHORDPRO_FIELD_STORAGE_KEY);
            if (storedField) {
                this.songChordProSaveField = storedField;
            }
        } catch (err) {
            console.warn('[Storage] Could not read ChordPro save field preference:', err);
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
            console.warn('[Storage] Could not persist ChordPro save field preference:', err);
        }
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
            console.error('Supabase getAll error', key, error);
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
            console.error('Supabase getById error', key, { message: error.message, code: error.code, details: error.details, hint: error.hint } || error);
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
                console.error(`Supabase getBatchByIds error in ${key}`, error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn(`Netzwerkproblem beim Laden von ${key} (Batch-Catch)`);
            } else {
                console.error(`Unexpected error in getBatchByIds (${key}):`, err);
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
            console.error('Supabase update error', key, error);
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
            console.error('Supabase delete error', key, error);
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
        if (error) { console.error('Supabase getUserByUsername error', error); return null; }
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
        if (error) { console.error('Supabase getUserByEmail error', error); return null; }
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
        if (error) { console.error('Supabase getBandByJoinCode error', error); return null; }
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
        if (error) { console.error('Supabase getBandMembers error', error); return []; }
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
                console.error('Supabase getUserBands error', error);
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
                console.error('[Storage] Unexpected error in getUserBands:', err);
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

        if (error) { console.error('Supabase getUserRoleInBand error', error); return null; }
        return data ? data.role : null;
    },

    async updateBandMemberRole(bandId, userId, newRole) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from('bandMembers').update({ role: newRole }).eq('bandId', bandId).eq('userId', userId);
        if (error) { console.error('Supabase updateBandMemberRole error', error); return false; }
        return true;
    },

    async removeBandMember(bandId, userId) {
        const sb = SupabaseClient.getClient();
        const { error } = await sb.from('bandMembers').delete().eq('bandId', bandId).eq('userId', userId);
        if (error) { console.error('Supabase removeBandMember error', error); return false; }
        return true;
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
        if (error) { console.error('Supabase getBandEvents error', error); return []; }
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
                console.error('Supabase getUserEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Auftritte (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getUserEvents:', err);
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
        if (error) { console.error('Supabase getBandRehearsals error', error); return []; }
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
                console.error('Supabase getUserRehearsals error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Probetermine (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getUserRehearsals:', err);
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
        if (error) { console.error('Supabase getRehearsalVotes error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getRehearsalVotesForMultipleRehearsals(rehearsalIds) {
        if (!rehearsalIds || rehearsalIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('votes')
            .select('*')
            .in('rehearsalId', rehearsalIds);
        if (error) { console.error('Supabase getRehearsalVotesForMultipleRehearsals error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserVoteForDate(userId, rehearsalId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId).eq('dateIndex', dateIndex).limit(1).maybeSingle();
        if (error) { console.error('Supabase getUserVoteForDate error', error); return null; }
        return data ? this.normalizeVoteRecord(data) : null;
    },

    async getUserVotesForRehearsal(userId, rehearsalId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId);
        if (error) { console.error('Supabase getUserVotesForRehearsal error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserVotesForMultipleRehearsals(userId, rehearsalIds) {
        if (!rehearsalIds || rehearsalIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes')
            .select('*')
            .eq('userId', userId)
            .in('rehearsalId', rehearsalIds);
        if (error) { console.error('Supabase getUserVotesForMultipleRehearsals error', error); return []; }
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
        if (error) { console.error('Supabase getEventVotes error', error); return []; }
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
                console.error('Supabase getEventVotesForMultipleEvents error', error);
                return [];
            }
            return (data || []).map(vote => this.normalizeVoteRecord(vote));
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Event-Stimmen (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getEventVotesForMultipleEvents:', err);
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
        if (error) { console.error('Supabase getUserEventVoteForDate error', error); return null; }
        return data ? this.normalizeVoteRecord(data) : null;
    },

    async getUserEventVotes(userId, eventId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes').select('*').eq('userId', userId).eq('eventId', eventId);
        if (error) { console.error('Supabase getUserEventVotes error', error); return []; }
        return (data || []).map(vote => this.normalizeVoteRecord(vote));
    },

    async getUserEventVotesForMultipleEvents(userId, eventIds) {
        if (!eventIds || eventIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('votes')
            .select('*')
            .eq('userId', userId)
            .in('eventId', eventIds);
        if (error) { console.error('Supabase getUserEventVotesForMultipleEvents error', error); return []; }
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
        if (error) { console.error('Supabase getEventTimeSuggestions error', error); return []; }
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
                console.error('Supabase getEventTimeSuggestionsForMultipleEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Zeitvorschläge (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getEventTimeSuggestionsForMultipleEvents:', err);
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
        if (error) { console.error('Supabase getUserEventTimeSuggestionForDate error', error); return null; }
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
        if (error) { console.error('Supabase getTimeSuggestionsForDate error', error); return []; }
        return data || [];
    },

    async getUserTimeSuggestionForDate(userId, rehearsalId, dateIndex) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('timeSuggestions').select('*').eq('userId', userId).eq('rehearsalId', rehearsalId).eq('dateIndex', dateIndex).limit(1).maybeSingle();
        if (error) { console.error('Supabase getUserTimeSuggestionForDate error', error); return null; }
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
    async createAbsence(userId, startDate, endDate, reason = '') {
        const absence = {
            id: this.generateId(),
            userId,
            startDate,
            endDate,
            reason,
            createdAt: new Date().toISOString()
        };
        return await this.save('absences', absence);
    },

    async getUserAbsences(userId) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason')
            .eq('userId', userId);
        if (error) { console.error('Supabase getUserAbsences error', error); return []; }
        return data || [];
    },

    async getAbsencesForUsers(userIds) {
        if (!userIds || userIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason')
            .in('userId', userIds);
        if (error) { console.error('Supabase getAbsencesForUsers error', error); return []; }
        return data || [];
    },


    async deleteAbsence(absenceId) {
        return await this.delete('absences', absenceId);
    },

    async isUserAbsentOnDate(userId, date) {
        const absences = await this.getUserAbsences(userId);
        const checkDate = new Date(date);
        return absences.some(a => {
            const start = new Date(a.startDate);
            const end = new Date(a.endDate);
            return checkDate >= start && checkDate <= end;
        });
    },

    async getAbsentUsersDuringRange(userIds, startDate, endDate) {
        if (!userIds || userIds.length === 0) return [];
        const sb = SupabaseClient.getClient();
        // Optimized columns
        const { data, error } = await sb
            .from('absences')
            .select('id, userId, startDate, endDate, reason')
            .in('userId', userIds);

        if (error) { console.error('Supabase getAbsentUsersDuringRange error', error); return []; }

        const absences = data || [];
        const rangeStart = new Date(startDate);
        const rangeEnd = new Date(endDate);

        return absences.filter(a => {
            const absStart = new Date(a.startDate);
            const absEnd = new Date(a.endDate);
            return (absStart <= rangeEnd && absEnd >= rangeStart);
        });
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
                console.error('Supabase getLatestNews error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der News (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getLatestNews:', err);
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
        if (markerIndex === -1) return '';

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

    // Song operations
    async createSong(songData) {
        const song = {
            id: this.generateId(),
            ...songData,
            createdAt: new Date().toISOString()
        };
        return await this.save('songs', song);
    },

    async getEventSongs(eventId) {
        const sb = SupabaseClient.getClient();
        // Optimized: Reverted to * due to unknown duration column name
        const { data, error } = await sb
            .from('songs')
            .select('*')
            .eq('eventId', eventId);

        if (error) { console.error('Supabase getEventSongs error', error); return []; }
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
                console.error('Supabase getEventSongsForMultipleEvents error', error);
                return [];
            }
            return data || [];
        } catch (err) {
            if (this._isNetworkError(err)) {
                Logger.warn('Netzwerkproblem beim Laden der Setlists (Catch)');
            } else {
                console.error('[Storage] Unexpected error in getEventSongsForMultipleEvents:', err);
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

        if (error) { console.error('Supabase getBandSongs error', error); return []; }
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
            console.error('Supabase getBandSongChoices error', error);
            throw new Error(error.message || 'Songs konnten nicht geladen werden.');
        }

        return (data || []).map(song => ({
            id: song.id,
            title: song.title || 'Ohne Titel'
        }));
    },

    async updateSong(songId, updates) {
        return await this.update('songs', songId, updates);
    },

    async saveChordProToSong(songId, chordProText) {
        const sb = SupabaseClient.getClient();
        const cleanChordPro = typeof chordProText === 'string' ? chordProText.trim() : '';
        if (!songId) throw new Error('Kein Song zum Speichern ausgewählt.');
        if (!cleanChordPro) throw new Error('Es ist noch kein ChordPro-Inhalt vorhanden.');

        const candidateFields = [
            'chordpro',
            'chord_pro',
            'chordPro',
            'chordpro_text',
            'chordProText',
            'lyrics',
            'content',
            'songText',
            'text'
        ];

        const updateField = async (field, value) => {
            const payload = {};
            payload[field] = value;
            return await sb
                .from('songs')
                .update(payload)
                .eq('id', songId)
                .select('*')
                .maybeSingle();
        };

        const preferredField = this.getSongChordProSaveFieldPreference();
        const preferredFields = preferredField
            ? [this.songChordProSaveField]
            : [];

        const fieldsToTry = [
            ...preferredFields,
            ...candidateFields.filter(field => field !== this.songChordProSaveField)
        ];

        for (const field of fieldsToTry) {
            const { data, error } = await updateField(field, cleanChordPro);
            if (!error) {
                this.setSongChordProSaveFieldPreference(field);
                return { field, usedInfoFallback: false, song: data || null };
            }

            const isSchemaCacheMiss = error.code === 'PGRST204' ||
                error.code === '42703' ||
                (error.message && error.message.includes(`'${field}' column`));

            if (isSchemaCacheMiss) {
                if (this.songChordProSaveField === field) {
                    this.setSongChordProSaveFieldPreference(null);
                }
                continue;
            }

            if (this._isNetworkError(error)) {
                throw new Error('Netzwerkproblem beim Speichern des ChordPro-Inhalts.');
            }

            throw new Error(error.message || 'ChordPro konnte nicht gespeichert werden.');
        }

        const existingSong = await this.getById('songs', songId);
        if (!existingSong) {
            throw new Error('Der ausgewählte Song wurde nicht gefunden.');
        }

        const mergedInfo = this.composeSongInfoWithChordPro(this.getSongPlainInfo(existingSong), cleanChordPro);
        const { data, error } = await updateField('info', mergedInfo);

        if (error) {
            if (this._isNetworkError(error)) {
                throw new Error('Netzwerkproblem beim Speichern des ChordPro-Inhalts.');
            }
            throw new Error(error.message || 'ChordPro konnte nicht gespeichert werden.');
        }

        this.setSongChordProSaveFieldPreference('info');
        return { field: 'info', usedInfoFallback: true, song: data || null };
    },

    async deleteSong(songId) {
        return await this.delete('songs', songId);
    },

    // Settings operations
    async getSetting(key) {
        const sb = SupabaseClient.getClient();
        const { data, error } = await sb.from('settings').select('value').eq('key', key).limit(1).maybeSingle();
        if (error) { console.error('Supabase getSetting error', key, error); return null; }
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
                console.error('Supabase setSetting update error', key, error);
                throw new Error(`Fehler beim Aktualisieren der Einstellung: ${error.message}`);
            }
        } else {
            // Insert new
            const { error } = await sb.from('settings').insert({ id, key, value });
            if (error) {
                console.error('Supabase setSetting insert error', key, error);
                throw new Error(`Fehler beim Speichern der Einstellung: ${error.message}`);
            }
        }
        return true;
    },

    // Cleanup operations
    async cleanupPastItems() {
        try {
            const now = new Date();
            now.setHours(0, 0, 0, 0); // Set to start of today

            // Clean up past events
            const allEvents = await this.getAll('events');
            let deletedEventsCount = 0;

            for (const event of allEvents) {
                if (event.date) {
                    const eventDate = new Date(event.date);
                    eventDate.setHours(0, 0, 0, 0);

                    if (eventDate < now) {
                        await this.deleteEvent(event.id);
                        deletedEventsCount++;
                    }
                }
            }

            // Clean up past rehearsals
            const allRehearsals = await this.getAll('rehearsals');
            let deletedRehearsalsCount = 0;

            for (const rehearsal of allRehearsals) {
                let shouldDelete = false;

                // Check confirmed rehearsals with finalDate
                if (rehearsal.finalDate) {
                    const rehearsalDate = new Date(rehearsal.finalDate);
                    rehearsalDate.setHours(0, 0, 0, 0);

                    if (rehearsalDate < now) {
                        shouldDelete = true;
                    }
                }
                // Check unconfirmed rehearsals - delete if ALL proposed dates are in the past
                else if (rehearsal.proposedDates && Array.isArray(rehearsal.proposedDates) && rehearsal.proposedDates.length > 0) {
                    const allDatesInPast = rehearsal.proposedDates.every(dateStr => {
                        const proposedDate = new Date(dateStr);
                        proposedDate.setHours(0, 0, 0, 0);
                        return proposedDate < now;
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

            if (deletedEventsCount > 0 || deletedRehearsalsCount > 0) {
                Logger.info(`Cleanup complete: ${deletedEventsCount} events and ${deletedRehearsalsCount} rehearsals deleted`);
            }

            return { deletedEventsCount, deletedRehearsalsCount };
        } catch (error) {
            Logger.error('Error during cleanup:', error);
            return { deletedEventsCount: 0, deletedRehearsalsCount: 0 };
        }
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
            console.error('[Storage.getAllCalendars] Fetch error:', error);
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
        console.log('[Storage.deleteCalendar] Using direct REST API call for:', calendarId);
        try {
            const sb = SupabaseClient.getClient();
            const response = await fetch(`${sb.supabaseUrl}/rest/v1/calendars?id=eq.${calendarId}`, {
                method: 'DELETE',
                headers: {
                    'apikey': sb.supabaseKey,
                    'Authorization': `Bearer ${sb.supabaseKey}`
                }
            });
            console.log('[Storage.deleteCalendar] Response status:', response.status, 'OK:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Storage.deleteCalendar] Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            console.log('[Storage.deleteCalendar] Calendar deleted successfully');

            this.calendarsCache = null; // Invalidate cache

            return response.ok;
        } catch (error) {
            console.error('[Storage.deleteCalendar] Error:', error);
            throw error;
        }
    },
};

// Initialize storage on load
(async () => {
    await Storage.init();
})();
