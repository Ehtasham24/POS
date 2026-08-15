-- Adds authentication: this app had zero login/session/role concept anywhere until now —
-- anyone with the URL had full, anonymous, untracked access to everything. Two roles:
-- 'owner' (full access) and 'cashier' (selling screens only, see app-level route guards).
-- Also adds sales.sold_by so every sale can be attributed to whoever rang it up — needed
-- both for accountability and for the sale-void feature (migration 007) to know whose
-- sale is whose.
-- Safe to re-run: guarded with IF NOT EXISTS / ON CONFLICT throughout.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cashier',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('owner', 'cashier'))
);

-- Attribution — who rang up each sale. Nullable: existing historical sales predate this
-- column and can't be attributed retroactively.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_by INTEGER REFERENCES users(id);

-- Seeds one owner account so there's a way to log in immediately after this migration
-- runs. Username "owner", password "changeme123" — change this via Settings -> Users
-- right after first login. Hash below is bcrypt("changeme123", 10).
INSERT INTO users (username, password_hash, display_name, role)
VALUES ('owner', '$2b$10$psS3DDM4Ja/kc/7Ina2U1.pS88afFXgSfdilcwb.zewUEF6Q8nibi', 'Owner', 'owner')
ON CONFLICT (username) DO NOTHING;
