import { Widget } from '@lumino/widgets';
import { INotebookTracker } from '@jupyterlab/notebook';
import {  extensionStateChanged,
          getCurrentUser,
          haveBeenErrors,
          getCurrentNotebookByCurrentUser,
          logError,
          isActiveNotebook,
          getErrorRateForCurrentUser,
          getTopErrorCellsForCurrentUser,
          getTopTimeCellsForCurrentUser,
          getTopAttemptCellsForCurrentUser,
          getTopErrorTypesForCurrentUser,
          getTimelineSuccessErrorsForCurrentUser,
          getNotebookHealthStatsForCurrentUser
        } from './index';
import { requestAPI } from './request';

interface TimelinePoint {
  x: Date;
  y: string;
}

export class DashboardWidget extends Widget {
  private _tracker: INotebookTracker;

  constructor(tracker: INotebookTracker) {
    super();
    this._tracker = tracker;
    this.id = 'la-notebook-dashboard';
    this.title.label = '📊 Notebook Dashboard';
    this.title.closable = true;
    this.addClass('la-dashboard-wrapper'); // Clase del CSS

    this.node.innerHTML = `
<div class="la-dashboard-container">
  <header class="la-header">
    <div class="la-user-card">
      <div class="la-user-details">
        <div id="user-name" class="la-user-main-name">Loading...</div>
        <div class="la-role-line">
          <span class="la-role-label">Access Level:</span>
          <span id="user-role" class="la-role-value">-</span>
        </div>
      </div>
    </div>
  </header>

  <section class="la-stats-grid">
    <div class="la-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Current Progress</span>
            <span class="la-help-badge" data-help="Progress calculated as the percentage of executed code cells without errors over the total number of code cells.">?</span>
          </div>
          <div id="progress-notebook-title" class="la-panel-subtitle">No active notebook</div>
          <div id="progress-open-time" class="la-panel-subtitle-time">—</div>
        </div>
        <span id="progress-percent" class="la-panel-value">0%</span>
      </div>
      <div class="la-panel-content">
        <div class="la-progress-track">
          <div id="progress-fill" class="la-progress-fill"></div>
        </div>
      </div>
    </div>

    <div class="la-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">SUCCESS/ERROR/ATTEMPT RATE</span>
            <span class="la-help-badge" data-help="• 🟢 (Success): Success at first try&#10;• 🟡 (+1 Attempt): Fixed after retrying&#10;• 🔴 (Error): Last execution failed&#10;Porcentage of code cells of each type with respect to the total number of cells.">?</span>
          </div>
        </div>
      </div>
      <div class="la-panel-content">
        <div class="la-stacked-bar-container">
          <div id="health-bar-success" class="la-bar-segment segment-success"></div>
          <div id="health-bar-warning" class="la-bar-segment segment-warning"></div>
          <div id="health-bar-error" class="la-bar-segment segment-error"></div>
        </div>
        
        <div class="la-health-legend">
          <div class="la-legend-item">
            <span class="dot dot-success"></span>
            <span>Success: <b id="text-health-success">0%</b></span>
          </div>
          <div class="la-legend-item">
            <span class="dot dot-warning"></span>
            <span>+1 Attempts: <b id="text-health-warning">0%</b></span>
          </div>
          <div class="la-legend-item">
            <span class="dot dot-error"></span>
            <span>Errors: <b id="text-health-error">0%</b></span>
          </div>
        </div>
      </div>
    </div>

    <div class="la-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Error Rate</span>
            <span class="la-help-badge" data-help="Percentage of cell executions that resulted in errors over the total number of executions.">?</span>
          </div>
        </div>
        <span id="error-rate-text" class="la-panel-value">0%</span>
      </div>
      <div class="la-panel-content la-flex-center">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle class="la-circle-bg" cx="40" cy="40" r="32" stroke-width="10" fill="transparent" />
          <circle id="error-circle-fill" class="la-circle-fill" cx="40" cy="40" r="32" 
                  stroke-width="10" fill="transparent" 
                  stroke-dasharray="201.6" stroke-dashoffset="201.6"
                  transform="rotate(-90 40 40)">
            <title id="error-circle-tooltip"></title>
          </circle>
        </svg>
      </div>
    </div>

    <div class="la-panel la-error-ranking-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Top Error Cells</span>
            <span class="la-help-badge" data-help="Cells with the highest number of execution errors.">?</span>
          </div>
          <div class="la-panel-controls">
            <label for="la-error-limit">Limit:</label>
            <input 
              type="number" 
              id="la-error-limit" 
              class="la-input-number" 
              value="5" 
              min="1" 
              max="50"
            >
          </div>
        </div>
      </div>
      
      <div id="la-error-cells-list" class="la-error-list">
        <div class="la-placeholder">No errors detected yet</div>
      </div>
    </div>

    <div class="la-panel la-attempt-ranking-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Top Attempt Cells</span>
            <span class="la-help-badge" data-help="Cells with the highest number of execution attempts (retries).&#10;Even the final execution attempt is counted.">?</span>
          </div>
          <div class="la-panel-controls">
            <label for="la-attempt-limit">Limit:</label>
            <input 
              type="number" 
              id="la-attempt-limit" 
              class="la-input-number" 
              value="5" 
              min="1" 
              max="50"
            >
          </div>
        </div>
      </div>
      
      <div id="la-attempt-cells-list" class="la-error-list">
        <div class="la-placeholder">No attempts detected yet</div>
      </div>
    </div>

    <div class="la-panel la-time-ranking-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Top Time-Consuming Cells</span>
            <span class="la-help-badge" data-help="Cells with the highest time being active (editing them).">?</span>
          </div>
          <div class="la-panel-controls">
            <label for="la-time-limit">Limit:</label>
            <input 
              type="number" 
              id="la-time-limit" 
              class="la-input-number" 
              value="5" 
              min="1" 
              max="50"
            >
          </div>
        </div>
      </div>
      
      <div id="la-time-cells-list" class="la-error-list">
        <div class="la-placeholder">No timing data collected yet</div>
      </div>
    </div>

    <div class="la-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Top Common Error Types</span>
            <span class="la-help-badge" data-help="Most frequent Python error types encountered during code cell executions.">?</span>
          </div>
          <div class="la-panel-controls">
            <label for="la-errortypes-limit">Limit:</label>
            <input 
              type="number" 
              id="la-errortypes-limit" 
              class="la-input-number" 
              value="5" 
              min="1" 
              max="50"
            >
          </div>
        </div>
      </div>
      <div id="la-common-errors-list" class="la-error-list">
        <div class="la-placeholder">No errors detected yet</div>
      </div>
    </div>

    <div class="la-panel">
      <div class="la-panel-header">
        <div class="la-panel-title-group">
          <div class="la-title-row">
            <span class="la-panel-title">Execution Timeline</span>
            <span class="la-help-badge" data-help="Timeline of code cell executions indicating successes and errors over time.">?</span>
          </div>
        </div>
      </div>
      <div class="la-timeline-container">
        <canvas id="la-execution-timeline"></canvas>
      </div>
    </div>
  </section>
  

  <footer class="la-footer">
    <div class="la-footer-left">
      <span id="la-status-indicator" class="la-status-dot"></span> 
      <span id="la-status-text">System Connected</span>
    </div>
    
    <div class="la-footer-right">
      <span class="la-footer-names">Arturo Olivares & Lisa Pawlowski</span>
    </div>
  </footer>
</div>
    `;

    ['#la-error-limit', '#la-time-limit', '#la-errortypes-limit', '#la-attempt-limit'].forEach(selector => {
      const input = this.node.querySelector(selector) as HTMLInputElement;
      if (input) {
        input.addEventListener('change', () => {
          this.updateContent();
        });
      }
    });

    extensionStateChanged.connect(() => {
      this.updateContent();
    });
  }

