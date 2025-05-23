/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */

import path, {dirname} from "path"
import childProcess from "child_process"
import crypto from "crypto"
import {isValidProcessingProject} from "./utils"
import {processingCommand} from "./config"
import vscode from "vscode"

let oldHash = ""
// Add a debounce interval to prevent excessive diagnostic runs
const DIAGNOSTIC_DEBOUNCE_MS = 1000
let diagnosticTimeout: NodeJS.Timeout | null = null

const hash = (content: {toString: () => string}) =>
    crypto.createHash("sha384").update(content.toString()).digest("hex")

const createDiagnostic = (
    lineOfText: vscode.TextLine,
    lineIndex: number,
    charIndex: number,
    message: string,
): vscode.Diagnostic => {
    const range = new vscode.Range(lineIndex, charIndex, lineIndex, lineOfText.text.length)

    const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)

    diagnostic.code = "processing"

    return diagnostic
}

// Add a timeout promise to prevent diagnostics from hanging
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    return Promise.race([promise, timeout]);
};

const refreshDiagnostics = async (
    diagnostics: vscode.DiagnosticCollection,
    doc: vscode.TextDocument,
    log: vscode.OutputChannel,
): Promise<void> => {
    try {
        // Clear existing diagnostics first
        diagnostics.delete(doc.uri);
        
        const foundDiagnostics: vscode.Diagnostic[] = []
        let sketchName = doc.fileName.includes(".pde") ? dirname(doc.fileName) : undefined

        if (
            sketchName &&
            doc.getText() &&
            isValidProcessingProject(sketchName.split(path.sep).pop())
        ) {
            const shouldQuotePath = sketchName.includes(" ")

            if (shouldQuotePath) {
                sketchName = `"${sketchName}"`
            }

            console.log({sketchName})
            const diagnostic = await withTimeout(
                new Promise<string[]>((resolve) => {
                    const processingProcess = childProcess.spawn(processingCommand, [
                        `--sketch=${sketchName}`,
                        "--build",
                    ])

                    const problems: string[] = []

                    const handleOutput = (data: Buffer): void => {
                        for (const line of data.toString().split("\n")) {
                            if (/(:[0-9]+){4}:/gu.test(line)) {
                                problems.push(line)
                            }
                        }
                    }

                    processingProcess.stderr.on("data", handleOutput)
                    processingProcess.stdout.on("data", handleOutput)

                    processingProcess.on("exit", () => {
                        resolve(problems)
                    })
                }),
                5000,
                "Processing diagnostics timed out"
            ).catch(() => undefined)

            if (!diagnostic) {
                return
            }

            if (diagnostic.length > 0) {
                log.appendLine(diagnostic.toString())
            }

            for (const result of diagnostic) {
                const splitResult = result.split(":")
                const lineIndex = Number(splitResult[1]) - 1
                const charIndex = Number(splitResult[2]) - 2

                foundDiagnostics.push(
                    createDiagnostic(
                        doc.lineAt(lineIndex),
                        lineIndex > 0 ? lineIndex : 0,
                        charIndex > 0 ? charIndex : 0,
                        splitResult.slice(5).join("").trim(),
                    ),
                )
            }

            diagnostics.set(doc.uri, foundDiagnostics)
        }
    } catch (error) {
        log.appendLine(`Error in refreshDiagnostics: ${error instanceof Error ? error.message : String(error)}`)
    }
}

export const subscribeDiagnostics = (
    diagnostics: vscode.DiagnosticCollection,
    context: vscode.ExtensionContext,
    log: vscode.OutputChannel,
): void => {
    let isRunning = false
    let shouldRunAgain = false

    const runDiagnostics = async (
        editor: vscode.TextEditor | vscode.TextDocumentChangeEvent,
    ): Promise<void> => {
        if (diagnosticTimeout) {
            clearTimeout(diagnosticTimeout)
        }

        diagnosticTimeout = setTimeout(async () => {
            if (isRunning) {
                shouldRunAgain = true
            } else {
                isRunning = true

                oldHash = `${editor.document.fileName} = ${hash(editor.document.getText())}`

                await refreshDiagnostics(diagnostics, editor.document, log)

                let newHash = `${editor.document.fileName} = ${hash(editor.document.getText())}`

                while (shouldRunAgain || oldHash !== newHash) {
                    shouldRunAgain = false
                    oldHash = newHash

                    await refreshDiagnostics(diagnostics, editor.document, log)

                    newHash = `${editor.document.fileName} = ${hash(editor.document.getText())}`

                    if (!shouldRunAgain || oldHash === newHash) {
                        break
                    }
                }

                await refreshDiagnostics(diagnostics, editor.document, log)

                isRunning = false
            }
        }, DIAGNOSTIC_DEBOUNCE_MS)
    }

    if (vscode.window.activeTextEditor) {
        const editor = vscode.window.activeTextEditor

        runDiagnostics(editor)
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && /\.pde/u.test(editor.document.fileName)) {
                runDiagnostics(editor)
            }
        }),
    )

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((editor) => {
            if (/\.pde/u.test(editor.document.fileName)) {
                if (editor.contentChanges.length > 0) {
                    runDiagnostics(editor)
                }
            }
        }),
    )

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
    )
}

export default subscribeDiagnostics
