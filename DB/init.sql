-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VIDEOS
CREATE TABLE videos (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    file_name VARCHAR(255),
    s3_path VARCHAR(255),
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- JOBS
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    video_id UUID REFERENCES videos(id),
    type VARCHAR(50),
    status VARCHAR(50),
    attempts INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OUTPUTS
CREATE TABLE outputs (
    id UUID PRIMARY KEY,
    video_id UUID REFERENCES videos(id),
    type VARCHAR(50),
    s3_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EVENTS (AUDITORIA)
CREATE TABLE events (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100),
    source VARCHAR(100),
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);