  protected onActivateRequest(): void {
    this.updateContent();
  }
  



  async updateContent(): Promise<void> {
    // 1. Update User Section
    const nameEl = this.node.querySelector('#user-name');
    const roleEl = this.node.querySelector('#user-role') as HTMLElement;
    
    const user = await getCurrentUser();

    if (nameEl && roleEl) {
      if (user && user.code !== 'Unknown') {
        nameEl.textContent = `${user.code}`;
        roleEl.textContent = user.role;
        roleEl.setAttribute('data-role', user.role.toLowerCase());
      } else {
        nameEl.textContent = 'Guest User';
        roleEl.textContent = 'None';
        roleEl.setAttribute('data-role', 'none');
      }
    }

    if (user.role.toLowerCase() === 'teacher') {
      const statsGrid = this.node.querySelector('.la-stats-grid') as HTMLElement;

      // Change content. Only a panel that tells that the dashboard is made for students
      statsGrid.innerHTML = `
        <div class="la-panel la-teacher-placeholder">
          <div class="la-panel-header">
            <div class="la-panel-title-group">
              <span class="la-panel-title">You are logged in as a Teacher</span>
            </div>
          </div>
          <div class="la-panel-content la-flex-center">
            <div class="la-teacher-message">
              <p>This dashboard is designed for students to monitor their notebook progress and errors.</p>
              <p>As a teacher, you have no active notebook sessions to track.</p>
            </div>
          </div>
        </div>
      `;
      
      return;
    }





    // 2. Update Progress Bar Section
    const fillEl = this.node.querySelector('#progress-fill') as HTMLElement;
    const percentTextEl = this.node.querySelector('#progress-percent');
    const notebookTitleEl = this.node.querySelector('#progress-notebook-title');
    const openTimeEl = this.node.querySelector('#progress-open-time') as HTMLElement;

    let progress = 0;
    let notebookTitle = 'No active notebook';
    let openTimeText = '—';

    const is_active = isActiveNotebook();

    if (is_active) {
      const currentNotebook = await getCurrentNotebookByCurrentUser();
      if (currentNotebook) {
        notebookTitle = currentNotebook.title || 'No active notebook';
        if (openTimeEl && currentNotebook.open_time) {
          const openDate = new Date(currentNotebook.open_time + 'Z'); // It assumes UTC
          const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Berlin' // CET/CEST
          };
          const formattedDate = openDate.toLocaleString('en-GB', options);
          openTimeText = `Opened: ${formattedDate}`;
        }

        progress = await getProgressForNotebook(currentNotebook.id);
      }
    }
    
