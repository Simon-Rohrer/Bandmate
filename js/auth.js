// (removed duplicate top-level async deleteCurrentUser)
// Authentication Module with Supabase Auth

const Auth = {

    currentUser: null,
    supabaseUser: null, // Supabase auth.users record

    // Löscht den aktuell eingeloggten User aus Supabase Auth
    async deleteCurrentUser() {
        const sb = SupabaseClient.getClient();
        if (!sb) return;

        // NOTE: Deleting the 'auth.users' record directly from the client is not allowed (405 Method Not Allowed)
        // and requires a Service Role key or a Postgres Function (RPC).
        // We rely on the fact that we already deleted the public user data in 'handleDeleteAccount'.
        // Ideally, a Supabase Database Trigger should be set up: "ON DELETE public.users -> DELETE auth.users"

        // Attempt to call a common RPC if it exists, otherwise just proceed
        try {
            await sb.rpc('delete_user');
        } catch (e) {
            console.warn('RPC delete_user not available or failed', e);
        }

        this.currentUser = null;
        this.supabaseUser = null;
    },

    async init() {
        if (this.initialized) {
            console.log('[Auth.init] Already initialized, skipping');
            return;
        }
        this.initialized = true;

        // Set the single valid registration code
        const validCode = 'c2j5Dps!';
        localStorage.setItem('registrationCodes', JSON.stringify([validCode]));
        this.validRegistrationCodes = [validCode];

        // Check for existing Supabase session
        const sb = SupabaseClient.getClient();
        if (sb) {
            if (SupabaseClient.isStoredSessionExpired()) {
                SupabaseClient.clearStoredAuthSession();
            }
            try {
                const { data, error } = await sb.auth.getSession();
                if (error) {
                    console.warn('[Auth.init] Supabase session check error:', error);
                } else if (data && data.session) {
                    await this.setCurrentUser(data.session.user);
                }
            } catch (err) {
                console.error('[Auth.init] Failed to get Supabase session (likely AbortError or network issue):', err);
                // Proceed as logged out, do not crash
            }
        }

        // Listen for auth state changes
        if (sb) {
            sb.auth.onAuthStateChange(async (event, session) => {
                Logger.info('Auth State Changed', event);
                if (event === 'SIGNED_IN' && session) {
                    await this.setCurrentUser(session.user);
                } else if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                    this.supabaseUser = null;
                } else if (event === 'PASSWORD_RECOVERY') {
                    // Only trigger if URL actually contains recovery token
                    if (window.location.hash && window.location.hash.includes('type=recovery')) {
                        console.log('Password recovery mode detected via URL (auth.js)');

                        // Clear hash IMMEDIATELY and AGGRESSIVELY
                        try {
                            history.replaceState(null, null, window.location.pathname + window.location.search);
                            // Fallback for some mobile WebViews
                            if (window.location.hash) {
                                window.location.hash = '';
                            }
                        } catch (e) {
                            window.location.hash = '';
                        }

                        // Dispatch immediately, no timeout to avoid race conditions with showApp
                        window.dispatchEvent(new CustomEvent('auth:password_recovery'));
                    } else {
                        console.log('Ignoring PASSWORD_RECOVERY event (no type=recovery in URL)');
                    }
                }
            });
        }
    },

    async setCurrentUser(supabaseAuthUser) {
        this.supabaseUser = supabaseAuthUser;
        // Load profile from users table
        const profile = await Storage.getById('users', supabaseAuthUser.id);
        // console.log('[Auth.setCurrentUser] Profile from storage:', profile);

        if (profile) {
            this.currentUser = profile;
        } else {
            console.warn('[Auth.setCurrentUser] Profile not found in storage, using fallback');
            this.currentUser = {
                id: supabaseAuthUser.id,
                email: supabaseAuthUser.email,
                username: supabaseAuthUser.user_metadata?.username || supabaseAuthUser.email.split('@')[0],
                first_name: supabaseAuthUser.user_metadata?.first_name || '',
                last_name: supabaseAuthUser.user_metadata?.last_name || '',
                name: supabaseAuthUser.user_metadata?.name || supabaseAuthUser.email.split('@')[0],
                isAdmin: false // Explicitly set to false in fallback if unknown
            };
        }
        // console.log('[Auth.setCurrentUser] Final currentUser:', JSON.stringify(this.currentUser, null, 2));

    },

    async register(registrationCode, firstName, lastName, email, username, password, instrument = "") {
        // Validate registration code first
        if (!registrationCode) {
            throw new Error('Registrierungscode ist erforderlich');
        }

        // Check if code is valid (exact match)
        const validCodes = JSON.parse(localStorage.getItem('registrationCodes') || '[]');
        if (!validCodes.includes(registrationCode)) {
            throw new Error('Ungültiger Registrierungscode');
        }

        // Validate inputs
        if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !username?.trim() || !password) {
            throw new Error('Alle Felder sind erforderlich');
        }

        // Validate password length
        if (password.length < 6) {
            throw new Error('Passwort muss mindestens 6 Zeichen lang sein');
        }

        // Check if username already exists
        const existingUser = await Storage.getUserByUsername(username);
        if (existingUser) {
            throw new Error('Benutzername bereits vergeben');
        }

        const sb = SupabaseClient.getClient();
        if (!sb) {
            throw new Error('Supabase nicht konfiguriert');
        }

        // Sign up with Supabase Auth
        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                    first_name: firstName,
                    last_name: lastName,
                    instrument
                }
            }
        });

        if (error) {
            console.error('Supabase signUp error:', error);

            // CRITICAL FIX: Supabase may throw "Database error saving new user" 
            // but the user is still created successfully. Only fail if there's 
            // no user data returned.
            if (!data || !data.user) {
                // User-friendly error messages
                if (error.message.includes('User already registered') || error.message.includes('already been registered')) {
                    throw new Error('Diese E-Mail-Adresse ist bereits registriert. Bitte logge dich ein oder verwende eine andere E-Mail.');
                }
                throw new Error(error.message || 'Registrierung fehlgeschlagen');
            }

            // If we have user data despite the error, log it but continue
            console.warn('[Auth.register] Supabase reported error but user was created:', error.message);
        }

        // The user profile should be automatically created by the trigger
        // Wait for the trigger to complete, but if it fails, create manually
        if (data.user) {
            let profile = null;
            let attempts = 0;
            const maxAttempts = 3; // Reduced from 5 to fail faster

            // Try to wait for trigger-created profile
            while (!profile && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 400));
                profile = await Storage.getById('users', data.user.id);
                attempts++;
            }

            // If trigger didn't create profile, create it manually as fallback
            if (!profile) {
                console.log('[Auth.register] Trigger did not create profile, creating manually...');
                try {
                    const fullName = `${firstName} ${lastName}`;
                    profile = await Storage.createUser({
                        id: data.user.id,
                        email: email,
                        username: username,
                        name: fullName,
                        instrument: instrument || '',
                        isAdmin: false
                    });
                    console.log('[Auth.register] Profile created manually:', profile);
                } catch (createError) {
                    console.error('[Auth.register] Failed to create profile manually:', createError);
                    throw new Error('Profil konnte nicht erstellt werden. Bitte lade die Seite neu und versuche dich einzuloggen.');
                }
            } else {
                console.log('[Auth.register] Profile created by trigger');
            }

            // Set the current user
            await this.setCurrentUser(data.user);
        }

        return data.user;
    },

    async createUserByAdmin(firstName, lastName, email, username, password, instrument = "") {
        console.log('[createUserByAdmin] Starting with:', { firstName, lastName, email, username, instrument });

        // Admin creates user without registration code
        if (!this.isAdmin()) {
            throw new Error('Nur Administratoren können neue Benutzer anlegen');
        }

        // Validate inputs
        if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !username?.trim() || !password) {
            throw new Error('Alle Felder sind erforderlich');
        }

        // Validate password length
        if (password.length < 6) {
            throw new Error('Passwort muss mindestens 6 Zeichen lang sein');
        }

        console.log('[createUserByAdmin] Checking if username exists...');
        const existingUser = await Storage.getUserByUsername(username);
        if (existingUser) {
            console.warn('[createUserByAdmin] Username exists:', existingUser);
            throw new Error('Benutzername bereits vergeben');
        }

        const sb = SupabaseClient.getClient();
        if (!sb) {
            throw new Error('Supabase nicht konfiguriert');
        }

        console.log('[createUserByAdmin] Creating user via isolated client...');

        try {
            // CRITICAL FIX: Use a separate, isolated Supabase client for the new user creation.
            // This prevents the main Admin session from being overwritten or cleared.
            // We configure it with NO storage persistence preventing side effects.

            const supabaseUrl = localStorage.getItem('supabase.url');
            const anonKey = localStorage.getItem('supabase.anonKey');

            if (!supabaseUrl || !anonKey || !window.supabase) {
                throw new Error('Supabase Configuration Missing');
            }

            // Create temporary client
            const tempClient = window.supabase.createClient(supabaseUrl, anonKey, {
                auth: {
                    persistSession: false, // Do not save session to localStorage
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            });

            // Sign up the new user on the isolated client
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username,
                        first_name: firstName,
                        last_name: lastName,
                        instrument
                    },
                    emailRedirectTo: undefined // Don't send confirmation email
                }
            });

            if (authError) {
                console.error('[createUserByAdmin] Auth error:', authError);
                throw new Error(authError.message || 'Benutzer konnte nicht erstellt werden');
            }

            const newUserId = authData.user?.id;
            console.log('[createUserByAdmin] User created with ID:', newUserId);

            // Clean up: Sign out variable client (just to be safe, though it's not persisted)
            await tempClient.auth.signOut();

            return newUserId;

        } catch (error) {
            console.error('[createUserByAdmin] Error:', error);
            throw error;
        }
    },

    async login(usernameOrEmail, password) {
        // Validate inputs
        if (!usernameOrEmail || !password) {
            throw new Error('Benutzername/E-Mail und Passwort sind erforderlich');
        }

        // Check if input is email or username
        let email = usernameOrEmail;
        // If it's not an email format, look up the email by username
        if (!usernameOrEmail.includes('@')) {
            const profile = await Storage.getUserByUsername(usernameOrEmail);
            if (!profile) {
                throw new Error('Ungültiger Benutzername oder Passwort');
            }
            email = profile.email;
        }

        const rememberMe = arguments.length > 2 ? arguments[2] : false;
        SupabaseClient.prepareSessionPersistence(rememberMe);

        const sb = SupabaseClient.getClient();
        if (!sb) {
            throw new Error('Supabase nicht konfiguriert');
        }

        // Sign in with Supabase Auth
        const { data, error } = await sb.auth.signInWithPassword({ email, password });

        // Force scroll reset on interaction
        window.scrollTo(0, 0);

        if (error) {
            console.error('Supabase signIn error:', error);
            throw new Error('Ungültiger Benutzername/E-Mail oder Passwort');
        }

        if (data.user) {
            SupabaseClient.setSessionExpiry(rememberMe);
            await this.setCurrentUser(data.user);
        }

        return this.currentUser;
    },

    async logout() {
        // Clear user state first
        this.currentUser = null;
        this.supabaseUser = null;

        // Clear any cached session data
        sessionStorage.removeItem('currentUser');
        SupabaseClient.clearStoredAuthSession();

        // Clear module-level caches to prevent data from persisting between users
        if (typeof Rehearsals !== 'undefined' && Rehearsals.clearCache) {
            Rehearsals.clearCache();
        }
        if (typeof PersonalCalendar !== 'undefined' && PersonalCalendar.clearCache) {
            PersonalCalendar.clearCache();
        }
        if (typeof Bands !== 'undefined' && Bands.clearCache) {
            Bands.clearCache();
        }
        if (typeof Statistics !== 'undefined' && Statistics.clearCache) {
            Statistics.clearCache();
        }
        if (typeof App !== 'undefined' && App.clearCache) {
            App.clearCache();
        }

        // Sign out from Supabase
        const sb = SupabaseClient.getClient();
        if (sb) {
            const { error } = await sb.auth.signOut();
            if (error) {
                console.error('Supabase signOut error:', error);
            }
        }

        console.log('[Auth.logout] User logged out and all caches cleared');
    },

    isAuthenticated() {
        if (SupabaseClient.isStoredSessionExpired()) {
            this.currentUser = null;
            this.supabaseUser = null;
            SupabaseClient.clearStoredAuthSession();
            const sb = SupabaseClient.getClient();
            if (sb) {
                sb.auth.signOut().catch(err => console.warn('[Auth.isAuthenticated] Sign-out after expiry failed:', err));
            }
        }
        return this.currentUser !== null;
    },

    getCurrentUser() {
        if (SupabaseClient.isStoredSessionExpired()) {
            this.currentUser = null;
            this.supabaseUser = null;
            SupabaseClient.clearStoredAuthSession();
            return null;
        }
        // Return profile with Supabase auth ID
        return this.currentUser;
    },

    getSupabaseUser() {
        if (SupabaseClient.isStoredSessionExpired()) {
            this.currentUser = null;
            this.supabaseUser = null;
            SupabaseClient.clearStoredAuthSession();
            return null;
        }
        return this.supabaseUser;
    },

    async updateCurrentUser() {
        if (this.currentUser) {
            const updatedUser = await Storage.getById('users', this.currentUser.id);
            this.currentUser = updatedUser;
            sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
        }
    },

    // Check if user is admin
    isAdmin() {
        return this.currentUser && this.currentUser.isAdmin === true;
    },

    // Check if user can create bands (everyone can)
    canCreateBand() {
        return true;
    },

    // Check if user can manage band (admin or leader)
    async canManageBand(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader';
    },

    // Check if user can change roles (admin or leader)
    async canChangeRoles(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader';
    },

    // Check if user can propose/edit rehearsals (leader or co-leader)
    async canProposeRehearsal(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader' || role === 'co-leader';
    },

    // Check if user can confirm rehearsals (leader or co-leader)
    async canConfirmRehearsal(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader' || role === 'co-leader';
    },

    // Check if user can edit band details (leader or co-leader)
    async canEditBandDetails(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader' || role === 'co-leader';
    },

    // Check if user can manage events (leader or co-leader)
    async canManageEvents(bandId) {
        if (!this.currentUser) return false;
        if (this.isAdmin()) return true;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role === 'leader' || role === 'co-leader';
    },

    // Check if user is member of band
    async isMemberOfBand(bandId) {
        if (!this.currentUser) return false;
        const role = await Storage.getUserRoleInBand(this.currentUser.id, bandId);
        return role !== null;
    },

    // Get role display with hierarchy
    getRoleHierarchy(role) {
        const hierarchy = {
            'admin': 1,
            'leader': 2,
            'co-leader': 3,
            'member': 4
        };
        return hierarchy[role] || 999;
    },

    // Password Reset Flow
    async requestPasswordReset(email) {
        const sb = SupabaseClient.getClient();
        if (!sb) throw new Error('Supabase client missing');

        // Redirect to the dedicated reset-password.html page
        let baseUrl = window.location.origin + window.location.pathname;
        if (baseUrl.endsWith('index.html')) {
            baseUrl = baseUrl.replace('index.html', 'reset-password.html');
        } else {
            // If it ends with / or something else, ensure it points to reset-password.html
            baseUrl = baseUrl.endsWith('/') ? baseUrl + 'reset-password.html' : baseUrl + '/reset-password.html';
        }
        const redirectTo = baseUrl;

        const { data, error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: redirectTo
        });

        if (error) throw error;
        return data;
    },

    async updatePassword(newPassword) {
        const sb = SupabaseClient.getClient();
        if (!sb) throw new Error('Supabase client missing');

        const { data, error } = await sb.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return data;
    }
};

// Initialize auth on load
// Auth.init() is now called by App.init() in app.js
// Auth.init();
