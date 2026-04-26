// ChurchTools API Integration Module

const ChurchToolsAPI = {
    // Configuration
    config: {
        apiUrl: 'https://jms-altensteig.church.tools/api',
        apiToken: '', // Will be set in settings
        calendarId: null,
        groupId: 2445 // Musikpool group ID
    },

    // Initialize API connection
    init(apiUrl, apiToken) {
        this.config.apiUrl = apiUrl || 'https://jms-altensteig.church.tools/api';
        this.config.apiToken = apiToken;
    },

    // Set calendar ID for syncing
    setCalendar(calendarId) {
        this.config.calendarId = calendarId;
    },

    // Fetch group members from ChurchTools
    async fetchGroupMembers(groupId = null) {
        const targetGroupId = groupId || this.config.groupId;
        
        try {
            const url = `${this.config.apiUrl}/groups/${targetGroupId}/members`;
            
            const headers = {
                'Accept': 'application/json'
            };
            
            // Add auth token if available
            if (this.config.apiToken) {
                headers['Authorization'] = `Login ${this.config.apiToken}`;
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            // ChurchTools API returns data in result.data
            return {
                success: true,
                members: result.data || [],
                meta: result.meta || {}
            };
            
        } catch (error) {
            Logger.error('Error fetching group members:', error);
            return {
                success: false,
                error: error.message,
                members: []
            };
        }
    },

    // Fetch group details
    async fetchGroupDetails(groupId = null) {
        const targetGroupId = groupId || this.config.groupId;
        
        try {
            const url = `${this.config.apiUrl}/groups/${targetGroupId}`;
            
            const headers = {
                'Accept': 'application/json'
            };
            
            if (this.config.apiToken) {
                headers['Authorization'] = `Login ${this.config.apiToken}`;
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            return {
                success: true,
                group: result.data || {}
            };
            
        } catch (error) {
            Logger.error('Error fetching group details:', error);
            return {
                success: false,
                error: error.message,
                group: null
            };
        }
    },

    // Sync rehearsal to ChurchTools calendar
    async syncRehearsalToCalendar(rehearsal, selectedDateIndex) {
        // TODO: Implement ChurchTools API integration
        // This is a placeholder for future implementation

        Logger.info('ChurchTools sync prepared for:', {
            rehearsal,
            selectedDateIndex,
            config: this.config
        });

        // Future implementation will:
        // 1. Authenticate with ChurchTools API
        // 2. Create calendar event with rehearsal details
        // 3. Handle conflicts and updates
        // 4. Return event ID for tracking

        return {
            success: false,
            message: 'ChurchTools integration not yet implemented',
            eventId: null
        };
    },

    // Fetch events from ChurchTools
    async fetchCalendarEvents(startDate, endDate) {
        // TODO: Implement fetching events from ChurchTools
        Logger.info('Fetching ChurchTools events:', { startDate, endDate });

        return {
            success: false,
            events: [],
            message: 'ChurchTools integration not yet implemented'
        };
    },

    // Check for conflicts with existing calendar events
    async checkConflicts(proposedDates) {
        // TODO: Implement conflict detection
        Logger.info('Checking conflicts for dates:', proposedDates);

        return {
            success: false,
            conflicts: [],
            message: 'ChurchTools integration not yet implemented'
        };
    },

    // Update existing calendar event
    async updateCalendarEvent(eventId, updates) {
        // TODO: Implement event update
        Logger.info('Updating ChurchTools event:', { eventId, updates });

        return {
            success: false,
            message: 'ChurchTools integration not yet implemented'
        };
    },

    // Delete calendar event
    async deleteCalendarEvent(eventId) {
        // TODO: Implement event deletion
        Logger.info('Deleting ChurchTools event:', eventId);

        return {
            success: false,
            message: 'ChurchTools integration not yet implemented'
        };
    },

    // Test API connection
    async testConnection() {
        // TODO: Implement connection test
        Logger.info('Testing ChurchTools connection');

        return {
            success: false,
            message: 'ChurchTools integration not yet implemented'
        };
    }
};

// Example usage (for future implementation):
/*
// Initialize with ChurchTools credentials
ChurchToolsAPI.init('https://your-church.church.tools', 'your-api-token');
ChurchToolsAPI.setCalendar(123); // Calendar ID

// Sync a confirmed rehearsal
const result = await ChurchToolsAPI.syncRehearsalToCalendar(rehearsal, 0);
if (result.success) {
    Logger.info('Event created:', result.eventId);
}
*/