    if (notebookTitleEl) {
      notebookTitleEl.textContent = notebookTitle;
    }
    if (fillEl && percentTextEl) {
      const safePercent = Math.min(Math.max(progress, 0), 100);
      fillEl.style.width = `${safePercent}%`;
      fillEl.setAttribute('title', `${Math.round(safePercent)}%`);
      percentTextEl.textContent = `${Math.round(safePercent)}%`;
    }
    if (openTimeEl) {
      openTimeEl.textContent = openTimeText;
    }


    // 3. Update Error Rate Section
    let errorRate = 0;
    if (is_active) {
      errorRate = await getErrorRateForCurrentUser();
    }

    const circleFill = this.node.querySelector('#error-circle-fill') as SVGCircleElement;
    const errorText = this.node.querySelector('#error-rate-text');
    const circleTooltip = this.node.querySelector('#error-circle-tooltip');

    if (circleFill && errorText) {
      const safeRate = Math.min(Math.max(errorRate, 0), 100);
      
      const circumference = 2 * Math.PI * 32; // r = 32
      const offset = circumference - (safeRate / 100) * circumference;
      
      const hue = 120 - (safeRate * 1.2); 

      if (!is_active){
        circleFill.style.opacity = '0';
        circleFill.style.strokeDashoffset = circumference.toString();
        errorText.textContent = '- %';
        if (circleTooltip) circleTooltip.textContent = "- %";
      }else{
        circleFill.style.opacity = '1';
        errorText.textContent = `${Math.round(safeRate)}%`;

        circleFill.style.strokeDashoffset = offset.toString();
        circleFill.style.stroke = `hsl(${hue}, 70%, 45%)`; // Dynamic color
        if (circleTooltip) circleTooltip.textContent = `${Math.round(safeRate)}%`;
      }
    }

