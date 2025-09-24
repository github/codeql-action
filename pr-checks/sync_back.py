#!/usr/bin/env python3
"""
Sync-back script to automatically update action versions in source templates
from the generated workflow files after Dependabot updates.

This script scans the generated workflow files (.github/workflows/__*.yml) to find
all external action versions used, then updates:
1. Hardcoded action versions in pr-checks/sync.py
2. Action version references in template files in pr-checks/checks/

The script automatically detects all actions used in generated workflows and
preserves version comments (e.g., # v1.2.3) when syncing versions.

This ensures that when Dependabot updates action versions in generated workflows,
those changes are properly synced back to the source templates. Regular workflow
files are updated directly by Dependabot and don't need sync-back.
"""

import os
import re
import glob
import argparse
import sys
from pathlib import Path
from typing import Dict, List


def scan_generated_workflows(workflow_dir: str) -> Dict[str, str]:
    """
    Scan generated workflow files to extract the latest action versions.

    Args:
        workflow_dir: Path to .github/workflows directory

    Returns:
        Dictionary mapping action names to their latest versions (including comments)
    """
    action_versions = {}
    generated_files = glob.glob(os.path.join(workflow_dir, "__*.yml"))

    for file_path in generated_files:
        with open(file_path, 'r') as f:
            content = f.read()

        # Find all action uses in the file, including potential comments
        # This pattern captures: action_name@version_with_possible_comment
        pattern = r'uses:\s+([^/\s]+/[^@\s]+)@([^@\n]+)'
        matches = re.findall(pattern, content)

        for action_name, version_with_comment in matches:
            # Only track non-local actions (those with / but not starting with ./)
            if not action_name.startswith('./'):
                # Assume that version numbers are consistent (this should be the case on a Dependabot update PR)
                action_versions[action_name] = version_with_comment.rstrip()

    return action_versions


def update_sync_py(sync_py_path: str, action_versions: Dict[str, str]) -> bool:
    """
    Update hardcoded action versions in pr-checks/sync.py

    Args:
        sync_py_path: Path to sync.py file
        action_versions: Dictionary of action names to versions (may include comments)

    Returns:
        True if file was modified, False otherwise
    """
    if not os.path.exists(sync_py_path):
        raise FileNotFoundError(f"Could not find {sync_py_path}")

    with open(sync_py_path, 'r') as f:
        content = f.read()

    original_content = content

    # Update hardcoded action versions
    for action_name, version_with_comment in action_versions.items():
        # Extract just the version part (before any comment) for sync.py
        version = version_with_comment.split('#')[0].strip() if '#' in version_with_comment else version_with_comment.strip()

        # Look for patterns like 'uses': 'actions/setup-node@v4'
        # Note that this will break if we store an Action uses reference in a
        # variable - that's a risk we're happy to take since in that case the
        # PR checks will just fail.
        pattern = rf"('uses':\s*'){re.escape(action_name)}@(?:[^']+)(')"
        replacement = rf"\1{action_name}@{version}\2"
        content = re.sub(pattern, replacement, content)

    if content != original_content:
        with open(sync_py_path, 'w') as f:
            f.write(content)
        print(f"Updated {sync_py_path}")
        return True
    else:
        print(f"No changes needed in {sync_py_path}")
        return False


def update_template_files(checks_dir: str, action_versions: Dict[str, str]) -> List[str]:
    """
    Update action versions in template files in pr-checks/checks/

    Args:
        checks_dir: Path to pr-checks/checks directory
        action_versions: Dictionary of action names to versions (may include comments)

    Returns:
        List of files that were modified
    """
    modified_files = []
    template_files = glob.glob(os.path.join(checks_dir, "*.yml"))

    for file_path in template_files:
        with open(file_path, 'r') as f:
            content = f.read()

        original_content = content

        # Update action versions
        for action_name, version_with_comment in action_versions.items():
            # Look for patterns like 'uses: actions/setup-node@v4' or 'uses: actions/setup-node@sha # comment'
            pattern = rf"(uses:\s+{re.escape(action_name)})@(?:[^@\n]+)"
            replacement = rf"\1@{version_with_comment}"
            content = re.sub(pattern, replacement, content)

        if content != original_content:
            with open(file_path, 'w') as f:
                f.write(content)
            modified_files.append(file_path)
            print(f"Updated {file_path}")

    return modified_files


def main():
    parser = argparse.ArgumentParser(description="Sync action versions from generated workflows back to templates")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    args = parser.parse_args()

    # Get the repository root (assuming script is in pr-checks/)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent

    workflow_dir = repo_root / ".github" / "workflows"
    checks_dir = script_dir / "checks"
    sync_py_path = script_dir / "sync.py"

    print("Scanning generated workflows for latest action versions...")
    action_versions = scan_generated_workflows(str(workflow_dir))

    if args.verbose:
        print("Found action versions:")
        for action, version in action_versions.items():
            print(f"  {action}@{version}")

    if not action_versions:
        print("No action versions found in generated workflows")
        return 1

    # Update files
    print("\nUpdating source files...")
    modified_files = []

    # Update sync.py
    if update_sync_py(str(sync_py_path), action_versions):
        modified_files.append(str(sync_py_path))

    # Update template files
    template_modified = update_template_files(str(checks_dir), action_versions)
    modified_files.extend(template_modified)

    if modified_files:
        print(f"\nSync completed. Modified {len(modified_files)} files:")
        for file_path in modified_files:
            print(f"  {file_path}")
    else:
        print("\nNo files needed updating - all action versions are already in sync")

    return 0


if __name__ == "__main__":
    sys.exit(main())