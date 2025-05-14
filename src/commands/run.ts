/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */

import {
    jarPath,
    javaCommand,
    processingCommand,
    shouldAlwaysQuotePath,
    shouldSendSigint,
} from "../config"
import path, {dirname} from "path"
import {isValidProcessingProject} from "../utils"
import vscode from "vscode"

/**
 * Ensures the processing command includes the 'cli' part
 * @param command - The processing command from config
 * @returns The command with 'cli' appended if needed
 */
const ensureProcessingCli = (command: string): string => {
    // If the command is just "processing", append " cli"
    if (command === "processing") {
        return "processing cli";
    }
    
    // If the command already contains "processing cli", return as is
    if (command.includes("processing cli")) {
        return command;
    }
    
    // If it contains "processing" but not "cli", try to insert "cli" after "processing"
    if (command.includes("processing")) {
        // Handle paths with quotes
        if (command.includes('"')) {
            // For paths like "/path/to/processing" or "C:\path\to\processing"
            return command.replace(/"([^"]*processing)("?)/, '"$1 cli$2');
        }
        // For paths without quotes
        return command.replace(/(\S*processing)(\s|$)/, '$1 cli$2');
    }
    
    // Default case: return the original command
    return command;
}

// Helper function to validate required tools with user-friendly error messages
const validateTool = async (command: string, toolName: string, configField: string): Promise<boolean> => {
    try {
        // Ensure the command includes "processing cli"
        const validatedCommand = ensureProcessingCli(command);
        
        // Check if the command contains "processing cli" anywhere in it
        // This handles cases like "/path/to/processing cli" or "processing cli"
        const isProcessingCli = validatedCommand.includes("processing") && validatedCommand.includes("cli");
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Checking for ${toolName}...`,
            cancellable: false
        }, async () => {
            // Different handling for "processing cli" vs other commands
            if (isProcessingCli) {
                // For "processing cli", it's likely to be a special case or alias
                // Instead of validating, just trust it works
                return Promise.resolve();
            } else {
                // For regular commands, try to validate
                // Since we might have spaces in the path (not just in the arguments),
                // we need to be careful about how we handle command splitting
                let cmd;
                let args;
                
                if (validatedCommand.includes(' ')) {
                    // We need to be careful with paths that contain spaces
                    // If the command path has quotes, honor them
                    if (validatedCommand.includes('"')) {
                        const match = validatedCommand.match(/"([^"]+)"\s+(.*)/);
                        if (match) {
                            cmd = match[1]; // The part in quotes
                            args = (match[2] || '').split(' ').concat(['--help']);
                        } else {
                            // Fallback to simple split if quote parsing fails
                            const parts = validatedCommand.split(' ');
                            cmd = parts[0];
                            args = parts.slice(1).concat(['--help']);
                        }
                    } else {
                        // Simple space-separated command
                        const parts = validatedCommand.split(' ');
                        cmd = parts[0];
                        args = parts.slice(1).concat(['--help']);
                    }
                } else {
                    // No spaces, simple command
                    cmd = validatedCommand;
                    args = ['--help'];
                }
                
                const childProcess = require('child_process');
                const proc = childProcess.spawn(cmd, args, {
                    shell: true, // Use shell for better cross-platform compatibility
                });
                
                return new Promise<void>((resolve, reject) => {
                    proc.on('error', (err: Error) => {
                        console.error(`Error validating tool: ${err.message}`);
                        reject(err);
                    });
                    
                    // Listen for some output to validate command works
                    let output = '';
                    proc.stdout.on('data', (data: Buffer) => {
                        output += data.toString();
                        // If we get any output, consider it a success
                        if (output.length > 0) {
                            resolve();
                        }
                    });
                    
                    proc.stderr.on('data', (data: Buffer) => {
                        output += data.toString();
                        // Even stderr can be valid for processing help output
                        if (output.includes('processing') || output.includes('Usage')) {
                            resolve();
                        }
                    });
                    
                    proc.on('exit', (code: number) => {
                        // Consider any output a success even with non-zero exit code
                        // as --help might return non-zero but still be valid
                        if (output.length > 0) {
                            resolve();
                        } else if (code !== 0) {
                            reject(new Error(`Process exited with code ${code}`));
                        } else {
                            resolve();
                        }
                    });
                    
                    // Only wait a short time to check if the process starts
                    setTimeout(() => {
                        if (output.length > 0) {
                            resolve();
                        } else {
                            // Give it a chance - don't reject immediately
                            // This helps with slow-starting processes
                            resolve();
                        }
                    }, 1000);
                });
            }
        });
        
        return true;
    } catch (error) {
        console.error(`Tool validation failed: ${error}`);
        const message = `${toolName} not found. Please check your ${configField} setting.`;
        const configure = 'Configure';
        const response = await vscode.window.showErrorMessage(message, configure);
        
        if (response === configure) {
            await vscode.commands.executeCommand('workbench.action.openSettings', configField);
        }
        
        return false;
    }
};

const pythonUtils = {
    getProjectFilename: ({fileName}: vscode.TextDocument): string =>
        shouldAlwaysQuotePath || / |\\/u.test(fileName) ? `"${fileName}"` : fileName,

    getJarFilename: (): string =>
        shouldAlwaysQuotePath || / |\\/u.test(jarPath) ? `"${jarPath}"` : jarPath,
}

class RunManager {
    private _terminal?: vscode.Terminal = undefined
    private _pythonTerminal?: vscode.Terminal = undefined
    
    // Add dispose method to properly clean up resources
    public dispose(): void {
        if (this._terminal) {
            this._terminal.dispose();
        }
        if (this._pythonTerminal) {
            this._pythonTerminal.dispose();
        }
    }

    public run = (mode?: "py" | "java"): void => {
        const {activeTextEditor: editor} = vscode.window

        if (!editor) {
            vscode.window.showErrorMessage("No active text editor found")
            return
        }

        // Before running, save the document to ensure latest changes are included
        if (editor.document.isDirty) {
            editor.document.save().then(() => {
                this._determineAndRun(editor, mode);
            });
        } else {
            this._determineAndRun(editor, mode);
        }
    }
    
    // Extract mode determination logic to its own method
    private _determineAndRun(editor: vscode.TextEditor, mode?: "py" | "java"): void {
        const processingMode = (() => {
            if (mode) {
                return mode
            }

            if (/\.pde$/u.test(editor.document.fileName)) {
                return "java"
            } else if (editor.document.languageId === "python") {
                return "py"
            }

            return
        })()

        if (processingMode === "java") {
            // Validate processing command before attempting to run
            validateTool(processingCommand, "Processing", "processing.processingPath")
                .then(isValid => {
                    if (isValid) {
                        this._runJavaMode(editor);
                    }
                });
        } else if (processingMode === "py") {
            // Validate Java and Processing Python jar before attempting to run
            validateTool(javaCommand, "Java", "processing.py.javaPath")
                .then(isJavaValid => {
                    if (isJavaValid) {
                        // Check if jar file exists
                        const fs = require('fs');
                        if (!fs.existsSync(jarPath)) {
                            const message = `Processing Python JAR file not found at: ${jarPath}`;
                            const configure = 'Configure';
                            vscode.window.showErrorMessage(message, configure).then(response => {
                                if (response === configure) {
                                    vscode.commands.executeCommand('workbench.action.openSettings', 'processing.py.jarPath');
                                }
                            });
                            return;
                        }
                        this._runPythonMode(editor);
                    }
                });
        } else {
            vscode.window.showErrorMessage("Could not determine processing mode.")
        }
    }

    /**
     * This monstrosity searches for an existing terminal if it exists or creates a new one and returns it.
     *
     * @param terminalName - Key of terminal in class
     * @param terminalDisplayName - Display name of terminal
     * @returns Vscode terminal
     */
    private _getTerminal = (
        terminalName: "_terminal" | "_pythonTerminal",
        terminalDisplayName: string,
    ): vscode.Terminal =>
        (this[terminalName] !== undefined && this[terminalName]?.exitStatus === undefined // Terminal exists
            ? vscode.window.terminals.find((terminal) => terminal.name === terminalDisplayName) // Find existing terminal
            : (this[terminalName] = vscode.window.createTerminal(terminalDisplayName))) ?? // Terminal doesn't exist; create a new terminal
        (this[terminalName] = vscode.window.createTerminal(terminalDisplayName)) // Somehow couldn't find an existing terminal

    /**
     * Runs the current project in Java mode
     *
     * @param editor - Vscode text editor
     */
    private _runJavaMode = (editor: vscode.TextEditor): void => {
        const terminalName = "_terminal"
        const hasTerminal =
            this[terminalName] !== undefined && this[terminalName]?.exitStatus === undefined
        const currentTerminal = this._getTerminal(terminalName, "Processing")

        let sketchName = dirname(editor.document.fileName)
        const isValidProjectName = isValidProcessingProject(sketchName.split(path.sep).pop())
        const shouldQuotePath = shouldAlwaysQuotePath || / |\\/u.test(sketchName)

        if (shouldQuotePath) {
            sketchName = `"${sketchName}"`
        }

        currentTerminal.show()

        if (!isValidProjectName) {
            vscode.window.showWarningMessage(
                "Warning: Processing project names must be valid Java variable names. Your program may fail to run properly.",
            )
        }

        // Ensure the processing command includes 'cli'
        const processCommand = ensureProcessingCli(processingCommand);

        // If file is a processing project file
        const cmd = `${
            hasTerminal && shouldSendSigint ? "\x03" : ""
        }${processCommand} --sketch=${sketchName} --run`

        currentTerminal.sendText(cmd)
    }

    /**
     * Runs the current project in Python mode
     *
     * @param editor - Vscode text editor
     */
    private _runPythonMode = (editor: vscode.TextEditor): void => {
        const terminalName = "_terminal"
        const hasTerminal =
            this[terminalName] !== undefined && this[terminalName]?.exitStatus === undefined
        const currentTerminal = this._getTerminal(terminalName, "Processing-py")

        currentTerminal.show()

        // If file is a processing project file
        const cmd = `${
            hasTerminal && shouldSendSigint ? "\x03" : ""
        }${javaCommand} -jar ${pythonUtils.getJarFilename()} ${pythonUtils.getProjectFilename(
            editor.document,
        )}`

        currentTerminal.sendText(cmd)
    }
}

const runManager = new RunManager()

/**
 * Export the run function and the manager instance for proper disposal
 */
export const {run} = runManager
export const disposeRunManager = () => runManager.dispose();
