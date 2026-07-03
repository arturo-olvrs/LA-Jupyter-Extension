import sqlite3
import os

# Configuración
db_files = ['arturo.db', 'kai.db', 'lisa.db']
output_db = 'total_data.db'
schema_file = 'create.sql'

# 1. Crear la base de datos final con el esquema original
if os.path.exists(output_db):
    os.remove(output_db)

with open(schema_file, 'r') as f:
    schema_sql = f.read()

conn_main = sqlite3.connect(output_db)
conn_main.executescript(schema_sql)
cursor_main = conn_main.cursor()

def merge_db(source_db_path):
    print(f"Procesando {source_db_path}...")
    conn_src = sqlite3.connect(source_db_path)
    cursor_src = conn_src.cursor()

    # Diccionarios para mapear ID antiguo -> ID nuevo
    user_map = {}      # {old_id: new_id}
    notebook_map = {}
    session_map = {}
    cell_map = {}

    # --- 1. INSERTAR USUARIOS ---
    cursor_src.execute("SELECT id, personal_code, role FROM users")
    for old_id, p_code, role in cursor_src.fetchall():
        cursor_main.execute("INSERT INTO users (personal_code, role) VALUES (?, ?)", (p_code, role))
        user_map[old_id] = cursor_main.lastrowid

    # --- 2. INSERTAR NOTEBOOKS ---
    cursor_src.execute("SELECT id, title, author_id, path FROM notebooks")
    for old_id, title, author_id, path in cursor_src.fetchall():
        # Usamos el mapeo de usuario para el autor
        new_author_id = user_map.get(author_id)
        cursor_main.execute("INSERT INTO notebooks (title, author_id, path) VALUES (?, ?, ?)", 
                           (title, new_author_id, path))
        notebook_map[old_id] = cursor_main.lastrowid

    # --- 3. INSERTAR SESSIONS ---
    cursor_src.execute("SELECT session_id, notebook_id, open_time, close_time, user_id FROM notebook_sessions")
    for old_id, nb_id, open_t, close_t, u_id in cursor_src.fetchall():
        cursor_main.execute("""
            INSERT INTO notebook_sessions (notebook_id, open_time, close_time, user_id) 
            VALUES (?, ?, ?, ?)""", 
            (notebook_map[nb_id], open_t, close_t, user_map[u_id]))
        session_map[old_id] = cursor_main.lastrowid

    # --- 4. INSERTAR CELLS ---
    cursor_src.execute("SELECT id, cell_id, cell_type, notebook_id, initial_content FROM cells")
    for old_id, c_uuid, c_type, nb_id, content in cursor_src.fetchall():
        cursor_main.execute("""
            INSERT INTO cells (cell_id, cell_type, notebook_id, initial_content) 
            VALUES (?, ?, ?, ?)""", 
            (c_uuid, c_type, notebook_map[nb_id], content))
        cell_map[old_id] = cursor_main.lastrowid

    # --- 5. INSERTAR ACTIVE_CELLS ---
    cursor_src.execute("SELECT cell_id, session_id, start_time, end_time FROM active_cells")
    for c_id, s_id, start, end in cursor_src.fetchall():
        cursor_main.execute("""
            INSERT INTO active_cells (cell_id, session_id, start_time, end_time) 
            VALUES (?, ?, ?, ?)""", 
            (cell_map[c_id], session_map[s_id], start, end))

    # --- 6. INSERTAR CELL_EXECUTIONS ---
    cursor_src.execute("""
        SELECT cell_id, session_id, content, start_time, end_time, execution_count, output, num_errors, error_msg 
        FROM cell_executions""")
    for row in cursor_src.fetchall():
        new_row = list(row)
        new_row[0] = cell_map[row[0]]    # cell_id mapeado
        new_row[1] = session_map[row[1]] # session_id mapeado
        cursor_main.execute("""
            INSERT INTO cell_executions 
            (cell_id, session_id, content, start_time, end_time, execution_count, output, num_errors, error_msg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", new_row)

    conn_src.close()
    conn_main.commit()

# Ejecutar para cada base de datos
for db in db_files:
    if os.path.exists(db):
        merge_db(db)
    else:
        print(f"Advertencia: No se encontró {db}")

conn_main.close()
print("¡Fusión completada con éxito en total_data.db!")