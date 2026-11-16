-- Additive clinic-onboarding foundation. Existing memberships, users, records,
-- assignments, sessions and caregiver data are preserved.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS creation_request_key varchar;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_creation_request_key_uq
  ON clinics (creation_request_key);

CREATE TABLE IF NOT EXISTS clinic_invitations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id varchar NOT NULL REFERENCES clinics(id),
  invited_email varchar NOT NULL,
  role varchar NOT NULL CHECK (role IN ('clinic_admin', 'treating_clinician')),
  status varchar NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'superseded', 'expired')),
  token_hash varchar NOT NULL UNIQUE,
  request_key varchar UNIQUE,
  created_by varchar NOT NULL REFERENCES users(id),
  accepted_by varchar REFERENCES users(id),
  accepted_at timestamptz,
  revoked_by varchar REFERENCES users(id),
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  delivery_status varchar NOT NULL DEFAULT 'not_sent'
    CHECK (delivery_status IN ('not_sent', 'test_sink_accepted', 'provider_accepted', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_invitations_clinic_status_idx
  ON clinic_invitations (clinic_id, status, created_at);
CREATE INDEX IF NOT EXISTS clinic_invitations_email_status_idx
  ON clinic_invitations (invited_email, status);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_invitations_one_pending_uq
  ON clinic_invitations (clinic_id, invited_email, role)
  WHERE status = 'pending';

COMMIT;

-- Reversal is intentionally additive: stop using clinic invitation endpoints
-- and remove the indexes/table only after a separately approved data-retention
-- review. Existing records are never deleted by app startup or this migration.
