-- Additive and idempotent. Existing goal IDs, clinical progress, documents and
-- accounts are untouched. Existing goals retain their historical visibility.
BEGIN;
ALTER TABLE reward_tokens ADD COLUMN IF NOT EXISTS publication_status varchar NOT NULL DEFAULT 'published';
ALTER TABLE reward_tokens ADD COLUMN IF NOT EXISTS goal_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE reward_tokens ADD COLUMN IF NOT EXISTS goal_version integer NOT NULL DEFAULT 0;
ALTER TABLE reward_tokens ADD COLUMN IF NOT EXISTS goal_versions jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS care_team_assignments (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), child_id varchar NOT NULL,
 clinician_id varchar NOT NULL, tenant_id varchar NOT NULL, goal_id varchar,
 library_id varchar, definition jsonb NOT NULL DEFAULT '{}', status varchar NOT NULL DEFAULT 'draft',
 version integer NOT NULL DEFAULT 0, published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_assignments_child_idx ON care_team_assignments(child_id,clinician_id);
CREATE TABLE IF NOT EXISTS care_team_assignment_versions (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id varchar NOT NULL REFERENCES care_team_assignments(id),
 version integer NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS care_assignment_version_uq ON care_team_assignment_versions(assignment_id,version);
CREATE TABLE IF NOT EXISTS care_team_practice (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), assignment_id varchar NOT NULL REFERENCES care_team_assignments(id),
 version integer NOT NULL, child_id varchar NOT NULL, parent_id varchar NOT NULL, request_id varchar NOT NULL,
 outcome varchar NOT NULL, note varchar(4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS care_practice_request_uq ON care_team_practice(parent_id,request_id);
CREATE INDEX IF NOT EXISTS care_practice_child_idx ON care_team_practice(child_id,created_at);
COMMIT;
-- Reversal: stop serving new care-team routes; leave these additive structures
-- in place to preserve records. Any destructive down migration needs a backup
-- and explicit approval; it is intentionally not run by app startup.
