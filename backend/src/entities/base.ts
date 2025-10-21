import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity({ abstract: true })
export default abstract class BaseEntity {
  @PrimaryKey({ type: 'number' })
  id!: number;

  @Property({ type: 'date' })
  createdAt?: Date = new Date();

  @Property({ type: 'date', onUpdate: () => new Date() })
  updatedAt?: Date = new Date();
}
