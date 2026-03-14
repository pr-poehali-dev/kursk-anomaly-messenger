ALTER TABLE t_p36965254_kursk_anomaly_messen.chat_messages ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;

CREATE TABLE t_p36965254_kursk_anomaly_messen.sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);