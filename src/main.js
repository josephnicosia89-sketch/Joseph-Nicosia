import './styles.css';
import {
  boot, rAll, rTbl, setF, openAdd, closeAdd, addOrder,
  togTheme, expCSV, shareQ, loadQ, impXL, openAuditLog,
  closeAudit, exportAuditCSV, promptSetUser, openSync,
  closeSync, svSyncUrl, doSyncPull, closeXL, doXL,
  handleResetData
} from './app.js';
import { dedupe } from './store.js';

// Wire up globals for inline onclick handlers in the HTML
window.togTheme = togTheme;
window.expCSV = expCSV;
window.openAuditLog = openAuditLog;
window.closeAudit = closeAudit;
window.exportAuditCSV = exportAuditCSV;
window.promptSetUser = promptSetUser;
window.dedupe = dedupe;
window.rAll = rAll;
window.resetData = handleResetData;
window.shareQ = shareQ;
window.openAdd = openAdd;
window.closeAdd = closeAdd;
window.addOrder = addOrder;
window.loadQ = loadQ;
window.impXL = impXL;
window.openSync = openSync;
window.closeSync = closeSync;
window.svSyncUrl = svSyncUrl;
window.doSyncPull = doSyncPull;
window.closeXL = closeXL;
window.doXL = doXL;
window.rTbl = rTbl;
window.setF = setF;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
