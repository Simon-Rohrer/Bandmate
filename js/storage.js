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
        if (error) console.warn('[Songpool] Raw Error Detail:', error);

        if (this._isMissingSongpoolTableError(error)) {
            return 'Die Songpool-Tabelle fehlt noch. Bitte zuerst das SQL aus "sql/songpool_setup.sql" in Supabase ausführen.';
        }
        if (this._isNetworkError(error)) {
            return 'Netzwerkproblem beim Laden des Songpools.';
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
            console.error('Supabase getPendingBandMembershipRequest error', error);
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
            console.error('Supabase getPendingMembershipRequestsForUserContext self error', selfError);
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
                console.error('Supabase getPendingMembershipRequestsForUserContext leader error', leaderError);
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
            console.error('Supabase getBandLeadershipMembers error', error);
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
            console.error('Supabase getNotificationsForUser error', error);
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
            console.error('Supabase getUnreadNotificationCount error', error);
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
            console.error('Supabase markNotificationsRead error', error);
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
            console.error('Supabase dismissNotification error', error);
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
            console.error('Supabase updateNotificationsByRequest error', error);
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
            console.error('Supabase getNotificationsByRequest error', error);
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
            console.warn('[Storage] Could not parse song pdf path:', error);
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
            console.warn('[Storage] Song pdf reference lookup failed in songs:', songsError);
        }

        if (songpoolError && !this._isMissingSongpoolTableError(songpoolError)) {
            console.warn('[Storage] Song pdf reference lookup failed in songpool_songs:', songpoolError);
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
            console.warn('[Storage] Song pdf cleanup failed:', error);
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

    async deleteSongpoolSong(songId) {
        const existingSong = await this.getSongpoolSong(songId);
        const sb = SupabaseClient.getClient();
        const { error } = await sb
            .from('songpool_songs')
            .delete()
            .eq('id', songId);

        if (error) {
            throw new Error(this._getSongpoolErrorMessage(error, 'Songpool-Song konnte nicht gelöscht werden.'));
        }

        if (existingSong?.pdf_url) {
            await this.cleanupSongPdfStorage(existingSong.pdf_url);
        }

        return true;
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
                console.warn('External song autofill search failed:', externalError);
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
            console.error('Song autofill search failed:', error);
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
            console.error('Storage.createRundownTemplate error', error);
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
            console.error('Storage.getRundownTemplates error', error);
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
            console.error('Storage.deleteRundownTemplate error', error);
            throw new Error(error.message || 'Vorlage konnte nicht gelöscht werden.');
        }
        return true;
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

            for (const event of allEvents) {
                if (!event?.date || !this.isPastCalendarDay(event.date, today)) {
                    continue;
                }

                if (event.status === 'confirmed') {
                    archivedConfirmedEvents.push(event);
                    continue;
                }

                await this.deleteEvent(event.id);
                deletedEventsCount++;
            }

            const staleArchivedEvents = archivedConfirmedEvents
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(20);

            for (const event of staleArchivedEvents) {
                await this.deleteEvent(event.id);
                trimmedArchivedEventsCount++;
            }

            // Clean up past rehearsals
            const allRehearsals = await this.getAll('rehearsals');
            let deletedRehearsalsCount = 0;
            let trimmedArchivedRehearsalsCount = 0;
            const archivedConfirmedRehearsals = [];

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
