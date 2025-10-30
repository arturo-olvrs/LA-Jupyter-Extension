import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';

import dashboardHTML from './dashboard';


const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_notebook_dashboard:plugin',
  description: 'A JupyterLab extension that adds a dashboard showing notebook open times',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  activate: activate
};

export default plugin;

type NotebookInfo = {
    time: string;
    path: string;
    title: string;
  };


// Function only run when the extension is activated (when JupyterLab starts)
function activate(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker
) : void {
  console.log('Notebook Dashboard extension loaded');

  // Guardamos la hora de apertura de cada notebook
  const NotebookInfo_Array = new Map<string, NotebookInfo>();
  notebookTracker.widgetAdded.connect((sender, notebookPanel) => {
    const now = new Date();
    const time = now.toLocaleTimeString('de-DE', { hour12: false });
    NotebookInfo_Array.set(notebookPanel.id, {
      time,
      path: notebookPanel.context.path,
      title: notebookPanel.title.label
    });
  });



  const command = 'dashboard:open';
  app.commands.addCommand(command, {
    label: 'Open Notebook Dashboard',
    execute: () => execute(app, notebookTracker, NotebookInfo_Array)
  });

  palette.addItem({ command, category: 'Dashboard' });
}


// Function only run when the extension is opened (command executed)
function execute(
  app: JupyterFrontEnd,
  notebookTracker: INotebookTracker,
  NotebookInfo_Array: Map<string, NotebookInfo>
) :void {

  // Creamos el contenido
  const content = new Widget();
  content.node.innerHTML = dashboardHTML;

  // Creamos el widget del dashboard
  const widget = new MainAreaWidget({ content });
  widget.id = 'notebook-dashboard-panel';
  widget.title.label = 'Notebook Dashboard';
  widget.title.closable = true;


  // Función para actualizar la hora del notebook activo
  const updateDashboard = () => {
    if (!widget.isAttached) return;

    const container = content.node.querySelector<HTMLDivElement>('#notebook-info')!;
    container.innerHTML = ''; // limpiar contenido previo

    if (notebookTracker.size === 0) {
      container.textContent = 'No hay notebooks abiertos';
      return;
    }

    const ol = document.createElement('ol');

    notebookTracker.forEach(panel => {
      const info = NotebookInfo_Array.get(panel.id);
      const liNotebook = document.createElement('li');
      liNotebook.textContent = info ? info.title : 'Notebook desconocido';

      const ul = document.createElement('ul');

      if (info) {
        const liTime = document.createElement('li');
        liTime.textContent = `Hora de apertura: ${info.time}`;
        const liPath = document.createElement('li');
        liPath.textContent = `Path: ${info.path}`;

        ul.appendChild(liTime);
        ul.appendChild(liPath);
      }

      liNotebook.appendChild(ul);
      ol.appendChild(liNotebook);
    });

    container.appendChild(ol);
  };

  // Conectar eventos
  notebookTracker.currentChanged.connect(updateDashboard);
  notebookTracker.widgetAdded.connect(updateDashboard);

  // Añadir al shell y activar
  app.shell.add(widget, 'main');
  updateDashboard();
  app.shell.activateById(widget.id);
}



  