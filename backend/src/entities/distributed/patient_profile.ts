import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class PatientProfile extends BaseEntity {
  @Property({ type: 'datetime' })
  dateOfBirth!: Date;

  @Property({ type: 'string' })
  phoneNumber!: string;

  @Property({ type: 'string', nullable: true })
  address?: string;

  @Property({ type: 'string', nullable: true })
  emergencyContactName?: string;

  @Property({ type: 'string', nullable: true })
  emergencyContactPhone?: string;

  @Property({ type: 'string', nullable: true })
  bloodType?: string;

  @Property({ type: 'string', nullable: true })
  allergies?: string;

  @Property({ type: 'string', nullable: true })
  chronicConditions?: string;

  @Property({ type: 'string' })
  ipAddress!: string;
}
