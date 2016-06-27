/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    const regexRegex = /\/((?:\\\/|\[[^\]]*\]|[^/])+)\/([gimuy]*)/g;
    const regexHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(100,100,100,.35)' });
    const matchHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,255,0,.35)' });

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('extension.showRegexPreview', showRegexPreview));

    context.subscriptions.push(vscode.languages.registerCodeLensProvider('typescript', { provideCodeLenses }));

    function provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const matches = findRegexes(document);
        return matches.map(match => new vscode.CodeLens(match.range, {
            title: 'Show Matches...',
            command: 'extension.showRegexPreview',
            arguments: [ match ]
        }));
    }

    function showRegexPreview(originEditor: vscode.TextEditor, builder?: vscode.TextEditorEdit, initialRegexMatch?: RegexMatch) {
        const rootPath = vscode.workspace.rootPath;
        if (!rootPath) {
            vscode.window.showWarningMessage('No folder opened yet.');
            return;
        }
        
        const filePath = context.asAbsolutePath('User/Regex Playground.md')
        const uri = vscode.Uri.parse(`file:${encodeURI(filePath)}`);
        return vscode.workspace.openTextDocument(uri).then(document => {
            return vscode.window.showTextDocument(document, originEditor.viewColumn + 1, true);
        }).then(editor => {
            new RegexMatchDecorator(editor, originEditor, initialRegexMatch);
        }).then(null, reason => {
            vscode.window.showErrorMessage(reason);
        });
    }

    interface RegexMatch {

        document: vscode.TextDocument;

        regex: RegExp;

        range: vscode.Range;

    }

    interface Match {

        range: vscode.Range;
    }

    class RegexMatchDecorator {

        private disposables: vscode.Disposable[] = [];

        constructor(private matchEditor: vscode.TextEditor, private lastRegexEditor?: vscode.TextEditor, private initialRegexMatch?: RegexMatch) {

            this.disposables.push(vscode.workspace.onDidCloseTextDocument(e => {
                if (this.lastRegexEditor && e === this.lastRegexEditor.document) {
                    this.lastRegexEditor = null;
                    this.initialRegexMatch = null;
                    matchEditor.setDecorations(matchHighlight, []);
                } else if (e === matchEditor.document) {
                    this.dispose();
                }
            }));

            this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
                if ((this.lastRegexEditor && e.document === this.lastRegexEditor.document) || e.document === matchEditor.document) {
                    this.update();
                }
            }));

            this.disposables.push(vscode.window.onDidChangeTextEditorSelection(e => {
                if (this.lastRegexEditor && e.textEditor === this.lastRegexEditor) {
                    this.initialRegexMatch = null;
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
            const regexEditor = this.lastRegexEditor = findRegexEditor() || this.lastRegexEditor;
            let regex = regexEditor && findRegexAtCaret(regexEditor);
            if (this.initialRegexMatch) {
                if (regex || !regexEditor || regexEditor.document !== this.initialRegexMatch.document) {
                    this.initialRegexMatch = null;
                } else {
                    regex = this.initialRegexMatch;
                }
            }
            const matches = regex ? findMatches(regex, this.matchEditor.document) : [];
            this.matchEditor.setDecorations(matchHighlight, matches.map(match => match.range));

            if (regexEditor) {
                regexEditor.setDecorations(regexHighlight, (this.initialRegexMatch || regexEditor !== vscode.window.activeTextEditor) && regex ? [ regex.range ] : []);
            }
        }
    }

    function findRegexEditor() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.languageId !== 'typescript') {
            return null;
        }
        return activeEditor;        
    }

    function findRegexAtCaret(editor: vscode.TextEditor): RegexMatch {
        const anchor = editor.selection.anchor;
        const text = editor.document.lineAt(anchor).text;

        let match: RegExpExecArray;
        regexRegex.lastIndex = 0;
        while ((match = regexRegex.exec(text)) && (match.index + match[0].length < anchor.character));
        if (match && match.index <= anchor.character) {
            return createRegexMatch(editor.document, anchor.line, match);
        }
    }

    function findRegexes(document: vscode.TextDocument) {
        const matches: RegexMatch[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            let match: RegExpExecArray;
            regexRegex.lastIndex = 0;
            while ((match = regexRegex.exec(line.text))) {
                matches.push(createRegexMatch(document, i, match));
            }
        }
        return matches;
    }

    function createRegexMatch(document: vscode.TextDocument, line: number, match: RegExpExecArray) {
        const regex = createRegex(match[1], match[2]);
        if (regex) {
            return {
                document: document,
                regex: regex,
                range: new vscode.Range(line, match.index, line, match.index + match[0].length)
            };
        }
    }

    function createRegex(pattern: string, flags: string) {
            try {
                return new RegExp(pattern, flags);
            } catch (e) {
                // discard
            }
    }

    function findMatches(regexMatch: RegexMatch, document: vscode.TextDocument) {
        const text = document.getText();
        const matches: Match[] = [];
        const regex = regexMatch.regex;
        let match: RegExpExecArray;
        while ((regex.global || !matches.length) && (match = regex.exec(text))) {
            matches.push({
                range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length))
            });
        }
        return matches;
    }
}
