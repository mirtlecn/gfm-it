#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { renderMarkdownToHtml } from './index.js';

const usage = `Usage: gfm-it [file] [options]

Render GitHub Flavored Markdown into a complete HTML document.

Arguments:
  file                         Markdown file to render. Reads stdin when omitted.

Options:
  -h, --help                   Show this help message.
  -o, --output <path>          Write HTML to a file instead of stdout.
  --title <title>              Set the HTML document title.
  --canonical <url>            Set the canonical URL and og:url.
  --fallback-image <true|false> Use a stable grayscale Picsum image when no image is found. Default: false.
  --css <assetKey>             Select the main gfm-addons CSS asset. Default: ravel_gfm_css.
  --asset-mode <remote|local>  Use remote CDN assets or local asset routes. Default: remote.
  --asset-base-url <url>       Base URL for local asset mode. Default: /asset/.
  --extra-css <css>            Append raw CSS inside the generated style block.
  --body-class <class>         Add a class attribute to the generated body.
  --footer-html <html>         Append raw HTML in a sticky markdown footer.
`;

function fail(message) {
  process.stderr.write(`${message}\n\n${usage}`);
  process.exitCode = 1;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(data));
  });
}

function readRequiredValue(args, index, optionName) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function parseBooleanValue(value, optionName) {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${optionName} must be true or false, got: ${value}`);
}

function parseArgs(args) {
  const parsed = {
    file: '',
    output: '',
    title: '',
    canonical: '',
    fallbackImage: false,
    css: 'ravel_gfm_css',
    assetMode: 'remote',
    assetBaseUrl: '/asset/',
    extraCss: '',
    bodyClass: '',
    footerHtml: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
      continue;
    }
    if (arg === '-o' || arg === '--output') {
      parsed.output = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--title') {
      parsed.title = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--canonical') {
      parsed.canonical = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--fallback-image') {
      parsed.fallbackImage = parseBooleanValue(readRequiredValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === '--css') {
      parsed.css = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--asset-mode') {
      parsed.assetMode = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--asset-base-url') {
      parsed.assetBaseUrl = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--extra-css') {
      parsed.extraCss = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--body-class') {
      parsed.bodyClass = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--footer-html') {
      parsed.footerHtml = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (parsed.file) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    parsed.file = arg;
  }

  if (!['remote', 'local'].includes(parsed.assetMode)) {
    throw new Error(`--asset-mode must be remote or local, got: ${parsed.assetMode}`);
  }

  return parsed;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  try {
    const markdown = args.file ? await readFile(args.file, 'utf8') : await readStdin();
    const html = renderMarkdownToHtml(markdown, {
      title: args.title,
      canonical: args.canonical,
      fallbackImage: args.fallbackImage,
      css: args.css,
      assetMode: args.assetMode,
      assetBaseUrl: args.assetBaseUrl,
      extraCss: args.extraCss,
      bodyClass: args.bodyClass,
      footerHtml: args.footerHtml,
    });

    if (args.output) {
      await mkdir(dirname(args.output), { recursive: true });
      await writeFile(args.output, html);
      return;
    }

    process.stdout.write(html);
  } catch (error) {
    fail(error.message);
  }
}

await main();
