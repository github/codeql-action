#!/usr/bin/env python3
"""
Tests for the sync_back.py script
"""

import os
import shutil
import tempfile
import unittest

import sync_back


class TestSyncBack(unittest.TestCase):

    def setUp(self):
        """Set up temporary directories and files for testing"""
        self.test_dir = tempfile.mkdtemp()
        self.workflow_dir = os.path.join(self.test_dir, ".github", "workflows")
        self.checks_dir = os.path.join(self.test_dir, "pr-checks", "checks")
        os.makedirs(self.workflow_dir)
        os.makedirs(self.checks_dir)

        # Create sync.py file
        self.sync_py_path = os.path.join(self.test_dir, "pr-checks", "sync.py")

    def tearDown(self):
        """Clean up temporary directories"""
        shutil.rmtree(self.test_dir)

    def test_scan_generated_workflows_basic(self):
        """Test basic workflow scanning functionality"""
        # Create a test generated workflow file
        workflow_content = """
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v5
      - uses: actions/setup-go@v6
        """

        with open(os.path.join(self.workflow_dir, "__test.yml"), 'w') as f:
            f.write(workflow_content)

        result = sync_back.scan_generated_workflows(self.workflow_dir)

        self.assertEqual(result['actions/checkout'], 'v4')
        self.assertEqual(result['actions/setup-node'], 'v5')
        self.assertEqual(result['actions/setup-go'], 'v6')

    def test_scan_generated_workflows_with_comments(self):
        """Test scanning workflows with version comments"""
        workflow_content = """
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@44511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0
      - uses: actions/setup-python@v6 # Latest Python
        """

        with open(os.path.join(self.workflow_dir, "__test.yml"), 'w') as f:
            f.write(workflow_content)

        result = sync_back.scan_generated_workflows(self.workflow_dir)

        self.assertEqual(result['actions/checkout'], 'v4')
        self.assertEqual(result['ruby/setup-ruby'], '44511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0')
        self.assertEqual(result['actions/setup-python'], 'v6 # Latest Python')

    def test_scan_generated_workflows_ignores_local_actions(self):
        """Test that local actions (starting with ./) are ignored"""
        workflow_content = """
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/local-action
      - uses: ./another-local-action@v1
        """

        with open(os.path.join(self.workflow_dir, "__test.yml"), 'w') as f:
            f.write(workflow_content)

        result = sync_back.scan_generated_workflows(self.workflow_dir)

        self.assertEqual(result['actions/checkout'], 'v4')
        self.assertNotIn('./.github/actions/local-action', result)
        self.assertNotIn('./another-local-action', result)


    def test_update_sync_py(self):
        """Test updating sync.py file"""
        sync_py_content = """
steps = [
    {
        'uses': 'actions/setup-node@v4',
        'with': {'node-version': '16'}
    },
    {
        'uses': 'actions/setup-go@v5',
        'with': {'go-version': '1.19'}
    }
]
        """

        with open(self.sync_py_path, 'w') as f:
            f.write(sync_py_content)

        action_versions = {
            'actions/setup-node': 'v5',
            'actions/setup-go': 'v6'
        }

        result = sync_back.update_sync_py(self.sync_py_path, action_versions)
        self.assertTrue(result)

        with open(self.sync_py_path, 'r') as f:
            updated_content = f.read()

        self.assertIn("'uses': 'actions/setup-node@v5'", updated_content)
        self.assertIn("'uses': 'actions/setup-go@v6'", updated_content)

    def test_update_sync_py_with_comments(self):
        """Test updating sync.py file when versions have comments"""
        sync_py_content = """
steps = [
    {
        'uses': 'actions/setup-node@v4',
        'with': {'node-version': '16'}
    }
]
        """

        with open(self.sync_py_path, 'w') as f:
            f.write(sync_py_content)

        action_versions = {
            'actions/setup-node': 'v5 # Latest version'
        }

        result = sync_back.update_sync_py(self.sync_py_path, action_versions)
        self.assertTrue(result)

        with open(self.sync_py_path, 'r') as f:
            updated_content = f.read()

        # sync.py should get the version without comment
        self.assertIn("'uses': 'actions/setup-node@v5'", updated_content)
        self.assertNotIn("# Latest version", updated_content)

    def test_update_template_files(self):
        """Test updating template files"""
        template_content = """
name: Test Template
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v4
    with:
      node-version: 16
        """

        template_path = os.path.join(self.checks_dir, "test.yml")
        with open(template_path, 'w') as f:
            f.write(template_content)

        action_versions = {
            'actions/checkout': 'v4',
            'actions/setup-node': 'v5 # Latest'
        }

        result = sync_back.update_template_files(self.checks_dir, action_versions)
        self.assertEqual(len(result), 1)
        self.assertIn(template_path, result)

        with open(template_path, 'r') as f:
            updated_content = f.read()

        self.assertIn("uses: actions/checkout@v4", updated_content)
        self.assertIn("uses: actions/setup-node@v5 # Latest", updated_content)

    def test_update_template_files_preserves_comments(self):
        """Test that updating template files preserves version comments"""
        template_content = """
name: Test Template
steps:
  - uses: ruby/setup-ruby@44511735964dcb71245e7e55f72539531f7bc0eb # v1.256.0
        """

        template_path = os.path.join(self.checks_dir, "test.yml")
        with open(template_path, 'w') as f:
            f.write(template_content)

        action_versions = {
            'ruby/setup-ruby': '55511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0'
        }

        result = sync_back.update_template_files(self.checks_dir, action_versions)
        self.assertEqual(len(result), 1)

        with open(template_path, 'r') as f:
            updated_content = f.read()

        self.assertIn("uses: ruby/setup-ruby@55511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0", updated_content)

    def test_no_changes_needed(self):
        """Test that functions return False/empty when no changes are needed"""
        # Test sync.py with no changes needed
        sync_py_content = """
steps = [
    {
        'uses': 'actions/setup-node@v5',
        'with': {'node-version': '16'}
    }
]
        """

        with open(self.sync_py_path, 'w') as f:
            f.write(sync_py_content)

        action_versions = {
            'actions/setup-node': 'v5'
        }

        result = sync_back.update_sync_py(self.sync_py_path, action_versions)
        self.assertFalse(result)


if __name__ == '__main__':
    unittest.main()
