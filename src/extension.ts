/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const previewUri = vscode.Uri.parse('regex-preview://authority/regex-preview');
    const regExHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(100,100,100,.35)' });
    const matchHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,255,0,.35)' });
    const text = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit,
sed do eiusmod tempor incididunt ut labore et dolore magna
aliqua. Ut enim ad minim veniam, quis nostrud exercitation
ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit
esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
occaecat cupidatat non proident, sunt in culpa qui officia
deserunt mollit anim id est laborum.
        `.trim();

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('extension.showRegExPreview', showRegExPreview));

    function showRegExPreview(originEditor: vscode.TextEditor) {
        const rootPath = vscode.workspace.rootPath;
        if (!rootPath) {
            vscode.window.showWarningMessage('No folder opened yet.');
            return;
        }

        const filePath = path.join(rootPath, '.vscode/RegEx Playground.md');
        pathExists(filePath).then(exists => {

            const uri = vscode.Uri.parse((exists ? 'file:' : 'untitled:') + encodeURI(filePath));
            return vscode.workspace.openTextDocument(uri).then(document => {
                return vscode.window.showTextDocument(document, originEditor.viewColumn + 1, true);
            }).then(editor => {
                if (!editor.document.getText().length) {
                    return editor.edit(builder => {
                        builder.insert(new vscode.Position(0, 0), text);
                    }).then(() => editor);
                }
                return editor;
            }).then(editor => {
                new RegExMatchDecorator(editor);
            });

        }).then(null, reason => {
            vscode.window.showErrorMessage(reason);
        });
    }

    function pathExists(path: string) {
        return new Promise<boolean>((resolve, reject) => {
            fs.stat(path, err => {
                if (err && err.code !== 'ENOENT') {
                    reject(err);
                } else {
                    resolve(!err);
                }
            });
        });
    }

    interface RegExMatch {

        document: vscode.TextDocument;

        regEx: RegExp;

        range: vscode.Range;

    }

    interface Match {

        range: vscode.Range;
    }

    class RegExMatchDecorator {

        private lastRegExEditor: vscode.TextEditor;
        private disposables: vscode.Disposable[] = [];

        constructor(private matchEditor: vscode.TextEditor) {

            this.disposables.push(vscode.workspace.onDidCloseTextDocument(e => {
                if (this.lastRegExEditor && e === this.lastRegExEditor.document) {
                    this.lastRegExEditor = null;
                    this.matchEditor.setDecorations(matchHighlight, []);
                } else if (e === matchEditor.document) {
                    this.dispose();
                }
            }));

            this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
                if ((this.lastRegExEditor && e.document === this.lastRegExEditor.document) || e.document === matchEditor.document) {
                    this.update();
                }
            }));

            this.disposables.push(vscode.window.onDidChangeTextEditorSelection(e => {
                if (this.lastRegExEditor && e.textEditor === this.lastRegExEditor) {
                    this.update();
                }
            }));

            this.disposables.push(vscode.window.onDidChangeActiveTextEditor(e => {
                this.update();
            }));

            this.update();
        }

        private dispose() {
            this.disposables.forEach(disposable => {
                disposable.dispose();
            });
        }

        private update() {
            const regExEditor = this.lastRegExEditor = findRegExEditor() || this.lastRegExEditor;
            const regEx = regExEditor && findRegExAtCaret(regExEditor);
            const matches = regEx ? findMatches(regEx, this.matchEditor.document) : [];
            this.matchEditor.setDecorations(matchHighlight, matches.map(match => match.range));

            if (regExEditor) {
                regExEditor.setDecorations(regExHighlight, regExEditor !== vscode.window.activeTextEditor && regEx ? [ regEx.range ] : []);
            }
        }
    }

    function findRegExEditor() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'typescript') {
            return null;
        }
        return activeEditor;        
    }

    function findRegExAtCaret(editor: vscode.TextEditor): RegExMatch {
        const anchor = editor.selection.anchor;
        const text = editor.document.lineAt(anchor).text;

        let start = text.lastIndexOf('/', anchor.character);
        if (start === -1) {
            return;
        }
        
        let end = text.indexOf('/', start === anchor.character ? anchor.character + 1 : anchor.character);
        if (end === -1) {
            end = start;
            start = text.lastIndexOf('/', end - 1);
            if (start === -1) {
                return;
            }
        }

        const flagsRegEx = /[gimuy]*/y;
        flagsRegEx.lastIndex = end + 1;
        const flags = flagsRegEx.exec(text)[0];
        const all = end + flags.length + 1;
        if (anchor.character > all) {
            return;
        }

        return {
            document: editor.document,
            regEx: new RegExp(text.slice(start + 1, end), flags),
            range: new vscode.Range(anchor.line, start, anchor.line, all)
        };
    }

    function findMatches(regExMatch: RegExMatch, document: vscode.TextDocument) {
        const text = document.getText();
        const matches: Match[] = [];
        const regEx = regExMatch.regEx;
        let match: RegExpExecArray;
        while ((regEx.global || !matches.length) && (match = regEx.exec(text))) {
            matches.push({
                range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length))
            });
        }
        return matches;
    }
}
