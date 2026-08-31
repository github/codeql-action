import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import {
  isValidChangenoteContent,
  isValidChangenoteFileOrDir,
  isValidChangenoteFilename,
  hasValidChangenoteCategory,
  VALID_CHANGE_NOTE_CATEGORIES,
} from "./validate.ts";

async function withTmpDir<T>(body: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "changetool-validate-test-"),
  );
  try {
    return await body(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function withTmpFile<T>(
  baseFileName: string,
  contents: string,
  body: (filePath: string) => Promise<T>,
): Promise<T> {
  return await withTmpDir(async (tmpDir) => {
    const filePath = path.join(tmpDir, baseFileName);
    fs.writeFileSync(filePath, contents);
    return await body(filePath);
  });
}

await describe("isValidChangenoteContent", async () => {
  await it("recognizes an unordered Markdown list", async () => {
    const inputs = [
      "- One changenote entry",
      "- First item\n- Second item",
      "\n\n\n\n- Fixed a bug\n- Added a feature",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), true);
    }
  });

  await it("does not recognize non-Markdown text", async () => {
    const inputs = [
      "This is not a list.",
      '["this", "is", "JSON"]',
      "---",
      "***",
      "___",
      "paragraph",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), false);
    }
  });

  await it("does not recognize ordered Markdown lists", async () => {
    const inputs = [
      "1. First item\n2. Second item",
      "\n\n\n1. First item\n1. Second item",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), false);
    }
  });

  await it("requires all list items to use a hyphen bullet", async () => {
    const inputs = [
      "* Fixed a bug\n* Added feature",
      "+ Fixed a bug\n+ Added feature",
      "- Fixed a bug\n* Added feature",
      "- Fixed a bug\n+ Added feature",
      "- Fixed a bug\n  * Added feature\n    + Updated docs",
      "\n\n\n* Fixed a bug",
      "\n\n\n+ Fixed a bug",
      "---\n* Fixed a bug\n* Added feature",
    ] as const;

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), false);
    }
  });

  await it("does not contain other Markdown elements", async () => {
    const inputs = [
      "- Fixed a bug\n\nParagraph of text",
      "- Fixed a bug\n\n* Added a feature",
      "# Header\n- Fixed a bug",
      "- Fixed a bug\n## Subheader",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), false);
    }
  });
});

await describe("isValidChangenoteFilename", async () => {
  await it("accepts valid filenames", async () => {
    const inputs = [
      "2023-01-01-fix-bug.md",
      "2023-12-31-add-feature.md",
      "2023-06-15-update-docs.md",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteFilename(input), true);
    }
  });

  await it("rejects invalid filenames", async () => {
    const inputs = [
      "missing-date-from-filename.md",
      "2021-01-01.md",
      "2026-12-19-wrong-file-name-extension.txt",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteFilename(input), false);
    }
  });
});

await describe("hasValidChangenoteCategory", async () => {
  await it("accepts valid categories", async () => {
    for (const category of Object.keys(VALID_CHANGE_NOTE_CATEGORIES)) {
      const frontmatter = { category };
      assert.equal(hasValidChangenoteCategory(frontmatter), true);
    }
  });

  await it("rejects invalid categories", async () => {
    const inputs = [
      "",
      "invalid-category",
      "bug-fix",
      "new-feature",
      "security-patch",
      "miscellaneous",
      "documentation",
    ];

    for (const category of inputs) {
      const frontmatter = { category };
      assert.equal(hasValidChangenoteCategory(frontmatter), false);
    }
  });

  await it("reject missing category", async () => {
    assert.equal(hasValidChangenoteCategory({}), false);
    assert.equal(hasValidChangenoteCategory({ category: null }), false);
    assert.equal(hasValidChangenoteCategory({ category: undefined }), false);
  });
});

await describe("isValidChangenoteFileOrDir", async () => {
  await it("accepts a valid change-note file", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "---\ncategory: fix\n---\n- Fixed a bug\n",
      async (filePath) => {
        assert.equal(isValidChangenoteFileOrDir(filePath), true);
      },
    );
  });

  await it("accepts a directory of valid change-note files", async () => {
    await withTmpDir(async (tmpDir) => {
      fs.writeFileSync(
        path.join(tmpDir, "2026-01-01-fix-bug.md"),
        "---\ncategory: fix\n---\n- Fixed a bug\n",
      );
      fs.writeFileSync(
        path.join(tmpDir, "2026-01-02-add-feature.md"),
        "---\ncategory: feature\n---\n- Added a feature\n",
      );
      assert.equal(isValidChangenoteFileOrDir(tmpDir), true);
    });
  });

  await it("accepts an empty directory", async () => {
    await withTmpDir(async (tmpDir) => {
      assert.equal(isValidChangenoteFileOrDir(tmpDir), true);
    });
  });

  await it("accepts a directory of .gitkeep only", async () => {
    await withTmpFile(".gitkeep", "", async (filePath) => {
      const dirPath = path.dirname(filePath);
      assert.equal(isValidChangenoteFileOrDir(dirPath), true);
    });
  });

  await it("rejects a non-existent path", async () => {
    assert.equal(isValidChangenoteFileOrDir("non-existent-file.md"), false);
    assert.equal(isValidChangenoteFileOrDir("this-dir-does-not-exist"), false);
  });

  await it("rejects invalid filename", async () => {
    await withTmpFile(
      "fix-bug.md",
      "---\ncategory: fix\n---\n- Fixed a bug\n",
      async (filePath) => {
        assert.equal(isValidChangenoteFileOrDir(filePath), false);
      },
    );
  });

  await it("rejects missing frontmatter", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "- Fixed a bug\n",
      async (filePath) => {
        assert.equal(isValidChangenoteFileOrDir(filePath), false);
      },
    );
  });

  await it("rejects invalid Markdown", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "---\ncategory: fix\n---\n* Fixed a bug\n",
      async (filePath) => {
        assert.equal(isValidChangenoteFileOrDir(filePath), false);
      },
    );
  });

  await it("rejects directory with one invalid change-note file", async () => {
    await withTmpDir(async (tmpDir) => {
      fs.writeFileSync(
        path.join(tmpDir, "2026-01-01-fix-bug.md"),
        "---\ncategory: fix\n---\n- Fixed a bug\n",
      );
      fs.writeFileSync(
        path.join(tmpDir, "2026-01-02-wrong-category.md"),
        "---\ncategory: foobar\n---\n- Added a feature\n",
      );
      assert.equal(isValidChangenoteFileOrDir(tmpDir), false);
    });
  });
});
