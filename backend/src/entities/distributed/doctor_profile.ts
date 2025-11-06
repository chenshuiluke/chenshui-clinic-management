import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class DoctorProfile extends BaseEntity {
  @Property({ type: 'string' })
  specialization!: string;

  @Property({ type: 'string' })
  licenseNumber!: string;

  @Property({ type: 'string', nullable: true })
  phoneNumber?: string;
}
