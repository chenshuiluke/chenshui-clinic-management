import config from "../mikro-orm.config";
import { MikroORM } from "@mikro-orm/postgresql";

let ormInstance: MikroORM | null = null;

export async function getOrm(): Promise<MikroORM> {
  if (!ormInstance) {
    ormInstance = await MikroORM.init(config);
  }
  return ormInstance;
}

export default getOrm;
