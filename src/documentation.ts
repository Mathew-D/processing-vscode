/**
 * Processing-vscode - Processing Language Support for VSCode
 *
 * @copyright (C) 2021-2025 Luke Zhang
 */

import type {
    Documentation,
    DocumentationClass,
    DocumentationFunction,
    DocumentationVariable,
} from "./types"
import documentation from "./documentation-data.yml"
import vscode from "vscode"

// Add a cache for hover results to improve performance
const hoverCache = new Map<string, vscode.Hover>();
const MAX_CACHE_SIZE = 100;

/**
 * Gets the hovered "thing" and returns it
 *
 * @param line - Contents of line
 * @param position - Position of hover
 */
const getHoveredItem = (line: string, position: number): string | undefined => {
    // Skip processing if hovering over a comment
    if (/\/\//u.test(line.slice(0, position))) {
        return
    }

    // Find the start of the current symbol
    const itemStart = (() => {
        let index = position

        for (; index >= 0 && index < line.length; index--) {
            if (!/[a-z]|[0-9]|_/iu.test(line[index]!)) {
                break
            }
        }

        return index + 1
    })()

    // Find the end of the current symbol
    const itemEnd = (() => {
        let index = position

        for (; index >= 0 && index < line.length; index++) {
            if (!/[a-z]|[0-9]|_/iu.test(line[index]!)) {
                break
            }
        }

        return index
    })()

    return line.slice(itemStart, itemEnd)
}

/**
 * Creates a hover for a variable
 */
function documentVariable(info: any, item: string): vscode.Hover {
    return new vscode.Hover([
        info.examples
            ? `\`\`\`js
${info.type} ${item}
\`\`\`
\`\`\`java
// Examples
${info.examples}
\`\`\``
            : `\`\`\`js
${info.type} ${item}
\`\`\``,
        `${info.examples ? "" : `${item}\n\n`}${info.description}

*@see* — [${info.docUrl}](${info.docUrl})
`,
    ])
}

/**
 * Creates a hover for a function
 */
function documentFuntion(info: any, item: string): vscode.Hover {
    const params = Object.entries(info.parameters || {}).map(([name, desc]: [string, any]) => {
        const typeDefs = desc.indexOf ? desc.indexOf(":") : -1

        if (typeDefs === -1) {
            return `*@param* \`${name}\` — ${desc}`
        }

        const formattedDesc = `\`${desc.slice(0, typeDefs)}\`${desc.slice(typeDefs)}`

        return `*@param* \`${name}\` — ${formattedDesc}`
    })
    const {returns} = info

    return new vscode.Hover([
        ...(info.syntax
            ? [
                  `\`\`\`js
${info.type} ${item}
\`\`\`
\`\`\`java
${info.syntax}
\`\`\``,
              ]
            : []),
        `${info.syntax ? "" : `${item}\n\n`}${info.description}

*@see* — [${info.docUrl}](${info.docUrl})

${params.join("\n\n")}

${returns ? `*@returns* \`${returns}\`` : ""}
`,
    ])
}

/**
 * Creates a hover for a class
 */
function documentClass(info: any, item: string): vscode.Hover {
    const params = Object.entries(info.parameters || {}).map(([name, desc]: [string, any]) => {
        const typeDefs = desc.indexOf ? desc.indexOf(":") : -1

        if (typeDefs === -1) {
            return `*@param* \`${name}\` — ${desc}`
        }

        const formattedDesc = `\`${desc.slice(0, typeDefs)}\`${desc.slice(typeDefs)}`

        return `*@param* \`${name}\` — ${formattedDesc}`
    })

    return new vscode.Hover([
        ...(info.syntax
            ? [
                  `\`\`\`js
${info.type} ${item}
\`\`\`
\`\`\`java
${info.syntax}
\`\`\``,
              ]
            : []),
        `${info.syntax ? "" : `${item}\n\n`}${info.description}

*@see* — [${info.docUrl}](${info.docUrl})

${params.join("\n\n")}
`,
    ])
}

// Register the hover provider
vscode.languages.registerHoverProvider(
    [{scheme: "file", language: "pde"}, {scheme: "file", language: "python"}],
    {
        provideHover: (document, position) => {
            try {
                const line = document.lineAt(position.line)
                const item = getHoveredItem(line.text, position.character)

                if (!item) {
                    return undefined
                }
                
                // Check if this hover result is already cached
                const cacheKey = item;
                if (hoverCache.has(cacheKey)) {
                    return hoverCache.get(cacheKey);
                }

                // Make sure the item exists in our documentation data
                // @ts-ignore - documentation is imported from YAML
                const info = (documentation as any)[item];
                if (!info) {
                    return undefined
                }
                
                let result: vscode.Hover;
                
                if (info.type === "function") {
                    result = documentFuntion(info, item);
                } else if (info.type === "class") {
                    result = documentClass(info, item);
                } else {
                    // Not a function or class, therefore a variable
                    result = documentVariable(info, item);
                }
                
                // Cache the result for future use
                if (hoverCache.size >= MAX_CACHE_SIZE) {
                    // Remove the oldest entry if cache is full
                    const keysIterator = hoverCache.keys();
                    const firstKey = keysIterator.next().value;
                    if (firstKey !== undefined) {
                        hoverCache.delete(firstKey);
                    }
                }
                hoverCache.set(cacheKey, result);
                
                return result;
            } catch (error) {
                console.error("Error providing hover information:", error);
                return undefined;
            }
        },
    }
)
