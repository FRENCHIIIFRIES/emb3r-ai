// test-ai.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = path.join(__dirname, "models", "Llama-3.2-3B-Instruct-Q4_K_M.gguf");
async function main() {
  try {
    // c) initialize the llama backend
    const llama = await getLlama();

    // d) load the model
    const model = await llama.loadModel({
      modelPath: MODEL_PATH,
    });

    // e) create a context
    const context = await model.createContext();

    // f) create a chat session bound to a context sequence
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });

    // g) send a hardcoded prompt and await the full response
    const prompt = "Hello, who are you?";
    console.log("User:", prompt);
    const response = await session.prompt(prompt);

    // h) print result
    console.log("Assistant:", response);
  } catch (err) {
    // i) full error object
    console.error("Inference failed:", err);
    process.exitCode = 1;
  }
}

main();
