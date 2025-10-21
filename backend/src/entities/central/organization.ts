import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class Organization extends BaseEntity {
  @Property({ unique: true, type: 'string' })
  name!: string;

  constructor(name?: string) {
    super();
    if (name) {
      this.name = name;
    }
  }
}
