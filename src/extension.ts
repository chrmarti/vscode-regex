/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    let previewUri = vscode.Uri.parse('regex-preview://authority/regex-preview');

    interface RegExMatch {

        document: vscode.TextDocument;

        regEx: RegExp;

        range: vscode.Range;

    }

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
            const editor = vscode.window.activeTextEditor;
            const found = this.findRegExAtCaret(editor);

            if (!found) {
                return this.errorSnippet("Cannot find a regex.");
            }

            return this.snippet(found);
        }

        private findRegExAtCaret(editor: vscode.TextEditor): RegExMatch {
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

        private errorSnippet(error: string): string {
            return `
                <body>
                    ${error}
                </body>`;
        }

        private snippet(match: RegExMatch): string {
            const text = "Lorem ipsum dolor sit amet, mi et mauris nec ac luctus lorem, proin leo nulla integer metus vestibulum lobortis, eget";
            const highlightedText = text.replace(match.regEx, "<span class='highlight'>$&</span>");
            return `<style>
                    .highlight {
                        background: yellow;
                    }
                </style>
                <body>
                    <div>Preview for the matches of the current <a href="${encodeURI('command:extension.revealRegExRule?' + JSON.stringify([match.document.uri, match.document.offsetAt(match.range.start), match.document.offsetAt(match.range.end)]))}">RegEx</a></dev>
                    <hr>
                    <div>${highlightedText}</div>
                </body>`;
        }
    }

    const provider = new TextDocumentContentProvider();
    const registration = vscode.workspace.registerTextDocumentContentProvider('regex-preview', provider);

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

    const highlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(200,200,200,.35)' });

    context.subscriptions.push(vscode.commands.registerCommand('extension.revealRegExRule', (uri: vscode.Uri, propStart: number, propEnd: number) => {

        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri.toString()) {
                const start = editor.document.positionAt(propStart);
                const end = editor.document.positionAt(propEnd);

                editor.setDecorations(highlight, [new vscode.Range(start, end)]);
                setTimeout(() => editor.setDecorations(highlight, []), 1500);
            }
        }
    }));
}

export function deactivate() {
}