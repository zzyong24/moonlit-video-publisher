#!/usr/bin/env node
// Final pre-publish account re-verification (月明 2026-10-21).
// Re-reads the creator-home nickname + stable account ID inside the recorded task
// space, re-proves the space belongs to the bound Ego Profile, saves a header
// screenshot, and writes a proof file for `check-approval.mjs --account-proof`.
// The proof is valid for 15 seconds; run this immediately before the final click.
// Never creates a task space, never touches the editor/uploader, never clicks.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readPackage, bindPublishAccount } from "../lib/content-package.mjs";
import { ACCOUNT_GATED_PLATFORMS, evaluateAccountProof } from "./lib/expected-account.mjs";
import { parseV2Result, V2_RESULT_PREFIX } from "./lib/result-line.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HELP = "Usage: verify-account.mjs <douyin|xiaohongshu> <package.json> <task-space-id> --task-name <recorded name> [--out proof.json] [--shot-dir DIR]\nRe-verifies 账号→Ego Profile→昵称/账号ID in the recorded task space within 15s of the final click; exit 0=verified, 3=mismatch/unverified (stop), 2=usage/mapping error.\nBilibili/WeChat Channels have no automatic reader: verify manually.";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); process.exit(0); }
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((arg, index) => !arg.startsWith("--") && !["--task-name", "--out", "--shot-dir"].includes(argv[index - 1]));
const [platform, rawPackagePath, taskSpaceRef] = positional;
const taskName = opt("--task-name");
const usage = message => { console.error(`${message}\n${HELP}`); process.exit(2); };
if (!ACCOUNT_GATED_PLATFORMS.includes(platform)) usage(`${platform || "(none)"}: automatic account verification only exists for ${ACCOUNT_GATED_PLATFORMS.join("/")}`);
if (!rawPackagePath || !/^\d+$/.test(String(taskSpaceRef || "")) || !taskName) usage("package, numeric recorded task-space id and --task-name are required");
const packagePath = path.resolve(rawPackagePath);
const pkg = readPackage(packagePath);
const accountErrors = bindPublishAccount(pkg, platform);
if (accountErrors.length) usage(`Account binding failed for ${platform}: ${accountErrors.join("; ")}`);
const accountBinding = pkg.accountBinding[platform];
const shotDir = path.resolve(opt("--shot-dir") || path.join(path.dirname(packagePath), "account-proof"));

const header = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  `import { validateExpectedDouyinAccount, evaluateDouyinAccountProof, validateExpectedXiaohongshuAccount, evaluateXiaohongshuAccountProof } from ${JSON.stringify(pathToFileURL(path.join(DIR, "lib", "expected-account.mjs")).href)};`,
  `const platform = ${JSON.stringify(platform)};`,
  'const phase = "account";',
  "const existingTaskSpaceOnly = true;",
  `const taskName = ${JSON.stringify(taskName)};`,
  `const taskSpaceRef = ${JSON.stringify(String(taskSpaceRef))};`,
  `const packagePath = ${JSON.stringify(packagePath)};`,
  `const pkg = ${JSON.stringify(pkg)};`,
  `const accountBinding = ${JSON.stringify(accountBinding)};`,
  `const accountScreenshotDir = ${JSON.stringify(shotDir)};`,
].join("\n");
const tail = String.raw`
let accountCheck;
try {
  await selectTaskSpace();
  const verdict = platform === 'douyin' ? await verifyDouyinTargetAccount() : await verifyXiaohongshuTargetAccount();
  accountCheck = { ok: verdict.ok === true, evidence: verdict.evidence, blocker: verdict.blocker || null };
} catch (error) {
  accountCheck = { ok: false, evidence: error?.evidence || null, blocker: { code: error?.code || 'ACTION_FAILED', message: String(error?.message || error).slice(0, 300), retryable: false, requiresUser: true } };
}
cliLog(V2_RESULT_PREFIX + JSON.stringify({ schemaVersion: 1, kind: 'account-proof', platform, phase, taskSpaceId: activeTaskSpace?.id ?? null, taskSpace: activeTaskSpace?.name || taskName, finalPublishClicked: false, ...accountCheck }));
`;
const script = [header,
  fs.readFileSync(path.join(DIR, "ego", "core.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "ego", "douyin-account.mjs"), "utf8"),
  fs.readFileSync(path.join(DIR, "ego", "xiaohongshu-account.mjs"), "utf8"),
  tail].join("\n\n");

function runEgo(source) {
  return new Promise(resolve => {
    const child = spawn(process.env.VIDEO_PUBLISHER_V2_EGO_COMMAND || "ego-browser", ["nodejs"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => resolve({ code: 1, stdout, stderr: `${stderr}\n${error}` }));
    child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(source);
  });
}

const execution = await runEgo(script);
let result;
try { result = parseV2Result(`${execution.stdout}\n${execution.stderr}`, "Ego account verifier"); }
catch { result = { schemaVersion: 1, kind: "account-proof", platform, ok: false, evidence: null, blocker: { code: "INPUT_CHANNEL_BROKEN", message: "Ego Lite 没有返回账号核验结果", detail: `${execution.stdout}\n${execution.stderr}`.trim().slice(-800) } }; }
// Independent re-evaluation on the Node side; the Ego-side verdict is not trusted alone.
if (result.ok === true) {
  const evidence = result.evidence || {};
  const recheck = evaluateAccountProof(platform, { expectedAccounts: pkg.expectedAccounts, accountBinding: pkg.accountBinding }, evidence, { id: Number(taskSpaceRef), name: taskName });
  if (!recheck.ok) { result.ok = false; result.blocker = recheck.blocker; }
}
result.account = { account: accountBinding.account, label: accountBinding.label, egoProfileId: accountBinding.egoProfileId };
result.checkedAt = new Date().toISOString();
const out = opt("--out");
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), JSON.stringify(result, null, 2) + "\n"); }
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok === true ? 0 : 3);
