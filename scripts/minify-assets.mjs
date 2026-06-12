import { extname } from 'node:path';
import { transform } from 'esbuild';

export function createMinifiedFilePath(filePath) {
  const extension = extname(filePath);
  if (extension !== '.css' && extension !== '.js') {
    throw new Error(`Unsupported minified asset extension: ${filePath}`);
  }
  return `${filePath.slice(0, -extension.length)}.min${extension}`;
}

function getLoader(filePath) {
  const extension = extname(filePath);
  if (extension === '.css') {
    return 'css';
  }
  if (extension === '.js') {
    return 'js';
  }
  throw new Error(`Unsupported asset extension: ${filePath}`);
}

export async function minifyAssetContent(filePath, content) {
  const result = await transform(content.toString('utf8'), {
    loader: getLoader(filePath),
    minify: true,
    legalComments: 'inline',
  });
  return Buffer.from(result.code);
}
