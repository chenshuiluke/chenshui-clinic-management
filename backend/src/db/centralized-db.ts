import config from "../mikro-orm.config";
import { MikroORM } from "@mikro-orm/core";

const orm = await MikroORM.init(config);

export default orm;
