/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @version 2.5.6
 * @copyright (C) 2016 - 2020 Tobiah Zarlez, 2021 - 2025 Luke Zhang
 */

import {processingCommand, shouldEnableDiagnostics} from "./config"
import isValidProcessingCommand from "./validateCommand"
import subscribeCommands from "./commands"
import subscribeDiagnostics from "./diagnostics"
import vscode from "vscode"
import { disposeRunManager, clearValidationCache } from "./commands/run"
import { statusBarManager } from "./statusBar"

// Store disposables for cleanup on deactivation
const disposables: vscode.Disposable[] = []

export const activate = async (context: vscode.ExtensionContext) => {
    const log = vscode.window.createOutputChannel("Processing")
    disposables.push(log)

    log.appendLine("Activating Processing language extension...")
    
    // Initialize status bar
    statusBarManager.initialize();
    disposables.push(statusBarManager);

    subscribeCommands(context)

    // Clear validation cache when configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
        // Check if relevant settings changed
        if (
            event.affectsConfiguration('processing.processingPath') ||
            event.affectsConfiguration('processing.path') ||
            event.affectsConfiguration('processing.py.javaPath') ||
            event.affectsConfiguration('processing.py.jarPath')
        ) {
            log.appendLine("Processing configuration changed, clearing validation cache");
            clearValidationCache();
        }
    });
    
    // Add to disposables
    disposables.push(configListener);

    if (shouldEnableDiagnostics) {
        if (await isValidProcessingCommand(processingCommand)) {
            const pdeDiagnostics = vscode.languages.createDiagnosticCollection("processing")

            context.subscriptions.push(pdeDiagnostics)
            subscribeDiagnostics(pdeDiagnostics, context, log)
        } else {
            log.appendLine(
                `ERROR! The configured processing command ${processingCommand} could not be executed.`,
            )
            log.show()
        }
    }

    await import("./documentation")

    log.appendLine("Processing language extension is now active!")
}

// This method is called when your extension is deactivated
export const deactivate = () => {
    // Clean up all disposables
    disposeRunManager();
    disposables.forEach(disposable => {
        try {
            disposable.dispose();
        } catch (error) {
            console.error('Error disposing resource:', error);
        }
    });
}
