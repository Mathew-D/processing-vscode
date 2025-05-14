/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */

import vscode from "vscode"

/**
 * Helper function to get config values with proper type checking
 */
function getConfigValue<T>(
    key: string, 
    defaultValue: T, 
    expectedType: string
): T {
    const config = vscode.workspace.getConfiguration().get<unknown>(key, defaultValue)
    
    if (typeof config !== expectedType) {
        const msg = `Config option ${key} must be of type ${expectedType}`
        vscode.window.showErrorMessage(msg)
        return defaultValue
    }
    
    return config as T
}

const getProcessingCommand = (): string => {
    // Look for processing.processingPath, then processing.path, then default to processing-java
    const processingPath = vscode.workspace.getConfiguration().get<unknown>("processing.processingPath")
    const legacyPath = vscode.workspace.getConfiguration().get<unknown>("processing.path")
    
    // If processingPath is defined and a string, use it
    if (processingPath !== undefined && typeof processingPath === "string") {
        return processingPath
    }
    
    // If legacyPath is defined and a string, use it
    if (legacyPath !== undefined && typeof legacyPath === "string") {
        return legacyPath
    }
    
    // Default to processing-java
    return "processing-java"
}

const getJavaCommand = (): string => {
    return getConfigValue<string>("processing.py.javaPath", "java", "string")
}

const getJarPath = (): string => {
    return getConfigValue<string>("processing.py.jarPath", "processing-py.jar", "string")
}

const getShouldEnablePython = (): boolean => {
    return getConfigValue<boolean>("processing.py.isEnabled", true, "boolean")
}

type SearchEngines = "Google" | "DuckDuckGo"
type DocOptions = "processing.org" | "p5js.org" | "py.processing.org" | "auto"

const getSearchConfig = (): {searchEngine: SearchEngines; processingDocs: DocOptions} => {
    const config = vscode.workspace.getConfiguration("processing")
    const processingDocs = config.get<DocOptions>("docs", "auto")
    const searchEngine = config.get<SearchEngines>("search", "Google")

    if (!["processing.org", "p5js.org", "py.processing.org", "auto"].includes(processingDocs)) {
        const msg =
            'Config option processing.docs must be "processing.org" | "p5js.org" | "py.processing.org" | "auto"'

        vscode.window.showErrorMessage(msg)

        return {searchEngine: "Google", processingDocs: "auto"}
    } else if (!["Google", "DuckDuckGo"].includes(searchEngine)) {
        const msg = 'Config option processing.search must be "Google" | "DuckDuckGo"'

        vscode.window.showErrorMessage(msg)

        return {searchEngine: "Google", processingDocs: "auto"}
    }

    return {
        searchEngine,
        processingDocs,
    }
}

const getShouldEnableDiagnostics = (): boolean => {
    return getConfigValue<boolean>("processing.shouldGiveDiagnostics", true, "boolean")
}

const getQuoteEnablement = (): boolean => {
    const shouldQuotePath = vscode.workspace
        .getConfiguration()
        .get<"always" | "auto">("processing.runPathQuotes", "auto")

    if (shouldQuotePath !== "always" && shouldQuotePath !== "auto") {
        const msg = 'Config option processing.runPathQuotes should be "auto" or "always"'

        vscode.window.showErrorMessage(msg)

        return false
    }

    return shouldQuotePath === "always"
}

const getShouldSendSigint = (): boolean => {
    return getConfigValue<boolean>("processing.shouldSendSigint", false, "boolean")
}

export let processingCommand = getProcessingCommand()
export let javaCommand = getJavaCommand()
export let jarPath = getJarPath()
export let shouldEnablePython = getShouldEnablePython()
export let searchConfig = getSearchConfig()
export let shouldEnableDiagnostics = getShouldEnableDiagnostics()
export let shouldAlwaysQuotePath = getQuoteEnablement()
export let shouldSendSigint = getShouldSendSigint()

vscode.workspace.onDidChangeConfiguration(() => {
    processingCommand = getProcessingCommand()
    javaCommand = getJavaCommand()
    jarPath = getJarPath()
    shouldEnablePython = getShouldEnablePython()
    searchConfig = getSearchConfig()
    shouldEnableDiagnostics = getShouldEnableDiagnostics()
    shouldAlwaysQuotePath = getQuoteEnablement()
    shouldSendSigint = getShouldSendSigint()
})
