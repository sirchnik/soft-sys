-- Add migration script here

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (
        lower(
               hex( randomblob(4)) || '-'
            || hex( randomblob(2)) || '-'
            || '4' || substr( hex( randomblob(2)), 2) || '-'
            || substr('AB89', 1 + (abs(random()) % 4) , 1) 
            || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
            )
        ),
    email VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);