    // 3.1. Update Top Attempt Cells Section
    const attemptListContainer = this.node.querySelector('#la-attempt-cells-list');
    let attemptLimitInput = this.node.querySelector('#la-attempt-limit') as HTMLInputElement;

    if (!is_active){
      if (attemptListContainer) {
        attemptListContainer.innerHTML = '<div class="la-placeholder">No active notebook</div>';
      }
    }else{
      let limit = attemptLimitInput ? parseInt(attemptLimitInput.value) : 5;
      if (isNaN(limit) || limit < 1) {
        limit = 5; 
      }

      const topAttempts = await getTopAttemptCellsForCurrentUser(this._tracker, limit);

      if (attemptListContainer) {
        if (topAttempts.length === 0) {
          attemptListContainer.innerHTML = '<div class="la-placeholder">No attempts detected yet</div>';
        } else {
          attemptListContainer.innerHTML = '';
          
          topAttempts.forEach(cellData => {
            const item = document.createElement('div');
            item.className = 'la-error-item';
            
            const executionDisplay = cellData.executionCount ? `In [${cellData.executionCount}]` : '[ ]';
            const attemptText = cellData.attemptCount === 1 ? 'attempt' : 'attempts';
            const highlightedSnippet = this.highlightPython(cellData.codeSnippet);
            
            item.innerHTML = `
              <div class="la-error-cell-data">
                <span class="la-cell-header">Cell ${executionDisplay}</span>
                <code class="la-cell-code-preview">${highlightedSnippet}</code>
              </div>
              <div class="la-error-stats">
                <span class="la-count-badge la-normal">${cellData.attemptCount} ${attemptText}</span>
                <button class="la-goto-btn" title="Go to cell">🎯</button>
              </div>
            `;

            const btn = item.querySelector('.la-goto-btn');
            btn?.addEventListener('click', () => {
              this.scrollToCell(cellData.jupyterCellId);
            });

            attemptListContainer.appendChild(item);
          });
        }
      }
    }


    // 4. Update Top Error Cells Section

    const errorListContainer = this.node.querySelector('#la-error-cells-list');
    let limitInput = this.node.querySelector('#la-error-limit') as HTMLInputElement;

    if (!is_active){
      if (errorListContainer) {
        errorListContainer.innerHTML = '<div class="la-placeholder">No active notebook</div>';
      }
    }else{
      let limit = limitInput ? parseInt(limitInput.value) : 5;
      if (isNaN(limit) || limit < 1) {
        limit = 5; 
      }

      const topErrors = await getTopErrorCellsForCurrentUser(this._tracker, limit);

      if (errorListContainer) {
        if (topErrors.length === 0) {
          errorListContainer.innerHTML = '<div class="la-placeholder">No errors detected yet</div>';
        } else {
          errorListContainer.innerHTML = '';
          
          topErrors.forEach(cellData => {
            const item = document.createElement('div');
            item.className = 'la-error-item';
            
            const executionDisplay = cellData.executionCount ? `In [${cellData.executionCount}]` : '[ ]';
            const failText = cellData.errorCount === 1 ? 'fail' : 'fails';
            const highlightedSnippet = this.highlightPython(cellData.codeSnippet);
            
            item.innerHTML = `
              <div class="la-error-cell-data">
                <span class="la-cell-header">Cell ${executionDisplay}</span>
                <code class="la-cell-code-preview">${highlightedSnippet}</code>
              </div>
              <div class="la-error-stats">
                <span class="la-count-badge la-error">${cellData.errorCount} ${failText}</span>
                <button class="la-goto-btn" title="Go to cell">🎯</button>
              </div>
            `;

            const btn = item.querySelector('.la-goto-btn');
            btn?.addEventListener('click', () => {
              this.scrollToCell(cellData.jupyterCellId);
            });

            errorListContainer.appendChild(item);
          });
        }
      }
    }
    
