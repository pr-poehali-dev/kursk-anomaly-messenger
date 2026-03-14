CREATE TABLE t_p36965254_kursk_anomaly_messen.anomalies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'possible',
  location TEXT NOT NULL,
  description TEXT,
  coords_x FLOAT,
  coords_y FLOAT,
  reporter_id INTEGER REFERENCES t_p36965254_kursk_anomaly_messen.users(id),
  reviewed_by INTEGER REFERENCES t_p36965254_kursk_anomaly_messen.users(id),
  reviewed_at TIMESTAMP,
  review_comment TEXT,
  evidence_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);