-- # Supabase RLS (Row Level Security) fÃ¼r Bandmate
-- FÃ¼hre diese SQL-Befehle im SQL-Editor deines Supabase Dashboards aus.

-- ## 1. RLS auf allen Tabellen aktivieren
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandMembers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandMembershipRequests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rehearsals ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeSuggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;

-- ## 2. Helfer-Funktion: Ist User Mitglied in Band?
CREATE OR REPLACE FUNCTION is_band_member(target_band_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bandMembers 
    WHERE bandId = target_band_id AND userId = auth.uid()::text
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ## 3. Helfer-Funktion: Ist User Leader in Band?
CREATE OR REPLACE FUNCTION is_band_leader(target_band_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bandMembers 
    WHERE bandId = target_band_id AND userId = auth.uid()::text AND role IN ('leader', 'co-leader')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ## 4. Policies fÃ¼r 'users'
CREATE POLICY "Users can see themselves" ON users FOR SELECT USING (auth.uid()::text = id);
CREATE POLICY "Users can update themselves" ON users FOR UPDATE USING (auth.uid()::text = id);
CREATE POLICY "Admins can see all users" ON users FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND "isAdmin" = true)
);

-- ## 5. Policies fÃ¼r 'bands'
CREATE POLICY "Members can see their bands" ON bands FOR SELECT USING (is_band_member(id));
CREATE POLICY "Leaders can update their bands" ON bands FOR UPDATE USING (is_band_leader(id));

-- ## 6. Policies fÃ¼r 'bandMembers'
CREATE POLICY "Members can see band membership" ON bandMembers FOR SELECT USING (is_band_member(bandId));
CREATE POLICY "Leaders can manage band membership" ON bandMembers FOR ALL USING (is_band_leader(bandId));

-- ## 7. Policies fÃ¼r 'events', 'rehearsals', 'songs'
-- (Analog fÃ¼r alle band-gebundenen Daten)
CREATE POLICY "Members can see band data" ON events FOR SELECT USING (is_band_member(bandId));
CREATE POLICY "Leaders can manage band events" ON events FOR ALL USING (is_band_leader(bandId));

CREATE POLICY "Members can see rehearsals" ON rehearsals FOR SELECT USING (is_band_member(bandId));
CREATE POLICY "Leaders can manage rehearsals" ON rehearsals FOR ALL USING (is_band_leader(bandId));

CREATE POLICY "Members can see songs" ON songs FOR SELECT USING (is_band_member(bandId));
CREATE POLICY "Leaders can manage songs" ON songs FOR ALL USING (is_band_leader(bandId));

-- ## 8. Policies fÃ¼r 'votes' und 'timeSuggestions'
CREATE POLICY "Users can see/manage their own votes" ON votes FOR ALL USING (userId = auth.uid()::text);
CREATE POLICY "Members can see relevant votes" ON votes FOR SELECT USING (
  (rehearsalId IS NOT NULL AND EXISTS (SELECT 1 FROM rehearsals WHERE id = rehearsalId AND is_band_member(bandId))) OR
  (eventId IS NOT NULL AND EXISTS (SELECT 1 FROM events WHERE id = eventId AND is_band_member(bandId)))
);

-- ## 9. Policies fÃ¼r 'absences'
CREATE POLICY "Users can manage their own absences" ON absences FOR ALL USING (userId = auth.uid()::text);
CREATE POLICY "Band members can see absences" ON absences FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM bandMembers bm1 
    JOIN bandMembers bm2 ON bm1.bandId = bm2.bandId 
    WHERE bm1.userId = auth.uid()::text AND bm2.userId = absences.userId
  )
);

-- ## 10. Policies fÃ¼r 'news'
CREATE POLICY "Authenticated users can see news" ON news FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage news" ON news FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND "isAdmin" = true)
);

-- ## 11. ZusÃ¤tzlich: RPC fÃ¼r User-LÃ¶schung (falls noch nicht vorhanden)
-- Dies wird in js/auth.js referenziert.
CREATE OR REPLACE FUNCTION delete_auth_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Nur der User selbst oder ein Admin sollte dies dÃ¼rfen
  -- (Hinweis: BenÃ¶tigt 'Service Role' Rechte in Supabase, falls Ã¼ber die API aufgerufen, 
  -- oder muss als SECURITY DEFINER erstellt werden)
  IF auth.uid() = target_user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND "isAdmin" = true) THEN
    DELETE FROM auth.users WHERE id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
