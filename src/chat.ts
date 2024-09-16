/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

const REGEX_PARTICIPANT_ID = 'regex.chatParticipant';

const MODEL_SELECTOR: vscode.LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4o' };

export function registerChatParticipant(context: vscode.ExtensionContext) {

    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<void> => {
        try {
            let [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);
            if (!model) {
                [model] = await vscode.lm.selectChatModels();
                if (!model) {
                    stream.markdown('No language model available.');
                    return;
                }
            }
            const messages = [];
            if (!request.command) {
                for (let i = context.history.length - 1; i >= 0; i--) {
                    const turn = context.history[i];
                    if (turn.participant !== REGEX_PARTICIPANT_ID) {
                        break;
                    }
                    if (turn instanceof vscode.ChatRequestTurn) {
                        if (turn.command || i === 0 || context.history[i - 1].participant !== REGEX_PARTICIPANT_ID) {
                            messages.push(...getInitialPrompt(turn).reverse());
                            break;
                        }
                        messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
                    } else if (turn instanceof vscode.ChatResponseTurn) {
                        for (const part of turn.response) {
                            if (part instanceof vscode.ChatResponseMarkdownPart) {
                                messages.push(vscode.LanguageModelChatMessage.Assistant(part.value.value));
                            }
                        }
                    }
                }
                messages.reverse();
            }
            if (!messages.length) {
                messages.push(...getInitialPrompt(request));
            } else {
                messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
            }

            const chatResponse = await model.sendRequest(messages, {}, token);
            for await (const fragment of chatResponse.text) {
                stream.markdown(fragment);
            }
        } catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                stream.markdown(`${err.message} (${err.code})`);
            } else {
                throw err;
            }
        }
    };

    function getInitialPrompt({ prompt, command }: { prompt: string; command?: string }) {
        const languageId = vscode.window.activeTextEditor?.document.languageId
            || vscode.window.visibleTextEditors[0]?.document.languageId
            || vscode.workspace.textDocuments[0]?.languageId
            || 'javascript';
        const languageName = languageIdToNameMapping[languageId] || languageId;

        if (command === 'new') {
            return [
                vscode.LanguageModelChatMessage.User('You are an expert in regular expressions! Your job is to create regular expressions based on descriptions of what has to match.'),
                vscode.LanguageModelChatMessage.User(`Create a ${languageName} regular expression that matches text with the following description: ${prompt}`),
            ];
        }
        if (command === 'new-from') {
            return [
                vscode.LanguageModelChatMessage.User('You are an expert in regular expressions! Your job is to create regular expressions based on text samples that have to match.'),
                vscode.LanguageModelChatMessage.User(`Create a ${languageName} regular expression that matches the following samples: ${prompt}`),
            ];
        }
        return [
            vscode.LanguageModelChatMessage.User(`You are an expert in regular expressions! Your job is to assist with regular expressions in ${languageName}.`),
            vscode.LanguageModelChatMessage.User(prompt),
        ]
    }

    const regex = vscode.chat.createChatParticipant(REGEX_PARTICIPANT_ID, handler);
    regex.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');

    context.subscriptions.push(
        regex,
    );
}

const languageIdToNameMapping: { [id: string]: string } = {
    'javascript': 'JavaScript',
    'javascriptreact': 'JavaScript React',
    'typescript': 'TypeScript',
    'typescriptreact': 'TypeScript React',
    'vue': 'Vue',
    'php': 'PHP',
    'haxe': 'Haxe',
    'python': 'Python',
    'java': 'Java',
    'csharp': 'C#',
    'cpp': 'C++',
    'ruby': 'Ruby',
    'go': 'Go',
    'rust': 'Rust',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'perl': 'Perl',
    'html': 'HTML',
    'css': 'CSS',
    'markdown': 'Markdown',
    'json': 'JSON',
    'xml': 'XML',
    'sql': 'SQL',
};
