import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the LAextension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'LAextension:plugin',
  description: 'A JupyterLab extension for the LA Course.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension LAextension is activated!');
  }
};

export default plugin;
