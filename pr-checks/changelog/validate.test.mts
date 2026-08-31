import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

import { withTmpDir, withTmpFile } from "../../src/util";

import {
  hasValidChangenoteCategory,
  isValidAllChangenoteFiles,
  isValidChangenoteContent,
  isValidChangenoteFile,
  isValidChangenoteFilename,
  VALID_CHANGE_NOTE_CATEGORIES,
} from "./validate.mjs";

await describe("isValidChangenoteContent", async () => {
  await it("recognizes an unordered Markdown list", () => {
    const inputs = [
      "- One changenote entry",
      "- First item\n- Second item",
      "\n\n\n\n- Fixed a bug\n- Added a feature",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), true);
    }
  });

  await it("does not recognize non-Markdown text", () => {
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

  await it("does not recognize ordered Markdown lists", () => {
    const inputs = [
      "1. First item\n2. Second item",
      "\n\n\n1. First item\n1. Second item",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteContent(input), false);
    }
  });

  await it("requires all list items to use a hyphen bullet", () => {
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

  await it("does not contain other Markdown elements", () => {
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
  await it("accepts valid filenames", () => {
    const inputs = [
      "2023-01-01-fix-bug.md",
      "2023-12-31-add-feature.md",
      "2023-06-15-update-docs.md",
    ];

    for (const input of inputs) {
      assert.equal(isValidChangenoteFilename(input), true);
    }
  });

  await it("rejects invalid filenames", () => {
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
  await it("accepts valid categories", () => {
    for (const category of Object.keys(VALID_CHANGE_NOTE_CATEGORIES)) {
      const frontmatter = { category };
      assert.equal(hasValidChangenoteCategory(frontmatter), true);
    }
  });

  await it("rejects invalid categories", () => {
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

  await it("reject missing category", () => {
    assert.equal(hasValidChangenoteCategory({}), false);
    assert.equal(hasValidChangenoteCategory({ category: null }), false);
    assert.equal(hasValidChangenoteCategory({ category: undefined }), false);
  });
});

await describe("isValidChangenoteFile", async () => {
  await it("accepts a valid change-note file", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "---\ncategory: fix\n---\n- Fixed a bug\n",
      (filePath) => {
        assert.equal(isValidChangenoteFile(filePath), true);
      },
    );
  });

  await it("rejects a non-existent path", async () => {
    assert.equal(isValidChangenoteFile("non-existent-file.md"), false);
  });

  await it("rejects invalid filename", async () => {
    await withTmpFile(
      "fix-bug.md",
      "---\ncategory: fix\n---\n- Fixed a bug\n",
      (filePath) => {
        assert.equal(isValidChangenoteFile(filePath), false);
      },
    );
  });

  await it("rejects missing frontmatter", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "- Fixed a bug\n",
      (filePath) => {
        assert.equal(isValidChangenoteFile(filePath), false);
      },
    );
  });

  await it("rejects invalid Markdown", async () => {
    await withTmpFile(
      "2026-01-01-fix-bug.md",
      "---\ncategory: fix\n---\n* Fixed a bug\n",
      (filePath) => {
        assert.equal(isValidChangenoteFile(filePath), false);
      },
    );
  });
});

await describe("isValidAllChangenoteFiles", async () => {
  await it("accepts a directory of valid change-note files", async () => {
    await withTmpDir(async (tmpDir) => {
      const fileName1 = path.join(tmpDir, "2026-01-01-fix-bug.md");
      const fileName2 = path.join(tmpDir, "2026-01-02-add-feature.md");
      fs.writeFileSync(fileName1, "---\ncategory: fix\n---\n- Fixed a bug\n");
      fs.writeFileSync(
        fileName2,
        "---\ncategory: feature\n---\n- Added a feature\n",
      );
      assert.equal(isValidAllChangenoteFiles([fileName1, fileName2]), true);
    });
  });

  await it("accepts an empty list", async () => {
    assert.equal(isValidAllChangenoteFiles([]), true);
  });

  await it("accepts a list of .gitkeep only", async () => {
    assert.equal(isValidAllChangenoteFiles([".gitkeep"]), true);
  });

  await it("rejects directory with an invalid change-note file", async () => {
    await withTmpDir(async (tmpDir) => {
      const fileName1 = path.join(tmpDir, "2026-01-01-fix-bug.md");
      const fileName2 = path.join(tmpDir, "2026-01-02-wrong-category.md");
      fs.writeFileSync(fileName1, "---\ncategory: fix\n---\n- Fixed a bug\n");
      fs.writeFileSync(
        fileName2,
        "---\ncategory: foobar\n---\n- Added a feature\n",
      );
      assert.equal(isValidAllChangenoteFiles([fileName1, fileName2]), false);
    });
  });
});
