-- Pending clinic inquiries and explicit delivery-attempt timestamps.
-- Requests never create a clinic, membership, administrator, or invitation
-- until an authorized platform administrator approves them.
BEGIN;

CREATE TABLE IF NOT EXISTS clinic_requests (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name varchar(200) NOT NULL,
  contact_name varchar(160) NOT NULL,
  work_email varchar(254) NOT NULL,
  website varchar(500),
  request_key varchar(80) NOT NULL UNIQUE,
  status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by varchar REFERENCES users(id),
  reviewed_at timestamptz,
  clinic_id varchar REFERENCES clinics(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinic_requests_status_created_idx
  ON clinic_requests (status, created_at);
CREATE INDEX IF NOT EXISTS clinic_requests_email_status_idx
  ON clinic_requests (work_email, status);

ALTER TABLE clinic_invitations
  ADD COLUMN IF NOT EXISTS delivery_attempted_at timestamptz;

COMMIT;

-- Reversal is intentionally deferred. Clinic requests and the related audit
-- history are retained for review; no startup path deletes them.
