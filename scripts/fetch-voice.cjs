// Fetches Ember's voice into build/voice so electron-builder can ship it inside
// the installer, and the app has a voice the moment it is opened rather than a
// download button.
//
// Not committed to the repository: it is 92 MB of weights, and a repository is
// not a CDN. This runs as electron-builder's beforePack hook, so every
// packaging run - local or CI - has it without anyone having to remember.
//
// The layout written here is not arbitrary. transformers.js looks for
// <cacheDir>/<owner>/<repo>/<file>, so writing that exact tree means the
// runtime finds the weights by pointing its cache at this directory - no
// copying into userData on first run, and nothing to go wrong on a machine
// where the install directory is read-only.
const fs = require("fs");
const path = require("path");
const https = require("https");

const REVISION = "main";
const ROOT = path.join(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build", "voice");

// Two models: the one Ember speaks with and the one she listens with. Both ship
// so that the whole round trip - you talk, she hears, she answers, she speaks -
// works the first time the app is opened, with the offline lock on, having
// downloaded nothing.
//
// Sizes are the ones published at the revision above and are checked on
// arrival: a truncated model fails at synthesis time with something unhelpful,
// which is the worst place to find out.
const MODELS = [
  {
    repo: "onnx-community/Kokoro-82M-v1.0-ONNX",
    files: [
      { name: "onnx/model_quantized.onnx", bytes: 92_361_116 },
      { name: "config.json", bytes: null },
      { name: "tokenizer.json", bytes: null },
      { name: "tokenizer_config.json", bytes: null },
    ],
  },
  {
    repo: "onnx-community/whisper-tiny.en",
    files: [
      { name: "onnx/decoder_model_merged_quantized.onnx", bytes: 30_718_858 },
      { name: "onnx/encoder_model_quantized.onnx", bytes: 10_124_993 },
      { name: "config.json", bytes: null },
      { name: "generation_config.json", bytes: null },
      { name: "preprocessor_config.json", bytes: null },
      { name: "tokenizer.json", bytes: null },
      { name: "tokenizer_config.json", bytes: null },
    ],
  },
];

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    https.get(url, { headers: { "user-agent": "emb3r-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${url} returned ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function fetchVoice() {
  for (const model of MODELS) {
    const dest = path.join(BUILD_DIR, ...model.repo.split("/"));
    for (const file of model.files) {
      const target = path.join(dest, file.name);
      const label = `${model.repo.split("/")[1]}/${file.name}`;
      // already here and the right size: packaging twice should not re-download
      // a hundred and thirty megabytes
      if (fs.existsSync(target)) {
        const have = fs.statSync(target).size;
        if (!file.bytes || have > file.bytes * 0.98) {
          console.log(`speech: ${label} already present (${have} bytes)`);
          continue;
        }
        console.log(`speech: ${label} is ${have} bytes, refetching`);
      }

      const url = `https://huggingface.co/${model.repo}/resolve/${REVISION}/${file.name}`;
      console.log(`speech: fetching ${label}`);
      const body = await get(url);
      if (file.bytes && body.length < file.bytes * 0.98) {
        throw new Error(`${label} came back ${body.length} bytes, expected about ${file.bytes}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      console.log(`speech: wrote ${label} (${body.length} bytes)`);
    }
  }
}

// electron-builder calls the default export with a context object; running the
// file directly is what makes it testable on its own.
module.exports = async function beforePack() {
  await fetchVoice();
};

if (require.main === module) {
  fetchVoice().catch((err) => {
    console.error(`voice: ${err.message}`);
    process.exit(1);
  });
}
