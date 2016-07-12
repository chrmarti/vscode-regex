/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    
    const regexRegex = /(^|\s|[()={},:?;])(\/((?:\\\/|\[[^\]]*\]|[^/])+)\/([gimuy]*))(\s|[()={},:?;]|$)/g;
    const regexHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(100,100,100,.35)' });
    const matchHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,255,0,.35)' });

    const matchesFilePath = context.asAbsolutePath('resources/sample.txt');
    const matchesFileContent = fs.readFileSync(matchesFilePath, 'utf8');
    const matchesFileUri = vscode.Uri.parse(`untitled:${path.sep}Regex Matches`);
    const languages = ['javascript', 'typescript'];

    const decorators = new Map<vscode.TextEditor, RegexMatchDecorator>();

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('extension.showRegexPreview', showRegexPreview));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('extension.makeRegexPreview', editor => applyDecorator(editor)));

    languages.forEach(language => {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(language, { provideCodeLenses }));
    });

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(tryApplyDecorator));

    function provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken) {
        const matches = findRegexes(document);
        return matches.map(match => new vscode.CodeLens(match.range, {
            title: 'Test Regex...',
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
        
        // TODO: figure out why originEditor.document is sometimes a different object
        if (initialRegexMatch && initialRegexMatch.document && initialRegexMatch.document.uri.toString() === originEditor.document.uri.toString()) {
            initialRegexMatch.document = originEditor.document;
        }

        return vscode.workspace.openTextDocument(matchesFileUri).then(document => {
            return vscode.window.showTextDocument(document, originEditor.viewColumn + 1, true);
        }).then(editor => {
            if (editor.document.lineCount === 1 && !editor.document.getText().length) {
                editor.edit(builder => {
                    builder.insert(new vscode.Position(0, 0), matchesFileContent);
                }).then(() => editor);
            }
            return editor;
        }).then(editor => {
            tryApplyDecorator(editor, originEditor, initialRegexMatch);
        }).then(null, reason => {
            vscode.window.showErrorMessage(reason);
        });
    }

    function tryApplyDecorator(matchEditor: vscode.TextEditor, initialRegexEditor?: vscode.TextEditor, initialRegexMatch?: RegexMatch) {
        if (matchEditor && matchEditor.document.uri.toString() === matchesFileUri.toString()) {
            applyDecorator(matchEditor, initialRegexEditor, initialRegexMatch);
        }
    }

    function applyDecorator(matchEditor: vscode.TextEditor, initialRegexEditor?: vscode.TextEditor, initialRegexMatch?: RegexMatch) {
        let decorator = decorators.get(matchEditor);
        const newDecorator = !decorator;
        if (newDecorator) {
            decorator = new RegexMatchDecorator(matchEditor);
            context.subscriptions.push(decorator);
            decorators.set(matchEditor, decorator);
        }
        if (newDecorator || initialRegexEditor || initialRegexMatch) {
            decorator.apply(initialRegexEditor, initialRegexMatch);
        }
    }

    function discardDecorator(matchEditor: vscode.TextEditor) {
        decorators.delete(matchEditor);
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

        private stableRegexEditor: vscode.TextEditor;
        private stableRegexMatch: RegexMatch;
        private disposables: vscode.Disposable[] = [];

        constructor(private matchEditor: vscode.TextEditor) {

            this.disposables.push(vscode.workspace.onDidCloseTextDocument(e => {
                if (this.stableRegexEditor && e === this.stableRegexEditor.document) {
                    this.stableRegexEditor = null;
                    this.stableRegexMatch = null;
                    matchEditor.setDecorations(matchHighlight, []);
                } else if (e === matchEditor.document) {
                    this.dispose();
                }
            }));

            this.disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
                if ((this.stableRegexEditor && e.document === this.stableRegexEditor.document) || e.document === matchEditor.document) {
                    this.update();
                }
            }));

            this.disposables.push(vscode.window.onDidChangeTextEditorSelection(e => {
                if (this.stableRegexEditor && e.textEditor === this.stableRegexEditor) {
                    this.stableRegexMatch = null;
                    this.update();
                }
            }));

            this.disposables.push(vscode.window.onDidChangeActiveTextEditor(e => {
                this.update();
            }));
        }

        public apply(stableRegexEditor?: vscode.TextEditor, stableRegexMatch?: RegexMatch) {
            this.stableRegexEditor = stableRegexEditor;
            this.stableRegexMatch = stableRegexMatch;
            this.update();
        }

        public dispose() {
            discardDecorator(this.matchEditor);
            this.disposables.forEach(disposable => {
                disposable.dispose();
            });
        }

        private update() {
            const regexEditor = this.stableRegexEditor = findRegexEditor() || this.stableRegexEditor;
            let regex = regexEditor && findRegexAtCaret(regexEditor);
            if (this.stableRegexMatch) {
                if (regex || !regexEditor || regexEditor.document !== this.stableRegexMatch.document) {
                    this.stableRegexMatch = null;
                } else {
                    regex = this.stableRegexMatch;
                }
            }
            const matches = regex ? findMatches(regex, this.matchEditor.document) : [];
            this.matchEditor.setDecorations(matchHighlight, matches.map(match => match.range));

            if (regexEditor) {
                regexEditor.setDecorations(regexHighlight, (this.stableRegexMatch || regexEditor !== vscode.window.activeTextEditor) && regex ? [ regex.range ] : []);
            }
        }
    }

    function findRegexEditor() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || languages.indexOf(activeEditor.document.languageId) === -1) {
            return null;
        }
        return activeEditor;        
    }

    function findRegexAtCaret(editor: vscode.TextEditor): RegexMatch {
        const anchor = editor.selection.anchor;
        const text = editor.document.lineAt(anchor).text;

        let match: RegExpExecArray;
        regexRegex.lastIndex = 0;
        while ((match = regexRegex.exec(text)) && (match.index + match[1].length + match[2].length < anchor.character));
        if (match && match.index + match[1].length <= anchor.character) {
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
        const regex = createRegex(match[3], match[4]);
        if (regex) {
            return {
                document: document,
                regex: regex,
                range: new vscode.Range(line, match.index + match[1].length, line, match.index + match[1].length + match[2].length)
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

    vscode.window.visibleTextEditors.forEach(editor => tryApplyDecorator(editor));
}
