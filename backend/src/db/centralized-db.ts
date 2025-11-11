import config from "../mikro-orm.config";
import { MikroORM } from "@mikro-orm/postgresql";

let ormInstance: MikroORM | null = null;

async function initWithRetry(maxRetries = 10, delay = 2000): Promise<MikroORM> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to database (attempt ${attempt}/${maxRetries})...`);
      const orm = await MikroORM.init(config);
      console.log('Successfully connected to database');
      return orm;
    } catch (error) {
      console.error(`Database connection attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Failed to connect to database after all retries');
}

export async function getOrm(): Promise<MikroORM> {
  if (!ormInstance) {
    ormInstance = await initWithRetry();
  }
  return ormInstance;
}

export default getOrm;
