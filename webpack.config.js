import path from 'path';
import { fileURLToPath } from 'url';

// Convert file URL to path for compatibility with __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  entry: {
    linkme: "./src/linkme.ts"
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: "[name].js"
  },
  // these are loaders, added as "modules rules"
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.tsx?/,
        use: [{loader: 'ts-loader', options: {onlyCompileBundledFiles: true}}],
      }
    ]
  }
};

export default config;
