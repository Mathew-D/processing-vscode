const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

// Read package.json to get the current version
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

require('esbuild').build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'processing-vscode.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  plugins: [
    {
      name: 'yaml-loader',
      setup(build) {
        build.onResolve({ filter: /\.ya?ml$/ }, args => ({
          path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
          namespace: 'yaml-loader',
        }));
        
        build.onLoad({ filter: /.*/, namespace: 'yaml-loader' }, async args => {
          const yamlContent = await fs.promises.readFile(args.path, 'utf8');
          const parsed = yaml.parse(yamlContent);
          return {
            contents: `module.exports = ${JSON.stringify(parsed)}`,
            loader: 'js',
          };
        });
      },
    },
  ],
  banner: {
    js: `/**
 * Processing-vscode - Processing Language Support for VSCode
 * https://github.com/Luke-zhang-04/processing-vscode
 *
 * @license MIT
 * @version ${version}
 * @preserve
 * @copyright (C) 2016 - 2025 Tobiah Zarlez, 2021 - 2025 Luke Zhang
 */`,
  },
});