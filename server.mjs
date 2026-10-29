import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node.js';

const require = createRequire(import.meta.url);

export async function startServer(cwd, config, rootFontSize) {
  const child = spawn(process.execPath, [require.resolve('@tailwindcss/language-server/bin/tailwindcss-language-server'), '--stdio'], { cwd, windowsHide: true });
  let logs = '';
  child.stderr.on('data', data => { logs = (logs + data).slice(-4000); });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  const pending = new Map();
  const settings = {
    validate: true, rootFontSize,
    classAttributes: ['class'], classFunctions: [], includeLanguages: {},
    files: { exclude: ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'] },
    experimental: { configFile: config, classRegex: [] },
    lint: { cssConflict: 'warning', suggestCanonicalClasses: 'warning' },
  };
  connection.onRequest('workspace/configuration', ({ items }) => items.map(item => item.section === 'tailwindCSS' ? settings : item.section === 'editor' ? { tabSize: 4 } : {}));
  for (const method of ['client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create']) connection.onRequest(method, () => null);
  connection.onNotification('window/logMessage', ({ message }) => { logs = (logs + '\n' + message).slice(-4000); });
  connection.onNotification('textDocument/publishDiagnostics', ({ uri, diagnostics }) => {
    const waiter = pending.get(uri);
    if (waiter) { pending.delete(uri); waiter.resolve(diagnostics); }
  });
  const fail = () => {
    for (const waiter of pending.values()) waiter.reject(new Error('Language server stopped: ' + logs));
    pending.clear();
  };
  child.on('error', fail);
  connection.onClose(fail);
  connection.listen();
  const deadline = setTimeout(() => child.kill(), 60000);
  try {
    const uri = pathToFileURL(cwd).href;
    await connection.sendRequest('initialize', {
      processId: process.pid, rootUri: uri, workspaceFolders: [{ uri, name: 'project' }],
      capabilities: { workspace: { configuration: true, workspaceFolders: true, didChangeWatchedFiles: { dynamicRegistration: true } }, textDocument: { publishDiagnostics: { relatedInformation: true } } },
      initializationOptions: { testMode: true },
    });
    await connection.sendNotification('initialized', {});
  } catch (error) { clearTimeout(deadline); child.kill(); connection.dispose(); throw error; }
  clearTimeout(deadline);
  return {
    async diagnostics(uri, text) {
      let timer;
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(uri); reject(new Error('No diagnostics received. Check CSS entrypoint and installed Tailwind.\n' + logs)); }, 25000);
        pending.set(uri, { resolve, reject });
      });
      try {
        await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'html', version: 1, text } });
        return await result;
      } finally { clearTimeout(timer); pending.delete(uri); }
    },
    async request(method, params) {
      const timer = setTimeout(() => child.kill(), 25000);
      try { return await connection.sendRequest(method, params); }
      finally { clearTimeout(timer); }
    },
    async closeDocument(uri) { await connection.sendNotification('textDocument/didClose', { textDocument: { uri } }); },
    close() { connection.dispose(); child.kill(); },
  };
}
