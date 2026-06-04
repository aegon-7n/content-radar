-- TRU-312: Make invite_tokens.creator_id required.
-- Delete any tokens (expired or not) that have no creator linked — they can't
-- be used under the new flow and would prevent adding the NOT NULL constraint.
DELETE FROM invite_tokens WHERE creator_id IS NULL;

-- Enforce the constraint going forward.
ALTER TABLE invite_tokens ALTER COLUMN creator_id SET NOT NULL;
