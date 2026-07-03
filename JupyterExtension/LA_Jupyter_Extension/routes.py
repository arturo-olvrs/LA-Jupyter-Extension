import json
import re

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
from datetime import datetime, timezone
from collections import Counter

import sqlite3
import os
db_pth = os.environ.get("DB_PATH", "DataBase/db.db")

from enum import Enum

class InitHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "status": "ok"
        }))


class NotebookActivateHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):

        input_data = self.get_json_body()
        notebook_title = input_data.get("title")
        notebook_path = input_data.get("path")
        user_id = input_data.get("userId")
        cells = input_data.get("cells", [])
        author_id = input_data.get("author")

        try:
            def transactional_ops(cursor):
                response = {}

                cursor.execute("""
                    SELECT * FROM notebooks
                        WHERE path = ?
                            AND title = ?;
                """, (notebook_path, notebook_title))
                rows = cursor.fetchall()
                already_registered = len(rows) > 0

                notebook_id = None
                if already_registered:
                    notebook_id = rows[0]["id"]

                    # Update cells in case there are updated cell_ids
                    for cell in cells:
                        cursor.execute("""
                            UPDATE cells
                            SET cell_id = ?
                            WHERE notebook_id = ? AND initial_content = ?;
                        """, (cell["id"], notebook_id, cell["content"]))
                else:
                    if (not is_teacher(user_id)):
                        # // TODO: While debugging, allow non-teachers to register notebooks
                        response["warning"] = "Notebook registered by a non-teacher user."
                        # self.set_status(400)
                        # self.finish(json.dumps({
                        #     "error": "Only teachers can register new notebooks.",
                        #     "notebook_path": notebook_path,
                        #     "user_id": user_id
                        # }))
                        # return

                    author_empty = (author_id is None) or (author_id == "") or (author_id == "null")

                    if (not author_empty and not is_teacher(author_id)):
                        #raise Exception("Only teachers can be authors of notebooks.")
                        response["warning"] = "Author is not a teacher."

                    if (author_empty):
                        cursor.execute("""
                            INSERT INTO notebooks (title, path)
                            VALUES (?, ?);
                        """, (notebook_title, notebook_path))
                    else:
                        cursor.execute("""
                            INSERT INTO notebooks (title, path, author_id)
                            VALUES (?, ?, ?);
                        """, (notebook_title, notebook_path, author_id))

                    notebook_id = cursor.execute("SELECT last_insert_rowid() AS notebook_id;").fetchone()["notebook_id"]

                    for cell in cells:
                        cursor.execute("""
                            INSERT INTO cells (cell_id, cell_type, notebook_id, initial_content)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(cell_id, notebook_id) DO UPDATE SET
                                cell_type = excluded.cell_type,
                                initial_content = excluded.initial_content;
                        """, (cell["id"], cell["type"], notebook_id, cell["content"]))

                
                if (is_teacher(user_id)):
                    response["note"] = "Teachers do not have sessions."
                else:
                    cursor.execute("""
                        UPDATE notebook_sessions
                        SET close_time = CURRENT_TIMESTAMP
                        WHERE user_id = ? 
                        AND close_time IS NULL;
                    """, (user_id,))

                    cursor.execute("""
                        INSERT INTO notebook_sessions (notebook_id, open_time, user_id)
                        VALUES (?, CURRENT_TIMESTAMP, ?)
                    """, (notebook_id, user_id))

                    cursor.execute("""
                        SELECT session_id FROM notebook_sessions
                        WHERE notebook_id = ? AND user_id = ? AND close_time IS NULL;
                    """, (notebook_id, user_id))

                    session_id = cursor.fetchone()["session_id"]

                    response["session_id"] = session_id
                
                response["notebook_id"] = notebook_id
                response["already_registered"] = already_registered

                return response

            result = execute_transaction(transactional_ops)
            self.finish(json.dumps(result))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Activation": str(e),
                "Notebook Path": notebook_path,
                "User ID": user_id,
                "Author ID": author_id
            }))

class NotebookSavedHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):

        input_data = self.get_json_body()
        notebook_title = input_data.get("title")
        notebook_path = input_data.get("path")
        user_id = input_data.get("userId")
        cells = input_data.get("cells", [])
        author_id = input_data.get("author")
        notebook_id = input_data.get("notebook_id")

        try:
            if (not is_teacher(user_id)):
                self.set_status(400)
                self.finish(json.dumps({
                    "error": "Only teachers can change notebooks.",
                    "notebook_id": notebook_id,
                    "user_id": user_id
                }))
                return

            author_empty = (author_id is None) or (author_id == "") or (author_id == "null")

            if (not is_teacher(author_id)) and (not author_empty):
                # self.set_status(400)
                # self.finish(json.dumps({
                #     "error": "Only teachers can be authors of notebooks.",
                #     "notebook_id": notebook_id,
                #     "author_id": author_id
                # }))
                # return
                response["warning"] = "Author is not a teacher."

            if (author_empty):
                execute_sql("""
                    UPDATE notebooks
                        SET title = ?, path = ?
                        WHERE id = ?;
                """, (notebook_title, notebook_path, notebook_id))
            else:
                execute_sql("""
                    UPDATE notebooks
                        SET title = ?, author_id = ?, path = ?
                        WHERE id = ?;
                """, (notebook_title, author_id, notebook_path, notebook_id))

            for cell in cells:
                cell_row = execute_sql("""
                    SELECT * FROM cells
                        WHERE cell_id = ?
                            AND notebook_id = ?;
                """, (cell["id"], notebook_id))
                exists = len(cell_row) > 0
                if not exists:
                    execute_sql("""
                        INSERT INTO cells (cell_id, cell_type, notebook_id, initial_content)
                        VALUES (?, ?, ?, ?);
                    """, (cell["id"], cell["type"], notebook_id, cell["content"]))
                else:
                    execute_sql("""
                        UPDATE cells
                            SET cell_type = ?, initial_content = ?
                            WHERE cell_id = ? AND notebook_id = ?;
                    """, (cell["type"], cell["content"], cell["id"], notebook_id))
            
            self.finish(json.dumps({
                "notebook_id": notebook_id,
                "user_id": user_id
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error while Saving": str(e),
                "Notebook Id": notebook_id,
                "User ID": user_id,
                "Author ID": author_id
            }))


class NotebookDeactivateHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("userId")

        try:
            if (is_teacher(user_id)):
                self.finish(json.dumps({
                    "user_id": user_id,
                    "note": "Teachers do not have sessions to deactivate."
                }))
                return

            session_id = get_active_session(self, user_id, log_errors=False)
            if session_id is None:
                self.finish(json.dumps({
                    "message": "No active session to deactivate.",
                    "user_id": user_id
                }))
                return

            execute_sql("""
                UPDATE notebook_sessions
                SET close_time = CURRENT_TIMESTAMP
                WHERE session_id = ?;
            """, (session_id,))

            # Close any active cells for this session
            execute_sql("""
                UPDATE active_cells
                SET end_time = CURRENT_TIMESTAMP
                WHERE session_id = ? AND end_time IS NULL;
            """, (session_id,))

            self.finish(json.dumps({
                "session_id": session_id,
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Deactivation": str(e),
                "User ID": user_id
            }))
            return



class UserLoginByCodeHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_code = input_data.get("personal_code")
        role = input_data.get("role", "student")

        if not user_code:
            self.set_status(400)
            self.finish(json.dumps({"message": "Code is required"}))
            return
        
        try:
            execute_sql("""
                INSERT INTO users (personal_code, role)
                VALUES (?, ?);
            """, (user_code, role))

            user_row = execute_sql("""
                SELECT id FROM users
                    WHERE personal_code = ?
                        AND role = ?;
            """, (user_code, role))

            self.finish(json.dumps({
                "id": user_row[0]["id"],
                "code": user_code,
                "role": role
            }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in User Creation": str(e),
                "Code": user_code,
                "Role": role
            }))

class CellExecutionStartedHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        cellId = input_data.get("cellId")
        user_id = input_data.get("userId")
        content: Optional[str] = input_data.get("content")

        try:
            if (is_teacher(user_id)):
                self.finish(json.dumps({
                    "note": "Teachers executions are not tracked."
                }))
                return

            session_id = get_active_session(self, user_id)
            if session_id is None:
                return

            notebook_id = get_notebook_id(self, session_id)
            if notebook_id is None:
                return

            cell_id = get_cell_id(self, notebook_id, cellId)
            if cell_id is None:
                return
            
            execute_sql("""
                INSERT INTO cell_executions (cell_id, session_id, content)
                VALUES (?, ?, ?);
            """, (cell_id, session_id, content))

            execution_id = execute_sql("""
                SELECT last_insert_rowid() AS execution_id;
            """)[0]["execution_id"]

            self.finish(json.dumps({
                "execution_id": execution_id,
                "cell_id": cell_id,
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Cell Execution Started": str(e),
                "Notebook Id": notebook_id,
                "cell_id": cell_id
            }))

class CellExecutionFinishedHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        cellId = input_data.get("cellId")
        user_id = input_data.get("userId")
        execution_count: Optional[int] = input_data.get("executionCount")
        output: Optional[str] = input_data.get("output")
        num_errors: Optional[int] = input_data.get("num_errors")
        error_msg: Optional[str] = input_data.get("error_msg")

 
        try:
            if (is_teacher(user_id)):
                self.finish(json.dumps({
                    "note": "Teachers executions are not tracked."
                }))
                return

            session_id = get_active_session(self, user_id)
            if session_id is None:
                return

            notebook_id = get_notebook_id(self, session_id)
            if notebook_id is None:
                return

            cell_id = get_cell_id(self, notebook_id, cellId)
            if cell_id is None:
                return

            execution_id = get_open_execution_id(self, cell_id, session_id)
            if execution_id is None:
                return

            execute_sql("""
                UPDATE cell_executions
                SET end_time = CURRENT_TIMESTAMP,
                    execution_count = ?,
                    output = ?,
                    num_errors = ?,
                    error_msg = ?
                WHERE execution_id = ?;
            """, (execution_count, output, num_errors, error_msg, execution_id))

            self.finish(json.dumps({
                "execution_id": execution_id,
                "cell_id": cell_id,
                "errors": num_errors
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Cell Execution Finished": str(e),
                "Notebook Id": notebook_id,
                "cell_id": cell_id
            }))


class CellActivateHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        cellId = input_data.get("cellId")
        user_id = input_data.get("userId")

        try:

            if (is_teacher(user_id)):
                self.finish(json.dumps({
                    "note": "Teachers active cells are not tracked."
                }))
                return
            
            session_id = get_active_session(self, user_id)
            if session_id is None:
                return

            notebook_id = get_notebook_id(self, session_id)
            if notebook_id is None:
                return

            cell_id = get_cell_id(self, notebook_id, cellId)
            if cell_id is None:
                return

            # Firstly, close any previously active cells for this session
            execute_sql("""
                UPDATE active_cells
                SET end_time = CURRENT_TIMESTAMP
                WHERE session_id = ? AND end_time IS NULL;
            """, (session_id,))

            # Insertar registro de activación de celda
            execute_sql("""
                INSERT INTO active_cells (cell_id, session_id)
                VALUES (?, ?);
            """, (cell_id, session_id))

            self.finish(json.dumps({
                "cell_id": cell_id,
                "session_id": session_id,
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Cell Activation": str(e),
                "Notebook Id": notebook_id,
                "cell_Id": cell_id
            }))

class CellDeactivateHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        cellId = input_data.get("cellId")
        user_id = input_data.get("userId")

        try:
            if (is_teacher(user_id)):
                self.finish(json.dumps({
                    "note": "Teachers active cells are not tracked."
                }))
                return

            session_id = get_active_session(self, user_id)
            if session_id is None:
                return

            notebook_id = get_notebook_id(self, session_id)
            if notebook_id is None:
                return

            cell_id = get_cell_id(self, notebook_id, cellId)
            if cell_id is None:
                return

            execute_sql("""
                UPDATE active_cells
                SET end_time = CURRENT_TIMESTAMP
                WHERE cell_id = ? AND session_id = ? AND end_time IS NULL;
            """, (cell_id, session_id))

            self.finish(json.dumps({
                "cell_id": cell_id,
                "session_id": session_id,
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error in Cell Deactivation": str(e),
                "Notebook Id": notebook_id,
                "cell_Id": cell_id
            }))

class GetUser(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("userId")

        try:
            user_row = execute_sql("""
                SELECT personal_code, role FROM users WHERE id = ?;
            """, (user_id,))

            if user_row:
                self.finish(json.dumps({
                    "userId": user_id,
                    "code": user_row[0]["personal_code"],
                    "role": user_row[0]["role"],
                }))
            else:
                self.set_status(400)
                self.finish(json.dumps({
                    "Error": "User not found.",
                    "userId": user_id
                }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching user": str(e),
                "userId": user_id
            }))

