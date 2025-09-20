/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getVersion } from '../get-release-version.js';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');

describe('getVersion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date('2025-09-17T00:00:00.000Z'));
  });

  const mockExecSync = (command) => {
    // NPM Mocks - old dist-tag method (kept for backward compatibility)
    if (command.includes('npm view') && command.includes('--tag=latest'))
      return '0.4.1';
    if (command.includes('npm view') && command.includes('--tag=preview'))
      return '0.5.0-preview.2';
    if (command.includes('npm view') && command.includes('--tag=nightly'))
      return '0.6.0-nightly.20250910.a31830a3';

    // NPM versions list - new semantic sorting method
    if (command.includes('npm view') && command.includes('versions --json'))
      return JSON.stringify([
        '0.4.1',
        '0.5.0-preview.2',
        '0.6.0-nightly.20250910.a31830a3',
      ]);

    // Git Tag Mocks - updated to use new command format
    if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'")) return 'v0.4.1';
    if (command.includes("git tag -l 'v*-preview*'")) return 'v0.5.0-preview.2';
    if (command.includes("git tag -l 'v*-nightly*'"))
      return 'v0.6.0-nightly.20250910.a31830a3';

    // GitHub Release Mocks
    if (command.includes('gh release view "v0.4.1"')) return 'v0.4.1';
    if (command.includes('gh release view "v0.5.0-preview.2"'))
      return 'v0.5.0-preview.2';
    if (command.includes('gh release view "v0.6.0-nightly.20250910.a31830a3"'))
      return 'v0.6.0-nightly.20250910.a31830a3';

    // Git Hash Mock
    if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

    return '';
  };

  describe('Happy Path - Version Calculation', () => {
    it('should calculate the next stable version from the latest preview', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'stable' });
      expect(result.releaseVersion).toBe('0.5.0');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should use the override version for stable if provided', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({
        type: 'stable',
        stable_version_override: '1.2.3',
      });
      expect(result.releaseVersion).toBe('1.2.3');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should calculate the next preview version from the latest nightly', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'preview' });
      expect(result.releaseVersion).toBe('0.6.0-preview.0');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });

    it('should use the override version for preview if provided', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({
        type: 'preview',
        preview_version_override: '4.5.6-preview.0',
      });
      expect(result.releaseVersion).toBe('4.5.6-preview.0');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });

    it('should calculate the next nightly version from the latest nightly', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'nightly' });
      expect(result.releaseVersion).toBe('0.7.0-nightly.20250917.d3bf8a3d');
      expect(result.npmTag).toBe('nightly');
      expect(result.previousReleaseTag).toBe(
        'v0.6.0-nightly.20250910.a31830a3',
      );
    });

    it('should calculate the next patch version for a stable release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(result.releaseVersion).toBe('0.4.2');
      expect(result.npmTag).toBe('latest');
      expect(result.previousReleaseTag).toBe('v0.4.1');
    });

    it('should calculate the next patch version for a preview release', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      const result = getVersion({ type: 'patch', 'patch-from': 'preview' });
      expect(result.releaseVersion).toBe('0.5.0-preview.3');
      expect(result.npmTag).toBe('preview');
      expect(result.previousReleaseTag).toBe('v0.5.0-preview.2');
    });
  });

  describe('Failure Path - Invalid Overrides', () => {
    it('should throw an error for an invalid stable_version_override', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'stable',
          stable_version_override: '1.2.3-beta',
        }),
      ).toThrow(
        'Invalid stable_version_override: 1.2.3-beta. Must be in X.Y.Z format.',
      );
    });

    it('should throw an error for an invalid preview_version_override format', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'preview',
          preview_version_override: '4.5.6-preview', // Missing .N
        }),
      ).toThrow(
        'Invalid preview_version_override: 4.5.6-preview. Must be in X.Y.Z-preview.N format.',
      );
    });

    it('should throw an error for another invalid preview_version_override format', () => {
      vi.mocked(execSync).mockImplementation(mockExecSync);
      expect(() =>
        getVersion({
          type: 'preview',
          preview_version_override: '4.5.6',
        }),
      ).toThrow(
        'Invalid preview_version_override: 4.5.6. Must be in X.Y.Z-preview.N format.',
      );
    });
  });

  describe('Semver Sorting Edge Cases', () => {
    it('should demonstrate the current broken behavior with creation date sorting', () => {
      const mockWithBrokenDateSorting = (command) => {
        // NPM dist tags (old way - may be incorrectly tagged)
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.0.77'; // This is the problem - NPM dist-tag says 0.0.77 is "latest"
        if (command.includes('npm view') && command.includes('--tag=preview'))
          return '0.6.0-preview.2';
        if (command.includes('npm view') && command.includes('--tag=nightly'))
          return '0.7.0-nightly.20250910.a31830a3';

        // NPM versions list (new way - semantic sorting will fix this)
        if (command.includes('npm view') && command.includes('versions --json'))
          return JSON.stringify([
            '0.0.77',
            '0.4.1',
            '0.5.0',
            '0.6.0-preview.1',
            '0.6.0-preview.2',
            '0.7.0-nightly.20250910.a31830a3',
          ]);

        // Git tags now use semver sorting - simulate multiple tags
        if (command.includes("git tag -l 'v[0-9].[0-9].[0-9]'"))
          return 'v0.0.77\nv0.5.0\nv0.4.1'; // Multiple tags to test sorting
        if (command.includes("git tag --sort=-creatordate -l 'v*-preview*'"))
          return 'v0.6.0-preview.2';
        if (command.includes("git tag --sort=-creatordate -l 'v*-nightly*'"))
          return 'v0.7.0-nightly.20250910.a31830a3';

        // GitHub releases exist for the broken versions
        if (command.includes('gh release view "v0.0.77"')) return 'v0.0.77';
        if (command.includes('gh release view "v0.6.0-preview.2"'))
          return 'v0.6.0-preview.2';
        if (
          command.includes('gh release view "v0.7.0-nightly.20250910.a31830a3"')
        )
          return 'v0.7.0-nightly.20250910.a31830a3';

        // Git Hash Mock
        if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithBrokenDateSorting);

      // With our fix, this should now give correct results even with bad dist-tags
      const patchResult = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(patchResult.releaseVersion).toBe('0.5.1'); // Fixed! Now correctly 0.5.1
      expect(patchResult.previousReleaseTag).toBe('v0.5.0'); // Fixed! Now correctly v0.5.0

      // Stable version calculation should also be correct
      const stableResult = getVersion({ type: 'stable' });
      expect(stableResult.releaseVersion).toBe('0.6.0'); // Still correct
      expect(stableResult.previousReleaseTag).toBe('v0.5.0'); // Fixed! Now correctly v0.5.0
    });

    it('should handle mixed version ranges correctly with proper semver sorting', () => {
      const mockWithCorrectSemverSorting = (command) => {
        // This is what we want - NPM and Git should use semantic version sorting
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.5.0'; // Correct - semantically latest stable version
        if (command.includes('npm view') && command.includes('--tag=preview'))
          return '0.6.0-preview.2';
        if (command.includes('npm view') && command.includes('--tag=nightly'))
          return '0.7.0-nightly.20250910.a31830a3';

        // Git tags should use semantic version sorting, not creation date
        if (
          command.includes(
            "git tag --sort=-creatordate -l 'v[0-9].[0-9].[0-9]'",
          )
        )
          return 'v0.5.0'; // Correct - should return semver latest, not date latest
        if (command.includes("git tag --sort=-creatordate -l 'v*-preview*'"))
          return 'v0.6.0-preview.2';
        if (command.includes("git tag --sort=-creatordate -l 'v*-nightly*'"))
          return 'v0.7.0-nightly.20250910.a31830a3';

        // GitHub releases for correct versions
        if (command.includes('gh release view "v0.5.0"')) return 'v0.5.0';
        if (command.includes('gh release view "v0.6.0-preview.2"'))
          return 'v0.6.0-preview.2';
        if (
          command.includes('gh release view "v0.7.0-nightly.20250910.a31830a3"')
        )
          return 'v0.7.0-nightly.20250910.a31830a3';

        // Git Hash Mock
        if (command.includes('git rev-parse --short HEAD')) return 'd3bf8a3d';

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithCorrectSemverSorting);

      // Test what we want the behavior to be
      const patchResult = getVersion({ type: 'patch', 'patch-from': 'stable' });
      expect(patchResult.releaseVersion).toBe('0.5.1'); // Correct - patch from 0.5.0
      expect(patchResult.previousReleaseTag).toBe('v0.5.0'); // Correct

      const stableResult = getVersion({ type: 'stable' });
      expect(stableResult.releaseVersion).toBe('0.6.0'); // Correct - from preview
      expect(stableResult.previousReleaseTag).toBe('v0.5.0'); // Correct
    });

    it('should fail when git tags are not semver-sorted correctly', () => {
      const mockWithIncorrectGitSorting = (command) => {
        // NPM correctly returns 0.5.0 as latest
        if (command.includes('npm view') && command.includes('--tag=latest'))
          return '0.5.0';

        // But git tag sorting by creation date incorrectly returns 0.0.77
        if (
          command.includes(
            "git tag --sort=-creatordate -l 'v[0-9].[0-9].[0-9]'",
          )
        )
          return 'v0.0.77'; // This should cause a discrepancy error

        return mockExecSync(command);
      };

      vi.mocked(execSync).mockImplementation(mockWithIncorrectGitSorting);

      // This should throw because NPM says 0.5.0 but git tag sorting says v0.0.77
      expect(() =>
        getVersion({ type: 'patch', 'patch-from': 'stable' }),
      ).toThrow(
        'Discrepancy found! NPM latest tag (0.5.0) does not match latest git latest tag (v0.0.77).',
      );
    });
  });

  describe('Failure Path - Discrepancy Checks', () => {
    it('should throw an error if the git tag does not match npm', () => {
      const mockWithMismatchGitTag = (command) => {
        if (command.includes("git tag --sort=-creatordate -l 'v*-preview*'"))
          return 'v0.4.0-preview-99'; // Mismatch
        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithMismatchGitTag);

      expect(() => getVersion({ type: 'stable' })).toThrow(
        'Discrepancy found! NPM preview tag (0.5.0-preview.2) does not match latest git preview tag (v0.4.0-preview-99).',
      );
    });

    it('should throw an error if the GitHub release is missing', () => {
      const mockWithMissingRelease = (command) => {
        if (command.includes('gh release view "v0.5.0-preview.2"')) {
          throw new Error('gh command failed'); // Simulate gh failure
        }
        return mockExecSync(command);
      };
      vi.mocked(execSync).mockImplementation(mockWithMissingRelease);

      expect(() => getVersion({ type: 'stable' })).toThrow(
        'Discrepancy found! Failed to verify GitHub release for v0.5.0-preview.2.',
      );
    });
  });
});
