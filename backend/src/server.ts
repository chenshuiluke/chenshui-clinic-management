import { bootstrap } from "./app";

if (process.env.PORT == null) {
  console.error("PORT environment variable is not set");
  process.exit(1);
}

const PORT = parseInt(process.env.PORT) || 3000;

async function main(): Promise<void> {
  try {
    await bootstrap(PORT);
  } catch (e) {
    console.error(e);
  }
}

main();
