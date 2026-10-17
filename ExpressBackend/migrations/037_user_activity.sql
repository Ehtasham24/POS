-- When each shop user last used the app, for the admin panel's "Last active" (utils/activity.js).
-- A sign-in alone said little: a session lasts 180 days, so people open the app already signed
-- in, and a register signs people in on its own, offline, without the cloud ever hearing of it.
--
--   user_activity            one row per user: the last time they did something, and where —
--                            device_id is the register they used, NULL for the web app. Written
--                            by the cloud at most every few minutes per user, and from what each
--                            register reports with its sync. Platform-only, like login_events:
--                            RLS on and no pos_app grant, so no shop request can read it.
--   login_events.device_id   a sign-in on a register, reported with its next sync (ip and
--                            user_agent stay empty). The unique index makes a report sent twice
--                            — a sync that failed after the cloud had stored it — land once.

CREATE TABLE IF NOT EXISTS user_activity (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop_id        INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  last_active_at TIMESTAMP NOT NULL,
  device_id      UUID REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_user_activity_shop ON user_activity (shop_id, last_active_at DESC);
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE login_events ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_events_device_once ON login_events (device_id, user_id, created_at) WHERE device_id IS NOT NULL;
