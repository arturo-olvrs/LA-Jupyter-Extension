import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  LabShell
} from '@jupyterlab/application';

import { requestAPI } from './request';
import { ICommandPalette } from '@jupyterlab/apputils';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { CodeCellModel } from '@jupyterlab/cells';
import { Signal } from '@lumino/signaling';

export const extensionStateChanged = new Signal<any, void>({});
function notifyStateChange() {
  extensionStateChanged.emit(undefined);
}


import '../style/dashboard.css';
import { DashboardWidget } from './dashboard';

const DEBUG = false;


/**
 * Initialization data for the LA_Jupyter_Extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'LA_Jupyter_Extension:plugin',
  description: 'A JupyterLab extension for LA',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  activate: activate
};

export default plugin;




let currentUserId: number | null = null;
let currentNotebookId: number | null = null;
let errors = false;
const NOTEBOOK_PATH = 'NoteBooks/JupyterExercices.ipynb';

// Function only run when the extension is activated (when JupyterLab starts)
async function activate(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker
) : Promise<void> {

  checkInitialization();

  showStudyInformation();
  
  currentUserId = await selectUser();

  await notebookTracker.currentWidget?.context.ready;

  const shell = app.shell;

  if ('currentChanged' in shell && shell.currentChanged) {

    // Each time the current widget changes
    shell.currentChanged.connect((_, change) => {
      const oldWidget = change.oldValue;
      const newWidget = change.newValue;

      // Old notebook deactivated
      if (oldWidget && notebookTracker.has(oldWidget)) {
        const oldNb = notebookTracker.find(nb => nb === oldWidget);
        if (oldNb) {onNotebookDeactivated(oldNb);}
      }

      // New notebook activated
      if (newWidget && notebookTracker.has(newWidget)) {
        const newNb = notebookTracker.find(nb => nb === newWidget);
        if (newNb) {onNotebookActivated(newNb);}
      }
    });

  } else {
    console.warn("Shell does not support currentChanged signal.");
  }

    
  notebookTracker.widgetAdded.connect((_, notebookPanel) => {

    notebookPanel.disposed.connect(() => { onNotebookDeactivated(notebookPanel); });


    notebookPanel.context.ready.then(() => {
      
      let previousActiveCell: any = null;
      notebookPanel.content.activeCellChanged.connect(async () => {

        await notebookPanel.context.ready;

        const newCell = notebookPanel.content.activeCell;

        if (previousActiveCell && previousActiveCell !== newCell)
          onCellDeactivated(notebookPanel, previousActiveCell);

        if (newCell && previousActiveCell !== newCell)
          onCellActivated(notebookPanel, newCell);

        previousActiveCell = newCell;
      });

      
      
      
      
      const model = notebookPanel.context.model;

      // Listener for the execution of code cells
      for (let i = 0; i < model.cells.length; i++) {
        const cell = model.cells.get(i);
        if (!cell) continue;

        if (cell.type === 'code') {
          const codeCell = cell as CodeCellModel;

          // Escuchar cambio de ejecución
          codeCell.stateChanged.connect((_, args: any) => {
            if (args.name === 'executionState' && codeCell.executionState == 'running') 
              onCodeExecutionStarted(notebookPanel, codeCell);
            
            else if (args.name === 'executionState' && codeCell.executionState == 'idle')
              onCodeExecutionFinished(notebookPanel, codeCell);
            
          });
        }
      }

      notebookPanel.context.saveState.connect((_, state) => {
        if (state === 'completed') {
          onNotebookSaved(notebookPanel);
        }
      });
    
    });
  });


  // When the window is closed, we deactivate all open notebooks
  window.addEventListener("beforeunload", () => {
    notebookTracker.forEach(nb => {
      onNotebookDeactivated(nb);
    });
  });



  const command = 'dashboard:open';
  let dashboardWidget: DashboardWidget | null = null;

  app.commands.addCommand(command, {
    label: 'Open Notebook Dashboard',
    execute: () => {
      if (!dashboardWidget || dashboardWidget.isDisposed) {
        dashboardWidget = new DashboardWidget(notebookTracker);
      }
      
      if (!dashboardWidget.isAttached) {
        app.shell.add(dashboardWidget, 'right');
      }

      app.shell.activateById(dashboardWidget.id);

      if (notebookTracker.currentWidget) {
        notebookTracker.currentWidget.content.activate();
      }
      
      if (app.shell instanceof LabShell) {
        app.shell.expandRight();
      }
    }
  });

  palette.addItem({ command, category: 'Dashboard' });


  app.restored.then(async () => {
    if (currentUserId !== -1) {
      
      //--- 3. ABRIR EL NOTEBOOK DEL ESTUDIO ---
      try {
        // 1. Abrimos el archivo
        const result = await app.commands.execute('docmanager:open', {
          path: NOTEBOOK_PATH
        });

        // 2. Si el comando devolvió el widget, forzamos el foco
        if (result) {
          // Activamos el widget en el shell
          app.shell.activateById(result.id);
          
          // Si es un NotebookPanel, activamos su contenido interno (el editor de celdas)
          if (result instanceof NotebookPanel) {
            result.content.activate();
          }
        }
      } catch (error) {
        logError(`Could not open ${NOTEBOOK_PATH}. Check if the path is correct.`);
      }



      // Ejecutamos el comando que ya definiste más abajo en tu código
      app.commands.execute('dashboard:open');
      logDebug("Dashboard opened automatically on startup.");
    }
  });
}



function checkInitialization() {
  requestAPI<{ status: string }>('init')
    .then(data => {
      if (data.status === 'ok') {
        logDebug('JupyterLab extension LA_Jupyter_Extension has been sucessfully activated.');
      } else {
        logError('Server extension LA_Jupyter_Extension is not responding as expected.');
      }
    })
    .catch(reason => {
      logError(`Error connecting to the LA_Jupyter_Extension server extension.\n${reason}`);
    });
}


async function showStudyInformation(): Promise<boolean> {
  const infoBody = new Widget();
  infoBody.node.innerHTML = `
    <div style="font-size: 14px; line-height: 1.5; color: var(--jp-ui-font-color1);">
      <p>You are invited to participate in a study aimed at improving the learning experience in programming environments.</p>
      
      <p style="margin-top: 10px;"><strong>What do you need to do?</strong></p>
      <ol style="margin-left: 20px;">
        <li><strong>Complete the activity:</strong> Open and solve the notebook located in the <code>${NOTEBOOK_PATH}</code> path.</li>
        <li><strong>Consult the Dashboard:</strong> Keep the dashboard on the right side open to monitor your progress in real-time.</li>
        <li><strong>Final Survey:</strong> Upon completion, you must fill out a feedback survey (approx. 10 minutes).</li>
      </ol>

      <p style="margin-top: 10px;"><strong>Privacy:</strong> All data is pseudonymized. Your activity is linked to a code, not your name. Participation is voluntary.</p>
    </div>
  `;

  const result = await showDialog({
    title: 'Study Instructions & Consent',
    body: infoBody,
    buttons: [
      Dialog.okButton({ label: 'I Understand and Continue' })
    ]
  });

  return result.button.accept;
}



async function onNotebookActivated(nb: NotebookPanel) {
  await nb.context.ready
  const metadata = nb.context.model.metadata as any;

  requestAPI<any>('notebook/activate', {
      method: 'POST',
      body: JSON.stringify({
        title: nb.title.label,
        path: nb.context.path,
        author: metadata.author,
        cells: cellsToJson(nb),
        userId: currentUserId,
      }),
  })
    .then (data   => {
        logDebug("Notebook activated:", data);
        currentNotebookId = data.notebook_id;
      })
    .catch(reason => { logError(reason); });

  notifyStateChange();
}

async function onNotebookDeactivated(nb: NotebookPanel) {

  await nb.context.ready
  requestAPI<any>('notebook/deactivate', {
      method: 'POST',
      body: JSON.stringify({
        userId: currentUserId,
      }),
  })
    .then (data   => {
      logDebug("Notebook deactivated:", data);
      currentNotebookId = null;
    })
    .catch(reason => { logError(reason); });
  
  notifyStateChange();
}


function cellToJson(cell: any) {
  return {
    id: cell.id,
    type: cell.type,
    content: cell.sharedModel.getSource(),
  };
}


function cellsToJson(nb: NotebookPanel) {
  const model = nb.context.model;

  const cells: any[] = [];

  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);

    cells.push(cellToJson(cell));
  }

  return cells;
}


function onCodeExecutionStarted(nb: NotebookPanel, cell: any) {
  requestAPI('cell/execution/started', {
      method: 'POST',
      body: JSON.stringify({
        content: cell.sharedModel.getSource(),
        cellId: cell.sharedModel.getId(),
        userId: currentUserId,
      })
  })
    .then (data   => {
        logDebug("Cell execution started:", data);
      })
    .catch(reason => { logError(reason); });

  notifyStateChange();
}

// Function to strip ANSI escape codes from a string
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function onCodeExecutionFinished(notebookPanel: NotebookPanel, codeCell: CodeCellModel) {

  const outputsRaw = codeCell.outputs.toJSON();

  const errors = outputsRaw.filter((o: any) => o.output_type === 'error');
  const outputs = outputsRaw.filter((o: any) => o.output_type !== 'error');


  const executionCount = codeCell.executionCount;
  const num_errors = errors.length;
  const error_msgs: string[] = [];
  errors.forEach((err: any) => {
    const cleanTraceback = err.traceback?.map((line: string) => stripAnsi(line)).join('\n') ?? '';
    error_msgs.push(cleanTraceback);
  });


  requestAPI('cell/execution/finished', {
      method: 'POST',
      body: JSON.stringify({
        cellId: codeCell.sharedModel.getId(),
        userId: currentUserId,
        executionCount: executionCount,
        output: JSON.stringify(outputs),
        num_errors: num_errors,
        error_msg: JSON.stringify(error_msgs)
      })
  })
    .then (data   => {
        logDebug("Cell execution finished:", data);
      })
    .catch(reason => { logError(reason); });

  notifyStateChange();
}




function onCellActivated(nb: NotebookPanel, cell: any) {
  if (!cell) return;
  
  requestAPI('cell/activate', {
    method: 'POST',
    body: JSON.stringify({
      cellId: cell.model.id,
      userId: currentUserId,
    })
  })
    .then (data   => {
        logDebug('Cell activated:', data);
      })
    .catch(reason => { logError(reason); });

  notifyStateChange();
}

async function onCellDeactivated(nb: NotebookPanel, cell: any) {

  await nb.context.ready;
  if (!cell || !cell.model || !cell.model.id) return;

  requestAPI('cell/deactivate', {
    method: 'POST',
    body: JSON.stringify({
      cellId: cell.model.id,
      userId: currentUserId,
    })
  })
    .then (data   => {
        logDebug('Cell deactivated:', data);
      })
    .catch(reason => { logError(reason); });
  
  notifyStateChange();
}


async function onNotebookSaved(nb: NotebookPanel) {
  await nb.context.ready
  const metadata = nb.context.model.metadata as any;
  requestAPI<any>('notebook/saved', {
      method: 'POST',
      body: JSON.stringify({
        notebook_id: currentNotebookId,
        title: nb.title.label,
        path: nb.context.path,
        author: metadata.author,
        cells: cellsToJson(nb),
        userId: currentUserId,
      }),
  })
    .then (data   => {
        logDebug("Notebook saved:", data);
      })
    .catch(reason => { logError(reason); });
        
  notifyStateChange();
}

async function selectUser(): Promise<number> {
  const body = new Widget();
  
  const instructionContainer = document.createElement('div');
  instructionContainer.style.fontSize = '14px';
  instructionContainer.style.lineHeight = '1.5';
  
  instructionContainer.innerHTML = `
    <p><strong>Scheme for Creating a Pseudonymized Identification Code</strong></p>
    <p>Please create your personal code according to the following scheme and enter it exactly in this order (in uppercase):</p>
    <ul style="list-style-type: disc; margin-left: 20px;">
      <li>Last two letters of your <strong>first name</strong></li>
      <li>First two letters of your <strong>mother's first name</strong></li>
      <li><strong>Year of birth</strong> of your father (four digits)</li>
    </ul>
    <div style="background-color: var(--jp-layout-color2); padding: 10px; border-radius: 4px; margin: 10px 0;">
      <strong>Example:</strong><br>
      First name: Anna → <strong>NA</strong><br>
      Mother's first name: Maria → <strong>MA</strong><br>
      Father's year of birth: 1968 → <strong>1968</strong><br>
      <span style="font-size: 16px;">➡️ Code: <strong>NAMA1968</strong></span>
    </div>
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter your code (e.g., NAMA1968)';
  input.className = 'jp-mod-styled';
  input.style.width = '100%';
  input.style.marginTop = '10px';
  input.style.padding = '8px';

  body.node.appendChild(instructionContainer);
  body.node.appendChild(input);

  const result = await showDialog({
    title: 'Identification Code Required',
    body: body,
    buttons: [Dialog.okButton({ label: 'Submit Code' })]
  });

  if (result.button.accept) {
    const userCode = input.value.trim().toUpperCase();
    
    if (!userCode) {
      return -1;
    }

    return requestAPI<any>('user/login_by_code', {
      method: 'POST',
      body: JSON.stringify({
        personal_code: userCode,
        role: 'student'
      }),
    })
      .then(data => {
        logDebug(`User ID for code ${userCode}:`, data);
        return data.id;
      })
      .catch(reason => {
        logError(`Error fetching user ID for code ${userCode}:`, reason);
        return -1;
      });
  }else{
    return -1;
  }
}

export function logDebug(...args: any[]) {
  if (DEBUG) console.log("Juptyter Extension - LA", ...args);
}

export function logError(...args: any[]) {
  errors = true;
  console.error("Juptyter Extension - LA", ...args);
}

export interface IUserInfo {
  id: number;
  code: string;
  role: string;
}

async function getUserById(userId: number): Promise<IUserInfo> {
  return requestAPI<IUserInfo>(`user`, {
    method: 'POST',
    body: JSON.stringify({
      userId: userId,
    }),
  })
    .then(data => {
      return {
        id: userId,
        code: data.code,
        role: data.role
      };
    })
    .catch(reason => {
      logError(`Error fetching user for ID ${userId}:`, reason);
      return {
        id: -1,
        code: 'Unknown',
        role: 'unknown'
      };
    });
}


export async function getCurrentUser(): Promise<IUserInfo> {
  if (currentUserId === null) {
    return Promise.resolve({
      id: -1,
      code: 'Unknown',
      role: 'unknown'
    });
  }
  return getUserById(currentUserId);
}


export function haveBeenErrors(): boolean {
  return errors;
}


export interface INotebookInfo {
  id: number;
  title: string;
  author_id: string;
  path: string;
  open_time: string;
}

async function getCurrentNotebookByUserId(userId: number): Promise<INotebookInfo> {
  return requestAPI<INotebookInfo>(`notebook/current_by_user`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
    .then(data => {
      return {
        id: data.id,
        title: data.title,
        author_id: data.author_id,
        path: data.path,
        open_time: data.open_time
      };
    })
    .catch(reason => {
      logError(`Error fetching current notebook for user ID ${userId}:`, reason);
      return { id: -1, title: 'Unknown', author_id: 'unknown', path: 'unknown', open_time: 'unknown' };
    });
}

export async function getCurrentNotebookByCurrentUser(): Promise<INotebookInfo> {
  if (currentUserId === null) {
    return Promise.resolve({ id: -1, title: 'Unknown', author_id: 'unknown', path: 'unknown', open_time: 'unknown' });
  }
  return getCurrentNotebookByUserId(currentUserId);
}


export function isActiveNotebook(): boolean {
  return currentNotebookId !== null;
}

async function getErrorRateByUserId(userId: number): Promise<number> {
  return requestAPI<any>(`user/error_rate`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
    .then(data => {
      return data.errorRate;
    })
    .catch(reason => { logError(reason); });
}

export async function getErrorRateForCurrentUser(): Promise<number> {
  if (currentUserId === null) {
    return Promise.resolve(0);
  }
  return await getErrorRateByUserId(currentUserId);
}



export interface IErrorCell {
  cellId: string;
  jupyterCellId: string;
  codeSnippet: string;
  executionCount: number | null;
  errorCount: number;
}

async function getTopErrorCellsByUserId(tracker: INotebookTracker, limit: number, userId: number): Promise<IErrorCell[]> {
  return requestAPI<any>(`user/top_error_cells`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      limit: limit
    }),
  })
    .then(data => {
      const topCellsFromDB = data.topErrorCells || [];
      const currentNotebook = tracker.currentWidget;

      if (!currentNotebook) {
        // If no notebook is active, return placeholders
        return topCellsFromDB.map((dbRow: any) => ({
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: 'Notebook not active',
          executionCount: dbRow.last_execution_count,
          errorCount: dbRow.error_count
        }));
      }

      // "Enrich" the DB data with the actual content of the Notebook
      return topCellsFromDB.map((dbRow: any) => {
        let snippet = getCellContentSnippet(currentNotebook, dbRow.jupyter_cell_id);

        return {
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: snippet || '(Empty Cell)',
          executionCount: dbRow.last_execution_count,
          errorCount: dbRow.error_count
        };
      });
    })
    .catch(reason => {
      logError(`Error fetching top error cells:`, reason);
      return [];
    });
}

export async function getTopErrorCellsForCurrentUser(tracker: INotebookTracker, limit: number): Promise<IErrorCell[]> {
  if (currentUserId === null) {
    return Promise.resolve([]);
  }
  return await getTopErrorCellsByUserId(tracker, limit, currentUserId);
}

function getCellContentSnippet(notebook: NotebookPanel, jupyterCellId: string): string {
  const cellWidget = notebook.content.widgets.find(
    w => w.model.id === jupyterCellId
  );

  let snippet = 'Cell content not found';
  if (cellWidget) {
    const fullCode = cellWidget.model.sharedModel.getSource();
    
    const lines = fullCode.split('\n');

    const max_lines = 2;
    const max_chars_per_line = 30;
    
    const firstLines = lines.slice(0, max_lines);
    
    const processedLines = firstLines.map(line => {
      let cleanLine = line.replace(/\s+$/, '');
      if (cleanLine.length > max_chars_per_line) {
        return cleanLine.substring(0, max_chars_per_line) + '    ...';
      }
      return cleanLine;
    });

    if (lines.length > max_lines) {
      processedLines.push('...');
    }

    snippet = processedLines.join('<br>');
  }
  else{
    logError(`Cell with Jupyter ID ${jupyterCellId} not found in current notebook.`);
  }
  return snippet;
}

export interface IAttemptCell {
  cellId: number;
  jupyterCellId: string;
  codeSnippet: string;
  executionCount: number;
  attemptCount: number;
}

async function getTopAttemptCellsByUserId(tracker: INotebookTracker, limit: number, userId: number): Promise<IAttemptCell[]> {
  return requestAPI<any>(`user/top_attempt_cells`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      limit: limit
    }),
  })
    .then(data => {
      const topCellsFromDB = data.topAttemptCells || [];
      const currentNotebook = tracker.currentWidget;

      if (!currentNotebook) {
        return topCellsFromDB.map((dbRow: any) => ({
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: 'Notebook not active',
          executionCount: dbRow.last_execution_count,
          attemptCount: dbRow.attempt_count
        }));
      }

      return topCellsFromDB.map((dbRow: any) => {
        let snippet = getCellContentSnippet(currentNotebook, dbRow.jupyter_cell_id);

        return {
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: snippet || '(Empty Cell)',
          executionCount: dbRow.last_execution_count,
          attemptCount: dbRow.attempt_count
        };
      });
    })
    .catch(reason => {
      logError(`Error fetching top attempt cells:`, reason);
      return [];
    });
}

export async function getTopAttemptCellsForCurrentUser(tracker: INotebookTracker, limit: number): Promise<IAttemptCell[]> {
  if (currentUserId === null) return [];
  return await getTopAttemptCellsByUserId(tracker, limit, currentUserId);
}

async function getNotebookHealthStatsByUserId(userId: number): Promise<any> {
  return requestAPI<any>(`user/notebook_health_stats`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
    }),
  })
    .then(data => {
      return data.healthStats || {};
    })
    .catch(reason => {
      logError(`Error fetching notebook health stats:`, reason);
      return {};
    });
}

export async function getNotebookHealthStatsForCurrentUser(): Promise<any> {
  if (currentUserId === null) {
    return Promise.resolve({});
  }
  return await getNotebookHealthStatsByUserId(currentUserId);
}



export interface ITimeCell {
  cellId: number;
  jupyterCellId: string;
  codeSnippet: string;
  executionCount: number;
  totalTimeSpent: number;
}

async function getTopTimeCellsByUserId(tracker: INotebookTracker, limit: number, userId: number): Promise<ITimeCell[]> {
  return requestAPI<any>(`user/time_consuming_cells`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      limit: limit
    }),
  })
    .then(data => {
      const topCellsFromDB = data.timeConsumingCells || [];
      const currentNotebook = tracker.currentWidget;

      if (!currentNotebook) {
        return topCellsFromDB.map((dbRow: any) => ({
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: 'Notebook not active',
          executionCount: dbRow.last_execution_count,
          totalTimeSpent: dbRow.total_time_spent
        }));
      }

      return topCellsFromDB.map((dbRow: any) => {
        let snippet = getCellContentSnippet(currentNotebook, dbRow.jupyter_cell_id);

        return {
          cellId: dbRow.cell_id,
          jupyterCellId: dbRow.jupyter_cell_id,
          codeSnippet: snippet || '(Empty Cell)',
          executionCount: dbRow.last_execution_count,
          totalTimeSpent: dbRow.total_active_time_seconds
        };
      });
    })
    .catch(reason => {
      logError(`Error fetching top time-consuming cells:`, reason);
      return [];
    });
}

export async function getTopTimeCellsForCurrentUser(tracker: INotebookTracker, limit: number): Promise<ITimeCell[]> {
  if (currentUserId === null) return [];
  return await getTopTimeCellsByUserId(tracker, limit, currentUserId);
}


export interface IErrorType {
  errorType: string;
  occurrenceCount: number;
}

async function getTopErrorTypesByUserId(userId: number): Promise<IErrorType[]> {
  return requestAPI<any>(`user/top_error_types`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
    }),
  })
    .then(data => {
      const ErrorTypesFromDB = data.errorDistribution || [];
      
      return ErrorTypesFromDB.map((dbRow: any) => ({
        errorType: dbRow.error_type,
        occurrenceCount: dbRow.occurrence_count
      }));
    })
    .catch(reason => {
      logError(`Error fetching top error types:`, reason);
      return [];
    });
}

export async function getTopErrorTypesForCurrentUser(): Promise<IErrorType[]> {
  if (currentUserId === null) {
    return Promise.resolve([]);
  }
  return await getTopErrorTypesByUserId(currentUserId);
}

async function getTimelineSuccessErrorsByUserId(userId: number): Promise<any[]> {
  return requestAPI<any>(`user/timeline_success_errors`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
    }),
  })
    .then(data => {
      return data.timelineData || [];
    })
    .catch(reason => {
      logError(`Error fetching timeline of success and errors:`, reason);
      return [];
    });
}

export async function getTimelineSuccessErrorsForCurrentUser(): Promise<any[]> {
  if (currentUserId === null) {
    return Promise.resolve([]);
  }
  return await getTimelineSuccessErrorsByUserId(currentUserId);
}