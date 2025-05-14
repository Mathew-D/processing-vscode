/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */
import childProcess from "child_process"
import vscode from "vscode"

/**
 * Check if the processing command is valid with improved timeout handling
 * @param cmd Processing command to validate
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise resolving to boolean indicating if command is valid
 */
export const isValidProcessingCommand = async (
    cmd: string, 
    timeoutMs: number = 5000
): Promise<boolean> => {
    try {
        const result = await Promise.race([
            new Promise<string | false>((resolve) => {
                const processingProcess = childProcess.spawn(cmd, ["--help"])
                let output = ""

                processingProcess.stderr.on("data", (data) => (output += data.toString()))
                processingProcess.stdout.on("data", (data) => (output += data.toString()))

                processingProcess.on("exit", () => {
                    resolve(output.trim())
                })

                processingProcess.on("error", () => resolve(false))
            }),
            new Promise<false>((resolve) => {
                setTimeout(() => {
                    vscode.window.showWarningMessage(
                        `Command validation timed out after ${timeoutMs}ms: ${cmd}`
                    );
                    resolve(false);
                }, timeoutMs);
            })
        ]);

        return typeof result === "boolean"
            ? result
            : /Command line edition for Processing/u.test(result)
    } catch (error) {
        console.error("Error validating processing command:", error);
        return false;
    }
}

export default isValidProcessingCommand