class GetCurrentNotebookByUser(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")

        try:

            session_id = get_active_session(self, user_id)

            current_notebook_row = execute_sql("""
                SELECT ns.notebook_id, n.title, n.path, n.author_id, ns.open_time
                    FROM notebook_sessions ns
                    JOIN notebooks n ON ns.notebook_id = n.id
                    WHERE session_id = ?;
            """, (session_id,))

            
            self.finish(json.dumps({
                "id": current_notebook_row[0]["notebook_id"],
                "title": current_notebook_row[0]["title"],
                "path": current_notebook_row[0]["path"],
                "author_id": current_notebook_row[0]["author_id"],
                "open_time": current_notebook_row[0]["open_time"],
            }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error": str(e),
                "user_id": user_id
            }))


class GetNotebookProgressHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        notebook_id = input_data.get("notebook_id")

        try:

            # Last session for the notebook
            last_session_row = execute_sql("""
                SELECT ns.session_id
                    FROM notebook_sessions ns
                    WHERE ns.notebook_id = ?
                    ORDER BY ns.open_time DESC
                    LIMIT 1;
            """, (notebook_id,))
            if len(last_session_row) == 0:
                self.finish(json.dumps({
                    "notebookId": notebook_id,
                    "progress": 0,
                    "note": "No sessions found for this notebook."
                }))
                return
            session_id = last_session_row[0]["session_id"]


            total_code_cells_row = execute_sql("""
                SELECT COUNT(*) AS total_code_cells
                    FROM cells
                    WHERE notebook_id = ? AND cell_type = 'code';
            """, (notebook_id,))
            total_code_cells = total_code_cells_row[0]["total_code_cells"]

            progressed_cells_row = execute_sql("""
                SELECT COUNT(DISTINCT ce.cell_id) AS progressed_cells
                    FROM cell_executions ce
                    WHERE ce.session_id = ?
                        AND ce.end_time IS NOT NULL
                        AND ce.num_errors = 0;
            """, (session_id,))
            progressed_cells = progressed_cells_row[0]["progressed_cells"]

            progress = (progressed_cells / total_code_cells) * 100 if total_code_cells > 0 else 0

            self.finish(json.dumps({
                "notebookId": notebook_id,
                "progress": progress
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching notebook progress": str(e),
                "notebookId": notebook_id
            }))


class GetUserErrorRateHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")

        try:
            session_id = get_active_session(self, user_id)
            error_rate_row = execute_sql("""
                SELECT
                    SUM(CASE WHEN ce.num_errors > 0 THEN 1 ELSE 0 END) AS error_count,
                    COUNT(ce.execution_id) AS total_executions
                FROM cell_executions ce
                WHERE ce.session_id = ?;
            """, (session_id,))
            error_count = error_rate_row[0]["error_count"]
            total_executions = error_rate_row[0]["total_executions"]
            error_rate = (error_count / total_executions) * 100 if total_executions > 0 else 0
            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "errorRate": error_rate
            }))
            

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching user error rate": str(e),
                "userId": user_id
            }))


class GetTopErrorCellsHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        top_n = input_data.get("limit", 5)
        try:
            session_id = get_active_session(self, user_id)
            top_error_cells = execute_sql("""
                SELECT ce.cell_id, SUM(ce.num_errors) AS error_count
                    FROM cell_executions ce
                    WHERE ce.session_id = ?
                    GROUP BY ce.cell_id
                    HAVING error_count > 0
                    ORDER BY error_count DESC
                    LIMIT ?;
            """, (session_id, top_n))

            result = []
            for row in top_error_cells:
                last_execution_count = get_last_execution_count(self, row["cell_id"], session_id)
                jupyter_cell_id = get_jupyter_cell_id(self, row["cell_id"])

                result.append({
                    "cell_id": row["cell_id"],
                    "jupyter_cell_id": jupyter_cell_id,
                    "error_count": row["error_count"],
                    "last_execution_count": last_execution_count
                })

                

            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "topErrorCells": result
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching top error cells": str(e),
                "userId": user_id
            }))


class GetTopAttemptCellsHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        top_n = input_data.get("limit", 5)
        try:
            session_id = get_active_session(self, user_id)
            top_attempt_cells = execute_sql("""
                SELECT ce.cell_id, COUNT(*) AS attempt_count
                    FROM cell_executions ce
                    WHERE ce.session_id = ?
                    GROUP BY ce.cell_id
                    HAVING attempt_count > 0
                    ORDER BY attempt_count DESC
                    LIMIT ?;
            """, (session_id, top_n))

            result = []
            for row in top_attempt_cells:
                last_execution_count = get_last_execution_count(self, row["cell_id"], session_id)
                jupyter_cell_id = get_jupyter_cell_id(self, row["cell_id"])

                result.append({
                    "cell_id": row["cell_id"],
                    "jupyter_cell_id": jupyter_cell_id,
                    "attempt_count": row["attempt_count"],
                    "last_execution_count": last_execution_count
                })

            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "topAttemptCells": result
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching top attempt cells": str(e),
                "userId": user_id
            }))

class GetTimeConsumingCellsHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        top_n = input_data.get("limit", 5)
        try:
            session_id = get_active_session(self, user_id)
            time_consuming_cells = execute_sql("""
                SELECT
                    ac.cell_id,
                    SUM(
                        JULIANDAY(
                        COALESCE(ac.end_time, CURRENT_TIMESTAMP)
                        ) - JULIANDAY(ac.start_time)
                    ) * 24 * 60 * 60 AS total_active_time_seconds
                    FROM active_cells ac
                    WHERE ac.session_id = ?
                    GROUP BY ac.cell_id
                    HAVING total_active_time_seconds > 0
                    ORDER BY total_active_time_seconds DESC
                    LIMIT ?;
            """, (session_id, top_n))

            result = []
            for row in time_consuming_cells:
                last_execution_count = get_last_execution_count(self, row["cell_id"], session_id)
                jupyter_cell_id = get_jupyter_cell_id(self, row["cell_id"])

                result.append({
                    "cell_id": row["cell_id"],
                    "jupyter_cell_id": jupyter_cell_id,
                    "total_active_time_seconds": row["total_active_time_seconds"],
                    "last_execution_count": last_execution_count
                })

            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "timeConsumingCells": result
            }))

        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching time consuming cells": str(e),
                "userId": user_id
            }))


class GetTopErrorTypesHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        
        try:
            session_id = get_active_session(self, user_id)
            
            error_messages = execute_sql("""
                SELECT error_msg
                    FROM cell_executions
                    WHERE session_id = ?
                    AND num_errors > 0;
            """, (session_id,))

            error_types = []
            for row in error_messages:
                error_msg = json.loads(row["error_msg"])
                for error in error_msg:
                    
                    error_type = get_error_name(error)
                    error_types.append(error_type)
                    

            counts = Counter(error_types)
            
            error_distribution = [
                {"error_type": k, "occurrence_count": v} 
                for k, v in counts.most_common()
            ]


            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "errorDistribution": error_distribution
            }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching top error types": str(e),
                "userId": user_id
            }))

class GetTimelineSuccessErrorsHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        
        try:
            session_id = get_active_session(self, user_id)
            
            timeline_data = execute_sql("""
                SELECT  end_time AS execution_date,
                        CASE WHEN num_errors > 0 THEN 'error' ELSE 'success' END AS outcome
                    FROM cell_executions
                    WHERE session_id = ?;
            """, (session_id,))
            data = []
            for row in timeline_data:
                data.append({
                    "execution_date": row["execution_date"],
                    "outcome": row["outcome"]
                })

            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "timelineData": data
            }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching timeline data": str(e),
                "userId": user_id
            }))

class GetHealthHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        input_data = self.get_json_body()
        user_id = input_data.get("user_id")
        try:
            session_id = get_active_session(self, user_id)

            result = execute_sql("""
                WITH ranked_executions AS (
                    SELECT 
                        cell_id,
                        num_errors,
                        COUNT(*) OVER(PARTITION BY cell_id) as total_executions,
                        ROW_NUMBER() OVER(PARTITION BY cell_id ORDER BY start_time DESC) as rn
                    FROM cell_executions
                    WHERE session_id = ?
                )
                SELECT 
                    COUNT(CASE WHEN total_executions = 1 AND num_errors = 0 THEN 1 END) as success_count,
                    COUNT(CASE WHEN num_errors > 0 THEN 1 END) as error_count,
                    COUNT(CASE WHEN total_executions > 1 AND num_errors = 0 THEN 1 END) as attempt_count
                FROM ranked_executions
                WHERE rn = 1;
            """, (session_id,))

            total_cells_row = execute_sql("""
                SELECT COUNT(*) AS total_cells
                    FROM cells c
                    JOIN notebooks n ON c.notebook_id = n.id
                    JOIN notebook_sessions ns ON n.id = ns.notebook_id
                    WHERE ns.session_id = ? AND c.cell_type = 'code';
            """, (session_id,))

            data = {
                "successCount": 0,
                "errorCount": 0,
                "attemptCount": 0,
                "totalCodeCells": 0
            }
            if result and len(result) > 0:
                data["successCount"] = result[0]["success_count"]
                data["errorCount"] = result[0]["error_count"]
                data["attemptCount"] = result[0]["attempt_count"]
            if total_cells_row and len(total_cells_row) > 0:
                data["totalCodeCells"] = total_cells_row[0]["total_cells"]
                
            self.finish(json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "healthStats": data
            }))
        except Exception as e:
            self.set_status(400)
            self.finish(json.dumps({
                "Error fetching health data": str(e),
                "userId": user_id
            }))


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    handlers = [
        (endpoint_to_url(base_url, "init"), InitHandler),
        (endpoint_to_url(base_url, "notebook/activate"), NotebookActivateHandler),
        (endpoint_to_url(base_url, "notebook/deactivate"), NotebookDeactivateHandler),
        (endpoint_to_url(base_url, "notebook/saved"), NotebookSavedHandler),
        (endpoint_to_url(base_url, "cell/execution/started"), CellExecutionStartedHandler),
        (endpoint_to_url(base_url, "cell/execution/finished"), CellExecutionFinishedHandler),
        (endpoint_to_url(base_url, "cell/activate"), CellActivateHandler),
        (endpoint_to_url(base_url, "cell/deactivate"), CellDeactivateHandler),
        (endpoint_to_url(base_url, "user"), GetUser),
        (endpoint_to_url(base_url, "notebook/current_by_user"), GetCurrentNotebookByUser),
        (endpoint_to_url(base_url, "notebook/progress"), GetNotebookProgressHandler),
        (endpoint_to_url(base_url, "user/error_rate"), GetUserErrorRateHandler),
        (endpoint_to_url(base_url, "user/top_error_cells"), GetTopErrorCellsHandler),
        (endpoint_to_url(base_url, "user/top_attempt_cells"), GetTopAttemptCellsHandler),
        (endpoint_to_url(base_url, "user/time_consuming_cells"), GetTimeConsumingCellsHandler),
        (endpoint_to_url(base_url, "user/top_error_types"), GetTopErrorTypesHandler),
        (endpoint_to_url(base_url, "user/timeline_success_errors"), GetTimelineSuccessErrorsHandler),
        (endpoint_to_url(base_url, "user/notebook_health_stats"), GetHealthHandler),
        (endpoint_to_url(base_url, "user/login_by_code"), UserLoginByCodeHandler),
    ]

    web_app.add_handlers(host_pattern, handlers)

def get_error_name(msg):
    """
    Extrae el nombre del error de un Traceback de Jupyter.
    Ejemplo: de "NameError: name 'a' is not defined" extrae "NameError"
    """
    if not msg:
        return "UnknownError"
    
    # Buscamos en la última línea no vacía, que es donde Python pone el resumen
    lines = [l for l in msg.strip().split('\n') if l.strip()]
    if not lines:
        return "UnknownError"
    
    last_line = lines[-1]
    
    # La última línea suele ser "NombreError: descripción"
    # Usamos regex para capturar solo la palabra antes de los primeros dos puntos
    match = re.search(r'^([a-zA-Z0-9_]+Error):', last_line)
    if match:
        return match.group(1)
    
    # Si no termina en "Error:", buscamos la primera palabra de la última línea
    return last_line.split(':')[0].strip()

def get_last_execution_count(handler, cell_id, session_id):
    """
    Devuelve el conteo de ejecuciones de la última ejecución
    para un cell_id y session_id específicos.
    """

    last_execution_count_row = execute_sql("""
            SELECT execution_count
                FROM cell_executions
                WHERE session_id = ? AND cell_id = ?
                ORDER BY end_time DESC
                LIMIT 1;
        """, (session_id, cell_id))
    return last_execution_count_row[0]["execution_count"] if last_execution_count_row else None

