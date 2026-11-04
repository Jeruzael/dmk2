import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function createRepositoryFixture(root: string) {
  mkdirSync(root, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.autocrlf=false",
        "-c",
        "core.safecrlf=false",
        "-c",
        "user.name=Synthetic Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
    ).trim();
  git("init", "-b", "develop");
  const write = (path: string, text: string) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const largeText =
    "# Long field guide\n\n" +
    "Ω😀 Keep every training note local and readable.\n".repeat(28000) +
    "\n## Final evidence\n\nEND-OF-SYNTHETIC-LONG-DOCUMENT\n";
  write(
    "README.md",
    "# Trailhead source library\n\n[Architecture](Docs/Architecture/overview.md#component-boundary)\n\n[Long guide](Docs/Guides/long-guide.md)\n\n[Space guide](Docs/Guides/with%20space.md#start-here)\n\n<script>window.__repositoryUnsafe = true</script>\n\n![blocked](https://example.invalid/remote.png)\n\n[Outside](../../outside.md)\n",
  );
  write(
    "Docs/Architecture/overview.md",
    "# System **map**\n\n## Component boundary\n\nA synthetic isolated reader.\n\n[Back to index](../../README.md)\n\n### Nested *heading*\n\nPreserve heading text.\n",
  );
  write(
    "Docs/Planning/milestone.md",
    "# Local milestone\n\nA goal without an invented schedule.\n",
  );
  write(
    "Docs/Tracking/WBS.md",
    "# Tracked work\n\nRecorded state is not verification.\n",
  );
  write(
    "Docs/Walkthroughs/restart.md",
    "# Restart walkthrough\n\nVerify durable state independently.\n",
  );
  write("Docs/Guides/long-guide.md", largeText);
  write(
    "Docs/Drafts/idea.md",
    "# Draft idea\n\nAn explicitly path-marked draft.\n",
  );
  write(
    "Docs/Archived/old.md",
    "# Earlier proposal\n\nAn explicitly archived source.\n",
  );
  write(
    "Docs/Canonical/contract.md",
    "# Recorded contract\n\nA path-marked canonical source.\n",
  );
  write(
    "Docs/Guides/repeated.md",
    "# Heading guide\n\n[Second repeat](#repeat-1)\n\n## Repeat\n\nFirst section.\n\n## Repeat\n\nSecond section.\n",
  );
  write("Docs/Guides/multi.part.MD", "# Uppercase extension\n");
  write(
    "Docs/Guides/with space.md",
    "# Space guide\n\n## Start here\n\nThe encoded path resolves inside this library.\n",
  );
  write(
    "node_modules/vendor/README.md",
    "# Tracked vendor note\n\nA tracked Markdown file still belongs to the repository-wide inventory.\n",
  );
  write("private-secret.txt", "SYNTHETIC-NON-MARKDOWN-SECRET");
  git("add", ".");
  const linkBlob = execFileSync(
    "git",
    ["-C", root, "hash-object", "-w", "--stdin"],
    { input: "../../outside.md", encoding: "utf8", windowsHide: true },
  ).trim();
  git(
    "update-index",
    "--add",
    "--cacheinfo",
    `120000,${linkBlob},Docs/Guides/unsafe-link.md`,
  );
  git("commit", "-m", "Synthetic repository fixture");
  return { root, git, write, largeText, commit: git("rev-parse", "HEAD") };
}