    limitInput = this.node.querySelector('#la-time-limit') as HTMLInputElement;
    

    const timeListContainer = this.node.querySelector('#la-time-cells-list');
    if (!is_active){
      if (timeListContainer) {
        timeListContainer.innerHTML = '<div class="la-placeholder">No active notebook</div>';
      }
    }else{
      let limit = limitInput ? parseInt(limitInput.value) : 5;
      if (isNaN(limit) || limit < 1) {
        limit = 5; 
      }

      const topTime = await getTopTimeCellsForCurrentUser(this._tracker, limit);

      if (timeListContainer) {
        if (topTime.length === 0) {
          timeListContainer.innerHTML = '<div class="la-placeholder">No timing data collected yet</div>';
        } else {
          timeListContainer.innerHTML = '';
          
          topTime.forEach(cellData => {
            const item = document.createElement('div');
            item.className = 'la-error-item';

            
            const executionDisplay = cellData.executionCount ? `In [${cellData.executionCount}]` : '[ ]';
            const timeSpentFormatted = this.formatTime(cellData.totalTimeSpent);
            const highlightedSnippet = this.highlightPython(cellData.codeSnippet);
            
            item.innerHTML = `
              <div class="la-error-cell-data">
                <span class="la-cell-header">Cell ${executionDisplay}</span>
                <code class="la-cell-code-preview">${highlightedSnippet}</code>
              </div>
              <div class="la-error-stats">
                <span class="la-count-badge la-success">${timeSpentFormatted}</span>
                <button class="la-goto-btn" title="Go to cell">🎯</button>
              </div>
            `;

            const btn = item.querySelector('.la-goto-btn');
            btn?.addEventListener('click', () => {
              this.scrollToCell(cellData.jupyterCellId);
            });

            timeListContainer.appendChild(item);
          });
        }
      }
    }

    const commonErrorsContainer = this.node.querySelector('#la-common-errors-list');
    limitInput = this.node.querySelector('#la-errortypes-limit') as HTMLInputElement;
    if (!is_active){
      if (commonErrorsContainer) {
        commonErrorsContainer.innerHTML = '<div class="la-placeholder">No active notebook</div>';
      }
    }else{
      let limit = limitInput ? parseInt(limitInput.value) : 5;
      if (isNaN(limit) || limit < 1) {
        limit = 5; 
      }

      const errorTypes = await getTopErrorTypesForCurrentUser();
      if (commonErrorsContainer) {
        if (errorTypes.length === 0) {
          commonErrorsContainer.innerHTML = '<div class="la-placeholder">No errors detected yet</div>';
        } else {

          const totalOccurrences = errorTypes.reduce((sum, e) => sum + e.occurrenceCount, 0);

          const errorTypesLimited = errorTypes.slice(0, limit);

          commonErrorsContainer.innerHTML = '';

          errorTypesLimited.forEach(({ errorType, occurrenceCount }) => {
            // 3. Calculate what percentage of the bar to fill
            const percentage = (occurrenceCount / totalOccurrences) * 100;

            const item = document.createElement('div');
            item.className = 'la-common-error-item';
            item.innerHTML = `
              <div class="la-error-info-row">
                <span class="la-error-type-name">${errorType}</span>
                <span class="la-error-type-count">${occurrenceCount}</span>
              </div>
              <div class="la-mini-progress-track">
                <div class="la-mini-progress-fill" style="width: ${percentage}%"></div>
              </div>
            `;
            commonErrorsContainer.appendChild(item);
          });
        }
      }
    }

