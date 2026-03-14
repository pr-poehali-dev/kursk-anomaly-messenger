CREATE TABLE t_p36965254_kursk_anomaly_messen.evidence (
  id SERIAL PRIMARY KEY,
  anomaly_id INTEGER NOT NULL REFERENCES t_p36965254_kursk_anomaly_messen.anomalies(id),
  user_id INTEGER REFERENCES t_p36965254_kursk_anomaly_messen.users(id),
  description TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);