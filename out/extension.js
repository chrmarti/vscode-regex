/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = require("vscode");
function activate(context) {
    const regexRegex = /(^|\s|[()={},:?;])(\/((?:\\\/|\[[^\]]*\]|[^/])+)\/([gimuy]*))(\s|[()={},:?;]|$)/g;
    const phpRegexRegex = /(^|\s|[()={},:?;])['|"](\/((?:\\\/|\[[^\]]*\]|[^/])+)\/([gimuy]*))['|"](\s|[()={},:?;]|$)/g;
    const haxeRegexRegex = /(^|\s|[()={},:?;])(~\/((?:\\\/|\[[^\]]*\]|[^/])+)\/([gimsu]*))(\s|[.()={},:?;]|$)/g;
    const regexHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(100,100,100,.35)' });
    const matchHighlight = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(255,255,0,.35)' });
    const matchesFileContent = `Lorem ipsum dolor sit amet, consectetur adipiscing elit,
sed do eiusmod tempor incididunt ut labore et dolore magna
aliqua. Ut enim ad minim veniam, quis nostrud exercitation
ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit
esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
occaecat cupidatat non proident, sunt in culpa qui officia
deserunt mollit anim id est laborum.

abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ
0123456789 _+-.,!@#$%^&*();\/|<>"'
12345 -98.7 3.141 .6180 9,000 +42
555.123.4567	+1-(800)-555-2468
foo@demo.net	bar.ba@test.co.uk
www.demo.com	http://foo.co.uk/
https://marketplace.visualstudio.com/items?itemName=chrmarti.regex
https://github.com/chrmarti/vscode-regex
`;
    const languages = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'vue', 'php', 'haxe'];
    const decorators = new Map();
    context.subscriptions.push(vscode.commands.registerCommand('extension.toggleRegexPreview', toggleRegexPreview));
    languages.forEach(language => {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider(language, { provideCodeLenses }));
    });
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateDecorators(findRegexEditor())));
    const interval = setInterval(() => updateDecorators(), 5000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
    function provideCodeLenses(document, token) {
        const config = vscode.workspace.getConfiguration('regex-previewer', document.uri);
        if (!config.enableCodeLens)
            return;
        const matches = findRegexes(document);
        return matches.map(match => new vscode.CodeLens(match.range, {
            title: 'Test Regex...',
            command: 'extension.toggleRegexPreview',
            arguments: [match]
        }));
    }
    let addGMEnabled = false;
    const toggleGM = vscode.window.createStatusBarItem();
    toggleGM.command = 'regexpreview.toggleGM';
    context.subscriptions.push(toggleGM);
    context.subscriptions.push(vscode.commands.registerCommand('regexpreview.toggleGM', () => {
        addGMEnabled = !addGMEnabled;
        updateToggleGM();
        for (const decorator of decorators.values()) {
            decorator.update();
        }
    }));
    function updateToggleGM() {
        toggleGM.text = addGMEnabled ? 'Adding /gm' : 'Not adding /gm';
        toggleGM.tooltip = addGMEnabled ? 'Click to stop adding global and multiline (/gm) options to regexes for evaluation with example text.' : 'Click to add global and multiline (/gm) options to regexes for evaluation with example text.';
    }
    updateToggleGM();
    function addGM(regex) {
        if (!addGMEnabled || (regex.global && regex.multiline)) {
            return regex;
        }
        let flags = regex.flags;
        if (!regex.global) {
            flags += 'g';
        }
        if (!regex.multiline) {
            flags += 'm';
        }
        return new RegExp(regex.source, flags);
    }
    let enabled = false;
    function toggleRegexPreview(initialRegexMatch) {
        enabled = !enabled || !!initialRegexMatch && !!initialRegexMatch.regex;
        toggleGM[enabled ? 'show' : 'hide']();
        if (enabled) {
            const visibleEditors = getVisibleTextEditors();
            if (visibleEditors.length === 1) {
                return openLoremIpsum(visibleEditors[0].viewColumn + 1, initialRegexMatch);
            }
            else {
                updateDecorators(findRegexEditor(), initialRegexMatch);
            }
        }
        else {
            decorators.forEach(decorator => decorator.dispose());
        }
    }
    function openLoremIpsum(column, initialRegexMatch) {
        return vscode.workspace.openTextDocument({ language: 'text', content: matchesFileContent })
            .then(document => {
            return vscode.window.showTextDocument(document, column, true);
        }).then(editor => {
            updateDecorators(findRegexEditor(), initialRegexMatch);
        }).then(undefined, reason => {
            vscode.window.showErrorMessage(reason);
        });
    }
    function updateDecorators(regexEditor, initialRegexMatch) {
        if (!enabled) {
            return;
        }
        // TODO: figure out why originEditor.document is sometimes a different object
        if (regexEditor && initialRegexMatch && initialRegexMatch.document && initialRegexMatch.document.uri.toString() === regexEditor.document.uri.toString()) {
            initialRegexMatch.document = regexEditor.document;
        }
        const remove = new Map(decorators);
        getVisibleTextEditors().forEach(editor => {
            remove.delete(editor);
            applyDecorator(editor, regexEditor, initialRegexMatch);
        });
        remove.forEach(decorator => decorator.dispose());
    }
    function getVisibleTextEditors() {
        return vscode.window.visibleTextEditors.filter(editor => typeof editor.viewColumn === 'number');
    }
    function applyDecorator(matchEditor, initialRegexEditor, initialRegexMatch) {
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
    function discardDecorator(matchEditor) {
        decorators.delete(matchEditor);
    }
    class RegexMatchDecorator {
        constructor(matchEditor) {
            this.matchEditor = matchEditor;
            this.disposables = [];
            this.disposables.push(vscode.workspace.onDidCloseTextDocument(e => {
                if (this.stableRegexEditor && e === this.stableRegexEditor.document) {
                    this.stableRegexEditor = undefined;
                    this.stableRegexMatch = undefined;
                    matchEditor.setDecorations(matchHighlight, []);
                }
                else if (e === matchEditor.document) {
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
                    this.stableRegexMatch = undefined;
                    this.update();
                }
            }));
            this.disposables.push(vscode.window.onDidChangeActiveTextEditor(e => {
                this.update();
            }));
            this.disposables.push({ dispose: () => {
                    matchEditor.setDecorations(matchHighlight, []);
                    matchEditor.setDecorations(regexHighlight, []);
                } });
        }
        apply(stableRegexEditor, stableRegexMatch) {
            this.stableRegexEditor = stableRegexEditor;
            this.stableRegexMatch = stableRegexMatch;
            this.update();
        }
        dispose() {
            discardDecorator(this.matchEditor);
            this.disposables.forEach(disposable => {
                disposable.dispose();
            });
        }
        update() {
            const regexEditor = this.stableRegexEditor = findRegexEditor() || this.stableRegexEditor;
            let regex = regexEditor && findRegexAtCaret(regexEditor);
            if (this.stableRegexMatch) {
                if (regex || !regexEditor || regexEditor.document !== this.stableRegexMatch.document) {
                    this.stableRegexMatch = undefined;
                }
                else {
                    regex = this.stableRegexMatch;
                }
            }
            const matches = regex && regexEditor !== this.matchEditor ? findMatches(regex, this.matchEditor.document) : [];
            this.matchEditor.setDecorations(matchHighlight, matches.map(match => match.range));
            if (regexEditor) {
                regexEditor.setDecorations(regexHighlight, (this.stableRegexMatch || regexEditor !== vscode.window.activeTextEditor) && regex ? [regex.range] : []);
            }
        }
    }
    function findRegexEditor() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || languages.indexOf(activeEditor.document.languageId) === -1) {
            return undefined;
        }
        return activeEditor;
    }
    function findRegexAtCaret(editor) {
        const anchor = editor.selection.anchor;
        const line = editor.document.lineAt(anchor);
        const text = line.text.substr(0, 1000);
        let match;
        let regex = getRegexRegex(editor.document.languageId);
        regex.lastIndex = 0;
        while ((match = regex.exec(text)) && (match.index + match[1].length + match[2].length < anchor.character))
            ;
        if (match && match.index + match[1].length <= anchor.character) {
            return createRegexMatch(editor.document, anchor.line, match);
        }
    }
    function findRegexes(document) {
        const matches = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            let match;
            let regex = getRegexRegex(document.languageId);
            regex.lastIndex = 0;
            const text = line.text.substr(0, 1000);
            while ((match = regex.exec(text))) {
                const result = createRegexMatch(document, i, match);
                if (result) {
                    matches.push(result);
                }
            }
        }
        return matches;
    }
    function getRegexRegex(languageId) {
        if (languageId == 'haxe') {
            return haxeRegexRegex;
        }
        else if (languageId == 'php') {
            return phpRegexRegex;
        }
        return regexRegex;
    }
    function createRegexMatch(document, line, match) {
        const regex = createRegex(match[3], match[4]);
        if (regex) {
            return {
                document: document,
                regex: regex,
                range: new vscode.Range(line, match.index + match[1].length, line, match.index + match[1].length + match[2].length)
            };
        }
    }
    function createRegex(pattern, flags) {
        try {
            return new RegExp(pattern, flags);
        }
        catch (e) {
            // discard
        }
    }
    function findMatches(regexMatch, document) {
        const text = document.getText();
        const matches = [];
        const regex = addGM(regexMatch.regex);
        let match;
        while ((regex.global || !matches.length) && (match = regex.exec(text))) {
            matches.push({
                range: new vscode.Range(document.positionAt(match.index), document.positionAt(match.index + match[0].length))
            });
            // Handle empty matches (fixes #4)
            if (regex.lastIndex === match.index) {
                regex.lastIndex++;
            }
        }
        return matches;
    }
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map