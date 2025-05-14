/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */

import vscode from "vscode"
import { shouldEnablePython } from "./config"

class StatusBarManager {
    private processingStatusBarItem: vscode.StatusBarItem
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.processingStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        )
        this.processingStatusBarItem.command = 'processing.Run'
        this.processingStatusBarItem.tooltip = 'Run Processing Sketch'

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(this.updateStatusBar.bind(this))
        )
    }

    public initialize(): void {
        // Initial update
        this.updateStatusBar(vscode.window.activeTextEditor)
    }

    public updateStatusBar(editor: vscode.TextEditor | undefined): void {
        if (!editor) {
            this.hide()
            return
        }

        if (editor.document.languageId === 'pde') {
            this.show('java')
        } else if (editor.document.languageId === 'python' && shouldEnablePython) {
            this.show('python')
        } else {
            this.hide()
        }
    }

    private show(mode: 'java' | 'python'): void {
        if (mode === 'java') {
            this.processingStatusBarItem.text = '$(play) Processing Java'
            this.processingStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        } else {
            this.processingStatusBarItem.text = '$(play) Processing Python'
            this.processingStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.infoBackground')
        }
        
        this.processingStatusBarItem.show()
    }

    private hide(): void {
        this.processingStatusBarItem.hide()
    }

    public dispose(): void {
        this.processingStatusBarItem.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

export const statusBarManager = new StatusBarManager()