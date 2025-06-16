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

CREATE TABLE IF NOT EXISTS canvas (
    id VARCHAR(36) PRIMARY KEY DEFAULT (
        lower(
               hex( randomblob(4)) || '-'
            || hex( randomblob(2)) || '-'
            || '4' || substr( hex( randomblob(2)), 2) || '-'
            || substr('AB89', 1 + (abs(random()) % 4) , 1) 
            || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
            )
        )
);

CREATE TABLE IF NOT EXISTS user_canvas (
    user_id VARCHAR(36) NOT NULL,
    canvas_id VARCHAR(36) NOT NULL,
    right CHARACTER(2) NOT NULL CHECK (right IN ('R', 'W','V', 'M', 'CO', 'O')),
    PRIMARY KEY (user_id, canvas_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (canvas_id) REFERENCES canvas(id) ON DELETE CASCADE
);