def get_jupyter_cell_id(handler, cell_id):
    """
    Devuelve el cell_id de Jupyter asociado a un ID interno de celda.
    Lanza una excepción si no existe.
    """

    jupyter_cell_row = execute_sql("""
        SELECT cell_id FROM cells
        WHERE id = ?;
    """, (cell_id,))

    if len(jupyter_cell_row) == 0:
        handler.set_status(400)
        handler.finish({
            "error": "Jupyter cell ID not found for the specified internal cell ID.",
            "cellId": cell_id
        })
        return None
    else:
        return jupyter_cell_row[0]["cell_id"]


def get_cell_id(handler, notebook_id, cellId):
    """
    Busca la celda en la base de datos. Si no existe, devuelve un error JSON y
    corta la ejecución devolviendo None. Si existe, retorna el ID interno.
    """

    cell_row = execute_sql("""
        SELECT id FROM cells c
        WHERE notebook_id = ? AND c.cell_id = ?;
    """, (notebook_id, cellId))

    if len(cell_row) == 0:
        handler.set_status(400)
        handler.finish({
            "error": "Cell not found in the specified notebook.",
            "notebookId": notebook_id,
            "cellId": cellId
        })
        return None
    else:
        return cell_row[0]["id"]


def get_active_session(handler, user_id, log_errors=True):
    """
    Devuelve el session_id de la sesión activa para ese usuario y notebook.
    Si no existe, envía un error JSON y devuelve None.
    """
    session_row = execute_sql("""
        SELECT session_id
        FROM notebook_sessions
        WHERE user_id = ? AND close_time IS NULL;
    """, (user_id,))

    if len(session_row) == 0:
        if log_errors:
            handler.set_status(400)
            handler.finish({
                "error": "No active session found for the user.",
                "user_id": user_id
            })
        return None
    else:
        return session_row[0]["session_id"]


def get_open_execution_id(handler, cell_id, session_id):
    """
    Devuelve el execution_id de la ejecución abierta más reciente
    para un cell_id y session_id específicos.
    Lanza una excepción si no existe ejecución abierta.
    """

    open_exec = execute_sql("""
        SELECT execution_id FROM cell_executions
            WHERE cell_id = ?
            AND session_id = ?
            AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1;
    """, (cell_id, session_id))

    if not open_exec:
        handler.set_status(400)
        handler.finish({
            "error": "No open execution found for the specified cell.",
            "cellId": cell_id,
            "sessionId": session_id
        })
        return None

    return open_exec[0]["execution_id"]


def get_notebook_id(handler, session_id):
    """
    Devuelve el notebook_id asociado a una session_id específica.
    Lanza una excepción si no existe.
    """

    notebook_row = execute_sql("""
        SELECT notebook_id FROM notebook_sessions
        WHERE session_id = ?;
    """, (session_id,))

    if len(notebook_row) == 0:
        handler.set_status(400)
        handler.finish({
            "error": "No notebook found for the specified session.",
            "sessionId": session_id
        })
        return None
    else:
        return notebook_row[0]["notebook_id"]


class Role(Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    UNKNOWN = "unknown"

def role_from_id(user_id: int) -> Role:
    row = execute_sql("SELECT role FROM users WHERE id = ?", (user_id,))
    if len(row) == 0:
        return Role.UNKNOWN
    
    role_str = row[0]["role"]
    if role_str == "student":
        return Role.STUDENT
    elif role_str == "teacher":
        return Role.TEACHER
    else:
        return Role.UNKNOWN

def is_teacher(user_id: int) -> bool:
    return role_from_id(user_id) == Role.TEACHER






def endpoint_to_url(base_url, endpoint):
    return url_path_join(base_url, "LA-Jupyter-Extension", endpoint)


def execute_sql(query, params=()):
    conn = sqlite3.connect(db_pth)
    conn.row_factory = sqlite3.Row  # Each row will be a dictionary-like object

    cursor = conn.cursor()
    try:
        cursor.execute(query, params)
        if query.strip().upper().startswith("SELECT") or query.strip().upper().startswith("WITH"):
            result = cursor.fetchall()
        else:
            conn.commit()
            result = None
        return result
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def execute_transaction(callback):
    conn = sqlite3.connect(db_pth)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        conn.execute("BEGIN IMMEDIATE TRANSACTION;")
        result = callback(cursor)
        conn.commit()
        return result
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()