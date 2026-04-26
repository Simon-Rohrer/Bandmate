
const FeedbackService = {
    /**
     * Submits a feedback or bug report to Supabase
     * @param {string} type - 'feedback' or 'bug'
     * @param {string} title - Short title (optional for feedback)
     * @param {string} message - Detailed message
     * @returns {Promise<object>} - Result from Supabase
     */
    async submitFeedback(type, title, message) {
        const user = Auth.getCurrentUser();
        if (!user) {
            throw new Error('Du musst eingeloggt sein, um Feedback zu senden.');
        }

        const sb = SupabaseClient.getClient();
        if (!sb) {
            Logger.error('Supabase client not initialized');
            throw new Error('Verbindung zum Server fehlgeschlagen.');
        }

        // Prepare data payload
        const payload = {
            user_id: user.id,
            type: type,
            title: title || (type === 'feedback' ? 'User Feedback' : 'Bug Report'),
            message: message,
            status: 'open',
            metadata: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                location: window.location.href,
                timestamp: new Date().toISOString()
            }
        };

        const { data, error } = await sb
            .from('feedback')
            .insert([payload])
            .select();

        if (error) {
            Logger.error('Error submitting feedback:', error);
            throw new Error('Fehler beim Senden: ' + error.message);
        }

        return data;
    },

    /**
     * Fetch all feedback (Admin only)
     * @returns {Promise<Array>}
     */
    async getAllFeedback() {
        Logger.info('[FeedbackService] Getting all feedback (manual join)...');
        const sb = SupabaseClient.getClient();
        if (!sb) {
            Logger.error('[FeedbackService] No Supabase client');
            return [];
        }

        // 1. Fetch Feedback
        const { data: feedbacks, error } = await sb
            .from('feedback')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            Logger.error('Error fetching feedback:', error);
            throw new Error('Fehler beim Laden: ' + error.message);
        }

        if (!feedbacks || feedbacks.length === 0) return [];

        // 2. Fetch Users manually to avoid relationship errors
        try {
            // Get unique user IDs to fetch
            const userIds = [...new Set(feedbacks.map(f => f.user_id))];

            // Allow fetching users even if foreign key is missing in schema cache
            const { data: users, error: userError } = await sb
                .from('users')
                .select('id, email, username, first_name, last_name')
                .in('id', userIds);

            if (userError) {
                Logger.warn('[FeedbackService] Could not fetch users for join:', userError);
                return feedbacks; // Return without user details
            }

            // 3. Merge
            const userMap = new Map();
            users.forEach(u => userMap.set(u.id, u));

            return feedbacks.map(f => ({
                ...f,
                users: userMap.get(f.user_id) || null
            }));

        } catch (joinErr) {
            Logger.warn('[FeedbackService] Manual join failed:', joinErr);
            return feedbacks; // Fallback
        }
    },

    /**
     * Update status of a feedback item
     * @param {string} id 
     * @param {string} status 'open', 'resolved', 'closed'
     */
    async updateStatus(id, status) {
        const sb = SupabaseClient.getClient();
        if (!sb) throw new Error('No connection');

        const { data, error } = await sb
            .from('feedback')
            .update({ status: status })
            .eq('id', id)
            .select();

        if (error) {
            Logger.error('[FeedbackService] Update failed:', error);
            throw new Error('Status Fehler: ' + error.message);
        }

        // Check if row was actually updated (RLS might return no error but update 0 rows)
        if (!data || data.length === 0) {
            Logger.error('[FeedbackService] Update returned 0 rows. Likely RLS permission issue.');
            throw new Error('Fehler: Keine Berechtigung zum Aktualisieren oder Eintrag nicht gefunden.');
        }

        Logger.info('[FeedbackService] Status updated successfully:', data);
        return data;
    },

    /**
     * Delete a feedback item
     * @param {string} id 
     */
    async deleteFeedback(id) {
        const sb = SupabaseClient.getClient();
        if (!sb) throw new Error('No connection');

        const { data, error } = await sb
            .from('feedback')
            .delete()
            .eq('id', id)
            .select();

        if (error) {
            Logger.error('[FeedbackService] Delete failed:', error);
            throw new Error('Löschen fehlgeschlagen: ' + error.message);
        }

        // Check if row was actually deleted
        if (!data || data.length === 0) {
            Logger.error('[FeedbackService] Delete returned 0 rows. Likely RLS permission issue.');
            throw new Error('Fehler: Keine Berechtigung zum Löschen oder Eintrag nicht gefunden.');
        }

        return data;
    }
};
