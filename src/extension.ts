/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    let previewUri = vscode.Uri.parse('regex-preview://authority/regex-preview');

    class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
        private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

        public provideTextDocumentContent(uri: vscode.Uri): string {
            return this.createRegExSnippet();
        }

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this._onDidChange.event;
        }

        public update(uri: vscode.Uri) {
            this._onDidChange.fire(uri);
        }

        private createRegExSnippet() {
            let editor = vscode.window.activeTextEditor;
            if (!(editor.document.languageId === 'typescript')) {
                return this.errorSnippet("Active editor doesn't show a typescript document - no properties to preview.")
            }
            return this.extractSnippet();
        }

        private extractSnippet(): string {
            let editor = vscode.window.activeTextEditor;
            let text = editor.document.getText();
            let selStart = editor.document.offsetAt(editor.selection.anchor);
            let propStart = text.lastIndexOf('/', selStart - 1);
            let propEnd = text.indexOf('/', selStart);

            if (propStart === -1 || propEnd === -1) {
                return this.errorSnippet("Cannot find a regex.");
            } else {
                return this.snippet(editor.document, propStart, propEnd);
            }
        }

        private errorSnippet(error: string): string {
            return `
                <body>
                    ${error}
                </body>`;
        }

        private snippet(document: vscode.TextDocument, propStart: number, propEnd: number): string {
            const documentText = document.getText();
            const flagsRegEx = /[gimuy]*/y;
            flagsRegEx.lastIndex = propEnd + 1;
            const flags = flagsRegEx.exec(documentText)[0];
            const regex = new RegExp(documentText.slice(propStart + 1, propEnd), flags);
            const text = "Lorem ipsum dolor sit amet, mi et mauris nec ac luctus lorem, proin leo nulla integer metus vestibulum lobortis, eget";
            const highlightedText = text.replace(regex, "<span class='highlight'>$&</span>");
            return `<style>
                    .highlight {
                        background: yellow;
                    }
                </style>
                <body>
                    <div>Preview for the matches of the current <a href="${encodeURI('command:extension.revealRegExRule?' + JSON.stringify([document.uri, propStart, propEnd]))}">RegEx</a></dev>
                    <hr>
                    <div>${highlightedText}</div>
                </body>`;
        }
    }

    let provider = new TextDocumentContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('regex-preview', provider);

    vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document === vscode.window.activeTextEditor.document) {
            provider.update(previewUri);
        }
    });

    vscode.window.onDidChangeTextEditorSelection(e => {
        if (e.textEditor === vscode.window.activeTextEditor) {
            provider.update(previewUri);
        }
    })

    context.subscriptions.push(vscode.commands.registerCommand('extension.showRegExPreview', () => {
        return vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two).then((success) => {
        }, (reason) => {
            vscode.window.showErrorMessage(reason);
        });
    }));

    let highlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(200,200,200,.35)' });

    context.subscriptions.push(vscode.commands.registerCommand('extension.revealRegExRule', (uri: vscode.Uri, propStart: number, propEnd: number) => {

        for (let editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri.toString()) {
                let start = editor.document.positionAt(propStart);
                let end = editor.document.positionAt(propEnd + 1);

                editor.setDecorations(highlight, [new vscode.Range(start, end)]);
                setTimeout(() => editor.setDecorations(highlight, []), 1500);
            }
        }
    }));
}

export function deactivate() {
}