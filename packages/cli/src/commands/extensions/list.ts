/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { loadExtensions, toOutputString } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
import { ExtensionEnablementManager } from '../../config/extensions/extensionEnablement.js';
import { debugLogger } from '@google/gemini-cli-core';

export async function handleList() {
  try {
    const extensions = loadExtensions(
      new ExtensionEnablementManager(),
      process.cwd(),
    );
    if (extensions.length === 0) {
      debugLogger.log('No extensions installed.');
      return;
    }
    debugLogger.log(
      extensions
        .map((extension, _): string => toOutputString(extension, process.cwd()))
        .join('\n\n'),
    );
  } catch (error) {
    debugLogger.error(getErrorMessage(error));
    process.exit(1);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'Lists installed extensions.',
  builder: (yargs) => yargs,
  handler: async () => {
    await handleList();
  },
};
