#!/usr/bin/env python3
"""
Sync-back script to automatically update action versions in source templates
from the generated workflow files after Dependabot updates.

This script scans the generated workflow files (.github/workflows/__*.yml) to find
the latest action versions used, then updates:
1. Hardcoded action versions in pr-checks/sync.py
2. Action version references in template files in pr-checks/checks/
3. Action version references in regular workflow files

This ensures that when Dependabot updates action versions in generated workflows,
those changes are properly synced back to the source templates.
"""

import os
import re
import glob
import argparse
import sys
from pathlib import Path
from typing import Dict, Set, List, Tuple


def scan_generated_workflows(workflow_dir: str) -> Dict[str, str]:
    """
    Scan generated workflow files to extract the latest action versions.
    
    Args:
        workflow_dir: Path to .github/workflows directory
        
    Returns:
        Dictionary mapping action names to their latest versions
    """
    action_versions = {}
    generated_files = glob.glob(os.path.join(workflow_dir, "__*.yml"))
    
    # Actions we care about syncing
    target_actions = {
        'actions/setup-go',
        'actions/setup-node', 
        'actions/setup-python',
        'actions/github-script'
    }
    
    for file_path in generated_files:
        with open(file_path, 'r') as f:
            content = f.read()
            
        # Find all action uses in the file
        pattern = r'uses:\s+(actions/[^@\s]+)@([^@\s]+)'
        matches = re.findall(pattern, content)
        
        for action_name, version in matches:
            if action_name in target_actions:
                # Take the latest version seen (they should all be the same after Dependabot)
                action_versions[action_name] = version
                
    return action_versions


def update_sync_py(sync_py_path: str, action_versions: Dict[str, str]) -> bool:
    """
    Update hardcoded action versions in pr-checks/sync.py
    
    Args:
        sync_py_path: Path to sync.py file
        action_versions: Dictionary of action names to versions
        
    Returns:
        True if file was modified, False otherwise
    """
    if not os.path.exists(sync_py_path):
        print(f"Warning: {sync_py_path} not found")
        return False
        
    with open(sync_py_path, 'r') as f:
        content = f.read()
        
    original_content = content
    
    # Update hardcoded action versions 
    for action_name, version in action_versions.items():
        # Look for patterns like 'uses': 'actions/setup-node@v4'
        pattern = rf"('uses':\s*')(actions/{action_name.split('/')[-1]})@([^']+)(')"
        replacement = rf"\1\2@{version}\4"
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
        action_versions: Dictionary of action names to versions
        
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
        for action_name, version in action_versions.items():
            # Look for patterns like 'uses: actions/setup-node@v4'
            pattern = rf"(uses:\s+{re.escape(action_name)})@([^@\s]+)"
            replacement = rf"\1@{version}"
            content = re.sub(pattern, replacement, content)
            
        if content != original_content:
            with open(file_path, 'w') as f:
                f.write(content)
            modified_files.append(file_path)
            print(f"Updated {file_path}")
            
    return modified_files


def update_regular_workflows(workflow_dir: str, action_versions: Dict[str, str]) -> List[str]:
    """
    Update action versions in regular (non-generated) workflow files
    
    Args:
        workflow_dir: Path to .github/workflows directory
        action_versions: Dictionary of action names to versions
        
    Returns:
        List of files that were modified
    """
    modified_files = []
    
    # Get all workflow files that are NOT generated (don't start with __)
    all_files = glob.glob(os.path.join(workflow_dir, "*.yml"))
    regular_files = [f for f in all_files if not os.path.basename(f).startswith("__")]
    
    for file_path in regular_files:
        with open(file_path, 'r') as f:
            content = f.read()
            
        original_content = content
        
        # Update action versions
        for action_name, version in action_versions.items():
            # Look for patterns like 'uses: actions/setup-node@v4'
            pattern = rf"(uses:\s+{re.escape(action_name)})@([^@\s]+)"
            replacement = rf"\1@{version}"
            content = re.sub(pattern, replacement, content)
            
        if content != original_content:
            with open(file_path, 'w') as f:
                f.write(content)
            modified_files.append(file_path)
            print(f"Updated {file_path}")
            
    return modified_files


def main():
    parser = argparse.ArgumentParser(description="Sync action versions from generated workflows back to templates")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be changed without making changes")
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
        
    if args.dry_run:
        print("\nDRY RUN - Would make the following changes:")
        print(f"Action versions to sync: {action_versions}")
        return 0
        
    # Update files
    print("\nUpdating source files...")
    modified_files = []
    
    # Update sync.py
    if update_sync_py(str(sync_py_path), action_versions):
        modified_files.append(str(sync_py_path))
        
    # Update template files 
    template_modified = update_template_files(str(checks_dir), action_versions)
    modified_files.extend(template_modified)
    
    # Update regular workflow files
    workflow_modified = update_regular_workflows(str(workflow_dir), action_versions)
    modified_files.extend(workflow_modified)
    
    if modified_files:
        print(f"\nSync completed. Modified {len(modified_files)} files:")
        for file_path in modified_files:
            print(f"  {file_path}")
    else:
        print("\nNo files needed updating - all action versions are already in sync")
        
    return 0


if __name__ == "__main__":
    sys.exit(main())