    // 7. Update Execution Timeline Section
    const timelineContainer = this.node.querySelector('.la-timeline-container') as HTMLElement;
    if (!is_active){
      if (timelineContainer) {
        timelineContainer.innerHTML = '<div class="la-placeholder">No active notebook</div>';

        // Reduce height to avoid large empty space
        timelineContainer.style.height = '14px';
      }
    }else{
      // Restore canvas size
      timelineContainer.style.height = '60px';

      if (timelineContainer) {
        timelineContainer.innerHTML = `
          <canvas id="la-execution-timeline"></canvas>
        `;
      }
      const timeline_data = await getTimelineSuccessErrorsForCurrentUser();


      let canvas_data: TimelinePoint[] = timeline_data.map(point => ({
        x: new Date(point.execution_date),
        y: point.outcome
      }));

      this.renderTimeline(canvas_data);
    }

    // 8. Update Health Panel
    await this.updateHealthPanel();


    // Last. Update Footer Status
    const footerEl = this.node.querySelector('.la-footer') as HTMLElement;
    const statusDot = this.node.querySelector('#la-status-indicator');
    const statusText = this.node.querySelector('#la-status-text') as HTMLElement;

    if (footerEl && statusDot && statusText) {
      const errorActive = haveBeenErrors();

      if (errorActive) {
        footerEl.classList.add('footer-error');
        statusDot.classList.add('has-error');
        statusText.textContent = 'System Error. Please, check the logs and tell the administrator.';
        statusText.classList.add('status-text-error');
      } else {
        footerEl.classList.remove('footer-error');
        statusDot.classList.remove('has-error');
        statusText.textContent = 'System Connected';
        statusText.classList.remove('status-text-error');
      }
    }
  }

  private scrollToCell(cellId: string): void {
    const notebookPanel = this._tracker.currentWidget;
    if (!notebookPanel) {
      logError(`[Dashboard] No active notebook to navigate to cell ${cellId}`);
      return;
    }

    const cells = notebookPanel.content.widgets;
    const targetCell = cells.find(cell => cell.model.id === cellId);

    if (targetCell) {

      const index = cells.indexOf(targetCell);
      notebookPanel.content.activeCellIndex = index;
      notebookPanel.content.scrollToCell(targetCell, 'auto');
      targetCell.node.classList.add('la-cell-flash-active');
        
      setTimeout(() => {
        targetCell.node.classList.remove('la-cell-flash-active');
      }, 1000);

    } else {
      logError(`[Dashboard] Cell with ID ${cellId} not found in the current notebook.`);
    }
  }

  private renderTimeline(data: TimelinePoint[]): void {
    const canvas = document.getElementById('la-execution-timeline') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;


    canvas.width = canvas.parentElement?.clientWidth || 300;
    canvas.height = 60;

    const margin = 20;
    const width = canvas.width - margin * 2;
    const height = canvas.height - margin * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'var(--jp-border-color2)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin, margin); ctx.lineTo(margin + width, margin);       // Success line
    ctx.moveTo(margin, margin + height); ctx.lineTo(margin + width, margin + height); // Error line
    ctx.stroke();
    ctx.setLineDash([]);

    if (data.length === 0) return;

    // Draw executions
    data.forEach((exec, i) => {
      // Calculate X proportionally to the order (or you could use the actual time)
      const x = margin + (i * (width / (data.length - 1 || 1)));
      const y = exec.y === 'success' ? margin : margin + height;

      // Draw point
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = exec.y === 'success' ? '#4caf50' : '#f44336';
      ctx.fill();

      // Draw faint connecting line between consecutive points
      if (i > 0) {
        const prevX = margin + ((i - 1) * (width / (data.length - 1 || 1)));
        const prevY = data[i-1].y === 'success' ? margin : margin + height;
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });
  }

  private async updateHealthPanel(): Promise<void> {
    let pSuccess = 0;
    let pWarning = 0;
    let pError = 0;

    if (isActiveNotebook()){

      const stats = await getNotebookHealthStatsForCurrentUser();
      const total = stats.totalCodeCells;

      // 2. Calculate percentages
      pSuccess = (total > 0) ? (stats.successCount / total) * 100 : 0;
      pWarning = (total > 0) ? (stats.attemptCount / total) * 100 : 0;
      pError = (total > 0) ? (stats.errorCount / total) * 100 : 0;
    }

    // 3. Update bar segments
    const barSuccess = document.getElementById('health-bar-success');
    const barWarning = document.getElementById('health-bar-warning');
    const barError = document.getElementById('health-bar-error');

    if (barSuccess){
      barSuccess.style.width = `${pSuccess}%`;
      barSuccess.setAttribute('title', `${Math.round(pSuccess)}%`);
    }
    if (barWarning){
      barWarning.style.width = `${pWarning}%`;
      barWarning.setAttribute('title', `${Math.round(pWarning)}%`);
    }
    if (barError){
      barError.style.width = `${pError}%`;
      barError.setAttribute('title', `${Math.round(pError)}%`);
    }

    // 4. Update percentage texts
    this.setElementText('text-health-success', `${Math.round(pSuccess)}%`);
    this.setElementText('text-health-warning', `${Math.round(pWarning)}%`);
    this.setElementText('text-health-error', `${Math.round(pError)}%`);
  }

  // Helper to avoid null errors
  private setElementText(id: string, text: string) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }


  private highlightPython(code: string): string {
    if (!code) return '';

    // 1. CLEANUP: Convert any previous <br> into a real newline \n
    let cleanCode = code.replace(/<br\s*\/?>/gi, '\n');

    // 2. Escape HTML for security (will convert < to &lt; etc)
    let escaped = cleanCode
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 3. Combined regex (the robust version)
    const combinedRegex = new RegExp(
      [
        /(?<comment>#.*)/.source,
        /(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/.source,
        /(?<keyword>\b(?:def|class|import|from|as|return|if|else|elif|for|while|with|try|except|lambda|None|True|False|in|is|not|and|or|yield|pass|break|continue)\b)/.source,
        /(?<builtin>\b(?:print|len|range|int|str|list|dict|set|sum|max|min|enumerate|zip|open|type)\b)/.source,
        /(?<number>\b\d+\b)/.source,
        /(?<operator>[-+*/%=<>!]=?|\/\/|\*\*)/.source,
        /(?<punctuation>[()[\]{},.])/.source
      ].join('|'),
      'g'
    );

    // 4. Unique replacement
    return escaped.replace(combinedRegex, (match, ...args) => {
      const groups = args[args.length - 1];
      if (groups.comment) return `<span class="cm-comment">${match}</span>`;
      if (groups.string) return `<span class="cm-string">${match}</span>`;
      if (groups.keyword) return `<span class="cm-keyword">${match}</span>`;
      if (groups.builtin) return `<span class="cm-builtin">${match}</span>`;
      if (groups.number) return `<span class="cm-number">${match}</span>`;
      if (groups.operator) return `<span class="cm-operator">${match}</span>`;
      if (groups.punctuation) return `<span class="cm-punctuation">${match}</span>`;
      return match;
    });
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
}


async function getProgressForNotebook(notebookId: number): Promise<number> {
  return requestAPI<any>('notebook/progress', {
    method: 'POST',
    body: JSON.stringify({ notebook_id: notebookId })
  }).then(data => {
    return data.progress as number;
  }).catch(reason => {
    logError('Error fetching notebook progress:', reason);
    return 0;
  });
}
