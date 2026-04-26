// EmailJS Integration Module

const EmailService = {
    config: {
        serviceId: 'service_cadjeiq',
        templateId: 'template_l9a8mdf',
        publicKey: '5upXiXp5loj1iOMv7',
        isConfigured: true
    },

    init(serviceId, templateId, publicKey) {
        if (serviceId && templateId && publicKey) {
            this.config.serviceId = serviceId;
            this.config.templateId = templateId;
            this.config.publicKey = publicKey;
            this.config.isConfigured = true;
        } else {
            this.config.isConfigured = !!(this.config.serviceId && this.config.templateId && this.config.publicKey);
        }
    },

    isConfigured() {
        return this.config.isConfigured;
    },

    /**
     * Universal email function - works for any purpose
     * @param {string} toEmail - Recipient email
     * @param {string} toName - Recipient name
     * @param {string} subject - Email subject
     * @param {string} message - Main message text
     * @param {object} options - Optional parameters
     */
    async sendEmail(toEmail, toName, subject, message, options = {}) {
        if (!this.isConfigured()) {
            Logger.warn('EmailJS not configured. Skipping email send.');
            return {
                success: false,
                message: 'EmailJS ist nicht konfiguriert'
            };
        }

        try {
            if (typeof emailjs === 'undefined') {
                await this.loadEmailJS();
            }
            emailjs.init(this.config.publicKey);

            // Create HTML content
            const htmlMessage = this._getHtmlTemplate(subject, message, options);

            // Map to User's specific EmailJS template variables
            const templateParams = {
                user: toEmail,
                title: subject,
                content: htmlMessage, // Now sending HTML!
                name: 'Bandmate',
                email: 'noreply@bandplanning.local',
                to_name: toName
            };

            const response = await emailjs.send(
                this.config.serviceId,
                this.config.templateId,
                templateParams
            );

            return {
                success: true,
                message: 'E-Mail erfolgreich versendet',
                response
            };

        } catch (error) {
            Logger.error('EmailJS error:', error);
            return {
                success: false,
                message: 'Fehler beim Versenden der E-Mail: ' + error.message
            };
        }
    },

    /**
     * Generates a beautiful HTML template for emails
     * Uses inline-styles for maximum email client compatibility
     */
    _getHtmlTemplate(title, message, options = {}) {
        const primaryColor = '#6366f1';
        const bgColor = '#f1f5f9';
        const cardColor = '#ffffff';
        const textColor = '#1e293b';
        const secondaryTextColor = '#64748b';

        let detailsHtml = '';
        if (options.details && options.details.length > 0) {
            detailsHtml = `
                <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                    <h4 style="margin: 0 0 12px 0; color: ${textColor}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Details</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        ${options.details.map(d => `
                            <tr>
                                <td style="padding: 8px 0; color: ${secondaryTextColor}; font-size: 14px; width: 35%; vertical-align: top;">${d.label}</td>
                                <td style="padding: 8px 0 8px 12px; color: ${textColor}; font-size: 14px; font-weight: 600; vertical-align: top;">${d.value}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `;
        }

        let buttonHtml = '';
        if (options.buttonText && options.buttonLink) {
            buttonHtml = `
                <div style="margin-top: 32px; text-align: center;">
                    <a href="${options.buttonLink}" style="display: inline-block; padding: 12px 28px; background-color: ${primaryColor}; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">
                        ${options.buttonText}
                    </a>
                </div>
            `;
        }

        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${bgColor}; padding: 40px 10px; color: ${textColor}; line-height: 1.6;">
                <div style="max-width: 580px; margin: 0 auto; background-color: ${cardColor}; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    <!-- Decorative Top Bar -->
                    <div style="height: 6px; background-color: ${primaryColor};"></div>
                    
                    <!-- Header -->
                    <div style="padding: 32px 32px 20px 32px; text-align: center;">
                        <div style="background-color: ${primaryColor}; width: 64px; height: 64px; margin: 0 auto 16px auto; border-radius: 16px; display: table;">
                            <span style="display: table-cell; vertical-align: middle; font-size: 32px;">🎸</span>
                        </div>
                        <h1 style="margin: 0; color: ${textColor}; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Bandmate</h1>
                    </div>

                    <!-- Main Content -->
                    <div style="padding: 0 32px 32px 32px;">
                        <div style="background-color: #f8fafc; border-radius: 16px; padding: 24px; border: 1px solid #f1f5f9;">
                            <h2 style="margin: 0 0 12px 0; color: ${primaryColor}; font-size: 18px; font-weight: 700;">${title}</h2>
                            <div style="color: ${textColor}; font-size: 15px; white-space: pre-wrap; font-weight: 400;">${message}</div>
                            
                            ${detailsHtml}
                            ${buttonHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="padding: 24px 32px; background-color: #f8fafc; text-align: center; border-top: 1px solid #f1f5f9;">
                        <p style="margin: 0; color: ${secondaryTextColor}; font-size: 13px;">
                            Dies ist eine automatische Benachrichtigung von deinem Proben-Planer.
                        </p>
                        <p style="margin: 8px 0 0 0; color: ${textColor}; font-size: 14px; font-weight: 600;">
                            Rock on! 🤘
                        </p>
                    </div>
                </div>
                
                <!-- Extra Footer -->
                <div style="text-align: center; margin-top: 24px; padding-bottom: 20px;">
                    <p style="margin: 0; color: ${secondaryTextColor}; font-size: 12px; letter-spacing: 0.02em;">
                        &copy; ${new Date().getFullYear()} Bandmate &bull; Organisiere deine Band wie ein Profi
                    </p>
                </div>
            </div>
        `;
    },

    async sendPasswordReset(toEmail, toName, resetLink) {
        return await this.sendEmail(
            toEmail,
            toName,
            'Passwort zurücksetzen',
            'Sicherheit geht vor! Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Klicke einfach auf den Button unten, um ein neues Passwort zu vergeben.',
            {
                buttonText: 'Passwort neu festlegen',
                buttonLink: resetLink
            }
        );
    },

    async sendRehearsalConfirmation(rehearsal, selectedDate, selectedMembers) {
        if (!this.isConfigured()) return { success: false, message: 'EmailJS nicht konfiguriert' };

        try {
            if (typeof emailjs === 'undefined') await this.loadEmailJS();
            emailjs.init(this.config.publicKey);

            const band = await Storage.getBand(rehearsal.bandId);
            const dateFormatted = UI.formatDate(selectedDate);

            // Get Location Name
            let locationName = 'Kein Ort angegeben';
            let locationAddress = '';
            if (rehearsal.locationId) {
                const location = await Storage.getLocation(rehearsal.locationId);
                if (location) {
                    locationName = location.name;
                    locationAddress = location.address ? `\nAdresse: ${location.address}` : '';
                }
            }

            const promises = selectedMembers.map(async (member) => {
                const user = await Storage.getById('users', member.userId);
                if (!user || !user.email) return null;

                const message = `Hallo ${user.first_name || user.name || user.username},\n\ngute Neuigkeiten! Deine Probe wurde soeben bestätigt. Schnapp dir dein Instrument, wir sehen uns dort! 🎸`;

                const result = await this.sendEmail(
                    user.email,
                    user.name,
                    `Probe bestätigt: ${rehearsal.title}`,
                    message,
                    {
                        detailsTitle: 'Termin-Details',
                        details: [
                            { label: 'Titel', value: rehearsal.title },
                            { label: 'Band', value: band.name },
                            { label: 'Datum', value: dateFormatted },
                            { label: 'Ort', value: locationName }
                        ].concat(rehearsal.description ? [{ label: 'Zusatzinfo', value: rehearsal.description }] : []),
                        buttonText: 'In der App ansehen',
                        buttonLink: window.location.origin
                    }
                );

                return {
                    success: result.success,
                    email: user.email,
                    response: result.response,
                    error: result.success ? null : result.message
                };
            });

            const results = await Promise.all(promises);
            const successCount = results.filter(r => r && r.success).length;

            return {
                success: successCount > 0,
                message: `${successCount} E-Mails versendet`,
                results
            };

        } catch (error) {
            Logger.error('EmailJS error:', error);
            return { success: false, message: error.message };
        }
    },

    async sendRehearsalUpdate(oldRehearsal, newRehearsal, selectedMembers) {
        if (!this.isConfigured()) return { success: false, message: 'EmailJS nicht konfiguriert' };

        try {
            if (typeof emailjs === 'undefined') await this.loadEmailJS();
            emailjs.init(this.config.publicKey);

            const band = await Storage.getBand(newRehearsal.bandId);

            // Get old and new location names
            let oldLocationName = 'Kein Ort';
            let newLocationName = 'Kein Ort';

            if (oldRehearsal.locationId) {
                const oldLoc = await Storage.getLocation(oldRehearsal.locationId);
                if (oldLoc) oldLocationName = oldLoc.name;
            }

            if (newRehearsal.locationId) {
                const newLoc = await Storage.getLocation(newRehearsal.locationId);
                if (newLoc) newLocationName = newLoc.name;
            }

            // Detect changes
            const changes = [];

            if (oldRehearsal.title !== newRehearsal.title) {
                changes.push(`Titel: "${oldRehearsal.title}" → "${newRehearsal.title}"`);
            }

            if (oldRehearsal.confirmedDate !== newRehearsal.confirmedDate) {
                const oldDate = UI.formatDate(oldRehearsal.confirmedDate);
                const newDate = UI.formatDate(newRehearsal.confirmedDate);
                changes.push(`Datum: ${oldDate} → ${newDate}`);
            }

            if (oldRehearsal.locationId !== newRehearsal.locationId) {
                changes.push(`Ort: "${oldLocationName}" → "${newLocationName}"`);
            }

            if ((oldRehearsal.description || '') !== (newRehearsal.description || '')) {
                const oldDesc = oldRehearsal.description || '(keine)';
                const newDesc = newRehearsal.description || '(keine)';
                changes.push(`Beschreibung: "${oldDesc}" → "${newDesc}"`);
            }

            if (changes.length === 0) {
                return { success: false, message: 'Keine Änderungen erkannt' };
            }

            const promises = selectedMembers.map(async (member) => {
                const user = await Storage.getById('users', member.userId);
                if (!user || !user.email) return null;

                const dateFormatted = UI.formatDate(newRehearsal.confirmedDate);
                const message = `Hallo ${user.first_name || user.name || user.username},\n\nwichtige Info: An deiner geplanten Probe wurden Änderungen vorgenommen. Bitte schau dir die aktualisierten Details unten an. ⚠️`;

                const result = await this.sendEmail(
                    user.email,
                    user.name,
                    `Probe aktualisiert: ${newRehearsal.title}`,
                    message,
                    {
                        detailsTitle: 'Aktualisierte Details',
                        details: [
                            { label: 'Titel', value: newRehearsal.title },
                            { label: 'Band', value: band.name },
                            { label: 'Datum', value: dateFormatted },
                            { label: 'Ort', value: newLocationName },
                            { label: 'Änderungen', value: changes.join('<br>') }
                        ].concat(newRehearsal.description ? [{ label: 'Beschreibung', value: newRehearsal.description }] : []),
                        buttonText: 'Änderungen bestätigen',
                        buttonLink: window.location.origin
                    }
                );

                return {
                    success: result.success,
                    email: user.email,
                    response: result.response,
                    error: result.success ? null : result.message
                };
            });

            const results = await Promise.all(promises);
            const successCount = results.filter(r => r && r.success).length;

            return {
                success: successCount > 0,
                message: `${successCount} Update-E-Mails versendet`,
                results
            };

        } catch (error) {
            Logger.error('EmailJS error:', error);
            return { success: false, message: error.message };
        }
    },

    async sendEventNotification(toEmail, toName, event, band) {
        const dateFormatted = UI.formatDate(event.date);

        const message = `Hallo ${toName},\n\nmach dich bereit für die Bühne! Du wurdest soeben zu einem neuen Auftritt eingeladen. Hier sind die Eckdaten für deine Planung. 🎤`;

        return await this.sendEmail(
            toEmail,
            toName,
            `Neuer Auftritt: ${event.title}`,
            message,
            {
                detailsTitle: 'Auftritts-Details',
                details: [
                    { label: 'Event', value: event.title },
                    { label: 'Band', value: band.name },
                    { label: 'Datum', value: dateFormatted },
                    ...(event.location ? [{ label: 'Ort', value: event.location }] : []),
                    ...(event.time ? [{ label: 'Zeit/Prio', value: event.time }] : []),
                    ...(event.soundcheck ? [{ label: 'Soundcheck', value: event.soundcheck }] : [])
                ].concat(event.info ? [{ label: 'Wichtige Infos', value: event.info }] : []),
                buttonText: 'Zusagen & Details',
                buttonLink: window.location.origin
            }
        );
    },

    loadEmailJS() {
        return new Promise((resolve, reject) => {
            if (typeof emailjs !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load EmailJS library'));
            document.head.appendChild(script);
        });
    }
};

EmailService.init();
