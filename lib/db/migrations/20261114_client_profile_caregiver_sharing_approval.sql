-- Explicit clinician approval for legacy profile fields without visible source
-- linkage. Historical profile content is retained; sharing stays opt-in.
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS caregiver_share_approved_by varchar,
  ADD COLUMN IF NOT EXISTS caregiver_share_approved_at timestamptz;
