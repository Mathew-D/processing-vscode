const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

// Read package.json to get the current version
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

// Update version in index.ts
const syncVersionToFiles = () => {
  try {
    console.log(`Synchronizing version number to all files: v${version}`);
    
    // Update version in src/index.ts
    const indexTsPath = './src/index.ts';
    if (fs.existsSync(indexTsPath)) {
      let indexContent = fs.readFileSync(indexTsPath, 'utf8');
      indexContent = indexContent.replace(
        /(@version\s+)(\d+\.\d+\.\d+)/g,
        `$1${version}`
      );
      fs.writeFileSync(indexTsPath, indexContent, 'utf8');
      console.log(`Updated version in ${indexTsPath} to ${version}`);
    }
    
    // Update version in CHANGELOG.md if needed
    const changelogPath = './CHANGELOG.md';
    if (fs.existsSync(changelogPath)) {
      let changelogContent = fs.readFileSync(changelogPath, 'utf8');
      // Check if the current version is already in the changelog
      const versionRegex = new RegExp(`## \\[${version}\\]`);
      if (!versionRegex.test(changelogContent)) {
        // If not, we could automatically add it, but it's generally better 
        // to just remind the user to update the changelog manually
        console.log(`Note: You may need to update the CHANGELOG.md with details for version ${version}`);
      }
    }
  } catch (error) {
    console.error('Error synchronizing version:', error);
  }
};

// Run version sync before building
syncVersionToFiles();

require('esbuild').build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'processing-vscode.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'yaml-loader',
      setup(build) {
        build.onResolve({ filter: /\.ya?ml$/ }, args => ({
          path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
          namespace: 'yaml-loader',
        }));
        
        build.onLoad({ filter: /.*/, namespace: 'yaml-loader' }, async args => {
          try {
            const yamlContent = await fs.promises.readFile(args.path, 'utf8');
            const parsed = yaml.parse(yamlContent);
            return {
              contents: `module.exports = ${JSON.stringify(parsed)}`,
              loader: 'js',
            };
          } catch (err) {
            console.error(`Error processing YAML file ${args.path}:`, err);
            return {
              errors: [
                {
                  text: `Failed to parse YAML file: ${err.message}`,
                  location: { file: args.path },
                }
              ]
            };
          }
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
}).catch(() => process.exit(1)); // Exit with error code if build fails