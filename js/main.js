'use strict';
(function (App) {
  window.addEventListener('DOMContentLoaded', () => {
    App.project = App.loadSaved() || App.sampleProject();
    App.editor.init(document.getElementById('plan'));
    App.view3d.init(document.getElementById('view3d'));
    App.ui.init();
    let mode = '2d';
    try { mode = localStorage.getItem('planer.view') || 'split'; } catch (e) { mode = 'split'; }
    App.ui.setView(mode);
    App.editor.setTool('select');
    App.emit('change');
    requestAnimationFrame(() => App.editor.fit());
    App.loadLibs();
  });
})(window.App);
