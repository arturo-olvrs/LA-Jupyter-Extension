-- SQLite

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_code VARCHAR(100),
    role VARCHAR(20)  NOT NULL,
    CHECK(role IN ('student', 'teacher'))
);

CREATE TABLE notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    author_id INTEGER,
    path TEXT NOT NULL
);

CREATE TABLE notebook_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER NOT NULL,
    open_time TIMESTAMP NOT NULL,
    close_time TIMESTAMP DEFAULT NULL,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id),
    CHECK (close_time IS NULL OR close_time >= open_time)
);

CREATE TABLE cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id TEXT NOT NULL,
    cell_type TEXT NOT NULL,
    notebook_id INTEGER NOT NULL,
    initial_content TEXT,
    UNIQUE (cell_id, notebook_id),
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id)
);


CREATE TABLE active_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    FOREIGN KEY (session_id) REFERENCES notebook_sessions(session_id),
    CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE TABLE cell_executions (
    execution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    content TEXT,
    start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP DEFAULT NULL,
    execution_count INTEGER,
    output TEXT,
    num_errors INTEGER,
    error_msg TEXT,
    FOREIGN KEY (cell_id) REFERENCES cells(id),
    FOREIGN KEY (session_id) REFERENCES notebook_sessions(session_id),
    CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE TRIGGER trg_active_cell_insert
BEFORE INSERT ON active_cells
FOR EACH ROW
BEGIN
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM active_cells
                WHERE session_id = NEW.session_id
                  AND end_time IS NULL
            )
            THEN RAISE(ABORT, 'Could not create active cell: There is already an active cell for this session.')
        END;
END;



CREATE TRIGGER trg_session_insert
BEFORE INSERT ON notebook_sessions
FOR EACH ROW
BEGIN
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM notebook_sessions
                WHERE user_id = NEW.user_id
                  AND close_time IS NULL
            )
            THEN RAISE(ABORT, 'Could not create session: There is already an active session for this user.')
        END;
END;



CREATE TRIGGER trg_delete_session_if_close_equals_open
AFTER UPDATE ON notebook_sessions
FOR EACH ROW
WHEN NEW.close_time = NEW.open_time
BEGIN
    DELETE FROM notebook_sessions
    WHERE session_id = NEW.session_id;
END;

CREATE TRIGGER trg_delete_active_if_close_equals_open
AFTER UPDATE ON active_cells
FOR EACH ROW
WHEN NEW.end_time = NEW.start_time
BEGIN
    DELETE FROM active_cells
    WHERE id = NEW.id;
END;