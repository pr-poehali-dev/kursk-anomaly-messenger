CREATE TABLE t_p36965254_kursk_anomaly_messen.chats (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'general',
  description TEXT,
  min_level VARCHAR(20) DEFAULT 'seeker',
  created_by INTEGER REFERENCES t_p36965254_kursk_anomaly_messen.users(id),
  created_at TIMESTAMP DEFAULT NOW()
);