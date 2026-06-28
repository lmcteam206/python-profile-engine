const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');

function activate(context) {
    let disposable = vscode.commands.registerCommand('python-thinker.analyzeCode', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Open a Python file first!");
            return;
        }

        const code = editor.document.getText();
        const codeLines = code.split('\n'); 
        
        const scriptPath = path.join(__dirname, 'thinker.py');
        const encodedCode = Buffer.from(code).toString('base64');
        
        const panel = vscode.window.createWebviewPanel(
            'pythonExecutionTimeline',
            'Python Profiler Engine',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        const pythonProcess = spawn('python', [scriptPath, encodedCode]);
        let stdoutData = "";

        pythonProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });

        pythonProcess.stdout.on('end', () => {
            try {
                const stepData = JSON.parse(stdoutData.trim());
                panel.webview.html = getWebviewContent(stepData, codeLines);
            } catch (err) {
                vscode.window.showErrorMessage("Analysis engine failed parsing process stream.");
            }
        });
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(steps, codeLines) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                background-color: var(--vscode-editor-background, #1e1e1e); 
                color: var(--vscode-editor-foreground, #d4d4d4); 
                font-family: var(--vscode-editor-font-family, Menlo, Monaco, Consolas, monospace);
                font-size: var(--vscode-editor-font-size, 13px);
                line-height: 1.5;
                padding: 12px; 
                height: 100vh; 
                box-sizing: border-box; 
                overflow: hidden; 
            }
            
            /* Native VS Code Tab Styling Layout */
            .tabs { 
                display: flex; 
                border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); 
                margin-bottom: 14px; 
            }
            .tab-btn { 
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--vscode-tab-inactiveForeground, #808080); 
                padding: 6px 14px; 
                cursor: pointer; 
                font-family: inherit;
                font-size: 12px;
            }
            .tab-btn:hover {
                color: var(--vscode-tab-activeForeground, #ffffff);
            }
            .tab-btn.active { 
                color: var(--vscode-tab-activeForeground, #ffffff);
                border-bottom: 2px solid var(--vscode-panelTitle-activeBorder, #007acc); 
                font-weight: 600;
            }
            
            .tab-content { 
                display: none; 
                height: calc(100vh - 65px); 
                overflow-y: auto; 
            }
            .tab-content.active { 
                display: block; 
            }
            
            /* Data Grid Engine Table */
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                text-align: left;
            }
            th {
                background-color: var(--vscode-list-hoverBackground, #2a2a2a);
                color: var(--vscode-foreground, #cccccc);
                font-weight: 600;
                padding: 6px 8px;
                border: 1px solid var(--vscode-panel-border, #3c3c3c);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            td {
                padding: 6px 8px;
                border: 1px solid var(--vscode-panel-border, #3c3c3c);
                vertical-align: top;
            }
            tr:hover {
                background-color: var(--vscode-list-hoverBackground, #2a2a2a);
            }
            
            .code-text { 
                font-family: var(--vscode-editor-font-family, monospace);
                color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
                white-space: pre;
            }
            .meta-text {
                color: var(--vscode-descriptionForeground, #717171);
            }
            .info-text {
                color: var(--vscode-debugConsole-infoForeground, #75beff);
            }
            .asm-block { 
                color: var(--vscode-debugConsole-errorForeground, #f48771);
                font-family: var(--vscode-editor-font-family, monospace);
                white-space: pre;
                font-size: 11px;
                line-height: 1.3;
            }
        </style>
    </head>
    <body>

        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('tab-analytics')">Static Metrics</button>
            <button class="tab-btn" onclick="switchTab('tab-flow')">Trace Sequence</button>
            <button class="tab-btn" onclick="switchTab('tab-assembly')">Opcode Bytecode</button>
        </div>

        <div id="tab-analytics" class="tab-content active">
            <table>
                <thead>
                    <tr>
                        <th style="width: 80px;">Line Reference</th>
                        <th style="width: 140px;">Scope Frame</th>
                        <th>Source String</th>
                        <th style="width: 100px;">Size Metrics</th>
                        <th style="width: 120px;">Memory Registers</th>
                    </tr>
                </thead>
                <tbody>
                    ${steps.map((s) => {
                        const txt = codeLines[s.line - 1] || "";
                        const chars = txt.length;
                        const words = txt.trim().split(/\\s+/).filter(w => w.length > 0).length;
                        return `
                        <tr>
                            <td class="meta-text">0x${s.line.toString(16).toUpperCase().padStart(2, '0')} [L-${s.line}]</td>
                            <td style="color: var(--vscode-symbolIcon-methodForeground, #4fc1ff);">${s.function}</td>
                            <td class="code-text">${txt || ' '}</td>
                            <td class="meta-text">${chars}ch / ${words}w</td>
                            <td class="info-text">${Object.keys(s.locals).length} allocs</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        </div>

        <div id="tab-flow" class="tab-content">
            <table>
                <thead>
                    <tr>
                        <th style="width: 60px;">Step</th>
                        <th style="width: 70px;">Location</th>
                        <th>Source Execution Path</th>
                        <th>Mutations / Subroutine Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${steps.map((s, idx) => `
                        <tr>
                            <td class="meta-text">#${idx + 1}</td>
                            <td class="meta-text">Line ${s.line}</td>
                            <td class="code-text">${codeLines[s.line - 1] || ' '}</td>
                            <td class="info-text">${s.thought}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div id="tab-assembly" class="tab-content">
            <table>
                <thead>
                    <tr>
                        <th style="width: 80px;">Line Index</th>
                        <th style="width: 40%;">High-Level Statement</th>
                        <th>Python Virtual Machine Instructions</th>
                    </tr>
                </thead>
                <tbody>
                    ${steps.map((s) => `
                        <tr>
                            <td class="meta-text">L-${s.line}</td>
                            <td class="code-text">${codeLines[s.line - 1] || ' '}</td>
                            <td><div class="asm-block">${s.bytecode || "NO_OP"}</div></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <script>
            function switchTab(tabId) {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                
                document.getElementById(tabId).classList.add('active');
                event.target.classList.add('active');
            }
        </script>
    </body>
    </html>`;
}

module.exports = { activate };
