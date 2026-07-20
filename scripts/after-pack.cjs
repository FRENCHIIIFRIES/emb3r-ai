"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

/**
 * Ad-hoc sign the macOS app after packing.
 *
 * Apple Silicon enforces code signatures in the kernel: an unsigned arm64
 * binary is refused execution outright, with no Gatekeeper prompt to bypass.
 * v1.0.0 shipped unsigned and could not launch on Apple Silicon at all.
 *
 * We have no Developer ID certificate, and electron-builder will not sign on
 * its own here - CSC_IDENTITY_AUTO_DISCOVERY is off, so it finds no identity
 * and skips. An ad-hoc signature ("-") needs no certificate and satisfies the
 * kernel, which is all we need. Users still meet the usual Gatekeeper warning
 * until the app is signed with a real certificate.
 *
 * This runs before the dmg and zip are built, so both contain the signed app.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });

  // fail the build here rather than shipping something that cannot launch
  execFileSync("codesign", ["--verify", "--deep", appPath], { stdio: "inherit" });
  console.log("  • ad-hoc signature verified");
};
